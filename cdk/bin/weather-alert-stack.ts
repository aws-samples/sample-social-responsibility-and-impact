#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { WeatherAlertDataStack } from '../lib/data-stack';
import { WeatherAlertComputeStack } from '../lib/compute-stack';
import { WeatherAlertMonitoringStack } from '../lib/monitoring-stack';
import { WeatherAlertWebHostingStack } from '../lib/web-hosting-stack';

const app = new cdk.App();

// Add CDK Nag checks for AWS Solutions best practices
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Environment configuration
// Uses the region from AWS CLI configuration or CDK_DEFAULT_REGION environment variable
// This allows users to deploy to any AWS region they choose
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Data layer: DynamoDB, S3, SQS
const dataStack = new WeatherAlertDataStack(app, 'WeatherAlertDataStack', {
  env,
  description: 'Data layer for serverless weather alert system',
});

// Compute layer: Lambda functions, EventBridge, Bedrock
const computeStack = new WeatherAlertComputeStack(app, 'WeatherAlertComputeStack', {
  env,
  description: 'Compute layer for serverless weather alert system',
  mumTable: dataStack.mumTable,
  locationFetchQueue: dataStack.locationFetchQueue,
  weatherResultQueue: dataStack.weatherResultQueue,
  adviceRequestQueue: dataStack.adviceRequestQueue,
  notifyQueue: dataStack.notifyQueue,
  dataBucket: dataStack.dataBucket,
});

// Web hosting: CloudFront, Cognito, S3, API Gateway
const webHostingStack = new WeatherAlertWebHostingStack(app, 'WeatherAlertWebHostingStack', {
  env,
  description: 'Secure web hosting with CloudFront and Cognito authentication',
  notifyQueue: dataStack.notifyQueue,
});

// Monitoring: CloudWatch dashboards and alarms
const monitoringStack = new WeatherAlertMonitoringStack(app, 'WeatherAlertMonitoringStack', {
  env,
  description: 'Monitoring and observability for weather alert system',
  profilesToLocationsFn: computeStack.profilesToLocationsFn,
  weatherFetchFn: computeStack.weatherFetchFn,
  adviceFn: computeStack.adviceFn,
  sendAdviceSMSFn: computeStack.sendAdviceSMSFn,
  locationFetchQueue: dataStack.locationFetchQueue,
  weatherResultQueue: dataStack.weatherResultQueue,
  notifyQueue: dataStack.notifyQueue,
});

// Add dependencies
computeStack.addDependency(dataStack);
webHostingStack.addDependency(dataStack);
monitoringStack.addDependency(computeStack);

app.synth();
