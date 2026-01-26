# Deployment Guide - Serverless Weather Alert System

## 🎯 AWS Well-Architected Framework

This deployment follows AWS Well-Architected Framework principles:
- ✅ **Security**: Cognito authentication, encryption at rest/transit, least-privilege IAM
- ✅ **Reliability**: Multi-AZ, DLQs, automatic retries, CloudWatch alarms
- ✅ **Performance**: CloudFront CDN, Lambda optimization, SQS batching
- ✅ **Cost Optimization**: Serverless, pay-per-use, efficient resource usage
- ✅ **Operational Excellence**: IaC with CDK, CloudWatch monitoring, automated deployments

## Prerequisites

### Required
- AWS Account with appropriate permissions
- AWS CLI v2 configured
- Node.js 18+ and npm
- Python 3.14+
- Git

### API Keys
- Weather API key - Tomorrow.io recommended ([Get free key](https://www.tomorrow.io/weather-api/))
- (Optional) SMS provider credentials if enabling SMS notifications

## Step 1: Clone Repository

```bash
git clone <your-repository-url>
cd serverless-weather-alert-system
```

## Step 2: Choose Your AWS Region

This system can be deployed to **any AWS region** that supports the required services. Choose based on:
- Proximity to your users (lower latency)
- Data residency requirements
- Service availability

**Recommended regions**:
- `us-east-1` (N. Virginia) - Most services, lowest cost
- `us-west-2` (Oregon) - West coast US
- `eu-west-1` (Ireland) - Europe
- `ap-southeast-1` (Singapore) - Asia Pacific
- `af-south-1` (Cape Town) - Africa

**Set your region**:
```bash
export AWS_REGION=us-east-1  # Change to your preferred region
```

## Step 3: Store Secrets in AWS Secrets Manager

```bash
# Weather API Key (REQUIRED)
aws secretsmanager create-secret \
  --name weather-alert-system/api-key \
  --description "Weather API key for alert system" \
  --secret-string "YOUR_WEATHER_API_KEY" \
  --region $AWS_REGION

# SMS Provider Credentials (OPTIONAL)
aws secretsmanager create-secret \
  --name weather-alert-system/sms-credentials \
  --description "SMS provider API credentials" \
  --secret-string '{"apiKey":"YOUR_KEY","username":"YOUR_USERNAME"}' \
  --region $AWS_REGION
```

## Step 4: Create Bedrock Knowledge Base

### Enable Bedrock in Your Region

1. Navigate to [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. Select your chosen region
3. Go to **Model access** → **Manage model access**
4. Enable **Claude 3 Sonnet** and **Titan Embeddings G1 - Text**
5. Wait for approval (~2 minutes)

### Create Knowledge Base

1. Click **Knowledge Bases** → **Create knowledge base**
2. Configuration:
   - **Name**: `WeatherAlertKnowledgeBase`
   - **Description**: "Domain-specific guidelines for weather alerts"
3. Data source:
   - Create new S3 bucket or use existing
   - Upload your domain documents (health guidelines, farming tips, safety protocols, etc.)
4. Embeddings model: **Amazon Titan Embeddings G1 - Text**
5. Vector database: **Amazon OpenSearch Serverless** (recommended)
6. Click **Create**
7. **Copy the Knowledge Base ID** (format: `XXXXXXXXXX`)

## Step 5: Export Knowledge Base ID

```bash
# Update the template with your KB ID
sed -i "s/YOUR_KB_ID_HERE/YOUR_ACTUAL_KB_ID/" bedrock-kb-export.yaml

# Deploy the export stack
aws cloudformation create-stack \
  --stack-name WeatherAlertBedrockKB \
  --template-body file://bedrock-kb-export.yaml \
  --parameters ParameterKey=KnowledgeBaseId,ParameterValue=YOUR_ACTUAL_KB_ID \
  --region $AWS_REGION

# Wait for completion
aws cloudformation wait stack-create-complete \
  --stack-name WeatherAlertBedrockKB \
  --region $AWS_REGION
```

## Step 6: Install CDK Dependencies

```bash
cd cdk
npm install
```

## Step 7: Bootstrap CDK (First Time Only)

```bash
# Bootstrap for your account and region
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/$AWS_REGION

# This creates:
# - S3 bucket for CDK assets
# - IAM roles for deployments
# - ECR repository (if needed)
```

## Step 8: Deploy Infrastructure

```bash
# Deploy all stacks
cdk deploy --all --require-approval never

# Or deploy individually:
cdk deploy WeatherAlertDataStack
cdk deploy WeatherAlertComputeStack
cdk deploy WeatherAlertWebHostingStack
cdk deploy WeatherAlertMonitoringStack

# Deployment takes ~10-15 minutes
```

### What Gets Deployed

**WeatherAlertDataStack:**
- DynamoDB table for recipient data
- S3 bucket for data uploads
- 4 SQS queues with Dead Letter Queues

**WeatherAlertComputeStack:**
- 4 Lambda functions (Recipients→Locations, Weather Fetch, Message Generator, SMS Sender)
- EventBridge rule (daily scheduled trigger)
- IAM roles and policies

**WeatherAlertWebHostingStack:**
- Cognito User Pool + Identity Pool
- API Gateway with Cognito authorizer
- S3 bucket for web UI
- CloudFront distribution
- Lambda for SQS polling

**WeatherAlertMonitoringStack:**
- CloudWatch Dashboard
- CloudWatch Alarms
- SNS topic for notifications

## Step 9: Create Cognito Admin User

```bash
# Get User Pool ID from CDK output
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertWebHostingStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text \
  --region $AWS_REGION)

# Create admin user
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username admin \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS \
  --region $AWS_REGION

echo "✅ Admin user created: admin"
echo "   Email: admin@example.com"
echo "   Temporary password: TempPass123!"
echo "   You'll be prompted to change it on first login"
```

## Step 10: Load Sample Data

### Prepare Your Data

1. Create a CSV or Excel file with your recipient data
2. See `scripts/sample-data-template.csv` for the required format
3. Required fields: `contact_uuid`, `latitude`, `longitude`, `phone_number`

### Upload to S3 and Load

```bash
# Get your data bucket name
DATA_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertDataStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DataBucketName`].OutputValue' \
  --output text \
  --region $AWS_REGION)

# Upload your data file to S3
aws s3 cp your-data.xlsx s3://$DATA_BUCKET/data/your-data.xlsx --region $AWS_REGION

# Load data into DynamoDB
cd ../scripts
pip install -r requirements.txt
python load-sample-data.py $DATA_BUCKET data/your-data.xlsx MumBaseTable

# The script tracks progress and can resume if interrupted
```

**See [scripts/README.md](../scripts/README.md) for detailed instructions and troubleshooting.**

## Step 11: Build and Deploy Web UI

```bash
cd ../web-ui

# Install dependencies
npm install

# Build (automatically injects CDK outputs)
npm run build

# Deploy to S3
WEB_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertWebHostingStack \
  --query 'Stacks[0].Outputs[?OutputKey==`WebBucketName`].OutputValue' \
  --output text \
  --region $AWS_REGION)

aws s3 sync build/ s3://$WEB_BUCKET/ --delete --region $AWS_REGION

# Invalidate CloudFront cache
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertWebHostingStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text \
  --region $AWS_REGION)

aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

## Step 12: Access the Web UI

```bash
# Get CloudFront URL
WEBSITE_URL=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertWebHostingStack \
  --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
  --output text \
  --region $AWS_REGION)

echo "🌐 Web UI: $WEBSITE_URL"
```

### First Login

1. Navigate to the CloudFront URL
2. Sign in with:
   - Username: `admin`
   - Password: `TempPass123!`
3. You'll be prompted to set a new password
4. After login, you'll see the dashboard

## Step 13: Test the System

### Manual Trigger

```bash
# Get Lambda function name
FUNCTION_NAME=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertComputeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`RecipientsToLocationsFnName`].OutputValue' \
  --output text \
  --region $AWS_REGION)

# Trigger the workflow
aws lambda invoke \
  --function-name $FUNCTION_NAME \
  --cli-binary-format raw-in-base64-out \
  --payload '{"todayDate":"2025-11-07"}' \
  --region $AWS_REGION \
  response.json

# Check response
cat response.json
```

### Monitor Queues

```bash
# Check queue depths
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name LocationFetch --region $AWS_REGION --query QueueUrl --output text) \
  --attribute-names ApproximateNumberOfMessages \
  --region $AWS_REGION
```

### View CloudWatch Logs

```bash
# Tail logs for Lambda functions
aws logs tail /aws/lambda/$FUNCTION_NAME --follow --region $AWS_REGION
```

