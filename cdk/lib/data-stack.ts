import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export class WeatherAlertDataStack extends cdk.Stack {
  public readonly mumTable: dynamodb.ITable;
  public readonly dataBucket: s3.Bucket;
  public readonly locationFetchQueue: sqs.Queue;
  public readonly locationFetchDLQ: sqs.Queue;
  public readonly weatherResultQueue: sqs.Queue;
  public readonly adviceRequestQueue: sqs.Queue;
  public readonly notifyQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table for Recipients
    // Import existing table if it exists, otherwise create new one
    // This allows the stack to work with pre-existing data
    this.mumTable = dynamodb.Table.fromTableName(
      this,
      'MumBaseTable',
      'MumBaseTable'
    );

    // Note: If deploying fresh, comment out the above and uncomment below to create the table
    /*
    this.mumTable = new dynamodb.Table(this, 'MumBaseTable', {
      tableName: 'MumBaseTable',
      partitionKey: {
        name: 'contact_uuid',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Protect production data
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Add GSI for location-based queries (optional, for future use)
    this.mumTable.addGlobalSecondaryIndex({
      indexName: 'LocationIndex',
      partitionKey: {
        name: 'facility_code',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'lastAlertedDate',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    */

    // S3 Bucket for initial data uploads and backups
    this.dataBucket = new s3.Bucket(this, 'WeatherAlertDataBucket', {
      bucketName: `weather-alert-data-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      enforceSSL: true, // CDK Nag: Enforce SSL for all requests
      lifecycleRules: [
        {
          id: 'ArchiveOldData',
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // CDK Nag Suppression: S3 access logging not needed for sample project
    // In production, enable access logging to a separate logging bucket
    NagSuppressions.addResourceSuppressions(
      this.dataBucket,
      [
        {
          id: 'AwsSolutions-S1',
          reason: 'S3 access logging not required for AWS Sample project. Customers can enable in production deployments.',
        },
      ]
    );

    // Dead Letter Queue for LocationFetch
    this.locationFetchDLQ = new sqs.Queue(this, 'LocationFetchDLQ', {
      queueName: 'LocationFetchDLQ',
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.days(14),
      enforceSSL: true, // CDK Nag: Enforce SSL
    });

    // LocationFetch Queue
    this.locationFetchQueue = new sqs.Queue(this, 'LocationFetchQueue', {
      queueName: 'LocationFetch',
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(4),
      enforceSSL: true, // CDK Nag: Enforce SSL
      deadLetterQueue: {
        queue: this.locationFetchDLQ,
        maxReceiveCount: 3,
      },
    });

    // WeatherResult DLQ
    const weatherResultDLQ = new sqs.Queue(this, 'WeatherResultDLQ', {
      queueName: 'WeatherResultDLQ',
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.days(14),
      enforceSSL: true, // CDK Nag: Enforce SSL
    });

    // WeatherResult Queue
    this.weatherResultQueue = new sqs.Queue(this, 'WeatherResultQueue', {
      queueName: 'WeatherResult',
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(4),
      enforceSSL: true, // CDK Nag: Enforce SSL
      deadLetterQueue: {
        queue: weatherResultDLQ,
        maxReceiveCount: 3,
      },
    });

    // AdviceRequest DLQ
    const adviceRequestDLQ = new sqs.Queue(this, 'AdviceRequestDLQ', {
      queueName: 'AdviceRequestDLQ',
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.days(14),
      enforceSSL: true, // CDK Nag: Enforce SSL
    });

    // AdviceRequest Queue (legacy, can be used for SMS routing)
    this.adviceRequestQueue = new sqs.Queue(this, 'AdviceRequestQueue', {
      queueName: 'AdviceRequest',
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(4),
      enforceSSL: true, // CDK Nag: Enforce SSL
      deadLetterQueue: {
        queue: adviceRequestDLQ,
        maxReceiveCount: 3,
      },
    });

    // NotifyQueue DLQ
    const notifyDLQ = new sqs.Queue(this, 'NotifyDLQ', {
      queueName: 'NotifyDLQ',
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.days(14),
      enforceSSL: true, // CDK Nag: Enforce SSL
    });

    // NotifyQueue - Final messages ready for delivery
    this.notifyQueue = new sqs.Queue(this, 'NotifyQueue', {
      queueName: 'NotifyQueue',
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(7), // Keep messages longer for UI polling
      enforceSSL: true, // CDK Nag: Enforce SSL
      deadLetterQueue: {
        queue: notifyDLQ,
        maxReceiveCount: 3,
      },
    });

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'MumTableName', {
      value: this.mumTable.tableName,
      description: 'DynamoDB table for maternal profiles',
    });

    new cdk.CfnOutput(this, 'DataBucketName', {
      value: this.dataBucket.bucketName,
      description: 'S3 bucket for data uploads',
    });

    new cdk.CfnOutput(this, 'LocationFetchQueueUrl', {
      value: this.locationFetchQueue.queueUrl,
      description: 'SQS queue for location fetch',
    });

    new cdk.CfnOutput(this, 'NotifyQueueUrl', {
      value: this.notifyQueue.queueUrl,
      description: 'SQS queue for final notifications',
    });
  }
}
