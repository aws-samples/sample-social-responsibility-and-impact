import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
interface ComputeStackProps extends cdk.StackProps {
    mumTable: dynamodb.ITable;
    locationFetchQueue: sqs.Queue;
    weatherResultQueue: sqs.Queue;
    adviceRequestQueue: sqs.Queue;
    notifyQueue: sqs.Queue;
    dataBucket: s3.Bucket;
}
export declare class WeatherAlertComputeStack extends cdk.Stack {
    readonly profilesToLocationsFn: lambda.Function;
    readonly weatherFetchFn: lambda.Function;
    readonly adviceFn: lambda.Function;
    readonly sendAdviceSMSFn: lambda.Function;
    constructor(scope: Construct, id: string, props: ComputeStackProps);
    private addNagSuppressions;
}
export {};