## Step 14: Set Up Alarm Notifications

```bash
# Get SNS topic ARN
TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertMonitoringStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AlarmTopicArn`].OutputValue' \
  --output text \
  --region $AWS_REGION)

# Subscribe your email
aws sns subscribe \
  --topic-arn $TOPIC_ARN \
  --protocol email \
  --notification-endpoint your-email@example.com \
  --region $AWS_REGION

# Confirm subscription via email
echo "✅ Check your email and confirm the subscription"
```

## Production Configuration

### 1. Disable Demo Mode

```bash
# Edit lambda/weather-fetch/index.py
# Change: DEMO_MODE = False

# Redeploy
cd cdk
cdk deploy WeatherAlertComputeStack
```

### 2. Configure EventBridge Schedule

The system runs daily at 6 AM UTC by default. To change:

```typescript
// Edit cdk/lib/compute-stack.ts
schedule: events.Schedule.cron({
  minute: '0',
  hour: '6',  // Change to your preferred hour (UTC)
  weekDay: '*',
}),
```

### 3. Customize Weather Thresholds

```typescript
// Edit cdk/lib/compute-stack.ts
environment: {
  TEMP_THRESHOLD_C: '32',  // Your threshold
  THRESHOLD_FIELD: 'temperature',  // Field to check
}
```

## Multi-Region Deployment

To deploy to multiple regions:

```bash
# Deploy to first region
export AWS_REGION=us-east-1
cdk deploy --all

# Deploy to second region
export AWS_REGION=eu-west-1
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/$AWS_REGION
cdk deploy --all
```

## Troubleshooting

### Issue: "Secret not found"

```bash
# Verify secret exists
aws secretsmanager describe-secret \
  --secret-id weather-alert-system/api-key \
  --region $AWS_REGION
```

### Issue: "Knowledge Base not found"

```bash
# Check export exists
aws cloudformation list-exports --region $AWS_REGION | grep WeatherAlertBedrockKBId
```

### Issue: "Bedrock access denied"

- Go to Bedrock Console → Model access
- Request access to Claude 3 Sonnet
- Wait 2-5 minutes for approval

### Issue: "No messages in NotifyQueue"

1. Check CloudWatch logs for errors
2. Verify DynamoDB has data with valid coordinates
3. Check Dead Letter Queues for failed messages
4. Ensure EventBridge rule is enabled

## Cost Estimate

Costs vary by region and usage. Example for 1,000 recipients with daily checks:

| Service | Monthly Cost |
|---------|--------------|
| Lambda | $0.50 |
| DynamoDB | $2.50 |
| SQS | Free |
| Bedrock | $15.00 |
| Weather API | Free (500/day) |
| CloudWatch | $5.00 |
| CloudFront | $1.00 |
| Cognito | Free (< 50K MAU) |
| API Gateway | $3.50 |
| **Total** | **~$28/month** |

## Cleanup

To remove all resources:

```bash
# Delete stacks in reverse order
cdk destroy WeatherAlertMonitoringStack
cdk destroy WeatherAlertWebHostingStack
cdk destroy WeatherAlertComputeStack
cdk destroy WeatherAlertDataStack
cdk destroy WeatherAlertBedrockKB

# Delete secrets
aws secretsmanager delete-secret \
  --secret-id weather-alert-system/api-key \
  --force-delete-without-recovery \
  --region $AWS_REGION

# Delete Bedrock KB manually from console
```

## Next Steps

1. ✅ Access web UI via CloudFront
2. ✅ Create additional Cognito users
3. ✅ Populate Bedrock KB with domain-specific documents
4. ✅ Test end-to-end workflow
5. ✅ Set up monitoring alerts
6. ✅ Customize for your use case (see CUSTOMIZATION.md)

## Support

- **CloudWatch Logs**: Check Lambda execution logs
- **CloudWatch Dashboard**: Monitor system health
- **Documentation**: See ARCHITECTURE.md for system design
- **Customization**: See CUSTOMIZATION.md for adaptation guide

---

**Deployment complete!** 🎉

Access your secure web UI at the CloudFront URL and start sending personalized weather alerts.
