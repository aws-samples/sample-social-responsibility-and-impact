import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

interface MonitoringStackProps extends cdk.StackProps {
  profilesToLocationsFn: lambda.Function;
  weatherFetchFn: lambda.Function;
  adviceFn: lambda.Function; // Keep old name for compatibility
  messageGeneratorFn?: lambda.Function; // New name (optional for transition)
  sendAdviceSMSFn: lambda.Function;
  locationFetchQueue: sqs.Queue;
  weatherResultQueue: sqs.Queue;
  notifyQueue: sqs.Queue;
}

export class WeatherAlertMonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // SNS Topic for alarms with SSL enforcement
    const alarmTopic = new sns.Topic(this, 'WeatherAlertAlarmTopic', {
      topicName: 'WeatherAlert-SystemAlarms',
      displayName: 'Weather Alert System Alarms',
      enforceSSL: true, // Enforce SSL/TLS for all communications
    });

    // Add explicit topic policy to deny non-SSL requests (defense in depth)
    alarmTopic.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowPublishThroughSSLOnly',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['sns:Publish'],
      resources: [alarmTopic.topicArn],
      conditions: {
        'Bool': {
          'aws:SecureTransport': 'false',
        },
      },
    }));

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'WeatherAlertDashboard', {
      dashboardName: 'WeatherAlert-System-Dashboard',
    });

    // Lambda Metrics
    const lambdaFunctions = [
      { fn: props.profilesToLocationsFn, name: 'RecipientsToLocations' },
      { fn: props.weatherFetchFn, name: 'WeatherFetch' },
      { fn: props.adviceFn, name: 'MessageGenerator' },
      { fn: props.sendAdviceSMSFn, name: 'SendSMS' },
    ];

    lambdaFunctions.forEach(({ fn, name }) => {
      // Error rate alarm
      const errorMetric = fn.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      });

      const errorAlarm = new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        alarmName: `WeatherAlert-${name}-Errors`,
        metric: errorMetric,
        threshold: 5,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      errorAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));

      // Duration alarm
      const durationMetric = fn.metricDuration({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      });

      const durationAlarm = new cloudwatch.Alarm(this, `${name}DurationAlarm`, {
        alarmName: `WeatherAlert-${name}-SlowExecution`,
        metric: durationMetric,
        threshold: 60000, // 60 seconds
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      durationAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));

      // Add to dashboard
      dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: `${name} - Invocations & Errors`,
          left: [fn.metricInvocations(), fn.metricErrors()],
          width: 12,
        }),
        new cloudwatch.GraphWidget({
          title: `${name} - Duration`,
          left: [fn.metricDuration()],
          width: 12,
        })
      );
    });

    // SQS Queue Metrics
    const queues = [
      { queue: props.locationFetchQueue, name: 'LocationFetch' },
      { queue: props.weatherResultQueue, name: 'WeatherResult' },
      { queue: props.notifyQueue, name: 'Notify' },
    ];

    queues.forEach(({ queue, name }) => {
      // Messages visible alarm
      const messagesMetric = queue.metricApproximateNumberOfMessagesVisible({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      });

      const queueBacklogAlarm = new cloudwatch.Alarm(this, `${name}QueueBacklogAlarm`, {
        alarmName: `WeatherAlert-${name}-QueueBacklog`,
        metric: messagesMetric,
        threshold: 1000,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      queueBacklogAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));

      // Add to dashboard
      dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: `${name} Queue - Messages`,
          left: [
            queue.metricApproximateNumberOfMessagesVisible(),
            queue.metricNumberOfMessagesSent(),
            queue.metricNumberOfMessagesReceived(),
          ],
          width: 12,
        })
      );
    });

    // Custom metrics widget for end-to-end flow
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'End-to-End Flow',
        left: [
          props.profilesToLocationsFn.metricInvocations({ label: '1. Recipients Scanned' }),
          props.weatherFetchFn.metricInvocations({ label: '2. Weather Fetched' }),
          props.adviceFn.metricInvocations({ label: '3. Messages Generated' }),
        ],
        width: 24,
      })
    );

    // Outputs
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS Topic for system alarms',
    });
  }
}
