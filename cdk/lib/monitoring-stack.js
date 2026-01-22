"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherAlertMonitoringStack = void 0;
const cdk = require("aws-cdk-lib");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const sns = require("aws-cdk-lib/aws-sns");
const iam = require("aws-cdk-lib/aws-iam");
const actions = require("aws-cdk-lib/aws-cloudwatch-actions");
class WeatherAlertMonitoringStack extends cdk.Stack {
    constructor(scope, id, props) {
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
            dashboard.addWidgets(new cloudwatch.GraphWidget({
                title: `${name} - Invocations & Errors`,
                left: [fn.metricInvocations(), fn.metricErrors()],
                width: 12,
            }), new cloudwatch.GraphWidget({
                title: `${name} - Duration`,
                left: [fn.metricDuration()],
                width: 12,
            }));
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
            dashboard.addWidgets(new cloudwatch.GraphWidget({
                title: `${name} Queue - Messages`,
                left: [
                    queue.metricApproximateNumberOfMessagesVisible(),
                    queue.metricNumberOfMessagesSent(),
                    queue.metricNumberOfMessagesReceived(),
                ],
                width: 12,
            }));
        });
        // Custom metrics widget for end-to-end flow
        dashboard.addWidgets(new cloudwatch.GraphWidget({
            title: 'End-to-End Flow',
            left: [
                props.profilesToLocationsFn.metricInvocations({ label: '1. Recipients Scanned' }),
                props.weatherFetchFn.metricInvocations({ label: '2. Weather Fetched' }),
                props.adviceFn.metricInvocations({ label: '3. Messages Generated' }),
            ],
            width: 24,
        }));
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
exports.WeatherAlertMonitoringStack = WeatherAlertMonitoringStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uaXRvcmluZy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1vbml0b3Jpbmctc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLHlEQUF5RDtBQUd6RCwyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLDhEQUE4RDtBQWU5RCxNQUFhLDJCQUE0QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3hELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBMkI7UUFDbkUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsNENBQTRDO1FBQzVDLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDL0QsU0FBUyxFQUFFLDJCQUEyQjtZQUN0QyxXQUFXLEVBQUUsNkJBQTZCO1lBQzFDLFVBQVUsRUFBRSxJQUFJLEVBQUUseUNBQXlDO1NBQzVELENBQUMsQ0FBQztRQUVILHdFQUF3RTtRQUN4RSxVQUFVLENBQUMsbUJBQW1CLENBQUMsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3JELEdBQUcsRUFBRSw0QkFBNEI7WUFDakMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSTtZQUN2QixVQUFVLEVBQUUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNwQyxPQUFPLEVBQUUsQ0FBQyxhQUFhLENBQUM7WUFDeEIsU0FBUyxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQztZQUNoQyxVQUFVLEVBQUU7Z0JBQ1YsTUFBTSxFQUFFO29CQUNOLHFCQUFxQixFQUFFLE9BQU87aUJBQy9CO2FBQ0Y7U0FDRixDQUFDLENBQUMsQ0FBQztRQUVKLHVCQUF1QjtRQUN2QixNQUFNLFNBQVMsR0FBRyxJQUFJLFVBQVUsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixF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Y2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcclxuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xyXG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XHJcbmltcG9ydCAqIGFzIGFjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gtYWN0aW9ucyc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tICdjZGstbmFnJztcclxuXHJcbmludGVyZmFjZSBNb25pdG9yaW5nU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcclxuICBwcm9maWxlc1RvTG9jYXRpb25zRm46IGxhbWJkYS5GdW5jdGlvbjtcclxuICB3ZWF0aGVyRmV0Y2hGbjogbGFtYmRhLkZ1bmN0aW9uO1xyXG4gIGFkdmljZUZuOiBsYW1iZGEuRnVuY3Rpb247IC8vIEtlZXAgb2xkIG5hbWUgZm9yIGNvbXBhdGliaWxpdHlcclxuICBtZXNzYWdlR2VuZXJhdG9yRm4/OiBsYW1iZGEuRnVuY3Rpb247IC8vIE5ldyBuYW1lIChvcHRpb25hbCBmb3IgdHJhbnNpdGlvbilcclxuICBzZW5kQWR2aWNlU01TRm46IGxhbWJkYS5GdW5jdGlvbjtcclxuICBsb2NhdGlvbkZldGNoUXVldWU6IHNxcy5RdWV1ZTtcclxuICB3ZWF0aGVyUmVzdWx0UXVldWU6IHNxcy5RdWV1ZTtcclxuICBub3RpZnlRdWV1ZTogc3FzLlF1ZXVlO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgV2VhdGhlckFsZXJ0TW9uaXRvcmluZ1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTW9uaXRvcmluZ1N0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIC8vIFNOUyBUb3BpYyBmb3IgYWxhcm1zIHdpdGggU1NMIGVuZm9yY2VtZW50XHJcbiAgICBjb25zdCBhbGFybVRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnV2VhdGhlckFsZXJ0QWxhcm1Ub3BpYycsIHtcclxuICAgICAgdG9waWNOYW1lOiAnV2VhdGhlckFsZXJ0LVN5c3RlbUFsYXJtcycsXHJcbiAgICAgIGRpc3BsYXlOYW1lOiAnV2VhdGhlciBBbGVydCBTeXN0ZW0gQWxhcm1zJyxcclxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSwgLy8gRW5mb3JjZSBTU0wvVExTIGZvciBhbGwgY29tbXVuaWNhdGlvbnNcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBleHBsaWNpdCB0b3BpYyBwb2xpY3kgdG8gZGVueSBub24tU1NMIHJlcXVlc3RzIChkZWZlbnNlIGluIGRlcHRoKVxyXG4gICAgYWxhcm1Ub3BpYy5hZGRUb1Jlc291cmNlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgc2lkOiAnQWxsb3dQdWJsaXNoVGhyb3VnaFNTTE9ubHknLFxyXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuREVOWSxcclxuICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQW55UHJpbmNpcGFsKCldLFxyXG4gICAgICBhY3Rpb25zOiBbJ3NuczpQdWJsaXNoJ10sXHJcbiAgICAgIHJlc291cmNlczogW2FsYXJtVG9waWMudG9waWNBcm5dLFxyXG4gICAgICBjb25kaXRpb25zOiB7XHJcbiAgICAgICAgJ0Jvb2wnOiB7XHJcbiAgICAgICAgICAnYXdzOlNlY3VyZVRyYW5zcG9ydCc6ICdmYWxzZScsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBDbG91ZFdhdGNoIERhc2hib2FyZFxyXG4gICAgY29uc3QgZGFzaGJvYXJkID0gbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsICdXZWF0aGVyQWxlcnREYXNoYm9hcmQnLCB7XHJcbiAgICAgIGRhc2hib2FyZE5hbWU6ICdXZWF0aGVyQWxlcnQtU3lzdGVtLURhc2hib2FyZCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBMYW1iZGEgTWV0cmljc1xyXG4gICAgY29uc3QgbGFtYmRhRnVuY3Rpb25zID0gW1xyXG4gICAgICB7IGZuOiBwcm9wcy5wcm9maWxlc1RvTG9jYXRpb25zRm4sIG5hbWU6ICdSZWNpcGllbnRzVG9Mb2NhdGlvbnMnIH0sXHJcbiAgICAgIHsgZm46IHByb3BzLndlYXRoZXJGZXRjaEZuLCBuYW1lOiAnV2VhdGhlckZldGNoJyB9LFxyXG4gICAgICB7IGZuOiBwcm9wcy5hZHZpY2VGbiwgbmFtZTogJ01lc3NhZ2VHZW5lcmF0b3InIH0sXHJcbiAgICAgIHsgZm46IHByb3BzLnNlbmRBZHZpY2VTTVNGbiwgbmFtZTogJ1NlbmRTTVMnIH0sXHJcbiAgICBdO1xyXG5cclxuICAgIGxhbWJkYUZ1bmN0aW9ucy5mb3JFYWNoKCh7IGZuLCBuYW1lIH0pID0+IHtcclxuICAgICAgLy8gRXJyb3IgcmF0ZSBhbGFybVxyXG4gICAgICBjb25zdCBlcnJvck1ldHJpYyA9IGZuLm1ldHJpY0Vycm9ycyh7XHJcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IGVycm9yQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgJHtuYW1lfUVycm9yQWxhcm1gLCB7XHJcbiAgICAgICAgYWxhcm1OYW1lOiBgV2VhdGhlckFsZXJ0LSR7bmFtZX0tRXJyb3JzYCxcclxuICAgICAgICBtZXRyaWM6IGVycm9yTWV0cmljLFxyXG4gICAgICAgIHRocmVzaG9sZDogNSxcclxuICAgICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcclxuICAgICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXHJcbiAgICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXHJcbiAgICAgIH0pO1xyXG4gICAgICBlcnJvckFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBhY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XHJcblxyXG4gICAgICAvLyBEdXJhdGlvbiBhbGFybVxyXG4gICAgICBjb25zdCBkdXJhdGlvbk1ldHJpYyA9IGZuLm1ldHJpY0R1cmF0aW9uKHtcclxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcclxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IGR1cmF0aW9uQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgJHtuYW1lfUR1cmF0aW9uQWxhcm1gLCB7XHJcbiAgICAgICAgYWxhcm1OYW1lOiBgV2VhdGhlckFsZXJ0LSR7bmFtZX0tU2xvd0V4ZWN1dGlvbmAsXHJcbiAgICAgICAgbWV0cmljOiBkdXJhdGlvbk1ldHJpYyxcclxuICAgICAgICB0aHJlc2hvbGQ6IDYwMDAwLCAvLyA2MCBzZWNvbmRzXHJcbiAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXHJcbiAgICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xELFxyXG4gICAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxyXG4gICAgICB9KTtcclxuICAgICAgZHVyYXRpb25BbGFybS5hZGRBbGFybUFjdGlvbihuZXcgYWN0aW9ucy5TbnNBY3Rpb24oYWxhcm1Ub3BpYykpO1xyXG5cclxuICAgICAgLy8gQWRkIHRvIGRhc2hib2FyZFxyXG4gICAgICBkYXNoYm9hcmQuYWRkV2lkZ2V0cyhcclxuICAgICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XHJcbiAgICAgICAgICB0aXRsZTogYCR7bmFtZX0gLSBJbnZvY2F0aW9ucyAmIEVycm9yc2AsXHJcbiAgICAgICAgICBsZWZ0OiBbZm4ubWV0cmljSW52b2NhdGlvbnMoKSwgZm4ubWV0cmljRXJyb3JzKCldLFxyXG4gICAgICAgICAgd2lkdGg6IDEyLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcclxuICAgICAgICAgIHRpdGxlOiBgJHtuYW1lfSAtIER1cmF0aW9uYCxcclxuICAgICAgICAgIGxlZnQ6IFtmbi5tZXRyaWNEdXJhdGlvbigpXSxcclxuICAgICAgICAgIHdpZHRoOiAxMixcclxuICAgICAgICB9KVxyXG4gICAgICApO1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gU1FTIFF1ZXVlIE1ldHJpY3NcclxuICAgIGNvbnN0IHF1ZXVlcyA9IFtcclxuICAgICAgeyBxdWV1ZTogcHJvcHMubG9jYXRpb25GZXRjaFF1ZXVlLCBuYW1lOiAnTG9jYXRpb25GZXRjaCcgfSxcclxuICAgICAgeyBxdWV1ZTogcHJvcHMud2VhdGhlclJlc3VsdFF1ZXVlLCBuYW1lOiAnV2VhdGhlclJlc3VsdCcgfSxcclxuICAgICAgeyBxdWV1ZTogcHJvcHMubm90aWZ5UXVldWUsIG5hbWU6ICdOb3RpZnknIH0sXHJcbiAgICBdO1xyXG5cclxuICAgIHF1ZXVlcy5mb3JFYWNoKCh7IHF1ZXVlLCBuYW1lIH0pID0+IHtcclxuICAgICAgLy8gTWVzc2FnZXMgdmlzaWJsZSBhbGFybVxyXG4gICAgICBjb25zdCBtZXNzYWdlc01ldHJpYyA9IHF1ZXVlLm1ldHJpY0FwcHJveGltYXRlTnVtYmVyT2ZNZXNzYWdlc1Zpc2libGUoe1xyXG4gICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxyXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgcXVldWVCYWNrbG9nQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgJHtuYW1lfVF1ZXVlQmFja2xvZ0FsYXJtYCwge1xyXG4gICAgICAgIGFsYXJtTmFtZTogYFdlYXRoZXJBbGVydC0ke25hbWV9LVF1ZXVlQmFja2xvZ2AsXHJcbiAgICAgICAgbWV0cmljOiBtZXNzYWdlc01ldHJpYyxcclxuICAgICAgICB0aHJlc2hvbGQ6IDEwMDAsXHJcbiAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXHJcbiAgICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xELFxyXG4gICAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxyXG4gICAgICB9KTtcclxuICAgICAgcXVldWVCYWNrbG9nQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGFjdGlvbnMuU25zQWN0aW9uKGFsYXJtVG9waWMpKTtcclxuXHJcbiAgICAgIC8vIEFkZCB0byBkYXNoYm9hcmRcclxuICAgICAgZGFzaGJvYXJkLmFkZFdpZGdldHMoXHJcbiAgICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xyXG4gICAgICAgICAgdGl0bGU6IGAke25hbWV9IFF1ZXVlIC0gTWVzc2FnZXNgLFxyXG4gICAgICAgICAgbGVmdDogW1xyXG4gICAgICAgICAgICBxdWV1ZS5tZXRyaWNBcHByb3hpbWF0ZU51bWJlck9mTWVzc2FnZXNWaXNpYmxlKCksXHJcbiAgICAgICAgICAgIHF1ZXVlLm1ldHJpY051bWJlck9mTWVzc2FnZXNTZW50KCksXHJcbiAgICAgICAgICAgIHF1ZXVlLm1ldHJpY051bWJlck9mTWVzc2FnZXNSZWNlaXZlZCgpLFxyXG4gICAgICAgICAgXSxcclxuICAgICAgICAgIHdpZHRoOiAxMixcclxuICAgICAgICB9KVxyXG4gICAgICApO1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3VzdG9tIG1ldHJpY3Mgd2lkZ2V0IGZvciBlbmQtdG8tZW5kIGZsb3dcclxuICAgIGRhc2hib2FyZC5hZGRXaWRnZXRzKFxyXG4gICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XHJcbiAgICAgICAgdGl0bGU6ICdFbmQtdG8tRW5kIEZsb3cnLFxyXG4gICAgICAgIGxlZnQ6IFtcclxuICAgICAgICAgIHByb3BzLnByb2ZpbGVzVG9Mb2NhdGlvbnNGbi5tZXRyaWNJbnZvY2F0aW9ucyh7IGxhYmVsOiAnMS4gUmVjaXBpZW50cyBTY2FubmVkJyB9KSxcclxuICAgICAgICAgIHByb3BzLndlYXRoZXJGZXRjaEZuLm1ldHJpY0ludm9jYXRpb25zKHsgbGFiZWw6ICcyLiBXZWF0aGVyIEZldGNoZWQnIH0pLFxyXG4gICAgICAgICAgcHJvcHMuYWR2aWNlRm4ubWV0cmljSW52b2NhdGlvbnMoeyBsYWJlbDogJzMuIE1lc3NhZ2VzIEdlbmVyYXRlZCcgfSksXHJcbiAgICAgICAgXSxcclxuICAgICAgICB3aWR0aDogMjQsXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG5cclxuICAgIC8vIE91dHB1dHNcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXNoYm9hcmRVcmwnLCB7XHJcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly9jb25zb2xlLmF3cy5hbWF6b24uY29tL2Nsb3Vkd2F0Y2gvaG9tZT9yZWdpb249JHt0aGlzLnJlZ2lvbn0jZGFzaGJvYXJkczpuYW1lPSR7ZGFzaGJvYXJkLmRhc2hib2FyZE5hbWV9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdDbG91ZFdhdGNoIERhc2hib2FyZCBVUkwnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FsYXJtVG9waWNBcm4nLCB7XHJcbiAgICAgIHZhbHVlOiBhbGFybVRvcGljLnRvcGljQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyBUb3BpYyBmb3Igc3lzdGVtIGFsYXJtcycsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19