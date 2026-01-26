# Architecture - Serverless Weather Alert System

## System Overview

The Serverless Weather Alert System is an event-driven, serverless application that provides personalized weather-related advice to recipients based on their location and weather conditions.

## Architecture Diagram

![Weather Alert System Architecture](images/WeatherAlertSystem.jpg)

*Complete system architecture showing the event-driven flow from EventBridge trigger through Lambda functions, SQS queues, Bedrock AI, monitoring, and web UI delivery. The diagram includes authentication (Cognito), monitoring (CloudWatch + X-Ray), and optional SMS delivery.*

## Detailed Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AWS Cloud Environment                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐                                                        │
│  │ EventBridge  │  Daily at 6 AM UTC (9 AM EAT)                         │
│  │   Rule       │                                                        │
│  └──────┬───────┘                                                        │
│         │                                                                 │
│         ▼                                                                 │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  Lambda: ProfilesToLocationsFn                               │       │
│  │  - Scans DynamoDB for maternal profiles                      │       │
│  │  - Deduplicates by location (lat/lon)                        │       │
│  │  - Filters: one alert per day per mother                     │       │
│  └──────────────────┬───────────────────────────────────────────┘       │
│                     │                                                     │
│                     ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │  SQS: LocationFetch Queue                                   │        │
│  │  - Stores unique locations with enriched metadata           │        │
│  │  - DLQ: LocationFetchDLQ (3 retries)                        │        │
│  └──────────────────┬──────────────────────────────────────────┘        │
│                     │                                                     │
│                     ▼                                                     │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  Lambda: WeatherFetchFn                                      │       │
│  │  - Polls LocationFetch queue (batch: 10)                     │       │
│  │  - Calls Tomorrow.io API for daily forecast                 │       │
│  │  - Filters by temperature threshold (32°C)                   │       │
│  │  - Rate limited: 5 concurrent executions                     │       │
│  └──────────────────┬───────────────────────────────────────────┘       │
│                     │                                                     │
│                     ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │  SQS: WeatherResult Queue                                   │        │
│  │  - Stores weather data for severe conditions                │        │
│  │  - DLQ: WeatherResultDLQ (3 retries)                        │        │
│  └──────────────────┬──────────────────────────────────────────┘        │
│                     │                                                     │
│                     ▼                                                     │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  Lambda: AdviceFn                                            │       │
│  │  - Polls WeatherResult queue (batch: 5)                      │       │
│  │  - Queries Bedrock Knowledge Base (RAG)                      │       │
│  │  - Generates advice with Claude Sonnet                       │       │
│  │  - Personalizes by: ANC/PNC, conditions, language            │       │
│  └──────────────────┬───────────────────────────────────────────┘       │
│                     │                                                     │
│                     ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │  SQS: NotifyQueue                                            │        │
│  │  - Final advice messages ready for delivery                  │        │
│  │  - Retention: 7 days (for UI polling)                        │        │
│  └──────────────────┬───────────────────────────────────────────┘        │
│                     │                                                     │
│                     ├──────────────────────────────────────────┐         │
│                     │                                          │         │
│                     ▼                                          ▼         │
│  ┌──────────────────────────────────┐    ┌──────────────────────────┐  │
│  │  Lambda: SendAdviceSMSFn         │    │  React Phone UI          │  │
│  │  - Sends SMS via Africa's Talking│    │  - Polls NotifyQueue     │  │
│  │  - (Optional, disabled by default)│    │  - Displays messages     │  │
│  └──────────────────────────────────┘    └──────────────────────────┘  │
│                                                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                          Data Layer                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  DynamoDB: MumBaseTable                                      │       │
│  │  - Partition Key: contact_uuid                               │       │
│  │  - GSI: LocationIndex (facility_code, lastAlertedDate)       │       │
│  │  - Encryption: AWS Managed                                   │       │
│  │  - Point-in-time recovery enabled                            │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  S3: DataBucket(create your own bucket)                                     │       │
│  │  - Initial data uploads (Excel, CSV)                         │       │
│  │  - Backups and archives                                      │       │
│  │  - Lifecycle: Intelligent Tiering after 90 days              │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                          AI/ML Layer                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  Bedrock Knowledge Base                                      │       │
│  │  - Maternal health guidelines (PDFs, docs)                   │       │
│  │  - Embedding: Titan Embeddings G1                            │       │
│  │  - Vector search for RAG                                     │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  Bedrock Model: Claude 3 Sonnet                              │       │
│  │  - Generates personalized health advice                      │       │
│  │  - Supports English and Swahili                              │       │
│  │  - Context-aware (ANC/PNC, conditions, weather)              │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                       Monitoring & Observability                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  CloudWatch Dashboard                                        │       │
│  │  - Lambda invocations, errors, duration                      │       │
│  │  - SQS queue depths and message rates                        │       │
│  │  - End-to-end flow visualization                             │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  CloudWatch Alarms                                           │       │
│  │  - Lambda errors (> 5 in 5 min)                              │       │
│  │  - Slow execution (> 60s avg)                                │       │
│  │  - Queue backlog (> 1000 messages)                           │       │
│  │  - DLQ messages                                              │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  SNS Topic: WeatherAlert-SystemAlarms                        │       │
│  │  - Email notifications for critical alarms                   │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  X-Ray Tracing                                               │       │
│  │  - Distributed tracing across Lambda functions               │       │
│  │  - Performance bottleneck identification                   │       │
│  │  - Traces flow: EventBridge → Lambda → DynamoDB → SQS     │       │
│  │    → Lambda → External API → Lambda → Bedrock → SQS       │       │
│  │  - Access via: AWS X-Ray Console (Service Map/Traces)     │       │
│  │  - Shows: End-to-end flow, timing, errors, bottlenecks    │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘

