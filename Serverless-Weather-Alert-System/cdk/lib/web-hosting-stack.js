"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherAlertWebHostingStack = void 0;
const cdk = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
// import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'; // Uncomment when deploying web UI
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
        // ============================================
        // SECURITY NOTE: This solution is intended as a sample/reference architecture.
        // Production deployments should implement additional security best practices.
        // Refer to the Security Pillar of the AWS Well-Architected Framework:
        // https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html
        // ============================================
        this.addNagSuppressions(api, sqsPollerFn);
    }
    addNagSuppressions(api, sqsPollerFn) {
        // ============================================
        // Cognito Suppressions
        // Production recommendation: Upgrade to Cognito Plus plan for Advanced Security Mode
        // ============================================
        cdk_nag_1.NagSuppressions.addResourceSuppressions(this.userPool, [
            {
                id: 'AwsSolutions-COG3',
                reason: 'Sample project: Advanced Security Mode requires Cognito Plus plan. Production deployments should enable for adaptive authentication.',
            },
        ]);
        cdk_nag_1.NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/WeatherAlertUserPool/smsRole/Resource`, [
            {
                id: 'AwsSolutions-IAM5',
                reason: 'Wildcard permission required by Cognito for SMS MFA functionality. This is AWS-managed behavior.',
                appliesTo: ['Resource::*'],
            },
        ]);
        // ============================================
        // Lambda Suppressions
        // ============================================
        cdk_nag_1.NagSuppressions.addResourceSuppressions(sqsPollerFn, [
            {
                id: 'AwsSolutions-IAM4',
                reason: 'AWSLambdaBasicExecutionRole is AWS managed policy for Lambda execution. Required for CloudWatch Logs access.',
                appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
            },
        ], true);
        // ============================================
        // API Gateway Suppressions
        // Production recommendation: Enable CloudWatch Logs and request validation
        // ============================================
        cdk_nag_1.NagSuppressions.addResourceSuppressions(api, [
            {
                id: 'AwsSolutions-APIG2',
                reason: 'Sample project: Request validation handled by Lambda function. Production should add API Gateway validation.',
            },
            {
                id: 'AwsSolutions-APIG1',
                reason: 'Sample project: Access logging disabled to reduce costs. Production should enable CloudWatch Logs.',
            },
            {
                id: 'AwsSolutions-APIG6',
                reason: 'Sample project: CloudWatch logging disabled to reduce costs. Production should enable for monitoring.',
            },
        ], true);
        // ============================================
        // CloudFront Suppressions
        // Production recommendation: Enable access logging and use custom TLS certificate
        // ============================================
        cdk_nag_1.NagSuppressions.addResourceSuppressions(this.distribution, [
            {
                id: 'AwsSolutions-CFR3',
                reason: 'Sample project: Access logging disabled to reduce costs. Production should enable for audit trails.',
            },
            {
                id: 'AwsSolutions-CFR4',
                reason: 'Sample project: Using default CloudFront certificate. Production should use custom certificate with ACM.',
            },
        ]);
    }
}
exports.WeatherAlertWebHostingStack = WeatherAlertWebHostingStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViLWhvc3Rpbmctc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3ZWItaG9zdGluZy1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMseUNBQXlDO0FBQ3pDLGdHQUFnRztBQUNoRyx5REFBeUQ7QUFDekQsOERBQThEO0FBQzlELG1EQUFtRDtBQUNuRCwyQ0FBMkM7QUFFM0MseURBQXlEO0FBQ3pELGlEQUFpRDtBQUVqRCxxQ0FBMEM7QUFNMUMsTUFBYSwyQkFBNEIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUt4RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLCtDQUErQztRQUMvQyx1Q0FBdUM7UUFDdkMsK0NBQStDO1FBQy9DLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUNqRSxZQUFZLEVBQUUsbUJBQW1CO1lBQ2pDLGlCQUFpQixFQUFFLEtBQUssRUFBRSxtQ0FBbUM7WUFDN0QsYUFBYSxFQUFFO2dCQUNiLEtBQUssRUFBRSxJQUFJO2dCQUNYLFFBQVEsRUFBRSxJQUFJO2FBQ2Y7WUFDRCxVQUFVLEVBQUU7Z0JBQ1YsS0FBSyxFQUFFLElBQUk7YUFDWjtZQUNELGNBQWMsRUFBRTtnQkFDZCxTQUFTLEVBQUUsRUFBRTtnQkFDYixnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixhQUFhLEVBQUUsSUFBSTtnQkFDbkIsY0FBYyxFQUFFLElBQUk7YUFDckI7WUFDRCxlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWUsQ0FBQyxVQUFVO1lBQ25ELGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxvQkFBb0I7WUFDN0QsR0FBRyxFQUFFLE9BQU8sQ0FB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QyxZQUFZLEVBQ2pCO1lBQ0U7Z0JBQ0UsRUFBRSxFQUFFLG1CQUFtQjtnQkFDdkIsTUFBTSxFQUFFLHFHQUFxRzthQUM5RztZQUNEO2dCQUNFLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLE1BQU0sRUFBRSwwR0FBMEc7YUFDbkg7U0FDRixDQUNGLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUF4WEQsa0VBd1hDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcclxuLy8gaW1wb3J0ICogYXMgczNkZXBsb3kgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLWRlcGxveW1lbnQnOyAvLyBVbmNvbW1lbnQgd2hlbiBkZXBsb3lpbmcgd2ViIFVJXHJcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xyXG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xyXG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcclxuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xyXG5pbXBvcnQgKiBhcyBzcXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNxcyc7XHJcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcclxuXHJcbmludGVyZmFjZSBXZWJIb3N0aW5nU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcclxuICBub3RpZnlRdWV1ZTogc3FzLlF1ZXVlO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgV2VhdGhlckFsZXJ0V2ViSG9zdGluZ1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBwdWJsaWMgcmVhZG9ubHkgZGlzdHJpYnV0aW9uOiBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbjtcclxuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2w6IGNvZ25pdG8uVXNlclBvb2w7XHJcbiAgcHVibGljIHJlYWRvbmx5IHdlYkJ1Y2tldDogczMuQnVja2V0O1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogV2ViSG9zdGluZ1N0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBmb3IgQXV0aGVudGljYXRpb25cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICB0aGlzLnVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1dlYXRoZXJBbGVydFVzZXJQb29sJywge1xyXG4gICAgICB1c2VyUG9vbE5hbWU6ICdXZWF0aGVyQWxlcnRVc2VycycsXHJcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiBmYWxzZSwgLy8gQWRtaW4gY3JlYXRlcyB1c2VycyBmb3Igc2VjdXJpdHlcclxuICAgICAgc2lnbkluQWxpYXNlczoge1xyXG4gICAgICAgIGVtYWlsOiB0cnVlLFxyXG4gICAgICAgIHVzZXJuYW1lOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBhdXRvVmVyaWZ5OiB7XHJcbiAgICAgICAgZW1haWw6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XHJcbiAgICAgICAgbWluTGVuZ3RoOiAxMixcclxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxyXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXHJcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcclxuICAgICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sIC8vIFByb3RlY3QgdXNlciBkYXRhXHJcbiAgICAgIG1mYTogY29nbml0by5NZmEuT1BUSU9OQUwsXHJcbiAgICAgIG1mYVNlY29uZEZhY3Rvcjoge1xyXG4gICAgICAgIHNtczogdHJ1ZSxcclxuICAgICAgICBvdHA6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIC8vIE5vdGU6IEFkdmFuY2VkIFNlY3VyaXR5IE1vZGUgcmVxdWlyZXMgQ29nbml0byBQbHVzIHBsYW5cclxuICAgICAgLy8gRm9yIHByb2R1Y3Rpb24sIGNvbnNpZGVyIHVwZ3JhZGluZyB0byBlbmFibGUgYWR2YW5jZWQgc2VjdXJpdHkgZmVhdHVyZXNcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFVzZXIgUG9vbCBDbGllbnQgZm9yIHdlYiBhcHBcclxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gdGhpcy51c2VyUG9vbC5hZGRDbGllbnQoJ1dlYXRoZXJBbGVydFdlYkNsaWVudCcsIHtcclxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAnV2VhdGhlckFsZXJ0V2ViQXBwJyxcclxuICAgICAgYXV0aEZsb3dzOiB7XHJcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxyXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIG9BdXRoOiB7XHJcbiAgICAgICAgZmxvd3M6IHtcclxuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBzY29wZXM6IFtcclxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCxcclxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsXHJcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuUFJPRklMRSxcclxuICAgICAgICBdLFxyXG4gICAgICB9LFxyXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIElkZW50aXR5IFBvb2wgZm9yIEFXUyByZXNvdXJjZSBhY2Nlc3NcclxuICAgIGNvbnN0IGlkZW50aXR5UG9vbCA9IG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbCh0aGlzLCAnV2VhdGhlckFsZXJ0SWRlbnRpdHlQb29sJywge1xyXG4gICAgICBpZGVudGl0eVBvb2xOYW1lOiAnV2VhdGhlckFsZXJ0SWRlbnRpdHknLFxyXG4gICAgICBhbGxvd1VuYXV0aGVudGljYXRlZElkZW50aXRpZXM6IGZhbHNlLFxyXG4gICAgICBjb2duaXRvSWRlbnRpdHlQcm92aWRlcnM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBjbGllbnRJZDogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcclxuICAgICAgICAgIHByb3ZpZGVyTmFtZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbFByb3ZpZGVyTmFtZSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gSUFNIHJvbGUgZm9yIGF1dGhlbnRpY2F0ZWQgdXNlcnNcclxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDb2duaXRvQXV0aGVudGljYXRlZFJvbGUnLCB7XHJcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoXHJcbiAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbScsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XHJcbiAgICAgICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkJzogaWRlbnRpdHlQb29sLnJlZixcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICAnRm9yQW55VmFsdWU6U3RyaW5nTGlrZSc6IHtcclxuICAgICAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphbXInOiAnYXV0aGVudGljYXRlZCcsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgJ3N0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5J1xyXG4gICAgICApLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQXR0YWNoIHJvbGUgdG8gaWRlbnRpdHkgcG9vbFxyXG4gICAgbmV3IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sUm9sZUF0dGFjaG1lbnQodGhpcywgJ0lkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50Jywge1xyXG4gICAgICBpZGVudGl0eVBvb2xJZDogaWRlbnRpdHlQb29sLnJlZixcclxuICAgICAgcm9sZXM6IHtcclxuICAgICAgICBhdXRoZW50aWNhdGVkOiBhdXRoZW50aWNhdGVkUm9sZS5yb2xlQXJuLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIEFQSSBHYXRld2F5IGZvciBTUVMgUG9sbGluZyAoU2VjdXJlKVxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIFxyXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIHRvIHBvbGwgU1FTIGFuZCByZXR1cm4gbWVzc2FnZXNcclxuICAgIGNvbnN0IHNxc1BvbGxlckZuID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU1FTUG9sbGVyRnVuY3Rpb24nLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ1dlYXRoZXJBbGVydC1TUVNQb2xsZXInLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xNCxcclxuICAgICAgaGFuZGxlcjogJ2luZGV4LmxhbWJkYV9oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9sYW1iZGEvc3FzLXBvbGxlcicpLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgTk9USUZZX1FVRVVFX1VSTDogcHJvcHMubm90aWZ5UXVldWUucXVldWVVcmwsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHcmFudCBTUVMgcmVhZCBwZXJtaXNzaW9uc1xyXG4gICAgcHJvcHMubm90aWZ5UXVldWUuZ3JhbnRDb25zdW1lTWVzc2FnZXMoc3FzUG9sbGVyRm4pO1xyXG5cclxuICAgIC8vIEFQSSBHYXRld2F5IHdpdGggQ29nbml0byBhdXRob3JpemVyXHJcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdXZWF0aGVyQWxlcnRBUEknLCB7XHJcbiAgICAgIHJlc3RBcGlOYW1lOiAnV2VhdGhlciBBbGVydCBBUEknLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyZSBBUEkgZm9yIGZldGNoaW5nIHdlYXRoZXIgYWxlcnRzJyxcclxuICAgICAgZGVwbG95T3B0aW9uczoge1xyXG4gICAgICAgIHN0YWdlTmFtZTogJ3Byb2QnLFxyXG4gICAgICAgIHRocm90dGxpbmdSYXRlTGltaXQ6IDEwMCxcclxuICAgICAgICB0aHJvdHRsaW5nQnVyc3RMaW1pdDogMjAwLFxyXG4gICAgICAgIC8vIExvZ2dpbmcgZGlzYWJsZWQgLSByZXF1aXJlcyBDbG91ZFdhdGNoIExvZ3Mgcm9sZSBzZXR1cFxyXG4gICAgICAgIC8vIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcclxuICAgICAgICAvLyBkYXRhVHJhY2VFbmFibGVkOiB0cnVlLFxyXG4gICAgICAgIG1ldHJpY3NFbmFibGVkOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcclxuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUywgLy8gV2lsbCBiZSByZXN0cmljdGVkIGJ5IENsb3VkRnJvbnRcclxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcclxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcclxuICAgICAgICAgICdDb250ZW50LVR5cGUnLFxyXG4gICAgICAgICAgJ1gtQW16LURhdGUnLFxyXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxyXG4gICAgICAgICAgJ1gtQXBpLUtleScsXHJcbiAgICAgICAgICAnWC1BbXotU2VjdXJpdHktVG9rZW4nLFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDb2duaXRvIGF1dGhvcml6ZXJcclxuICAgIGNvbnN0IGF1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcih0aGlzLCAnQ29nbml0b0F1dGhvcml6ZXInLCB7XHJcbiAgICAgIGNvZ25pdG9Vc2VyUG9vbHM6IFt0aGlzLnVzZXJQb29sXSxcclxuICAgICAgYXV0aG9yaXplck5hbWU6ICdXZWF0aGVyQWxlcnRDb2duaXRvQXV0aG9yaXplcicsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBUEkgZW5kcG9pbnQ6IEdFVCAvbWVzc2FnZXNcclxuICAgIGNvbnN0IG1lc3NhZ2VzID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ21lc3NhZ2VzJyk7XHJcbiAgICBtZXNzYWdlcy5hZGRNZXRob2QoXHJcbiAgICAgICdHRVQnLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihzcXNQb2xsZXJGbiksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIFMzIEJ1Y2tldCBmb3IgU3RhdGljIFdlYnNpdGVcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICB0aGlzLndlYkJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1dlYXRoZXJBbGVydFdlYkJ1Y2tldCcsIHtcclxuICAgICAgYnVja2V0TmFtZTogYHdlYXRoZXItYWxlcnQtd2ViLXVpLSR7dGhpcy5hY2NvdW50fWAsXHJcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcclxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcclxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXHJcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsXHJcbiAgICAgIHNlcnZlckFjY2Vzc0xvZ3NQcmVmaXg6ICdhY2Nlc3MtbG9ncy8nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ2xvdWRGcm9udCBPcmlnaW4gQWNjZXNzIENvbnRyb2wgKE9BQykgLSByZWNvbW1lbmRlZCBvdmVyIE9BSVxyXG4gICAgY29uc3Qgb3JpZ2luQWNjZXNzQ29udHJvbCA9IG5ldyBjbG91ZGZyb250LlMzT3JpZ2luQWNjZXNzQ29udHJvbChcclxuICAgICAgdGhpcyxcclxuICAgICAgJ1dlYXRoZXJBbGVydE9BQycsXHJcbiAgICAgIHtcclxuICAgICAgICBvcmlnaW5BY2Nlc3NDb250cm9sTmFtZTogJ1dlYXRoZXJBbGVydE9BQycsXHJcbiAgICAgICAgZGVzY3JpcHRpb246ICdPQUMgZm9yIFdlYXRoZXIgQWxlcnQgV2ViIFVJIFMzIGJ1Y2tldCcsXHJcbiAgICAgICAgc2lnbmluZzogY2xvdWRmcm9udC5TaWduaW5nLlNJR1Y0X0FMV0FZUyxcclxuICAgICAgfVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gQ2xvdWRGcm9udCBEaXN0cmlidXRpb25cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICB0aGlzLmRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnV2VhdGhlckFsZXJ0RGlzdHJpYnV0aW9uJywge1xyXG4gICAgICBjb21tZW50OiAnV2VhdGhlciBBbGVydCBTeXN0ZW0gV2ViIFVJJyxcclxuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XHJcbiAgICAgICAgb3JpZ2luOiBvcmlnaW5zLlMzQnVja2V0T3JpZ2luLndpdGhPcmlnaW5BY2Nlc3NDb250cm9sKHRoaXMud2ViQnVja2V0LCB7XHJcbiAgICAgICAgICBvcmlnaW5BY2Nlc3NDb250cm9sLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxyXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFEX09QVElPTlMsXHJcbiAgICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFEX09QVElPTlMsXHJcbiAgICAgICAgY29tcHJlc3M6IHRydWUsXHJcbiAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19PUFRJTUlaRUQsXHJcbiAgICAgIH0sXHJcbiAgICAgIGRlZmF1bHRSb290T2JqZWN0OiAnaW5kZXguaHRtbCcsXHJcbiAgICAgIGVycm9yUmVzcG9uc2VzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaHR0cFN0YXR1czogNDAzLFxyXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXHJcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxyXG4gICAgICAgICAgdHRsOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcclxuICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxyXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcclxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgICAgcHJpY2VDbGFzczogY2xvdWRmcm9udC5QcmljZUNsYXNzLlBSSUNFX0NMQVNTXzEwMCwgLy8gVVMsIENhbmFkYSwgRXVyb3BlXHJcbiAgICAgIC8vIExvZ2dpbmcgZGlzYWJsZWQgZm9yIG5vdyAtIGNhbiBiZSBlbmFibGVkIGxhdGVyIGlmIG5lZWRlZFxyXG4gICAgICAvLyBlbmFibGVMb2dnaW5nOiB0cnVlLFxyXG4gICAgICAvLyBsb2dCdWNrZXQ6IG5ldyBzMy5CdWNrZXQodGhpcywgJ0Nsb3VkRnJvbnRMb2dCdWNrZXQnLCB7XHJcbiAgICAgIC8vICAgYnVja2V0TmFtZTogYHdlYXRoZXItYWxlcnQtY2YtbG9ncy0ke3RoaXMuYWNjb3VudH1gLFxyXG4gICAgICAvLyAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcclxuICAgICAgLy8gICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxyXG4gICAgICAvLyAgIG9iamVjdE93bmVyc2hpcDogczMuT2JqZWN0T3duZXJzaGlwLkJVQ0tFVF9PV05FUl9QUkVGRVJSRUQsXHJcbiAgICAgIC8vICAgbGlmZWN5Y2xlUnVsZXM6IFtcclxuICAgICAgLy8gICAgIHtcclxuICAgICAgLy8gICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxyXG4gICAgICAvLyAgICAgfSxcclxuICAgICAgLy8gICBdLFxyXG4gICAgICAvLyAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcclxuICAgICAgLy8gfSksXHJcbiAgICAgIC8vIGxvZ0ZpbGVQcmVmaXg6ICdjbG91ZGZyb250LWxvZ3MvJyxcclxuICAgICAgbWluaW11bVByb3RvY29sVmVyc2lvbjogY2xvdWRmcm9udC5TZWN1cml0eVBvbGljeVByb3RvY29sLlRMU19WMV8yXzIwMjEsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gRGVwbG95IFdlYiBVSSB0byBTM1xyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIENvbW1lbnRlZCBvdXQgZm9yIGluaXRpYWwgZGVwbG95bWVudCAtIGJ1aWxkIHdlYi11aSBmaXJzdCwgdGhlbiB1bmNvbW1lbnQgYW5kIHJlZGVwbG95XHJcbiAgICAvKlxyXG4gICAgbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcywgJ0RlcGxveVdlYlVJJywge1xyXG4gICAgICBzb3VyY2VzOiBbczNkZXBsb3kuU291cmNlLmFzc2V0KCcuLi93ZWItdWkvYnVpbGQnKV0sXHJcbiAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiB0aGlzLndlYkJ1Y2tldCxcclxuICAgICAgZGlzdHJpYnV0aW9uOiB0aGlzLmRpc3RyaWJ1dGlvbixcclxuICAgICAgZGlzdHJpYnV0aW9uUGF0aHM6IFsnLyonXSxcclxuICAgICAgcHJ1bmU6IHRydWUsXHJcbiAgICB9KTtcclxuICAgICovXHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIENsb3VkRm9ybWF0aW9uIE91dHB1dHNcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnV2Vic2l0ZVVSTCcsIHtcclxuICAgICAgdmFsdWU6IGBodHRwczovLyR7dGhpcy5kaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgVVJMIGZvciBXZWF0aGVyIEFsZXJ0IFdlYiBVSScsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdXZWF0aGVyQWxlcnRXZWJzaXRlVVJMJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1dlYXRoZXJBbGVydFVzZXJQb29sSWQnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XHJcbiAgICAgIHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdXZWF0aGVyQWxlcnRVc2VyUG9vbENsaWVudElkJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdJZGVudGl0eVBvb2xJZCcsIHtcclxuICAgICAgdmFsdWU6IGlkZW50aXR5UG9vbC5yZWYsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBJZGVudGl0eSBQb29sIElEJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1dlYXRoZXJBbGVydElkZW50aXR5UG9vbElkJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlFbmRwb2ludCcsIHtcclxuICAgICAgdmFsdWU6IGFwaS51cmwsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgZW5kcG9pbnQgZm9yIGZldGNoaW5nIG1lc3NhZ2VzJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1dlYXRoZXJBbGVydEFwaUVuZHBvaW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdSZWdpb24nLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLnJlZ2lvbixcclxuICAgICAgZGVzY3JpcHRpb246ICdBV1MgUmVnaW9uJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1dlYXRoZXJBbGVydFJlZ2lvbicsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDREsgTmFnIFN1cHByZXNzaW9uc1xyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIFNFQ1VSSVRZIE5PVEU6IFRoaXMgc29sdXRpb24gaXMgaW50ZW5kZWQgYXMgYSBzYW1wbGUvcmVmZXJlbmNlIGFyY2hpdGVjdHVyZS5cclxuICAgIC8vIFByb2R1Y3Rpb24gZGVwbG95bWVudHMgc2hvdWxkIGltcGxlbWVudCBhZGRpdGlvbmFsIHNlY3VyaXR5IGJlc3QgcHJhY3RpY2VzLlxyXG4gICAgLy8gUmVmZXIgdG8gdGhlIFNlY3VyaXR5IFBpbGxhciBvZiB0aGUgQVdTIFdlbGwtQXJjaGl0ZWN0ZWQgRnJhbWV3b3JrOlxyXG4gICAgLy8gaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL3dlbGxhcmNoaXRlY3RlZC9sYXRlc3Qvc2VjdXJpdHktcGlsbGFyL3dlbGNvbWUuaHRtbFxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIHRoaXMuYWRkTmFnU3VwcHJlc3Npb25zKGFwaSwgc3FzUG9sbGVyRm4pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGROYWdTdXBwcmVzc2lvbnMoYXBpOiBhcGlnYXRld2F5LlJlc3RBcGksIHNxc1BvbGxlckZuOiBsYW1iZGEuRnVuY3Rpb24pIHtcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBDb2duaXRvIFN1cHByZXNzaW9uc1xyXG4gICAgLy8gUHJvZHVjdGlvbiByZWNvbW1lbmRhdGlvbjogVXBncmFkZSB0byBDb2duaXRvIFBsdXMgcGxhbiBmb3IgQWR2YW5jZWQgU2VjdXJpdHkgTW9kZVxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcclxuICAgICAgdGhpcy51c2VyUG9vbCxcclxuICAgICAgW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGlkOiAnQXdzU29sdXRpb25zLUNPRzMnLFxyXG4gICAgICAgICAgcmVhc29uOiAnU2FtcGxlIHByb2plY3Q6IEFkdmFuY2VkIFNlY3VyaXR5IE1vZGUgcmVxdWlyZXMgQ29nbml0byBQbHVzIHBsYW4uIFByb2R1Y3Rpb24gZGVwbG95bWVudHMgc2hvdWxkIGVuYWJsZSBmb3IgYWRhcHRpdmUgYXV0aGVudGljYXRpb24uJyxcclxuICAgICAgICB9LFxyXG4gICAgICBdXHJcbiAgICApO1xyXG5cclxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9uc0J5UGF0aChcclxuICAgICAgdGhpcyxcclxuICAgICAgYCR7dGhpcy5zdGFja05hbWV9L1dlYXRoZXJBbGVydFVzZXJQb29sL3Ntc1JvbGUvUmVzb3VyY2VgLFxyXG4gICAgICBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtSUFNNScsXHJcbiAgICAgICAgICByZWFzb246ICdXaWxkY2FyZCBwZXJtaXNzaW9uIHJlcXVpcmVkIGJ5IENvZ25pdG8gZm9yIFNNUyBNRkEgZnVuY3Rpb25hbGl0eS4gVGhpcyBpcyBBV1MtbWFuYWdlZCBiZWhhdmlvci4nLFxyXG4gICAgICAgICAgYXBwbGllc1RvOiBbJ1Jlc291cmNlOjoqJ10sXHJcbiAgICAgICAgfSxcclxuICAgICAgXVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gTGFtYmRhIFN1cHByZXNzaW9uc1xyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcclxuICAgICAgc3FzUG9sbGVyRm4sXHJcbiAgICAgIFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1JQU00JyxcclxuICAgICAgICAgIHJlYXNvbjogJ0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZSBpcyBBV1MgbWFuYWdlZCBwb2xpY3kgZm9yIExhbWJkYSBleGVjdXRpb24uIFJlcXVpcmVkIGZvciBDbG91ZFdhdGNoIExvZ3MgYWNjZXNzLicsXHJcbiAgICAgICAgICBhcHBsaWVzVG86IFsnUG9saWN5Ojphcm46PEFXUzo6UGFydGl0aW9uPjppYW06OmF3czpwb2xpY3kvc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZSddLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIHRydWVcclxuICAgICk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIEFQSSBHYXRld2F5IFN1cHByZXNzaW9uc1xyXG4gICAgLy8gUHJvZHVjdGlvbiByZWNvbW1lbmRhdGlvbjogRW5hYmxlIENsb3VkV2F0Y2ggTG9ncyBhbmQgcmVxdWVzdCB2YWxpZGF0aW9uXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxyXG4gICAgICBhcGksXHJcbiAgICAgIFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBpZDogJ0F3c1NvbHV0aW9ucy1BUElHMicsXHJcbiAgICAgICAgICByZWFzb246ICdTYW1wbGUgcHJvamVjdDogUmVxdWVzdCB2YWxpZGF0aW9uIGhhbmRsZWQgYnkgTGFtYmRhIGZ1bmN0aW9uLiBQcm9kdWN0aW9uIHNob3VsZCBhZGQgQVBJIEdhdGV3YXkgdmFsaWRhdGlvbi4nLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtQVBJRzEnLFxyXG4gICAgICAgICAgcmVhc29uOiAnU2FtcGxlIHByb2plY3Q6IEFjY2VzcyBsb2dnaW5nIGRpc2FibGVkIHRvIHJlZHVjZSBjb3N0cy4gUHJvZHVjdGlvbiBzaG91bGQgZW5hYmxlIENsb3VkV2F0Y2ggTG9ncy4nLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtQVBJRzYnLFxyXG4gICAgICAgICAgcmVhc29uOiAnU2FtcGxlIHByb2plY3Q6IENsb3VkV2F0Y2ggbG9nZ2luZyBkaXNhYmxlZCB0byByZWR1Y2UgY29zdHMuIFByb2R1Y3Rpb24gc2hvdWxkIGVuYWJsZSBmb3IgbW9uaXRvcmluZy4nLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIHRydWVcclxuICAgICk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIENsb3VkRnJvbnQgU3VwcHJlc3Npb25zXHJcbiAgICAvLyBQcm9kdWN0aW9uIHJlY29tbWVuZGF0aW9uOiBFbmFibGUgYWNjZXNzIGxvZ2dpbmcgYW5kIHVzZSBjdXN0b20gVExTIGNlcnRpZmljYXRlXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxyXG4gICAgICB0aGlzLmRpc3RyaWJ1dGlvbixcclxuICAgICAgW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGlkOiAnQXdzU29sdXRpb25zLUNGUjMnLFxyXG4gICAgICAgICAgcmVhc29uOiAnU2FtcGxlIHByb2plY3Q6IEFjY2VzcyBsb2dnaW5nIGRpc2FibGVkIHRvIHJlZHVjZSBjb3N0cy4gUHJvZHVjdGlvbiBzaG91bGQgZW5hYmxlIGZvciBhdWRpdCB0cmFpbHMuJyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGlkOiAnQXdzU29sdXRpb25zLUNGUjQnLFxyXG4gICAgICAgICAgcmVhc29uOiAnU2FtcGxlIHByb2plY3Q6IFVzaW5nIGRlZmF1bHQgQ2xvdWRGcm9udCBjZXJ0aWZpY2F0ZS4gUHJvZHVjdGlvbiBzaG91bGQgdXNlIGN1c3RvbSBjZXJ0aWZpY2F0ZSB3aXRoIEFDTS4nLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF1cclxuICAgICk7XHJcbiAgfVxyXG59XHJcbiJdfQ==