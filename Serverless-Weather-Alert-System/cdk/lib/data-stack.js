"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherAlertDataStack = void 0;
const cdk = require("aws-cdk-lib");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const s3 = require("aws-cdk-lib/aws-s3");
const sqs = require("aws-cdk-lib/aws-sqs");
const cdk_nag_1 = require("cdk-nag");
class WeatherAlertDataStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // DynamoDB Table for Recipients
        // Import existing table if it exists, otherwise create new one
        // This allows the stack to work with pre-existing data
        this.mumTable = dynamodb.Table.fromTableName(this, 'MumBaseTable', 'MumBaseTable');
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
        cdk_nag_1.NagSuppressions.addResourceSuppressions(this.dataBucket, [
            {
                id: 'AwsSolutions-S1',
                reason: 'S3 access logging not required for AWS Sample project. Customers can enable in production deployments.',
            },
        ]);
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
exports.WeatherAlertDataStack = WeatherAlertDataStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImRhdGEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLHFEQUFxRDtBQUNyRCx5Q0FBeUM7QUFDekMsMkNBQTJDO0FBRzNDLHFDQUEwQztBQUUxQyxNQUFhLHFCQUFzQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBU2xELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsZ0NBQWdDO1FBQ2hDLCtEQUErRDtRQUMvRCx1REFBdUQ7UUFDdkQsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FDMUMsSUFBSSxFQUNKLGNBQWMsRUFDZCxjQUFjLENBQ2YsQ0FBQztRQUVGLDBGQUEwRjtRQUMxRjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O1VBMkJFO1FBRUYsaURBQWlEO1FBQ2pELElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUM5RCxVQUFVLEVBQUUsc0JBQXNCLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDaEQsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELFNBQVMsRUFBRSxJQUFJO1lBQ2YsVUFBVSxFQUFFLElBQUksRUFBRSx3Q0FBd0M7WUFDMUQsY0FBYyxFQUFFO2dCQUNkO29CQUNFLEVBQUUsRUFBRSxnQkFBZ0I7b0JBQ3BCLFdBQVcsRUFBRTt3QkFDWDs0QkFDRSxZQUFZLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQyxtQkFBbUI7NEJBQ2pELGVBQWUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUks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ZUFBZSxFQUFFO2dCQUNmLEtBQUssRUFBRSxTQUFTO2dCQUNoQixlQUFlLEVBQUUsQ0FBQzthQUNuQjtTQUNGLENBQUMsQ0FBQztRQUVILHlCQUF5QjtRQUN6QixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN0QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTO1lBQzlCLFdBQVcsRUFBRSxzQ0FBc0M7U0FDcEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN4QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVO1lBQ2pDLFdBQVcsRUFBRSw0QkFBNEI7U0FDMUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMvQyxLQUFLLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVE7WUFDdkMsV0FBVyxFQUFFLDhCQUE4QjtTQUM1QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3hDLEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVE7WUFDaEMsV0FBVyxFQUFFLG1DQUFtQztTQUNqRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE3TEQsc0RBNkxDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcclxuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcclxuaW1wb3J0ICogYXMgc3FzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xyXG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcclxuXHJcbmV4cG9ydCBjbGFzcyBXZWF0aGVyQWxlcnREYXRhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIHB1YmxpYyByZWFkb25seSBtdW1UYWJsZTogZHluYW1vZGIuSVRhYmxlO1xyXG4gIHB1YmxpYyByZWFkb25seSBkYXRhQnVja2V0OiBzMy5CdWNrZXQ7XHJcbiAgcHVibGljIHJlYWRvbmx5IGxvY2F0aW9uRmV0Y2hRdWV1ZTogc3FzLlF1ZXVlO1xyXG4gIHB1YmxpYyByZWFkb25seSBsb2NhdGlvbkZldGNoRExROiBzcXMuUXVldWU7XHJcbiAgcHVibGljIHJlYWRvbmx5IHdlYXRoZXJSZXN1bHRRdWV1ZTogc3FzLlF1ZXVlO1xyXG4gIHB1YmxpYyByZWFkb25seSBhZHZpY2VSZXF1ZXN0UXVldWU6IHNxcy5RdWV1ZTtcclxuICBwdWJsaWMgcmVhZG9ubHkgbm90aWZ5UXVldWU6IHNxcy5RdWV1ZTtcclxuXHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgLy8gRHluYW1vREIgVGFibGUgZm9yIFJlY2lwaWVudHNcclxuICAgIC8vIEltcG9ydCBleGlzdGluZyB0YWJsZSBpZiBpdCBleGlzdHMsIG90aGVyd2lzZSBjcmVhdGUgbmV3IG9uZVxyXG4gICAgLy8gVGhpcyBhbGxvd3MgdGhlIHN0YWNrIHRvIHdvcmsgd2l0aCBwcmUtZXhpc3RpbmcgZGF0YVxyXG4gICAgdGhpcy5tdW1UYWJsZSA9IGR5bmFtb2RiLlRhYmxlLmZyb21UYWJsZU5hbWUoXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgICdNdW1CYXNlVGFibGUnLFxyXG4gICAgICAnTXVtQmFzZVRhYmxlJ1xyXG4gICAgKTtcclxuXHJcbiAgICAvLyBOb3RlOiBJZiBkZXBsb3lpbmcgZnJlc2gsIGNvbW1lbnQgb3V0IHRoZSBhYm92ZSBhbmQgdW5jb21tZW50IGJlbG93IHRvIGNyZWF0ZSB0aGUgdGFibGVcclxuICAgIC8qXHJcbiAgICB0aGlzLm11bVRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdNdW1CYXNlVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogJ011bUJhc2VUYWJsZScsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdjb250YWN0X3V1aWQnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXHJcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiwgLy8gUHJvdGVjdCBwcm9kdWN0aW9uIGRhdGFcclxuICAgICAgc3RyZWFtOiBkeW5hbW9kYi5TdHJlYW1WaWV3VHlwZS5ORVdfQU5EX09MRF9JTUFHRVMsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgR1NJIGZvciBsb2NhdGlvbi1iYXNlZCBxdWVyaWVzIChvcHRpb25hbCwgZm9yIGZ1dHVyZSB1c2UpXHJcbiAgICB0aGlzLm11bVRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnTG9jYXRpb25JbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdmYWNpbGl0eV9jb2RlJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6ICdsYXN0QWxlcnRlZERhdGUnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcbiAgICAqL1xyXG5cclxuICAgIC8vIFMzIEJ1Y2tldCBmb3IgaW5pdGlhbCBkYXRhIHVwbG9hZHMgYW5kIGJhY2t1cHNcclxuICAgIHRoaXMuZGF0YUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1dlYXRoZXJBbGVydERhdGFCdWNrZXQnLCB7XHJcbiAgICAgIGJ1Y2tldE5hbWU6IGB3ZWF0aGVyLWFsZXJ0LWRhdGEtJHt0aGlzLmFjY291bnR9YCxcclxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxyXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxyXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXHJcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsIC8vIENESyBOYWc6IEVuZm9yY2UgU1NMIGZvciBhbGwgcmVxdWVzdHNcclxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBpZDogJ0FyY2hpdmVPbGREYXRhJyxcclxuICAgICAgICAgIHRyYW5zaXRpb25zOiBbXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICBzdG9yYWdlQ2xhc3M6IHMzLlN0b3JhZ2VDbGFzcy5JTlRFTExJR0VOVF9USUVSSU5HLFxyXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgXSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDREsgTmFnIFN1cHByZXNzaW9uOiBTMyBhY2Nlc3MgbG9nZ2luZyBub3QgbmVlZGVkIGZvciBzYW1wbGUgcHJvamVjdFxyXG4gICAgLy8gSW4gcHJvZHVjdGlvbiwgZW5hYmxlIGFjY2VzcyBsb2dnaW5nIHRvIGEgc2VwYXJhdGUgbG9nZ2luZyBidWNrZXRcclxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcclxuICAgICAgdGhpcy5kYXRhQnVja2V0LFxyXG4gICAgICBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtUzEnLFxyXG4gICAgICAgICAgcmVhc29uOiAnUzMgYWNjZXNzIGxvZ2dpbmcgbm90IHJlcXVpcmVkIGZvciBBV1MgU2FtcGxlIHByb2plY3QuIEN1c3RvbWVycyBjYW4gZW5hYmxlIGluIHByb2R1Y3Rpb24gZGVwbG95bWVudHMuJyxcclxuICAgICAgICB9LFxyXG4gICAgICBdXHJcbiAgICApO1xyXG5cclxuICAgIC8vIERlYWQgTGV0dGVyIFF1ZXVlIGZvciBMb2NhdGlvbkZldGNoXHJcbiAgICB0aGlzLmxvY2F0aW9uRmV0Y2hETFEgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdMb2NhdGlvbkZldGNoRExRJywge1xyXG4gICAgICBxdWV1ZU5hbWU6ICdMb2NhdGlvbkZldGNoRExRJyxcclxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5TUVNfTUFOQUdFRCxcclxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXHJcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsIC8vIENESyBOYWc6IEVuZm9yY2UgU1NMXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBMb2NhdGlvbkZldGNoIFF1ZXVlXHJcbiAgICB0aGlzLmxvY2F0aW9uRmV0Y2hRdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ0xvY2F0aW9uRmV0Y2hRdWV1ZScsIHtcclxuICAgICAgcXVldWVOYW1lOiAnTG9jYXRpb25GZXRjaCcsXHJcbiAgICAgIGVuY3J5cHRpb246IHNxcy5RdWV1ZUVuY3J5cHRpb24uU1FTX01BTkFHRUQsXHJcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMDApLFxyXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDQpLFxyXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLCAvLyBDREsgTmFnOiBFbmZvcmNlIFNTTFxyXG4gICAgICBkZWFkTGV0dGVyUXVldWU6IHtcclxuICAgICAgICBxdWV1ZTogdGhpcy5sb2NhdGlvbkZldGNoRExRLFxyXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFdlYXRoZXJSZXN1bHQgRExRXHJcbiAgICBjb25zdCB3ZWF0aGVyUmVzdWx0RExRID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnV2VhdGhlclJlc3VsdERMUScsIHtcclxuICAgICAgcXVldWVOYW1lOiAnV2VhdGhlclJlc3VsdERMUScsXHJcbiAgICAgIGVuY3J5cHRpb246IHNxcy5RdWV1ZUVuY3J5cHRpb24uU1FTX01BTkFHRUQsXHJcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxyXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLCAvLyBDREsgTmFnOiBFbmZvcmNlIFNTTFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gV2VhdGhlclJlc3VsdCBRdWV1ZVxyXG4gICAgdGhpcy53ZWF0aGVyUmVzdWx0UXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdXZWF0aGVyUmVzdWx0UXVldWUnLCB7XHJcbiAgICAgIHF1ZXVlTmFtZTogJ1dlYXRoZXJSZXN1bHQnLFxyXG4gICAgICBlbmNyeXB0aW9uOiBzcXMuUXVldWVFbmNyeXB0aW9uLlNRU19NQU5BR0VELFxyXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzAwKSxcclxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cyg0KSxcclxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSwgLy8gQ0RLIE5hZzogRW5mb3JjZSBTU0xcclxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XHJcbiAgICAgICAgcXVldWU6IHdlYXRoZXJSZXN1bHRETFEsXHJcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWR2aWNlUmVxdWVzdCBETFFcclxuICAgIGNvbnN0IGFkdmljZVJlcXVlc3RETFEgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdBZHZpY2VSZXF1ZXN0RExRJywge1xyXG4gICAgICBxdWV1ZU5hbWU6ICdBZHZpY2VSZXF1ZXN0RExRJyxcclxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5TUVNfTUFOQUdFRCxcclxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXHJcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsIC8vIENESyBOYWc6IEVuZm9yY2UgU1NMXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZHZpY2VSZXF1ZXN0IFF1ZXVlIChsZWdhY3ksIGNhbiBiZSB1c2VkIGZvciBTTVMgcm91dGluZylcclxuICAgIHRoaXMuYWR2aWNlUmVxdWVzdFF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnQWR2aWNlUmVxdWVzdFF1ZXVlJywge1xyXG4gICAgICBxdWV1ZU5hbWU6ICdBZHZpY2VSZXF1ZXN0JyxcclxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5TUVNfTUFOQUdFRCxcclxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwMCksXHJcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoNCksXHJcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsIC8vIENESyBOYWc6IEVuZm9yY2UgU1NMXHJcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xyXG4gICAgICAgIHF1ZXVlOiBhZHZpY2VSZXF1ZXN0RExRLFxyXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE5vdGlmeVF1ZXVlIERMUVxyXG4gICAgY29uc3Qgbm90aWZ5RExRID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnTm90aWZ5RExRJywge1xyXG4gICAgICBxdWV1ZU5hbWU6ICdOb3RpZnlETFEnLFxyXG4gICAgICBlbmNyeXB0aW9uOiBzcXMuUXVldWVFbmNyeXB0aW9uLlNRU19NQU5BR0VELFxyXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcclxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSwgLy8gQ0RLIE5hZzogRW5mb3JjZSBTU0xcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE5vdGlmeVF1ZXVlIC0gRmluYWwgbWVzc2FnZXMgcmVhZHkgZm9yIGRlbGl2ZXJ5XHJcbiAgICB0aGlzLm5vdGlmeVF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnTm90aWZ5UXVldWUnLCB7XHJcbiAgICAgIHF1ZXVlTmFtZTogJ05vdGlmeVF1ZXVlJyxcclxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5TUVNfTUFOQUdFRCxcclxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwMCksXHJcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoNyksIC8vIEtlZXAgbWVzc2FnZXMgbG9uZ2VyIGZvciBVSSBwb2xsaW5nXHJcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsIC8vIENESyBOYWc6IEVuZm9yY2UgU1NMXHJcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xyXG4gICAgICAgIHF1ZXVlOiBub3RpZnlETFEsXHJcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ2xvdWRGb3JtYXRpb24gT3V0cHV0c1xyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ011bVRhYmxlTmFtZScsIHtcclxuICAgICAgdmFsdWU6IHRoaXMubXVtVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIGZvciBtYXRlcm5hbCBwcm9maWxlcycsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YUJ1Y2tldE5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmRhdGFCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdTMyBidWNrZXQgZm9yIGRhdGEgdXBsb2FkcycsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTG9jYXRpb25GZXRjaFF1ZXVlVXJsJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5sb2NhdGlvbkZldGNoUXVldWUucXVldWVVcmwsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnU1FTIHF1ZXVlIGZvciBsb2NhdGlvbiBmZXRjaCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTm90aWZ5UXVldWVVcmwnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLm5vdGlmeVF1ZXVlLnF1ZXVlVXJsLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1NRUyBxdWV1ZSBmb3IgZmluYWwgbm90aWZpY2F0aW9ucycsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19