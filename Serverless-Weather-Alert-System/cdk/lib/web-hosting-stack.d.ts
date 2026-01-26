import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
interface WebHostingStackProps extends cdk.StackProps {
    notifyQueue: sqs.Queue;
}
export declare class WeatherAlertWebHostingStack extends cdk.Stack {
    readonly distribution: cloudfront.Distribution;
    readonly userPool: cognito.UserPool;
    readonly webBucket: s3.Bucket;
    constructor(scope: Construct, id: string, props: WebHostingStackProps);
    private addNagSuppressions;
}
export {};
