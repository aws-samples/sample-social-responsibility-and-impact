# Serverless Weather Alert System

[![AWS Samples](https://img.shields.io/badge/AWS-Samples-orange)](https://github.com/aws-samples)
[![License: MIT-0](https://img.shields.io/badge/License-MIT--0-blue.svg)](LICENSE)
[![CDK Version](https://img.shields.io/badge/CDK-2.150.0-green.svg)](https://docs.aws.amazon.com/cdk/)

**Event-driven architecture for sending personalized weather alerts at scale using Amazon Bedrock, SQS, and Lambda**

A production-ready, industry-agnostic system that demonstrates serverless best practices, AI-powered personalization, and cost-optimized processing patterns. Includes a working implementation for maternal health and can be adapted to any industry.

**🎯 Built with AWS Well-Architected Framework**

## 🌟 Features

- ✅ **AI-Powered Personalization**: Uses Amazon Bedrock (Claude 3 Sonnet) with RAG for context-aware advice
- ✅ **Event-Driven Architecture**: Serverless design with SQS, Lambda, and EventBridge
- ✅ **Cost-Optimized**: Location deduplication reduces API calls by 80% (~$47/month for 240K profiles)
- ✅ **Complete Web UI**: React app with 3 views (Cards, Phone mockup, Interactive Map)
- ✅ **Production-Ready**: Monitoring, alarms, DLQs, error handling, and retry logic
- ✅ **Industry-Agnostic**: Easily adaptable for agriculture, construction, public safety, and more
- ✅ **Proven at Scale**: Currently processing 240K+ profiles daily in production
- ✅ **Free Map Integration**: OpenStreetMap (no API keys required)

## 🏗️ Architecture

```
EventBridge (Scheduled Trigger)
    ↓
RecipientsToLocationsFn → Scans DynamoDB, deduplicates by location
    ↓
LocationFetch SQS → WeatherFetchFn → Weather API (rate-limited)
    ↓
WeatherResult SQS → MessageGeneratorFn → Bedrock KB + Claude Sonnet
    ↓
NotifyQueue SQS → API Gateway (Cognito) → CloudFront Web UI
```

### AWS Services Used

- **Compute**: AWS Lambda (serverless functions)
- **AI/ML**: Amazon Bedrock (Claude 3 Sonnet + Knowledge Base)
- **Storage**: Amazon DynamoDB, Amazon S3
- **Messaging**: Amazon SQS (with Dead Letter Queues)
- **Orchestration**: Amazon EventBridge
- **Web**: Amazon CloudFront, Amazon Cognito, Amazon API Gateway
- **Monitoring**: Amazon CloudWatch (dashboards, alarms, logs)

### Key Design Patterns

- **Location Deduplication**: Reduces API calls by ~80% (1,300 unique locations from 240K profiles)
- **Rate Limiting**: Concurrency controls and sleep intervals respect API quotas
- **One Alert Per Day**: Prevents notification fatigue
- **Resume Capability**: Data loader can resume from interruption
- **Error Handling**: Dead Letter Queues with 3 retries before failure

## 📁 Project Structure

```
├── cdk/                          # AWS CDK infrastructure
│   └── lib/
│       ├── data-stack.ts         # DynamoDB, SQS, S3
│       ├── compute-stack.ts      # Lambda functions, EventBridge
│       ├── web-hosting-stack.ts  # CloudFront, Cognito, API Gateway
│       └── monitoring-stack.ts   # CloudWatch dashboard, alarms
├── lambda/                       # Lambda function code
│   ├── recipients-to-locations/  # DDB scanner & deduplicator
│   ├── weather-fetch/            # Weather API integration
│   ├── message-generator/        # Bedrock KB + Claude integration
│   ├── send-sms/                 # SMS integration (optional)
│   └── sqs-poller/               # API endpoint for web UI
├── web-ui/                       # React web application
│   ├── src/
│   │   ├── config/
│   │   │   └── labels.js         # Configurable UI labels
│   │   └── components/
│   │       ├── Dashboard.js      # Main dashboard
│   │       ├── MessageCard.js    # Card view
│   │       ├── PhoneView.js      # Phone mockup view
│   │       └── MapView.js        # Interactive map
│   └── public/
├── examples/                     # Use case examples
│   ├── maternal-health/          # Reference implementation
│   ├── agriculture/              # Sample configuration
│   └── construction/             # Sample configuration
├── scripts/                      # Utility scripts
│   └── load-sample-data.py       # S3 → DynamoDB data loader
└── docs/
    ├── USE_CASES.md              # Industry examples
    ├── CUSTOMIZATION.md          # Adaptation guide
    ├── ARCHITECTURE.md           # System design
    └── DEPLOYMENT.md             # Deployment instructions
```

## 🎯 Use Cases

This system can be adapted for any industry where weather conditions trigger personalized notifications:

### 🏥 Maternal Health (Included Implementation)
**Scenario**: Pregnant women receive personalized health advice during extreme heat  
**Status**: ✅ **Production** - Currently protecting 240K+ mothers in Kenya  
**Threshold**: Temperature > 32°C  
**Message**: Hydration tips, activity recommendations, when to seek care

### 🌾 Agriculture (Conceptual)
**Scenario**: Farmers receive frost warnings and crop protection advice  
**Threshold**: Temperature < 0°C  
**Message**: Frost protection measures, irrigation timing, harvest adjustments

### 🏗️ Construction (Conceptual)
**Scenario**: Site managers get safety alerts for high winds or storms  
**Threshold**: Wind speed > 40 km/h  
**Message**: Safety protocols, equipment protection, work suspensions

### 🚨 Public Safety (Conceptual)
**Scenario**: Citizens receive severe weather warnings and evacuation guidance  
**Threshold**: Various (floods, storms, extreme heat)  
**Message**: Evacuation routes, shelter locations, safety instructions

### 🚛 Transportation (Conceptual)
**Scenario**: Fleet managers get route warnings for ice, fog, or flooding  
**Threshold**: Various (temperature, visibility, rainfall)  
**Message**: Route alternatives, delay estimates, safety advisories

**See [USE_CASES.md](USE_CASES.md) for detailed examples with sample data and prompts.**

## 🚀 Quick Start

### Prerequisites

- AWS Account with appropriate permissions
- AWS CLI v2 configured
- Node.js 18+ and npm
- Python 3.12+
- Weather API key (Tomorrow.io recommended - [Get free key](https://www.tomorrow.io/weather-api/))
- Amazon Bedrock access (Claude 3 Sonnet model enabled)

### Deployment (30-45 minutes)

```bash
# 1. Clone the repository
git clone <repository-url>
cd serverless-weather-alert-system

# 2. Store Weather API key in Secrets Manager
aws secretsmanager create-secret \
  --name weather-alert-system/api-key \
  --secret-string "YOUR_TOMORROW_IO_API_KEY" \
  --region us-east-1

# 3. Create Bedrock Knowledge Base (via AWS Console)
# - Upload your domain-specific documents (health advice, farming tips, etc.)
# - Note the Knowledge Base ID

# 4. Export Bedrock KB ID for CDK
aws cloudformation create-stack \
  --stack-name WeatherAlertBedrockKB \
  --template-body file://bedrock-kb-export.yaml \
  --parameters ParameterKey=KnowledgeBaseId,ParameterValue=YOUR_KB_ID \
  --region us-east-1

# 5. Enable Claude 3 Sonnet in Bedrock Console
# Navigate to Amazon Bedrock → Model access → Enable Claude 3 Sonnet

# 6. Deploy infrastructure with CDK
cd cdk
npm install
cdk bootstrap  # First time only
cdk deploy --all --require-approval never

# 7. Create Cognito admin user
aws cognito-idp admin-create-user \
  --user-pool-id <YOUR_POOL_ID_FROM_CDK_OUTPUT> \
  --username admin \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS

# 8. Load sample data
cd ../scripts
pip install -r requirements.txt
python load-sample-data.py <YOUR_S3_BUCKET> sample-data.json RecipientsTable

# 9. Build and deploy web UI
cd ../web-ui
npm install
npm run build
aws s3 sync build/ s3://<YOUR_WEB_BUCKET>/ --delete
```

**See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed step-by-step instructions.**

## 🎨 Customization

This system is designed to be easily adapted for your industry:

1. **Define your data schema** - What information do you need about recipients?
2. **Set weather thresholds** - What conditions trigger alerts?
3. **Customize AI prompts** - What advice should be generated?
4. **Update UI labels** - How should information be displayed?

**See [CUSTOMIZATION.md](CUSTOMIZATION.md) for a complete adaptation guide.**

### Quick Configuration Example

```bash
# Configure for agriculture use case
cd web-ui
cat > .env.local << EOF
REACT_APP_TITLE="Farm Weather Alerts"
REACT_APP_RECIPIENT_LABEL="Farmers"
REACT_APP_LOCATION_LABEL="Farm"
REACT_APP_MESSAGE_LABEL="Farming Advice"
EOF

# Update Bedrock prompt in CDK
# Edit cdk/lib/compute-stack.ts:
# BEDROCK_SYSTEM_PROMPT: "You are an agricultural advisor..."
```

## 🔒 Security Features

- **No PII in Git**: Data files excluded via .gitignore, loaded from S3
- **Secrets Management**: API keys stored in AWS Secrets Manager
- **Authentication**: Cognito User Pool with email verification
- **Authorization**: API Gateway with Cognito authorizer
- **Encryption**: At rest (DynamoDB, S3, SQS) and in transit (TLS)
- **Credential Masking**: Lambda logs mask sensitive values
- **HTTPS Only**: CloudFront enforces HTTPS
- **Least Privilege**: IAM roles follow principle of least privilege

## 📊 Monitoring

- **CloudWatch Dashboard**: Real-time metrics for all components
- **CloudWatch Alarms**: Lambda errors, slow execution, queue backlogs
- **SNS Notifications**: Email alerts for critical issues
- **X-Ray Tracing**: Distributed tracing across services
- **DLQs**: Dead-letter queues for failed messages (3 retries)

## 💰 Cost Estimate

**Example**: 240K recipients with daily checks (~1,300 unique locations after deduplication)

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| Lambda | $2.00 | ~3M invocations/month |
| DynamoDB | $5.00 | On-demand pricing, 240K items |
| SQS | Free | Within free tier |
| Bedrock KB | $10.00 | Knowledge Base queries |
| Bedrock Claude | $20.00 | ~1,300 messages/day |
| Weather API | Free | Tomorrow.io free tier (500/day) |
| CloudWatch | $5.00 | Logs and metrics |
| CloudFront | $1.00 | Low traffic web UI |
| Cognito | Free | < 50K MAU |
| API Gateway | $3.50 | REST API calls |
| **Total** | **~$47/month** | **Scales with usage** |

**Cost Optimization Features**:
- Location deduplication (80% API call reduction)
- Serverless architecture (pay only for what you use)
- Free tier usage where possible
- Rate limiting to stay within quotas

**Smaller deployments** (1K-10K recipients) will cost significantly less (~$10-20/month).

## 🎨 Web UI Features

### Three View Modes

1. **📋 Cards View**: Grid layout showing all alerts with full message text
2. **📱 Phone View**: iPhone mockup displaying messages in SMS format (perfect for demos!)
3. **🗺️ Map View**: Interactive OpenStreetMap with color-coded location markers (100% free, no API keys!)

### UI Capabilities

- **Auto-refresh**: Updates every 30 seconds
- **Authentication**: Secure access via Amazon Cognito
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Real-time Updates**: Polls SQS queue for new messages
- **Interactive Map**: Click markers to view full alert details
- **Configurable Labels**: Easy customization for different industries (see `web-ui/src/config/labels.js`)

## 🔧 Configuration

### Rate Limiting

Configured in CDK to respect API quotas:
- **WeatherFetch**: Concurrency=1 (respects free tier limits)
- **MessageGenerator**: Concurrency=2 (prevents Bedrock throttling)
- **Sleep Intervals**: 0.5s between API calls

### Weather Thresholds

Configurable per use case in `cdk/lib/compute-stack.ts`:
```typescript
environment: {
  TEMP_THRESHOLD_C: '32',  // Temperature threshold in Celsius
  THRESHOLD_FIELD: 'temperature',  // Field to check
}
```

### Demo Mode

For testing, enable in `lambda/weather-fetch/index.py`:
```python
DEMO_MODE = True  # Processes all weather conditions, not just threshold exceedances
```

### Data Quality Controls

- Validates coordinates (filters null or 0,0)
- Handles reversed lat/lon in source data
- One alert per recipient per day (prevents fatigue)
- Deduplicates by location (reduces API calls)

## 📚 Documentation

- **[USE_CASES.md](USE_CASES.md)** - Industry examples with sample data and prompts
- **[CUSTOMIZATION.md](CUSTOMIZATION.md)** - Complete guide to adapting for your industry
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design, patterns, and decisions
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Step-by-step deployment instructions
- **[AWS_SAMPLES_COMPLIANCE_REPORT.md](AWS_SAMPLES_COMPLIANCE_REPORT.md)** - Security and compliance details

## 🎓 What You'll Learn

This sample demonstrates:

- **Event-Driven Architecture**: Using EventBridge, SQS, and Lambda for decoupled processing
- **AI/ML Integration**: Amazon Bedrock with RAG (Retrieval Augmented Generation)
- **Serverless Best Practices**: Concurrency controls, error handling, DLQs
- **Cost Optimization**: Deduplication, rate limiting, efficient data access
- **Production Readiness**: Monitoring, alarms, security, scalability
- **Full-Stack Development**: React UI, API Gateway, CloudFront, Cognito

## 🤝 Contributing

Contributions welcome! This is an AWS Sample project.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

**Ideas for contributions**:
- Additional use case examples
- New weather provider integrations
- UI enhancements
- Documentation improvements
- Cost optimization techniques

## 📝 License

This project is licensed under the MIT-0 License. See [LICENSE](LICENSE) file.

## 🙏 Acknowledgments

- **Maternal Health Partners**: Original use case - improving maternal health outcomes in East Africa 🇰🇪
- **Tomorrow.io**: Weather API provider
- **Amazon Bedrock**: AI-powered personalization
- **AWS**: Serverless infrastructure and services
- **OpenStreetMap**: Free map integration

## 📞 Support

### Troubleshooting

- **Deployment issues**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Customization questions**: See [CUSTOMIZATION.md](CUSTOMIZATION.md)
- **Lambda errors**: Check CloudWatch Logs
- **Failed messages**: Check SQS Dead Letter Queues
- **Security questions**: See [AWS_SAMPLES_COMPLIANCE_REPORT.md](AWS_SAMPLES_COMPLIANCE_REPORT.md)

### Getting Help

- 📖 Read the documentation
- 🐛 Open an issue on GitHub
- 💬 Check existing issues for solutions
- 📧 Contact the maintainers

---

## 🌟 Real-World Impact

This system is currently deployed in production, protecting **240,000+ pregnant and postpartum mothers** in Kenya from heat-related health risks. The same architecture can be adapted to protect farmers from crop loss, construction workers from safety hazards, citizens from severe weather, and more.

**Built with ❤️ to demonstrate serverless best practices and real-world impact**
