import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
interface MonitoringStackProps extends cdk.StackProps {
    profilesToLocationsFn: lambda.Function;
    weatherFetchFn: lambda.Function;
    adviceFn: lambda.Function;
    messageGeneratorFn?: lambda.Function;
    sendAdviceSMSFn: lambda.Function;
    locationFetchQueue: sqs.Queue;
    weatherResultQueue: sqs.Queue;
    notifyQueue: sqs.Queue;
}
export declare class WeatherAlertMonitoringStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: MonitoringStackProps);
}
export {};
