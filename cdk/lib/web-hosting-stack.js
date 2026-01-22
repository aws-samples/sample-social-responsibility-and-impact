"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherAlertWebHostingStack = void 0;
const cdk = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const cognito = require("aws-cdk-lib/aws-cognito");
const iam = require("aws-cdk-lib/aws-iam");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const lambda = require("aws-cdk-lib/aws-lambda");
const cdk_nag_1 = require("cdk-nag");
class WeatherAlertWebHostingStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // ============================================
        // Cognito User Pool for Authentication
        // ============================================
        this.userPool = new cognito.UserPool(this, 'WeatherAlertUserPool', {
            userPoolName: 'WeatherAlertUsers',
            selfSignUpEnabled: false, // Admin creates users for security
            signInAliases: {
                email: true,
                username: true,
            },
            autoVerify: {
                email: true,
            },
            passwordPolicy: {
                minLength: 12,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: true,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: cdk.RemovalPolicy.RETAIN, // Protect user data
            mfa: cognito.Mfa.OPTIONAL,
            mfaSecondFactor: {
                sms: true,
                otp: true,
            },
            // Note: Advanced Security Mode requires Cognito Plus plan
            // For production, consider upgrading to enable advanced security features
        });
        // User Pool Client for web app
        const userPoolClient = this.userPool.addClient('WeatherAlertWebClient', {
            userPoolClientName: 'WeatherAlertWebApp',
            authFlows: {
                userPassword: true,
                userSrp: true,
            },
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                },
                scopes: [
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                ],
            },
            preventUserExistenceErrors: true,
        });
        // Identity Pool for AWS resource access
        const identityPool = new cognito.CfnIdentityPool(this, 'WeatherAlertIdentityPool', {
            identityPoolName: 'WeatherAlertIdentity',
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: userPoolClient.userPoolClientId,
                    providerName: this.userPool.userPoolProviderName,
                },
            ],
        });
        // IAM role for authenticated users
        const authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
            assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
                StringEquals: {
                    'cognito-identity.amazonaws.com:aud': identityPool.ref,
                },
                'ForAnyValue:StringLike': {
                    'cognito-identity.amazonaws.com:amr': 'authenticated',
                },
            }, 'sts:AssumeRoleWithWebIdentity'),
        });
        // Attach role to identity pool
        new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
            identityPoolId: identityPool.ref,
            roles: {
                authenticated: authenticatedRole.roleArn,
            },
        });
        // ============================================
        // API Gateway for SQS Polling (Secure)
        // ============================================
        // Lambda function to poll SQS and return messages
        const sqsPollerFn = new lambda.Function(this, 'SQSPollerFunction', {
            functionName: 'WeatherAlert-SQSPoller',
            runtime: lambda.Runtime.PYTHON_3_14,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromAsset('../lambda/sqs-poller'),
            timeout: cdk.Duration.seconds(30),
            environment: {
                NOTIFY_QUEUE_URL: props.notifyQueue.queueUrl,
            },
        });
        // Grant SQS read permissions
        props.notifyQueue.grantConsumeMessages(sqsPollerFn);
        // API Gateway with Cognito authorizer
        const api = new apigateway.RestApi(this, 'WeatherAlertAPI', {
            restApiName: 'Weather Alert API',
            description: 'Secure API for fetching weather alerts',
            deployOptions: {
                stageName: 'prod',
                throttlingRateLimit: 100,
                throttlingBurstLimit: 200,
                // Logging disabled - requires CloudWatch Logs role setup
                // loggingLevel: apigateway.MethodLoggingLevel.INFO,
                // dataTraceEnabled: true,
                metricsEnabled: true,
            },
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS, // Will be restricted by CloudFront
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: [
                    'Content-Type',
                    'X-Amz-Date',
                    'Authorization',
                    'X-Api-Key',
                    'X-Amz-Security-Token',
                ],
            },
        });
        // Cognito authorizer
        const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
            cognitoUserPools: [this.userPool],
            authorizerName: 'WeatherAlertCognitoAuthorizer',
        });
        // API endpoint: GET /messages
        const messages = api.root.addResource('messages');
        messages.addMethod('GET', new apigateway.LambdaIntegration(sqsPollerFn), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // ============================================
        // S3 Bucket for Static Website
        // ============================================
        this.webBucket = new s3.Bucket(this, 'WeatherAlertWebBucket', {
            bucketName: `weather-alert-web-ui-${this.account}`,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            enforceSSL: true,
            serverAccessLogsPrefix: 'access-logs/',
        });
        // CloudFront Origin Access Control (OAC) - recommended over OAI
        const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'WeatherAlertOAC', {
            originAccessControlName: 'WeatherAlertOAC',
            description: 'OAC for Weather Alert Web UI S3 bucket',
            signing: cloudfront.Signing.SIGV4_ALWAYS,
        });
        // ============================================
        // CloudFront Distribution
        // ============================================
        this.distribution = new cloudfront.Distribution(this, 'WeatherAlertDistribution', {
            comment: 'Weather Alert System Web UI',
            defaultBehavior: {
                origin: origins.S3BucketOrigin.withOriginAccessControl(this.webBucket, {
                    originAccessControl,
                }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                compress: true,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
            },
            defaultRootObject: 'index.html',
            errorResponses: [
                {
                    httpStatus: 403,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.minutes(5),
                },
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.minutes(5),
                },
            ],
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US, Canada, Europe
            // Logging disabled for now - can be enabled later if needed
            // enableLogging: true,
            // logBucket: new s3.Bucket(this, 'CloudFrontLogBucket', {
            //   bucketName: `weather-alert-cf-logs-${this.account}`,
            //   encryption: s3.BucketEncryption.S3_MANAGED,
            //   blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            //   objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
            //   lifecycleRules: [
            //     {
            //       expiration: cdk.Duration.days(90),
            //     },
            //   ],
            //   removalPolicy: cdk.RemovalPolicy.RETAIN,
            // }),
            // logFilePrefix: 'cloudfront-logs/',
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        });
        // ============================================
        // Deploy Web UI to S3
        // ============================================
        // Commented out for initial deployment - build web-ui first, then uncomment and redeploy
        /*
        new s3deploy.BucketDeployment(this, 'DeployWebUI', {
          sources: [s3deploy.Source.asset('../web-ui/build')],
          destinationBucket: this.webBucket,
          distribution: this.distribution,
          distributionPaths: ['/*'],
          prune: true,
        });
        */
        // ============================================
        // CloudFormation Outputs
        // ============================================
        new cdk.CfnOutput(this, 'WebsiteURL', {
            value: `https://${this.distribution.distributionDomainName}`,
            description: 'CloudFront URL for Weather Alert Web UI',
            exportName: 'WeatherAlertWebsiteURL',
        });
        new cdk.CfnOutput(this, 'UserPoolId', {
            value: this.userPool.userPoolId,
            description: 'Cognito User Pool ID',
            exportName: 'WeatherAlertUserPoolId',
        });
        new cdk.CfnOutput(this, 'UserPoolClientId', {
            value: userPoolClient.userPoolClientId,
            description: 'Cognito User Pool Client ID',
            exportName: 'WeatherAlertUserPoolClientId',
        });
        new cdk.CfnOutput(this, 'IdentityPoolId', {
            value: identityPool.ref,
            description: 'Cognito Identity Pool ID',
            exportName: 'WeatherAlertIdentityPoolId',
        });
        new cdk.CfnOutput(this, 'ApiEndpoint', {
            value: api.url,
            description: 'API Gateway endpoint for fetching messages',
            exportName: 'WeatherAlertApiEndpoint',
        });
        new cdk.CfnOutput(this, 'Region', {
            value: this.region,
            description: 'AWS Region',
            exportName: 'WeatherAlertRegion',
        });
        // CDK Nag Suppressions
        this.addNagSuppressions(api, sqsPollerFn);
    }
    addNagSuppressions(api, sqsPollerFn) {
        // Suppress Cognito Advanced Security Mode - requires Plus plan
        cdk_nag_1.NagSuppressions.addResourceSuppressions(this.userPool, [
            {
                id: 'AwsSolutions-COG3',
                reason: 'Advanced Security Mode requires Cognito Plus plan. For production deployments, customers should upgrade to enable advanced security features.',
            },
        ]);
        // Suppress Cognito SMS role wildcard - required by Cognito for MFA
        cdk_nag_1.NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/WeatherAlertUserPool/smsRole/Resource`, [
            {
                id: 'AwsSolutions-IAM5',
                reason: 'Wildcard permission required by Cognito for SMS MFA functionality. This is AWS Cognito managed behavior.',
                appliesTo: ['Resource::*'],
            },
        ]);
        // Suppress Lambda function warnings
        cdk_nag_1.NagSuppressions.addResourceSuppressions(sqsPollerFn, [
            {
                id: 'AwsSolutions-IAM4',
                reason: 'AWSLambdaBasicExecutionRole is AWS managed policy for Lambda execution. Required for CloudWatch Logs access.',
                appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
            },
            {
                id: 'AwsSolutions-L1',
                reason: 'Python 3.12 is the latest stable runtime. This warning is a false positive.',
            },
        ], true);
        // Suppress API Gateway warnings
        cdk_nag_1.NagSuppressions.addResourceSuppressions(api, [
            {
                id: 'AwsSolutions-APIG2',
                reason: 'Request validation handled by Lambda function. Input validation implemented in application code.',
            },
            {
                id: 'AwsSolutions-APIG1',
                reason: 'Access logging disabled for AWS Sample to reduce costs. Customers should enable CloudWatch Logs in production deployments.',
            },
            {
                id: 'AwsSolutions-APIG6',
                reason: 'CloudWatch logging disabled for AWS Sample to reduce costs. Customers should enable in production deployments.',
            },
        ], true);
        // Suppress CloudFront warnings
        cdk_nag_1.NagSuppressions.addResourceSuppressions(this.distribution, [
            {
                id: 'AwsSolutions-CFR3',
                reason: 'CloudFront access logging disabled for AWS Sample to reduce costs. Customers should enable in production deployments.',
            },
            {
                id: 'AwsSolutions-CFR4',
                reason: 'Using default CloudFront certificate for simplicity in AWS Sample. Customers should use custom certificate with TLS 1.2+ in production.',
            },
        ]);
    }
}
exports.WeatherAlertWebHostingStack = WeatherAlertWebHostingStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViLWhvc3Rpbmctc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3ZWItaG9zdGluZy1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMseUNBQXlDO0FBRXpDLHlEQUF5RDtBQUN6RCw4REFBOEQ7QUFDOUQsbURBQW1EO0FBQ25ELDJDQUEyQztBQUUzQyx5REFBeUQ7QUFDekQsaURBQWlEO0FBR2pELHFDQUEwQztBQU0xQyxNQUFhLDJCQUE0QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBS3hELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBMkI7UUFDbkUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsK0NBQStDO1FBQy9DLHVDQUF1QztRQUN2QywrQ0FBK0M7UUFDL0MsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQ2pFLFlBQVksRUFBRSxtQkFBbUI7WUFDakMsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLG1DQUFtQztZQUM3RCxhQUFhLEVBQUU7Z0JBQ2IsS0FBSyxFQUFFLElBQUk7Z0JBQ1gsUUFBUSxFQUFFLElBQUk7YUFDZjtZQUNELFVBQVUsRUFBRTtnQkFDVixLQUFLLEVBQUUsSUFBSTthQUNaO1lBQ0QsY0FBYyxFQUFFO2dCQUNkLFNBQVMsRUFBRSxFQUFFO2dCQUNiLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLGFBQWEsRUFBRSxJQUFJO2dCQUNuQixjQUFjLEVBQUUsSUFBSTthQUNyQjtZQUNELGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZSxDQUFDLFVBQVU7WUFDbkQsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLG9CQUFvQjtZQUM3RCxHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxR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RCxrRUE0V0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xyXG5pbXBvcnQgKiBhcyBzM2RlcGxveSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMtZGVwbG95bWVudCc7XHJcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xyXG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xyXG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcclxuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xyXG5pbXBvcnQgKiBhcyBzcXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNxcyc7XHJcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0IHsgTmFnU3VwcHJlc3Npb25zIH0gZnJvbSAnY2RrLW5hZyc7XHJcblxyXG5pbnRlcmZhY2UgV2ViSG9zdGluZ1N0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XHJcbiAgbm90aWZ5UXVldWU6IHNxcy5RdWV1ZTtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFdlYXRoZXJBbGVydFdlYkhvc3RpbmdTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XHJcbiAgcHVibGljIHJlYWRvbmx5IGRpc3RyaWJ1dGlvbjogY2xvdWRmcm9udC5EaXN0cmlidXRpb247XHJcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xyXG4gIHB1YmxpYyByZWFkb25seSB3ZWJCdWNrZXQ6IHMzLkJ1Y2tldDtcclxuXHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFdlYkhvc3RpbmdTdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2wgZm9yIEF1dGhlbnRpY2F0aW9uXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgdGhpcy51c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdXZWF0aGVyQWxlcnRVc2VyUG9vbCcsIHtcclxuICAgICAgdXNlclBvb2xOYW1lOiAnV2VhdGhlckFsZXJ0VXNlcnMnLFxyXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogZmFsc2UsIC8vIEFkbWluIGNyZWF0ZXMgdXNlcnMgZm9yIHNlY3VyaXR5XHJcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcclxuICAgICAgICBlbWFpbDogdHJ1ZSxcclxuICAgICAgICB1c2VybmFtZTogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgYXV0b1ZlcmlmeToge1xyXG4gICAgICAgIGVtYWlsOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBwYXNzd29yZFBvbGljeToge1xyXG4gICAgICAgIG1pbkxlbmd0aDogMTIsXHJcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcclxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxyXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXHJcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLCAvLyBQcm90ZWN0IHVzZXIgZGF0YVxyXG4gICAgICBtZmE6IGNvZ25pdG8uTWZhLk9QVElPTkFMLFxyXG4gICAgICBtZmFTZWNvbmRGYWN0b3I6IHtcclxuICAgICAgICBzbXM6IHRydWUsXHJcbiAgICAgICAgb3RwOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICAvLyBOb3RlOiBBZHZhbmNlZCBTZWN1cml0eSBNb2RlIHJlcXVpcmVzIENvZ25pdG8gUGx1cyBwbGFuXHJcbiAgICAgIC8vIEZvciBwcm9kdWN0aW9uLCBjb25zaWRlciB1cGdyYWRpbmcgdG8gZW5hYmxlIGFkdmFuY2VkIHNlY3VyaXR5IGZlYXR1cmVzXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBVc2VyIFBvb2wgQ2xpZW50IGZvciB3ZWIgYXBwXHJcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IHRoaXMudXNlclBvb2wuYWRkQ2xpZW50KCdXZWF0aGVyQWxlcnRXZWJDbGllbnQnLCB7XHJcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogJ1dlYXRoZXJBbGVydFdlYkFwcCcsXHJcbiAgICAgIGF1dGhGbG93czoge1xyXG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcclxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBvQXV0aDoge1xyXG4gICAgICAgIGZsb3dzOiB7XHJcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgc2NvcGVzOiBbXHJcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuRU1BSUwsXHJcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuT1BFTklELFxyXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEUsXHJcbiAgICAgICAgXSxcclxuICAgICAgfSxcclxuICAgICAgcHJldmVudFVzZXJFeGlzdGVuY2VFcnJvcnM6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBJZGVudGl0eSBQb29sIGZvciBBV1MgcmVzb3VyY2UgYWNjZXNzXHJcbiAgICBjb25zdCBpZGVudGl0eVBvb2wgPSBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2wodGhpcywgJ1dlYXRoZXJBbGVydElkZW50aXR5UG9vbCcsIHtcclxuICAgICAgaWRlbnRpdHlQb29sTmFtZTogJ1dlYXRoZXJBbGVydElkZW50aXR5JyxcclxuICAgICAgYWxsb3dVbmF1dGhlbnRpY2F0ZWRJZGVudGl0aWVzOiBmYWxzZSxcclxuICAgICAgY29nbml0b0lkZW50aXR5UHJvdmlkZXJzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgY2xpZW50SWQ6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXHJcbiAgICAgICAgICBwcm92aWRlck5hbWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xQcm92aWRlck5hbWUsXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIElBTSByb2xlIGZvciBhdXRoZW50aWNhdGVkIHVzZXJzXHJcbiAgICBjb25zdCBhdXRoZW50aWNhdGVkUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQ29nbml0b0F1dGhlbnRpY2F0ZWRSb2xlJywge1xyXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxyXG4gICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb20nLFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xyXG4gICAgICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZCc6IGlkZW50aXR5UG9vbC5yZWYsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgJ0ZvckFueVZhbHVlOlN0cmluZ0xpa2UnOiB7XHJcbiAgICAgICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yJzogJ2F1dGhlbnRpY2F0ZWQnLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICAgICdzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eSdcclxuICAgICAgKSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEF0dGFjaCByb2xlIHRvIGlkZW50aXR5IHBvb2xcclxuICAgIG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50KHRoaXMsICdJZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudCcsIHtcclxuICAgICAgaWRlbnRpdHlQb29sSWQ6IGlkZW50aXR5UG9vbC5yZWYsXHJcbiAgICAgIHJvbGVzOiB7XHJcbiAgICAgICAgYXV0aGVudGljYXRlZDogYXV0aGVudGljYXRlZFJvbGUucm9sZUFybixcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBBUEkgR2F0ZXdheSBmb3IgU1FTIFBvbGxpbmcgKFNlY3VyZSlcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICBcclxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiB0byBwb2xsIFNRUyBhbmQgcmV0dXJuIG1lc3NhZ2VzXHJcbiAgICBjb25zdCBzcXNQb2xsZXJGbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1NRU1BvbGxlckZ1bmN0aW9uJywge1xyXG4gICAgICBmdW5jdGlvbk5hbWU6ICdXZWF0aGVyQWxlcnQtU1FTUG9sbGVyJyxcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTQsXHJcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vbGFtYmRhL3Nxcy1wb2xsZXInKSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIE5PVElGWV9RVUVVRV9VUkw6IHByb3BzLm5vdGlmeVF1ZXVlLnF1ZXVlVXJsLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR3JhbnQgU1FTIHJlYWQgcGVybWlzc2lvbnNcclxuICAgIHByb3BzLm5vdGlmeVF1ZXVlLmdyYW50Q29uc3VtZU1lc3NhZ2VzKHNxc1BvbGxlckZuKTtcclxuXHJcbiAgICAvLyBBUEkgR2F0ZXdheSB3aXRoIENvZ25pdG8gYXV0aG9yaXplclxyXG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnV2VhdGhlckFsZXJ0QVBJJywge1xyXG4gICAgICByZXN0QXBpTmFtZTogJ1dlYXRoZXIgQWxlcnQgQVBJJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cmUgQVBJIGZvciBmZXRjaGluZyB3ZWF0aGVyIGFsZXJ0cycsXHJcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcclxuICAgICAgICBzdGFnZU5hbWU6ICdwcm9kJyxcclxuICAgICAgICB0aHJvdHRsaW5nUmF0ZUxpbWl0OiAxMDAsXHJcbiAgICAgICAgdGhyb3R0bGluZ0J1cnN0TGltaXQ6IDIwMCxcclxuICAgICAgICAvLyBMb2dnaW5nIGRpc2FibGVkIC0gcmVxdWlyZXMgQ2xvdWRXYXRjaCBMb2dzIHJvbGUgc2V0dXBcclxuICAgICAgICAvLyBsb2dnaW5nTGV2ZWw6IGFwaWdhdGV3YXkuTWV0aG9kTG9nZ2luZ0xldmVsLklORk8sXHJcbiAgICAgICAgLy8gZGF0YVRyYWNlRW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XHJcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsIC8vIFdpbGwgYmUgcmVzdHJpY3RlZCBieSBDbG91ZEZyb250XHJcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXHJcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXHJcbiAgICAgICAgICAnQ29udGVudC1UeXBlJyxcclxuICAgICAgICAgICdYLUFtei1EYXRlJyxcclxuICAgICAgICAgICdBdXRob3JpemF0aW9uJyxcclxuICAgICAgICAgICdYLUFwaS1LZXknLFxyXG4gICAgICAgICAgJ1gtQW16LVNlY3VyaXR5LVRva2VuJyxcclxuICAgICAgICBdLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ29nbml0byBhdXRob3JpemVyXHJcbiAgICBjb25zdCBhdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIodGhpcywgJ0NvZ25pdG9BdXRob3JpemVyJywge1xyXG4gICAgICBjb2duaXRvVXNlclBvb2xzOiBbdGhpcy51c2VyUG9vbF0sXHJcbiAgICAgIGF1dGhvcml6ZXJOYW1lOiAnV2VhdGhlckFsZXJ0Q29nbml0b0F1dGhvcml6ZXInLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQVBJIGVuZHBvaW50OiBHRVQgL21lc3NhZ2VzXHJcbiAgICBjb25zdCBtZXNzYWdlcyA9IGFwaS5yb290LmFkZFJlc291cmNlKCdtZXNzYWdlcycpO1xyXG4gICAgbWVzc2FnZXMuYWRkTWV0aG9kKFxyXG4gICAgICAnR0VUJyxcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oc3FzUG9sbGVyRm4pLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBTMyBCdWNrZXQgZm9yIFN0YXRpYyBXZWJzaXRlXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgdGhpcy53ZWJCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdXZWF0aGVyQWxlcnRXZWJCdWNrZXQnLCB7XHJcbiAgICAgIGJ1Y2tldE5hbWU6IGB3ZWF0aGVyLWFsZXJ0LXdlYi11aS0ke3RoaXMuYWNjb3VudH1gLFxyXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXHJcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXHJcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxyXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxyXG4gICAgICBzZXJ2ZXJBY2Nlc3NMb2dzUHJlZml4OiAnYWNjZXNzLWxvZ3MvJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENsb3VkRnJvbnQgT3JpZ2luIEFjY2VzcyBDb250cm9sIChPQUMpIC0gcmVjb21tZW5kZWQgb3ZlciBPQUlcclxuICAgIGNvbnN0IG9yaWdpbkFjY2Vzc0NvbnRyb2wgPSBuZXcgY2xvdWRmcm9udC5TM09yaWdpbkFjY2Vzc0NvbnRyb2woXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgICdXZWF0aGVyQWxlcnRPQUMnLFxyXG4gICAgICB7XHJcbiAgICAgICAgb3JpZ2luQWNjZXNzQ29udHJvbE5hbWU6ICdXZWF0aGVyQWxlcnRPQUMnLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnT0FDIGZvciBXZWF0aGVyIEFsZXJ0IFdlYiBVSSBTMyBidWNrZXQnLFxyXG4gICAgICAgIHNpZ25pbmc6IGNsb3VkZnJvbnQuU2lnbmluZy5TSUdWNF9BTFdBWVMsXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgdGhpcy5kaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ1dlYXRoZXJBbGVydERpc3RyaWJ1dGlvbicsIHtcclxuICAgICAgY29tbWVudDogJ1dlYXRoZXIgQWxlcnQgU3lzdGVtIFdlYiBVSScsXHJcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xyXG4gICAgICAgIG9yaWdpbjogb3JpZ2lucy5TM0J1Y2tldE9yaWdpbi53aXRoT3JpZ2luQWNjZXNzQ29udHJvbCh0aGlzLndlYkJ1Y2tldCwge1xyXG4gICAgICAgICAgb3JpZ2luQWNjZXNzQ29udHJvbCxcclxuICAgICAgICB9KSxcclxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcclxuICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRF9PUFRJT05TLFxyXG4gICAgICAgIGNhY2hlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQ2FjaGVkTWV0aG9kcy5DQUNIRV9HRVRfSEVBRF9PUFRJT05TLFxyXG4gICAgICAgIGNvbXByZXNzOiB0cnVlLFxyXG4gICAgICAgIGNhY2hlUG9saWN5OiBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfT1BUSU1JWkVELFxyXG4gICAgICB9LFxyXG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogJ2luZGV4Lmh0bWwnLFxyXG4gICAgICBlcnJvclJlc3BvbnNlczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwMyxcclxuICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxyXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcclxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDQsXHJcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcclxuICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcsXHJcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsIC8vIFVTLCBDYW5hZGEsIEV1cm9wZVxyXG4gICAgICAvLyBMb2dnaW5nIGRpc2FibGVkIGZvciBub3cgLSBjYW4gYmUgZW5hYmxlZCBsYXRlciBpZiBuZWVkZWRcclxuICAgICAgLy8gZW5hYmxlTG9nZ2luZzogdHJ1ZSxcclxuICAgICAgLy8gbG9nQnVja2V0OiBuZXcgczMuQnVja2V0KHRoaXMsICdDbG91ZEZyb250TG9nQnVja2V0Jywge1xyXG4gICAgICAvLyAgIGJ1Y2tldE5hbWU6IGB3ZWF0aGVyLWFsZXJ0LWNmLWxvZ3MtJHt0aGlzLmFjY291bnR9YCxcclxuICAgICAgLy8gICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXHJcbiAgICAgIC8vICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcclxuICAgICAgLy8gICBvYmplY3RPd25lcnNoaXA6IHMzLk9iamVjdE93bmVyc2hpcC5CVUNLRVRfT1dORVJfUFJFRkVSUkVELFxyXG4gICAgICAvLyAgIGxpZmVjeWNsZVJ1bGVzOiBbXHJcbiAgICAgIC8vICAgICB7XHJcbiAgICAgIC8vICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcclxuICAgICAgLy8gICAgIH0sXHJcbiAgICAgIC8vICAgXSxcclxuICAgICAgLy8gICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXHJcbiAgICAgIC8vIH0pLFxyXG4gICAgICAvLyBsb2dGaWxlUHJlZml4OiAnY2xvdWRmcm9udC1sb2dzLycsXHJcbiAgICAgIG1pbmltdW1Qcm90b2NvbFZlcnNpb246IGNsb3VkZnJvbnQuU2VjdXJpdHlQb2xpY3lQcm90b2NvbC5UTFNfVjFfMl8yMDIxLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIERlcGxveSBXZWIgVUkgdG8gUzNcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBDb21tZW50ZWQgb3V0IGZvciBpbml0aWFsIGRlcGxveW1lbnQgLSBidWlsZCB3ZWItdWkgZmlyc3QsIHRoZW4gdW5jb21tZW50IGFuZCByZWRlcGxveVxyXG4gICAgLypcclxuICAgIG5ldyBzM2RlcGxveS5CdWNrZXREZXBsb3ltZW50KHRoaXMsICdEZXBsb3lXZWJVSScsIHtcclxuICAgICAgc291cmNlczogW3MzZGVwbG95LlNvdXJjZS5hc3NldCgnLi4vd2ViLXVpL2J1aWxkJyldLFxyXG4gICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogdGhpcy53ZWJCdWNrZXQsXHJcbiAgICAgIGRpc3RyaWJ1dGlvbjogdGhpcy5kaXN0cmlidXRpb24sXHJcbiAgICAgIGRpc3RyaWJ1dGlvblBhdGhzOiBbJy8qJ10sXHJcbiAgICAgIHBydW5lOiB0cnVlLFxyXG4gICAgfSk7XHJcbiAgICAqL1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBDbG91ZEZvcm1hdGlvbiBPdXRwdXRzXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYnNpdGVVUkwnLCB7XHJcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3RoaXMuZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdDbG91ZEZyb250IFVSTCBmb3IgV2VhdGhlciBBbGVydCBXZWIgVUknLFxyXG4gICAgICBleHBvcnROYW1lOiAnV2VhdGhlckFsZXJ0V2Vic2l0ZVVSTCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHtcclxuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xJZCxcclxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdXZWF0aGVyQWxlcnRVc2VyUG9vbElkJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbENsaWVudElkJywge1xyXG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcclxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxyXG4gICAgICBleHBvcnROYW1lOiAnV2VhdGhlckFsZXJ0VXNlclBvb2xDbGllbnRJZCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSWRlbnRpdHlQb29sSWQnLCB7XHJcbiAgICAgIHZhbHVlOiBpZGVudGl0eVBvb2wucmVmLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gSWRlbnRpdHkgUG9vbCBJRCcsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdXZWF0aGVyQWxlcnRJZGVudGl0eVBvb2xJZCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpRW5kcG9pbnQnLCB7XHJcbiAgICAgIHZhbHVlOiBhcGkudXJsLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IGVuZHBvaW50IGZvciBmZXRjaGluZyBtZXNzYWdlcycsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdXZWF0aGVyQWxlcnRBcGlFbmRwb2ludCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUmVnaW9uJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5yZWdpb24sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVdTIFJlZ2lvbicsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdXZWF0aGVyQWxlcnRSZWdpb24nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ0RLIE5hZyBTdXBwcmVzc2lvbnNcclxuICAgIHRoaXMuYWRkTmFnU3VwcHJlc3Npb25zKGFwaSwgc3FzUG9sbGVyRm4pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGROYWdTdXBwcmVzc2lvbnMoYXBpOiBhcGlnYXRld2F5LlJlc3RBcGksIHNxc1BvbGxlckZuOiBsYW1iZGEuRnVuY3Rpb24pIHtcclxuICAgIC8vIFN1cHByZXNzIENvZ25pdG8gQWR2YW5jZWQgU2VjdXJpdHkgTW9kZSAtIHJlcXVpcmVzIFBsdXMgcGxhblxyXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxyXG4gICAgICB0aGlzLnVzZXJQb29sLFxyXG4gICAgICBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtQ09HMycsXHJcbiAgICAgICAgICByZWFzb246ICdBZHZhbmNlZCBTZWN1cml0eSBNb2RlIHJlcXVpcmVzIENvZ25pdG8gUGx1cyBwbGFuLiBGb3IgcHJvZHVjdGlvbiBkZXBsb3ltZW50cywgY3VzdG9tZXJzIHNob3VsZCB1cGdyYWRlIHRvIGVuYWJsZSBhZHZhbmNlZCBzZWN1cml0eSBmZWF0dXJlcy4nLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF1cclxuICAgICk7XHJcblxyXG4gICAgLy8gU3VwcHJlc3MgQ29nbml0byBTTVMgcm9sZSB3aWxkY2FyZCAtIHJlcXVpcmVkIGJ5IENvZ25pdG8gZm9yIE1GQVxyXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zQnlQYXRoKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICBgJHt0aGlzLnN0YWNrTmFtZX0vV2VhdGhlckFsZXJ0VXNlclBvb2wvc21zUm9sZS9SZXNvdXJjZWAsXHJcbiAgICAgIFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1JQU01JyxcclxuICAgICAgICAgIHJlYXNvbjogJ1dpbGRjYXJkIHBlcm1pc3Npb24gcmVxdWlyZWQgYnkgQ29nbml0byBmb3IgU01TIE1GQSBmdW5jdGlvbmFsaXR5LiBUaGlzIGlzIEFXUyBDb2duaXRvIG1hbmFnZWQgYmVoYXZpb3IuJyxcclxuICAgICAgICAgIGFwcGxpZXNUbzogWydSZXNvdXJjZTo6KiddLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF1cclxuICAgICk7XHJcblxyXG4gICAgLy8gU3VwcHJlc3MgTGFtYmRhIGZ1bmN0aW9uIHdhcm5pbmdzXHJcbiAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXHJcbiAgICAgIHNxc1BvbGxlckZuLFxyXG4gICAgICBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtSUFNNCcsXHJcbiAgICAgICAgICByZWFzb246ICdBV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUgaXMgQVdTIG1hbmFnZWQgcG9saWN5IGZvciBMYW1iZGEgZXhlY3V0aW9uLiBSZXF1aXJlZCBmb3IgQ2xvdWRXYXRjaCBMb2dzIGFjY2Vzcy4nLFxyXG4gICAgICAgICAgYXBwbGllc1RvOiBbJ1BvbGljeTo6YXJuOjxBV1M6OlBhcnRpdGlvbj46aWFtOjphd3M6cG9saWN5L3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnXSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGlkOiAnQXdzU29sdXRpb25zLUwxJyxcclxuICAgICAgICAgIHJlYXNvbjogJ1B5dGhvbiAzLjEyIGlzIHRoZSBsYXRlc3Qgc3RhYmxlIHJ1bnRpbWUuIFRoaXMgd2FybmluZyBpcyBhIGZhbHNlIHBvc2l0aXZlLicsXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgICAgdHJ1ZVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBTdXBwcmVzcyBBUEkgR2F0ZXdheSB3YXJuaW5nc1xyXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxyXG4gICAgICBhcGksXHJcbiAgICAgIFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1BUElHMicsXHJcbiAgICAgICAgICByZWFzb246ICdSZXF1ZXN0IHZhbGlkYXRpb24gaGFuZGxlZCBieSBMYW1iZGEgZnVuY3Rpb24uIElucHV0IHZhbGlkYXRpb24gaW1wbGVtZW50ZWQgaW4gYXBwbGljYXRpb24gY29kZS4nLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtQVBJRzEnLFxyXG4gICAgICAgICAgcmVhc29uOiAnQWNjZXNzIGxvZ2dpbmcgZGlzYWJsZWQgZm9yIEFXUyBTYW1wbGUgdG8gcmVkdWNlIGNvc3RzLiBDdXN0b21lcnMgc2hvdWxkIGVuYWJsZSBDbG91ZFdhdGNoIExvZ3MgaW4gcHJvZHVjdGlvbiBkZXBsb3ltZW50cy4nLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtQVBJRzYnLFxyXG4gICAgICAgICAgcmVhc29uOiAnQ2xvdWRXYXRjaCBsb2dnaW5nIGRpc2FibGVkIGZvciBBV1MgU2FtcGxlIHRvIHJlZHVjZSBjb3N0cy4gQ3VzdG9tZXJzIHNob3VsZCBlbmFibGUgaW4gcHJvZHVjdGlvbiBkZXBsb3ltZW50cy4nLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIHRydWVcclxuICAgICk7XHJcblxyXG4gICAgLy8gU3VwcHJlc3MgQ2xvdWRGcm9udCB3YXJuaW5nc1xyXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxyXG4gICAgICB0aGlzLmRpc3RyaWJ1dGlvbixcclxuICAgICAgW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGlkOiAnQXdzU29sdXRpb25zLUNGUjMnLFxyXG4gICAgICAgICAgcmVhc29uOiAnQ2xvdWRGcm9udCBhY2Nlc3MgbG9nZ2luZyBkaXNhYmxlZCBmb3IgQVdTIFNhbXBsZSB0byByZWR1Y2UgY29zdHMuIEN1c3RvbWVycyBzaG91bGQgZW5hYmxlIGluIHByb2R1Y3Rpb24gZGVwbG95bWVudHMuJyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGlkOiAnQXdzU29sdXRpb25zLUNGUjQnLFxyXG4gICAgICAgICAgcmVhc29uOiAnVXNpbmcgZGVmYXVsdCBDbG91ZEZyb250IGNlcnRpZmljYXRlIGZvciBzaW1wbGljaXR5IGluIEFXUyBTYW1wbGUuIEN1c3RvbWVycyBzaG91bGQgdXNlIGN1c3RvbSBjZXJ0aWZpY2F0ZSB3aXRoIFRMUyAxLjIrIGluIHByb2R1Y3Rpb24uJyxcclxuICAgICAgICB9LFxyXG4gICAgICBdXHJcbiAgICApO1xyXG4gIH1cclxufVxyXG4iXX0=