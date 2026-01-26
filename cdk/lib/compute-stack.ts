import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

interface ComputeStackProps extends cdk.StackProps {
  mumTable: dynamodb.ITable;
  locationFetchQueue: sqs.Queue;
  weatherResultQueue: sqs.Queue;
  adviceRequestQueue: sqs.Queue;
  notifyQueue: sqs.Queue;
  dataBucket: s3.Bucket;
}

export class WeatherAlertComputeStack extends cdk.Stack {
  public readonly profilesToLocationsFn: lambda.Function;
  public readonly weatherFetchFn: lambda.Function;
  public readonly adviceFn: lambda.Function;
  public readonly sendAdviceSMSFn: lambda.Function;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // Secrets for API keys
    const tomorrowIoSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'TomorrowIoSecret',
      'weather-alert/api-key'
    );

    // Commented out - Africa's Talking is optional
    // const africasTalkingSecret = secretsmanager.Secret.fromSecretNameV2(
    //   this,
    //   'AfricasTalkingSecret',
    //   'weather-alert-system/sms-credentials'
    // );

    // Common Lambda configuration
    const commonLambdaProps = {
      runtime: lambda.Runtime.PYTHON_3_14,
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        POWERTOOLS_SERVICE_NAME: 'weather-alert-system',
        LOG_LEVEL: 'INFO',
      },
    };

    // 1. RecipientsToLocationsFn - Scans DDB and queues locations
    this.profilesToLocationsFn = new lambda.Function(this, 'RecipientsToLocationsFn', {
      ...commonLambdaProps,
      functionName: 'WeatherAlert-RecipientsToLocations',
      description: 'Scans DynamoDB for recipient profiles and queues unique locations',
      code: lambda.Code.fromAsset('../lambda/recipients-to-locations'),
      handler: 'index.lambda_handler',
      environment: {
        ...commonLambdaProps.environment,
        RECIPIENTS_TABLE_NAME: props.mumTable.tableName,
        MUM_TABLE_NAME: props.mumTable.tableName, // Backward compatibility
        LOCATION_QUEUE_URL: props.locationFetchQueue.queueUrl,
      },
    });

    // Grant permissions
    props.mumTable.grantReadData(this.profilesToLocationsFn);
    props.locationFetchQueue.grantSendMessages(this.profilesToLocationsFn);

    // EventBridge rule to trigger daily at 6 AM UTC (9 AM EAT)
    const dailyRule = new events.Rule(this, 'DailyWeatherCheckRule', {
      ruleName: 'WeatherAlert-DailyWeatherCheck',
      description: 'Triggers weather alert workflow daily',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '6',
        weekDay: '*',
      }),
    });
    dailyRule.addTarget(new targets.LambdaFunction(this.profilesToLocationsFn));

    // 2. WeatherFetchFn - Fetches weather from Tomorrow.io
    this.weatherFetchFn = new lambda.Function(this, 'WeatherFetchFn', {
      ...commonLambdaProps,
      functionName: 'WeatherAlert-WeatherFetch',
      description: 'Fetches weather forecasts from Tomorrow.io API',
      code: lambda.Code.fromAsset('../lambda/weather-fetch'),
      handler: 'index.lambda_handler',
      timeout: cdk.Duration.seconds(300),
      reservedConcurrentExecutions: 1, // Rate limit API calls (Tomorrow.io free tier: 500/day)
      environment: {
        ...commonLambdaProps.environment,
        WEATHER_RESULT_QUEUE_URL: props.weatherResultQueue.queueUrl,
        TEMP_THRESHOLD_C: '32',
        TOMORROW_IO_API_KEY: tomorrowIoSecret.secretValue.unsafeUnwrap(),
      },
    });

    // Grant permissions
    props.weatherResultQueue.grantSendMessages(this.weatherFetchFn);
    tomorrowIoSecret.grantRead(this.weatherFetchFn);

    // SQS trigger from LocationFetch queue
    this.weatherFetchFn.addEventSource(
      new SqsEventSource(props.locationFetchQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
        reportBatchItemFailures: true,
      })
    );

    // 3. MessageGeneratorFn - Generates personalized messages using Bedrock
    this.adviceFn = new lambda.Function(this, 'MessageGeneratorFn', {
      ...commonLambdaProps,
      functionName: 'WeatherAlert-MessageGenerator',
      description: 'Generates personalized messages using Bedrock KB and Claude',
      code: lambda.Code.fromAsset('../lambda/message-generator'),
      handler: 'index.lambda_handler',
      timeout: cdk.Duration.seconds(300),
      memorySize: 1024,
      reservedConcurrentExecutions: 2, // Limit Bedrock API calls to prevent throttling
      environment: {
        ...commonLambdaProps.environment,
        NOTIFY_QUEUE_URL: props.notifyQueue.queueUrl,
        BEDROCK_KNOWLEDGE_BASE_ID: cdk.Fn.importValue('WeatherAlertBedrockKBId'),
        BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
        BEDROCK_SYSTEM_PROMPT: 'You are a maternal health advisor providing supportive, actionable health advice to pregnant and postpartum mothers based on weather forecasts.',
      },
    });

    // Grant Bedrock permissions
    this.adviceFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
        ],
      })
    );

    this.adviceFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:Retrieve'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*`,
        ],
      })
    );

    props.notifyQueue.grantSendMessages(this.adviceFn);

    // SQS trigger from WeatherResult queue
    this.adviceFn.addEventSource(
      new SqsEventSource(props.weatherResultQueue, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(10),
        reportBatchItemFailures: true,
      })
    );

    // 4. SendAdviceSMSFn - Sends SMS via Africa's Talking (optional)
    // Commented out for initial deployment - create Africa's Talking secret first
    this.sendAdviceSMSFn = new lambda.Function(this, 'SendAdviceSMSFn', {
      ...commonLambdaProps,
      functionName: 'WeatherAlert-SendSMS',
      description: 'Sends SMS notifications via Africas Talking',
      code: lambda.Code.fromAsset('../lambda/send-sms'),
      handler: 'index.lambda_handler',
      environment: {
        ...commonLambdaProps.environment,
        AT_API_KEY: 'NOT_CONFIGURED',
        AT_USERNAME: 'NOT_CONFIGURED',
        AT_SENDER_ID: 'WeatherAlert',
      },
    });

    // africasTalkingSecret.grantRead(this.sendAdviceSMSFn);

    // Optional: Add SQS trigger from NotifyQueue or AdviceRequest
    // Uncomment when ready to send actual SMS
    /*
    this.sendAdviceSMSFn.addEventSource(
      new SqsEventSource(props.notifyQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
        reportBatchItemFailures: true,
      })
    );
    */

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'ProfilesToLocationsFnArn', {
      value: this.profilesToLocationsFn.functionArn,
      description: 'ARN of ProfilesToLocations Lambda',
    });

    new cdk.CfnOutput(this, 'WeatherFetchFnArn', {
      value: this.weatherFetchFn.functionArn,
      description: 'ARN of WeatherFetch Lambda',
    });

    new cdk.CfnOutput(this, 'AdviceFnArn', {
      value: this.adviceFn.functionArn,
      description: 'ARN of Advice Lambda',
    });

    // CDK Nag Suppressions
    // ============================================
    // SECURITY NOTE: This solution is intended as a sample/reference architecture.
    // Production deployments should implement additional security best practices.
    // Refer to the Security Pillar of the AWS Well-Architected Framework:
    // https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html
    // ============================================
    this.addNagSuppressions();
  }

  private addNagSuppressions() {
    // ============================================
    // Lambda Suppressions
    // Production recommendation: Consider VPC deployment and custom IAM policies
    // ============================================
    const lambdaFunctions = [
      this.profilesToLocationsFn,
      this.weatherFetchFn,
      this.adviceFn,
      this.sendAdviceSMSFn,
    ];

    lambdaFunctions.forEach((fn) => {
      NagSuppressions.addResourceSuppressions(
        fn,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'AWSLambdaBasicExecutionRole is AWS managed policy for Lambda execution. Required for CloudWatch Logs access.',
            appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
          },
        ],
        true // Apply to children (role, policy)
      );

      // ============================================
      // IAM Wildcard Suppressions
      // Production recommendation: Scope permissions to specific resources where possible
      // ============================================
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/${fn.node.id}/ServiceRole/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Sample project: Wildcard permissions required for CloudWatch Logs (log stream creation), DynamoDB queries, and Bedrock Knowledge Base access. Production should scope to specific resources.',
            appliesTo: [
              'Resource::*',
              'Action::logs:CreateLogStream',
              'Action::logs:PutLogEvents',
              'Resource::arn:aws:bedrock:us-east-1:<AWS::AccountId>:knowledge-base/*',
            ],
          },
        ]
      );
    });

    // ============================================
    // CDK-Generated Resource Suppressions
    // These are standard CDK behaviors that cannot be modified
    // ============================================
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'CDK-created log retention Lambda uses AWS managed policy. This is standard CDK behavior.',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
      ],
      true
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'CDK-created log retention Lambda requires wildcard for log management. This is standard CDK behavior.',
          appliesTo: ['Resource::*'],
        },
      ]
    );
  }
}
