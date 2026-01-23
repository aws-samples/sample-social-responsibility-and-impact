"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherAlertComputeStack = void 0;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");
const secretsmanager = require("aws-cdk-lib/aws-secretsmanager");
const aws_lambda_event_sources_1 = require("aws-cdk-lib/aws-lambda-event-sources");
const cdk_nag_1 = require("cdk-nag");
class WeatherAlertComputeStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Secrets for API keys
        const tomorrowIoSecret = secretsmanager.Secret.fromSecretNameV2(this, 'TomorrowIoSecret', 'weather-alert/api-key');
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
        this.weatherFetchFn.addEventSource(new aws_lambda_event_sources_1.SqsEventSource(props.locationFetchQueue, {
            batchSize: 10,
            maxBatchingWindow: cdk.Duration.seconds(5),
            reportBatchItemFailures: true,
        }));
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
        this.adviceFn.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
            ],
            resources: [
                `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
            ],
        }));
        this.adviceFn.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['bedrock:Retrieve'],
            resources: [
                `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*`,
            ],
        }));
        props.notifyQueue.grantSendMessages(this.adviceFn);
        // SQS trigger from WeatherResult queue
        this.adviceFn.addEventSource(new aws_lambda_event_sources_1.SqsEventSource(props.weatherResultQueue, {
            batchSize: 5,
            maxBatchingWindow: cdk.Duration.seconds(10),
            reportBatchItemFailures: true,
        }));
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
    addNagSuppressions() {
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
            cdk_nag_1.NagSuppressions.addResourceSuppressions(fn, [
                {
                    id: 'AwsSolutions-IAM4',
                    reason: 'AWSLambdaBasicExecutionRole is AWS managed policy for Lambda execution. Required for CloudWatch Logs access.',
                    appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
                },
            ], true // Apply to children (role, policy)
            );
            // ============================================
            // IAM Wildcard Suppressions
            // Production recommendation: Scope permissions to specific resources where possible
            // ============================================
            cdk_nag_1.NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/${fn.node.id}/ServiceRole/DefaultPolicy/Resource`, [
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
            ]);
        });
        // ============================================
        // CDK-Generated Resource Suppressions
        // These are standard CDK behaviors that cannot be modified
        // ============================================
        cdk_nag_1.NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource`, [
            {
                id: 'AwsSolutions-IAM4',
                reason: 'CDK-created log retention Lambda uses AWS managed policy. This is standard CDK behavior.',
                appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
            },
        ], true);
        cdk_nag_1.NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource`, [
            {
                id: 'AwsSolutions-IAM5',
                reason: 'CDK-created log retention Lambda requires wildcard for log management. This is standard CDK behavior.',
                appliesTo: ['Resource::*'],
            },
        ]);
    }
}
exports.WeatherAlertComputeStack = WeatherAlertComputeStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHV0ZS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvbXB1dGUtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLGlEQUFpRDtBQUlqRCxpREFBaUQ7QUFDakQsMERBQTBEO0FBQzFELDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFDN0MsaUVBQWlFO0FBQ2pFLG1GQUFzRTtBQUV0RSxxQ0FBMEM7QUFXMUMsTUFBYSx3QkFBeUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQU1yRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXdCO1FBQ2hFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLHVCQUF1QjtRQUN2QixNQUFNLGdCQUFnQixHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQzdELElBQUksRUFDSixrQkFBa0IsRUFDbEIsdUJBQXVCLENBQ3hCLENBQUM7UUFFRiwrQ0FBK0M7UUFDL0MsdUVBQXVFO1FBQ3ZFLFVBQVU7UUFDViw0QkFBNEI7UUFDNUIsMkNBQTJDO1FBQzNDLEtBQUs7UUFFTCw4QkFBOEI7UUFDOUIsTUFBTSxpQkFBaUIsR0FBRztZQUN4QixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUM7WUFDbEMsVUFBVSxFQUFFLEdBQUc7WUFDZixZQUFZLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRO1lBQ3pDLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU07WUFDOUIsV0FBVyxFQUFFO2dCQUNYLHVCQUF1QixFQUFFLHNCQUFzQjtnQkFDL0MsU0FBUyxFQUFFLE1BQU07YUFDbEI7U0FDRixDQUFDO1FBRUYsOERBQThEO1FBQzlELElBQUksQ0FBQyxxQkFBcUIsR0FBRyxJQUFJLE1BQU0s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QUFHLElBQUksQ0FBQyxTQUFTLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLHFDQUFxQyxFQUNwRTtnQkFDRTtvQkFDRSxFQUFFLEVBQUUsbUJBQW1CO29CQUN2QixNQUFNLEVBQUUsOExBQThMO29CQUN0TSxTQUFTLEVBQUU7d0JBQ1QsYUFBYTt3QkFDYiw4QkFBOEI7d0JBQzlCLDJCQUEyQjt3QkFDM0IsdUVBQXVFO3FCQUN4RTtpQkFDRjthQUNGLENBQ0YsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsK0NBQStDO1FBQy9DLHNDQUFzQztRQUN0QywyREFBMkQ7UUFDM0QsK0NBQStDO1FBQy9DLHlCQUFlLENBQUMsNkJBQTZCLENBQzNDLElBQUksRUFDSixHQUFHLElBQUksQ0FBQyxTQUFTLG9FQUFvRSxFQUNyRjtZQUNFO2dCQUNFLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLE1BQU0sRUFBRSwwRkFBMEY7Z0JBQ2xHLFNBQVMsRUFBRSxDQUFDLHVGQUF1RixDQUFDO2FBQ3JHO1NBQ0YsRUFDRCxJQUFJLENBQ0wsQ0FBQztRQUVGLHlCQUFlLENBQUMsNkJBQTZCLENBQzNDLElBQUksRUFDSixHQUFHLElBQUksQ0FBQyxTQUFTLGtGQUFrRixFQUNuRztZQUNFO2dCQUNFLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLE1BQU0sRUFBRSx1R0FBdUc7Z0JBQy9HLFNBQVMsRUFBRSxDQUFDLGFBQWEsQ0FBQzthQUMzQjtTQUNGLENBQ0YsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQTNSRCw0REEyUkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XHJcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XHJcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcclxuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xyXG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMtdGFyZ2V0cyc7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XHJcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XHJcbmltcG9ydCB7IFNxc0V2ZW50U291cmNlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ldmVudC1zb3VyY2VzJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcbmltcG9ydCB7IE5hZ1N1cHByZXNzaW9ucyB9IGZyb20gJ2Nkay1uYWcnO1xyXG5cclxuaW50ZXJmYWNlIENvbXB1dGVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xyXG4gIG11bVRhYmxlOiBkeW5hbW9kYi5JVGFibGU7XHJcbiAgbG9jYXRpb25GZXRjaFF1ZXVlOiBzcXMuUXVldWU7XHJcbiAgd2VhdGhlclJlc3VsdFF1ZXVlOiBzcXMuUXVldWU7XHJcbiAgYWR2aWNlUmVxdWVzdFF1ZXVlOiBzcXMuUXVldWU7XHJcbiAgbm90aWZ5UXVldWU6IHNxcy5RdWV1ZTtcclxuICBkYXRhQnVja2V0OiBzMy5CdWNrZXQ7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBXZWF0aGVyQWxlcnRDb21wdXRlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIHB1YmxpYyByZWFkb25seSBwcm9maWxlc1RvTG9jYXRpb25zRm46IGxhbWJkYS5GdW5jdGlvbjtcclxuICBwdWJsaWMgcmVhZG9ubHkgd2VhdGhlckZldGNoRm46IGxhbWJkYS5GdW5jdGlvbjtcclxuICBwdWJsaWMgcmVhZG9ubHkgYWR2aWNlRm46IGxhbWJkYS5GdW5jdGlvbjtcclxuICBwdWJsaWMgcmVhZG9ubHkgc2VuZEFkdmljZVNNU0ZuOiBsYW1iZGEuRnVuY3Rpb247XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBDb21wdXRlU3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgLy8gU2VjcmV0cyBmb3IgQVBJIGtleXNcclxuICAgIGNvbnN0IHRvbW9ycm93SW9TZWNyZXQgPSBzZWNyZXRzbWFuYWdlci5TZWNyZXQuZnJvbVNlY3JldE5hbWVWMihcclxuICAgICAgdGhpcyxcclxuICAgICAgJ1RvbW9ycm93SW9TZWNyZXQnLFxyXG4gICAgICAnd2VhdGhlci1hbGVydC9hcGkta2V5J1xyXG4gICAgKTtcclxuXHJcbiAgICAvLyBDb21tZW50ZWQgb3V0IC0gQWZyaWNhJ3MgVGFsa2luZyBpcyBvcHRpb25hbFxyXG4gICAgLy8gY29uc3QgYWZyaWNhc1RhbGtpbmdTZWNyZXQgPSBzZWNyZXRzbWFuYWdlci5TZWNyZXQuZnJvbVNlY3JldE5hbWVWMihcclxuICAgIC8vICAgdGhpcyxcclxuICAgIC8vICAgJ0FmcmljYXNUYWxraW5nU2VjcmV0JyxcclxuICAgIC8vICAgJ3dlYXRoZXItYWxlcnQtc3lzdGVtL3Ntcy1jcmVkZW50aWFscydcclxuICAgIC8vICk7XHJcblxyXG4gICAgLy8gQ29tbW9uIExhbWJkYSBjb25maWd1cmF0aW9uXHJcbiAgICBjb25zdCBjb21tb25MYW1iZGFQcm9wcyA9IHtcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTQsXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcclxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXHJcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBQT1dFUlRPT0xTX1NFUlZJQ0VfTkFNRTogJ3dlYXRoZXItYWxlcnQtc3lzdGVtJyxcclxuICAgICAgICBMT0dfTEVWRUw6ICdJTkZPJyxcclxuICAgICAgfSxcclxuICAgIH07XHJcblxyXG4gICAgLy8gMS4gUmVjaXBpZW50c1RvTG9jYXRpb25zRm4gLSBTY2FucyBEREIgYW5kIHF1ZXVlcyBsb2NhdGlvbnNcclxuICAgIHRoaXMucHJvZmlsZXNUb0xvY2F0aW9uc0ZuID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUmVjaXBpZW50c1RvTG9jYXRpb25zRm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vbkxhbWJkYVByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6ICdXZWF0aGVyQWxlcnQtUmVjaXBpZW50c1RvTG9jYXRpb25zJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdTY2FucyBEeW5hbW9EQiBmb3IgcmVjaXBpZW50IHByb2ZpbGVzIGFuZCBxdWV1ZXMgdW5pcXVlIGxvY2F0aW9ucycsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vbGFtYmRhL3JlY2lwaWVudHMtdG8tbG9jYXRpb25zJyksXHJcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgLi4uY29tbW9uTGFtYmRhUHJvcHMuZW52aXJvbm1lbnQsXHJcbiAgICAgICAgUkVDSVBJRU5UU19UQUJMRV9OQU1FOiBwcm9wcy5tdW1UYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgTVVNX1RBQkxFX05BTUU6IHByb3BzLm11bVRhYmxlLnRhYmxlTmFtZSwgLy8gQmFja3dhcmQgY29tcGF0aWJpbGl0eVxyXG4gICAgICAgIExPQ0FUSU9OX1FVRVVFX1VSTDogcHJvcHMubG9jYXRpb25GZXRjaFF1ZXVlLnF1ZXVlVXJsLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnNcclxuICAgIHByb3BzLm11bVRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5wcm9maWxlc1RvTG9jYXRpb25zRm4pO1xyXG4gICAgcHJvcHMubG9jYXRpb25GZXRjaFF1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKHRoaXMucHJvZmlsZXNUb0xvY2F0aW9uc0ZuKTtcclxuXHJcbiAgICAvLyBFdmVudEJyaWRnZSBydWxlIHRvIHRyaWdnZXIgZGFpbHkgYXQgNiBBTSBVVEMgKDkgQU0gRUFUKVxyXG4gICAgY29uc3QgZGFpbHlSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdEYWlseVdlYXRoZXJDaGVja1J1bGUnLCB7XHJcbiAgICAgIHJ1bGVOYW1lOiAnV2VhdGhlckFsZXJ0LURhaWx5V2VhdGhlckNoZWNrJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmlnZ2VycyB3ZWF0aGVyIGFsZXJ0IHdvcmtmbG93IGRhaWx5JyxcclxuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5jcm9uKHtcclxuICAgICAgICBtaW51dGU6ICcwJyxcclxuICAgICAgICBob3VyOiAnNicsXHJcbiAgICAgICAgd2Vla0RheTogJyonLFxyXG4gICAgICB9KSxcclxuICAgIH0pO1xyXG4gICAgZGFpbHlSdWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbih0aGlzLnByb2ZpbGVzVG9Mb2NhdGlvbnNGbikpO1xyXG5cclxuICAgIC8vIDIuIFdlYXRoZXJGZXRjaEZuIC0gRmV0Y2hlcyB3ZWF0aGVyIGZyb20gVG9tb3Jyb3cuaW9cclxuICAgIHRoaXMud2VhdGhlckZldGNoRm4gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdXZWF0aGVyRmV0Y2hGbicsIHtcclxuICAgICAgLi4uY29tbW9uTGFtYmRhUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ1dlYXRoZXJBbGVydC1XZWF0aGVyRmV0Y2gnLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0ZldGNoZXMgd2VhdGhlciBmb3JlY2FzdHMgZnJvbSBUb21vcnJvdy5pbyBBUEknLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL2xhbWJkYS93ZWF0aGVyLWZldGNoJyksXHJcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwMCksXHJcbiAgICAgIHJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnM6IDEsIC8vIFJhdGUgbGltaXQgQVBJIGNhbGxzIChUb21vcnJvdy5pbyBmcmVlIHRpZXI6IDUwMC9kYXkpXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgLi4uY29tbW9uTGFtYmRhUHJvcHMuZW52aXJvbm1lbnQsXHJcbiAgICAgICAgV0VBVEhFUl9SRVNVTFRfUVVFVUVfVVJMOiBwcm9wcy53ZWF0aGVyUmVzdWx0UXVldWUucXVldWVVcmwsXHJcbiAgICAgICAgVEVNUF9USFJFU0hPTERfQzogJzMyJyxcclxuICAgICAgICBUT01PUlJPV19JT19BUElfS0VZOiB0b21vcnJvd0lvU2VjcmV0LnNlY3JldFZhbHVlLnVuc2FmZVVud3JhcCgpLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnNcclxuICAgIHByb3BzLndlYXRoZXJSZXN1bHRRdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyh0aGlzLndlYXRoZXJGZXRjaEZuKTtcclxuICAgIHRvbW9ycm93SW9TZWNyZXQuZ3JhbnRSZWFkKHRoaXMud2VhdGhlckZldGNoRm4pO1xyXG5cclxuICAgIC8vIFNRUyB0cmlnZ2VyIGZyb20gTG9jYXRpb25GZXRjaCBxdWV1ZVxyXG4gICAgdGhpcy53ZWF0aGVyRmV0Y2hGbi5hZGRFdmVudFNvdXJjZShcclxuICAgICAgbmV3IFNxc0V2ZW50U291cmNlKHByb3BzLmxvY2F0aW9uRmV0Y2hRdWV1ZSwge1xyXG4gICAgICAgIGJhdGNoU2l6ZTogMTAsXHJcbiAgICAgICAgbWF4QmF0Y2hpbmdXaW5kb3c6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxyXG4gICAgICAgIHJlcG9ydEJhdGNoSXRlbUZhaWx1cmVzOiB0cnVlLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyAzLiBNZXNzYWdlR2VuZXJhdG9yRm4gLSBHZW5lcmF0ZXMgcGVyc29uYWxpemVkIG1lc3NhZ2VzIHVzaW5nIEJlZHJvY2tcclxuICAgIHRoaXMuYWR2aWNlRm4gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdNZXNzYWdlR2VuZXJhdG9yRm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vbkxhbWJkYVByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6ICdXZWF0aGVyQWxlcnQtTWVzc2FnZUdlbmVyYXRvcicsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnR2VuZXJhdGVzIHBlcnNvbmFsaXplZCBtZXNzYWdlcyB1c2luZyBCZWRyb2NrIEtCIGFuZCBDbGF1ZGUnLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL2xhbWJkYS9tZXNzYWdlLWdlbmVyYXRvcicpLFxyXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMDApLFxyXG4gICAgICBtZW1vcnlTaXplOiAxMDI0LFxyXG4gICAgICByZXNlcnZlZENvbmN1cnJlbnRFeGVjdXRpb25zOiAyLCAvLyBMaW1pdCBCZWRyb2NrIEFQSSBjYWxscyB0byBwcmV2ZW50IHRocm90dGxpbmdcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICAuLi5jb21tb25MYW1iZGFQcm9wcy5lbnZpcm9ubWVudCxcclxuICAgICAgICBOT1RJRllfUVVFVUVfVVJMOiBwcm9wcy5ub3RpZnlRdWV1ZS5xdWV1ZVVybCxcclxuICAgICAgICBCRURST0NLX0tOT1dMRURHRV9CQVNFX0lEOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ1dlYXRoZXJBbGVydEJlZHJvY2tLQklkJyksXHJcbiAgICAgICAgQkVEUk9DS19NT0RFTF9JRDogJ2FudGhyb3BpYy5jbGF1ZGUtMy1zb25uZXQtMjAyNDAyMjktdjE6MCcsXHJcbiAgICAgICAgQkVEUk9DS19TWVNURU1fUFJPTVBUOiAnWW91IGFyZSBhIG1hdGVybmFsIGhlYWx0aCBhZHZpc29yIHByb3ZpZGluZyBzdXBwb3J0aXZlLCBhY3Rpb25hYmxlIGhlYWx0aCBhZHZpY2UgdG8gcHJlZ25hbnQgYW5kIHBvc3RwYXJ0dW0gbW90aGVycyBiYXNlZCBvbiB3ZWF0aGVyIGZvcmVjYXN0cy4nLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR3JhbnQgQmVkcm9jayBwZXJtaXNzaW9uc1xyXG4gICAgdGhpcy5hZHZpY2VGbi5hZGRUb1JvbGVQb2xpY3koXHJcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxyXG4gICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW0nLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbXHJcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7dGhpcy5yZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtMy1zb25uZXQtMjAyNDAyMjktdjE6MGAsXHJcbiAgICAgICAgXSxcclxuICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgdGhpcy5hZHZpY2VGbi5hZGRUb1JvbGVQb2xpY3koXHJcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgICAgYWN0aW9uczogWydiZWRyb2NrOlJldHJpZXZlJ10sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbXHJcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTprbm93bGVkZ2UtYmFzZS8qYCxcclxuICAgICAgICBdLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICBwcm9wcy5ub3RpZnlRdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyh0aGlzLmFkdmljZUZuKTtcclxuXHJcbiAgICAvLyBTUVMgdHJpZ2dlciBmcm9tIFdlYXRoZXJSZXN1bHQgcXVldWVcclxuICAgIHRoaXMuYWR2aWNlRm4uYWRkRXZlbnRTb3VyY2UoXHJcbiAgICAgIG5ldyBTcXNFdmVudFNvdXJjZShwcm9wcy53ZWF0aGVyUmVzdWx0UXVldWUsIHtcclxuICAgICAgICBiYXRjaFNpemU6IDUsXHJcbiAgICAgICAgbWF4QmF0Y2hpbmdXaW5kb3c6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcclxuICAgICAgICByZXBvcnRCYXRjaEl0ZW1GYWlsdXJlczogdHJ1ZSxcclxuICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgLy8gNC4gU2VuZEFkdmljZVNNU0ZuIC0gU2VuZHMgU01TIHZpYSBBZnJpY2EncyBUYWxraW5nIChvcHRpb25hbClcclxuICAgIC8vIENvbW1lbnRlZCBvdXQgZm9yIGluaXRpYWwgZGVwbG95bWVudCAtIGNyZWF0ZSBBZnJpY2EncyBUYWxraW5nIHNlY3JldCBmaXJzdFxyXG4gICAgdGhpcy5zZW5kQWR2aWNlU01TRm4gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTZW5kQWR2aWNlU01TRm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vbkxhbWJkYVByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6ICdXZWF0aGVyQWxlcnQtU2VuZFNNUycsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VuZHMgU01TIG5vdGlmaWNhdGlvbnMgdmlhIEFmcmljYXMgVGFsa2luZycsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vbGFtYmRhL3NlbmQtc21zJyksXHJcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgLi4uY29tbW9uTGFtYmRhUHJvcHMuZW52aXJvbm1lbnQsXHJcbiAgICAgICAgQVRfQVBJX0tFWTogJ05PVF9DT05GSUdVUkVEJyxcclxuICAgICAgICBBVF9VU0VSTkFNRTogJ05PVF9DT05GSUdVUkVEJyxcclxuICAgICAgICBBVF9TRU5ERVJfSUQ6ICdXZWF0aGVyQWxlcnQnLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gYWZyaWNhc1RhbGtpbmdTZWNyZXQuZ3JhbnRSZWFkKHRoaXMuc2VuZEFkdmljZVNNU0ZuKTtcclxuXHJcbiAgICAvLyBPcHRpb25hbDogQWRkIFNRUyB0cmlnZ2VyIGZyb20gTm90aWZ5UXVldWUgb3IgQWR2aWNlUmVxdWVzdFxyXG4gICAgLy8gVW5jb21tZW50IHdoZW4gcmVhZHkgdG8gc2VuZCBhY3R1YWwgU01TXHJcbiAgICAvKlxyXG4gICAgdGhpcy5zZW5kQWR2aWNlU01TRm4uYWRkRXZlbnRTb3VyY2UoXHJcbiAgICAgIG5ldyBTcXNFdmVudFNvdXJjZShwcm9wcy5ub3RpZnlRdWV1ZSwge1xyXG4gICAgICAgIGJhdGNoU2l6ZTogMTAsXHJcbiAgICAgICAgbWF4QmF0Y2hpbmdXaW5kb3c6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxyXG4gICAgICAgIHJlcG9ydEJhdGNoSXRlbUZhaWx1cmVzOiB0cnVlLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuICAgICovXHJcblxyXG4gICAgLy8gQ2xvdWRGb3JtYXRpb24gT3V0cHV0c1xyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2ZpbGVzVG9Mb2NhdGlvbnNGbkFybicsIHtcclxuICAgICAgdmFsdWU6IHRoaXMucHJvZmlsZXNUb0xvY2F0aW9uc0ZuLmZ1bmN0aW9uQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FSTiBvZiBQcm9maWxlc1RvTG9jYXRpb25zIExhbWJkYScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnV2VhdGhlckZldGNoRm5Bcm4nLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLndlYXRoZXJGZXRjaEZuLmZ1bmN0aW9uQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FSTiBvZiBXZWF0aGVyRmV0Y2ggTGFtYmRhJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBZHZpY2VGbkFybicsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuYWR2aWNlRm4uZnVuY3Rpb25Bcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIEFkdmljZSBMYW1iZGEnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ0RLIE5hZyBTdXBwcmVzc2lvbnNcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBTRUNVUklUWSBOT1RFOiBUaGlzIHNvbHV0aW9uIGlzIGludGVuZGVkIGFzIGEgc2FtcGxlL3JlZmVyZW5jZSBhcmNoaXRlY3R1cmUuXHJcbiAgICAvLyBQcm9kdWN0aW9uIGRlcGxveW1lbnRzIHNob3VsZCBpbXBsZW1lbnQgYWRkaXRpb25hbCBzZWN1cml0eSBiZXN0IHByYWN0aWNlcy5cclxuICAgIC8vIFJlZmVyIHRvIHRoZSBTZWN1cml0eSBQaWxsYXIgb2YgdGhlIEFXUyBXZWxsLUFyY2hpdGVjdGVkIEZyYW1ld29yazpcclxuICAgIC8vIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS93ZWxsYXJjaGl0ZWN0ZWQvbGF0ZXN0L3NlY3VyaXR5LXBpbGxhci93ZWxjb21lLmh0bWxcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICB0aGlzLmFkZE5hZ1N1cHByZXNzaW9ucygpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGROYWdTdXBwcmVzc2lvbnMoKSB7XHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gTGFtYmRhIFN1cHByZXNzaW9uc1xyXG4gICAgLy8gUHJvZHVjdGlvbiByZWNvbW1lbmRhdGlvbjogQ29uc2lkZXIgVlBDIGRlcGxveW1lbnQgYW5kIGN1c3RvbSBJQU0gcG9saWNpZXNcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICBjb25zdCBsYW1iZGFGdW5jdGlvbnMgPSBbXHJcbiAgICAgIHRoaXMucHJvZmlsZXNUb0xvY2F0aW9uc0ZuLFxyXG4gICAgICB0aGlzLndlYXRoZXJGZXRjaEZuLFxyXG4gICAgICB0aGlzLmFkdmljZUZuLFxyXG4gICAgICB0aGlzLnNlbmRBZHZpY2VTTVNGbixcclxuICAgIF07XHJcblxyXG4gICAgbGFtYmRhRnVuY3Rpb25zLmZvckVhY2goKGZuKSA9PiB7XHJcbiAgICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcclxuICAgICAgICBmbixcclxuICAgICAgICBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIGlkOiAnQXdzU29sdXRpb25zLUlBTTQnLFxyXG4gICAgICAgICAgICByZWFzb246ICdBV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUgaXMgQVdTIG1hbmFnZWQgcG9saWN5IGZvciBMYW1iZGEgZXhlY3V0aW9uLiBSZXF1aXJlZCBmb3IgQ2xvdWRXYXRjaCBMb2dzIGFjY2Vzcy4nLFxyXG4gICAgICAgICAgICBhcHBsaWVzVG86IFsnUG9saWN5Ojphcm46PEFXUzo6UGFydGl0aW9uPjppYW06OmF3czpwb2xpY3kvc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZSddLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHRydWUgLy8gQXBwbHkgdG8gY2hpbGRyZW4gKHJvbGUsIHBvbGljeSlcclxuICAgICAgKTtcclxuXHJcbiAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAgIC8vIElBTSBXaWxkY2FyZCBTdXBwcmVzc2lvbnNcclxuICAgICAgLy8gUHJvZHVjdGlvbiByZWNvbW1lbmRhdGlvbjogU2NvcGUgcGVybWlzc2lvbnMgdG8gc3BlY2lmaWMgcmVzb3VyY2VzIHdoZXJlIHBvc3NpYmxlXHJcbiAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9uc0J5UGF0aChcclxuICAgICAgICB0aGlzLFxyXG4gICAgICAgIGAke3RoaXMuc3RhY2tOYW1lfS8ke2ZuLm5vZGUuaWR9L1NlcnZpY2VSb2xlL0RlZmF1bHRQb2xpY3kvUmVzb3VyY2VgLFxyXG4gICAgICAgIFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtSUFNNScsXHJcbiAgICAgICAgICAgIHJlYXNvbjogJ1NhbXBsZSBwcm9qZWN0OiBXaWxkY2FyZCBwZXJtaXNzaW9ucyByZXF1aXJlZCBmb3IgQ2xvdWRXYXRjaCBMb2dzIChsb2cgc3RyZWFtIGNyZWF0aW9uKSwgRHluYW1vREIgcXVlcmllcywgYW5kIEJlZHJvY2sgS25vd2xlZGdlIEJhc2UgYWNjZXNzLiBQcm9kdWN0aW9uIHNob3VsZCBzY29wZSB0byBzcGVjaWZpYyByZXNvdXJjZXMuJyxcclxuICAgICAgICAgICAgYXBwbGllc1RvOiBbXHJcbiAgICAgICAgICAgICAgJ1Jlc291cmNlOjoqJyxcclxuICAgICAgICAgICAgICAnQWN0aW9uOjpsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsXHJcbiAgICAgICAgICAgICAgJ0FjdGlvbjo6bG9nczpQdXRMb2dFdmVudHMnLFxyXG4gICAgICAgICAgICAgICdSZXNvdXJjZTo6YXJuOmF3czpiZWRyb2NrOnVzLWVhc3QtMTo8QVdTOjpBY2NvdW50SWQ+Omtub3dsZWRnZS1iYXNlLyonLFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdXHJcbiAgICAgICk7XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gQ0RLLUdlbmVyYXRlZCBSZXNvdXJjZSBTdXBwcmVzc2lvbnNcclxuICAgIC8vIFRoZXNlIGFyZSBzdGFuZGFyZCBDREsgYmVoYXZpb3JzIHRoYXQgY2Fubm90IGJlIG1vZGlmaWVkXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zQnlQYXRoKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICBgJHt0aGlzLnN0YWNrTmFtZX0vTG9nUmV0ZW50aW9uYWFlMGFhM2M1YjRkNGY4N2IwMmQ4NWIyMDFlZmRkOGEvU2VydmljZVJvbGUvUmVzb3VyY2VgLFxyXG4gICAgICBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6ICdBd3NTb2x1dGlvbnMtSUFNNCcsXHJcbiAgICAgICAgICByZWFzb246ICdDREstY3JlYXRlZCBsb2cgcmV0ZW50aW9uIExhbWJkYSB1c2VzIEFXUyBtYW5hZ2VkIHBvbGljeS4gVGhpcyBpcyBzdGFuZGFyZCBDREsgYmVoYXZpb3IuJyxcclxuICAgICAgICAgIGFwcGxpZXNUbzogWydQb2xpY3k6OmFybjo8QVdTOjpQYXJ0aXRpb24+OmlhbTo6YXdzOnBvbGljeS9zZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJ10sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgICAgdHJ1ZVxyXG4gICAgKTtcclxuXHJcbiAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnNCeVBhdGgoXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgIGAke3RoaXMuc3RhY2tOYW1lfS9Mb2dSZXRlbnRpb25hYWUwYWEzYzViNGQ0Zjg3YjAyZDg1YjIwMWVmZGQ4YS9TZXJ2aWNlUm9sZS9EZWZhdWx0UG9saWN5L1Jlc291cmNlYCxcclxuICAgICAgW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGlkOiAnQXdzU29sdXRpb25zLUlBTTUnLFxyXG4gICAgICAgICAgcmVhc29uOiAnQ0RLLWNyZWF0ZWQgbG9nIHJldGVudGlvbiBMYW1iZGEgcmVxdWlyZXMgd2lsZGNhcmQgZm9yIGxvZyBtYW5hZ2VtZW50LiBUaGlzIGlzIHN0YW5kYXJkIENESyBiZWhhdmlvci4nLFxyXG4gICAgICAgICAgYXBwbGllc1RvOiBbJ1Jlc291cmNlOjoqJ10sXHJcbiAgICAgICAgfSxcclxuICAgICAgXVxyXG4gICAgKTtcclxuICB9XHJcbn1cclxuIl19