import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
export declare class WeatherAlertDataStack extends cdk.Stack {
    readonly mumTable: dynamodb.ITable;
    readonly dataBucket: s3.Bucket;
    readonly locationFetchQueue: sqs.Queue;
    readonly locationFetchDLQ: sqs.Queue;
    readonly weatherResultQueue: sqs.Queue;
    readonly adviceRequestQueue: sqs.Queue;
    readonly notifyQueue: sqs.Queue;
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}
