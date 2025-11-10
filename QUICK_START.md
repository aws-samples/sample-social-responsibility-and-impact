# Quick Start Guide

Get the Serverless Weather Alert System running in 30 minutes.

## Prerequisites

- AWS Account with appropriate permissions
- AWS CLI v2 configured
- Node.js 18+ and npm
- Python 3.12+
- Weather API key ([Get free key](https://www.tomorrow.io/weather-api/))

## Step 1: Set Your Region

```bash
# Choose your AWS region
export AWS_REGION=us-east-1  # Change to your preferred region
```

## Step 2: Store Weather API Key

```bash
aws secretsmanager create-secret \
  --name weather-alert-system/api-key \
  --secret-string "YOUR_WEATHER_API_KEY" \
  --region $AWS_REGION
```

## Step 3: Create Bedrock Knowledge Base

1. Go to [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. Select your region
3. Enable **Claude 3 Sonnet** and **Titan Embeddings** models
4. Click **Knowledge Bases** → **Create knowledge base**
5. Name: `WeatherAlertKnowledgeBase`
6. Upload your domain documents (health guidelines, farming tips, etc.)
7. Choose **Titan Embeddings G1 - Text**
8. Click **Create** and copy the Knowledge Base ID

## Step 4: Export Knowledge Base ID

```bash
# Update bedrock-kb-export.yaml with your KB ID
aws cloudformation create-stack \
  --stack-name WeatherAlertBedrockKB \
  --template-body file://bedrock-kb-export.yaml \
  --parameters ParameterKey=KnowledgeBaseId,ParameterValue=YOUR_KB_ID \
  --region $AWS_REGION
```

## Step 5: Deploy Infrastructure

```bash
cd cdk
npm install
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/$AWS_REGION
cdk deploy --all --require-approval never
```

## Step 6: Create Admin User

```bash
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertWebHostingStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text \
  --region $AWS_REGION)

aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username admin \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS \
  --region $AWS_REGION
```

## Step 7: Load Sample Data

```bash
# Get data bucket name
DATA_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertDataStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DataBucketName`].OutputValue' \
  --output text \
  --region $AWS_REGION)

# Upload your data file (see scripts/sample-data-template.csv for format)
aws s3 cp your-data.xlsx s3://$DATA_BUCKET/data/your-data.xlsx

# Load into DynamoDB
cd ../scripts
pip install -r requirements.txt
python load-sample-data.py $DATA_BUCKET data/your-data.xlsx MumBaseTable
```

## Step 8: Build and Deploy Web UI

```bash
cd ../web-ui
npm install
npm run build

WEB_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertWebHostingStack \
  --query 'Stacks[0].Outputs[?OutputKey==`WebBucketName`].OutputValue' \
  --output text \
  --region $AWS_REGION)

aws s3 sync build/ s3://$WEB_BUCKET/ --delete --region $AWS_REGION
```

## Step 9: Access Web UI

```bash
WEBSITE_URL=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertWebHostingStack \
  --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
  --output text \
  --region $AWS_REGION)

echo "🌐 Web UI: $WEBSITE_URL"
```

Login with:
- Username: `admin`
- Password: `TempPass123!`

## Step 10: Test the System

```bash
# Trigger manually
FUNCTION_NAME=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertComputeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`RecipientsToLocationsFnName`].OutputValue' \
  --output text \
  --region $AWS_REGION)

aws lambda invoke \
  --function-name $FUNCTION_NAME \
  --cli-binary-format raw-in-base64-out \
  --payload '{"todayDate":"2025-11-07"}' \
  --region $AWS_REGION \
  response.json

cat response.json
```

## Monitor

```bash
# View CloudWatch Dashboard
aws cloudformation describe-stacks \
  --stack-name WeatherAlertMonitoringStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
  --output text \
  --region $AWS_REGION

# Tail Lambda logs
aws logs tail /aws/lambda/$FUNCTION_NAME --follow --region $AWS_REGION
```

## Troubleshooting

### Secret not found
```bash
aws secretsmanager describe-secret \
  --secret-id weather-alert-system/api-key \
  --region $AWS_REGION
```

### Knowledge Base not found
```bash
aws cloudformation list-exports --region $AWS_REGION | grep WeatherAlertBedrockKBId
```

### Bedrock access denied
- Go to Bedrock Console → Model access
- Enable Claude 3 Sonnet
- Wait 2-5 minutes

### No messages appearing
1. Check CloudWatch logs for errors
2. Verify DynamoDB has data with valid coordinates
3. Check Dead Letter Queues
4. Ensure EventBridge rule is enabled

## Enable SMS (Optional)

1. Store SMS provider credentials:
```bash
aws secretsmanager create-secret \
  --name weather-alert-system/sms-credentials \
  --secret-string '{"apiKey":"YOUR_KEY","username":"YOUR_USERNAME"}' \
  --region $AWS_REGION
```

2. Uncomment SQS trigger in `cdk/lib/compute-stack.ts` (line ~180)
3. Redeploy: `cdk deploy WeatherAlertComputeStack`

## Cleanup

```bash
cdk destroy --all
aws secretsmanager delete-secret \
  --secret-id weather-alert-system/api-key \
  --force-delete-without-recovery \
  --region $AWS_REGION
aws cloudformation delete-stack --stack-name WeatherAlertBedrockKB --region $AWS_REGION
```

## Next Steps

- **Customize**: See [CUSTOMIZATION.md](CUSTOMIZATION.md)
- **Architecture**: See [ARCHITECTURE.md](ARCHITECTURE.md)
- **Full Guide**: See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

---

**System deployed!** 🚀 Access your web UI and start sending personalized weather alerts.
