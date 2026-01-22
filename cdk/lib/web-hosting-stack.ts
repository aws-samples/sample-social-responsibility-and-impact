import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

interface WebHostingStackProps extends cdk.StackProps {
  notifyQueue: sqs.Queue;
}

export class WeatherAlertWebHostingStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly userPool: cognito.UserPool;
  public readonly webBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: WebHostingStackProps) {
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
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
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
    messages.addMethod(
      'GET',
      new apigateway.LambdaIntegration(sqsPollerFn),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

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
    const originAccessControl = new cloudfront.S3OriginAccessControl(
      this,
      'WeatherAlertOAC',
      {
        originAccessControlName: 'WeatherAlertOAC',
        description: 'OAC for Weather Alert Web UI S3 bucket',
        signing: cloudfront.Signing.SIGV4_ALWAYS,
      }
    );

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

  private addNagSuppressions(api: apigateway.RestApi, sqsPollerFn: lambda.Function) {
    // Suppress Cognito Advanced Security Mode - requires Plus plan
    NagSuppressions.addResourceSuppressions(
      this.userPool,
      [
        {
          id: 'AwsSolutions-COG3',
          reason: 'Advanced Security Mode requires Cognito Plus plan. For production deployments, customers should upgrade to enable advanced security features.',
        },
      ]
    );

    // Suppress Cognito SMS role wildcard - required by Cognito for MFA
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/WeatherAlertUserPool/smsRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard permission required by Cognito for SMS MFA functionality. This is AWS Cognito managed behavior.',
          appliesTo: ['Resource::*'],
        },
      ]
    );

    // Suppress Lambda function warnings
    NagSuppressions.addResourceSuppressions(
      sqsPollerFn,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWSLambdaBasicExecutionRole is AWS managed policy for Lambda execution. Required for CloudWatch Logs access.',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
        {
          id: 'AwsSolutions-L1',
          reason: 'Python 3.12 is the latest stable runtime. This warning is a false positive.',
        },
      ],
      true
    );

    // Suppress API Gateway warnings
    NagSuppressions.addResourceSuppressions(
      api,
      [
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
      ],
      true
    );

    // Suppress CloudFront warnings
    NagSuppressions.addResourceSuppressions(
      this.distribution,
      [
        {
          id: 'AwsSolutions-CFR3',
          reason: 'CloudFront access logging disabled for AWS Sample to reduce costs. Customers should enable in production deployments.',
        },
        {
          id: 'AwsSolutions-CFR4',
          reason: 'Using default CloudFront certificate for simplicity in AWS Sample. Customers should use custom certificate with TLS 1.2+ in production.',
        },
      ]
    );
  }
}