External APIs:
┌──────────────────────┐
│  Tomorrow.io API     │  Weather forecasts (500 calls/day free)
└──────────────────────┘

┌──────────────────────┐
│  Africa's Talking    │  SMS delivery (optional)
└──────────────────────┘
```

## Data Flow

### 1. Profile Scanning Phase
- **Trigger**: EventBridge rule (daily at 6 AM UTC)
- **Input**: None (scheduled)
- **Process**: 
  - Scan DynamoDB for all maternal profiles
  - Filter out profiles already alerted today
  - Deduplicate by location (rounded to 3 decimal places)
- **Output**: Unique locations → LocationFetch SQS

### 2. Weather Fetching Phase
- **Trigger**: SQS messages from LocationFetch
- **Input**: Location coordinates + maternal metadata
- **Process**:
  - Call Tomorrow.io API for daily forecast
  - Extract max temperature
  - Filter by threshold (32°C) unless DEMO_MODE
- **Output**: Severe weather events → WeatherResult SQS

### 3. Advice Generation Phase
- **Trigger**: SQS messages from WeatherResult
- **Input**: Weather data + maternal profile
- **Process**:
  - Build search query from profile (ANC/PNC, conditions, temp)
  - Retrieve relevant context from Bedrock KB (RAG)
  - Generate personalized advice with Claude Sonnet
  - Localize to English or Swahili
- **Output**: Final advice messages → NotifyQueue SQS

### 4. Delivery Phase
- **Option A - SMS**: SendAdviceSMSFn → Africa's Talking API
- **Option B - UI**: React app polls NotifyQueue and displays messages

## Key Design Decisions

### 1. Event-Driven Architecture
- **Why**: Decouples components, enables independent scaling
- **Benefit**: Each Lambda can fail/retry independently without affecting others

### 2. SQS for Messaging
- **Why**: Reliable, durable, built-in retry logic
- **Benefit**: Messages persist even if downstream fails

### 3. Location Deduplication
- **Why**: Avoid redundant API calls for nearby mothers
- **Benefit**: Reduces Tomorrow.io API usage by ~80%

### 4. One Alert Per Day
- **Why**: Prevent alert fatigue
- **Benefit**: Mothers receive timely but not overwhelming notifications

### 5. RAG with Bedrock KB
- **Why**: Ground LLM responses in verified medical guidelines
- **Benefit**: Accurate, trustworthy health advice

### 6. Serverless
- **Why**: No infrastructure management, pay-per-use
- **Benefit**: Cost-effective for variable workloads

## Security Architecture

### Data Protection
- **At Rest**: DynamoDB and SQS use AWS-managed encryption
- **In Transit**: All API calls use HTTPS/TLS
- **Secrets**: API keys stored in Secrets Manager

### Access Control
- **IAM Roles**: Each Lambda has least-privilege permissions
- **Resource Policies**: SQS queues restrict access to specific Lambdas
- **VPC**: (Optional) Lambdas can run in private subnets

### Compliance
- **HIPAA**: Can be enabled with BAA and additional controls
- **GDPR**: PII handling follows data minimization principles
- **Audit**: CloudTrail logs all API calls

## Scalability

### Current Limits
- **Mothers**: 1,000 profiles
- **Locations**: ~200 unique (after deduplication)
- **Weather API**: 500 calls/day (free tier)
- **Bedrock**: 1,000 queries/day

### Scaling Strategy
- **10K mothers**: Increase Lambda concurrency, upgrade Tomorrow.io plan
- **100K mothers**: Add DynamoDB GSI for location queries, use Step Functions
- **1M mothers**: Partition by region, use Bedrock provisioned throughput

## Cost Breakdown

### Monthly Costs (1,000 mothers)
| Service | Usage | Cost |
|---------|-------|------|
| Lambda | 3,000 invocations × 512MB × 30s | $0.20 |
| DynamoDB | 1,000 items, 30 reads/day | $2.50 |
| SQS | 100,000 messages | Free |
| Bedrock KB | 1,000 queries | $5.00 |
| Bedrock Claude | 1,000 × 500 tokens | $10.00 |
| Tomorrow.io | 500 calls/day | Free |
| CloudWatch | Logs + metrics | $5.00 |
| **Total** | | **$22.70** |

## Failure Handling

### Retry Strategy
1. **SQS**: 3 retries with exponential backoff
2. **DLQ**: Failed messages moved to dead-letter queues
3. **Alarms**: CloudWatch alerts on DLQ messages

### Error Scenarios
| Error | Handling |
|-------|----------|
| DynamoDB throttling | Lambda retries automatically |
| Weather API timeout | Message returns to queue, retries |
| Bedrock rate limit | Exponential backoff, DLQ after 3 tries |
| Invalid phone number | Log error, skip message |

## Performance Metrics

### Target SLAs
- **End-to-end latency**: < 5 minutes (scan → advice)
- **Lambda duration**: < 30 seconds per invocation
- **API success rate**: > 99%
- **Message delivery**: > 95%

### Monitoring

**Custom CloudWatch Dashboard** (created by CDK, not out-of-the-box):

The system includes a comprehensive monitoring dashboard with:

**Lambda Function Metrics** (for each of 4 functions):
- Invocations & Errors (time series graphs)
- Duration/Performance (average execution time)
- Error rate alarms (triggers if > 5 errors in 5 minutes)
- Slow execution alarms (triggers if > 60 seconds average)

**SQS Queue Metrics** (for 3 queues):
- Messages visible (current queue depth)
- Messages sent/received rates
- Queue backlog alarms (triggers if > 1,000 messages)

**End-to-End Flow Visualization**:
- Single graph showing complete workflow
- Recipients Scanned → Weather Fetched → Messages Generated
- Easy to spot bottlenecks or failures

**SNS Alarm Notifications**:
- All alarms send to SNS topic
- Subscribe email addresses for alerts
- Immediate notification of issues

**Access the dashboard**:
```bash
# Get dashboard URL from CDK output
aws cloudformation describe-stacks \
  --stack-name WeatherAlertMonitoringStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
  --output text
```

**Additional monitoring**:
- CloudWatch Logs for all Lambda functions
- X-Ray tracing for distributed debugging
- Dead Letter Queues for failed messages

## Future Enhancements

1. **Multi-language support**: Add more Kenyan languages
2. **Weather types**: Expand beyond heat (floods, storms)
3. **Predictive alerts**: Use ML to predict high-risk periods
4. **Two-way SMS**: Allow mothers to respond with questions
5. **WhatsApp integration**: Alternative to SMS
6. **Mobile app**: Native iOS/Android apps
7. **Analytics dashboard**: Track alert effectiveness

## References

- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Tomorrow.io API Docs](https://docs.tomorrow.io/)
- [Africa's Talking SMS API](https://developers.africastalking.com/docs/sms)
