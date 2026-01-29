# Complete Testing Workflow - Serverless Weather Alert System

## 📋 Current Status

✅ **Infrastructure Deployed** - All 4 stacks successfully deployed
✅ **Cognito User Created** - Admin user ready for web UI access
✅ **Bedrock KB Created** - Knowledge Base loaded with maternal health data
✅ **Web UI Accessible** - CloudFront distribution live

🔄 **Next Steps** - Load data and test end-to-end workflow

---

## 🎯 Understanding the Complete User Journey

### What This System Does

The Serverless Weather Alert System is an **event-driven workflow** that:

1. **Scans recipient profiles** daily (pregnant/postpartum mothers in Kenya)
2. **Fetches weather forecasts** for their locations (from Tomorrow.io API)
3. **Generates personalized health advice** using AI (Amazon Bedrock + Claude)
4. **Delivers messages** via web UI (and optionally SMS)

### The Complete Flow

```
EventBridge (Daily 6 AM UTC)
    ↓
Lambda: RecipientsToLocations
    - Scans DynamoDB for all profiles
    - Deduplicates by location (saves API calls)
    - Filters: one alert per day per person
    ↓
SQS: LocationFetch Queue
    ↓
Lambda: WeatherFetch
    - Calls Tomorrow.io API for weather
    - Filters by temperature threshold (32°C)
    ↓
SQS: WeatherResult Queue
    ↓
Lambda: MessageGenerator
    - Queries Bedrock Knowledge Base (RAG)
    - Generates personalized advice with Claude
    ↓
SQS: NotifyQueue
    ↓
Web UI (polls queue) OR SMS (optional)
```

---

## 📊 Step-by-Step Testing Guide

### Step 1: Load Sample Data into DynamoDB

**What You Need:**
- A CSV or Excel file with recipient data
- Required fields: `contact_uuid`, `latitude`, `longitude`, `phone_number`
- Optional fields: `recipient_type`, `pregnancy_week`, `medical_conditions`, etc.

**Where to Find Sample Data Format:**
- See `scripts/sample-data-template.csv` for structure
- See `examples/maternal-health/README.md` for field descriptions

**How to Load Data:**

```bash
# 1. Get your data bucket name
DATA_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertDataStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DataBucketName`].OutputValue' \
  --output text \
  --region us-east-1)

echo "Data bucket: $DATA_BUCKET"

# 2. Upload your data file to S3
aws s3 cp your-data.xlsx s3://$DATA_BUCKET/data/your-data.xlsx --region us-east-1

# 3. Install Python dependencies
cd scripts
pip install -r requirements.txt

# 4. Load data into DynamoDB
python load-sample-data.py $DATA_BUCKET data/your-data.xlsx MumBaseTable

# The script will:
# - Download file from S3
# - Validate required fields
# - Load records into DynamoDB
# - Track progress (can resume if interrupted)
```

**Verify Data Loaded:**

```bash
# Check DynamoDB table has records
aws dynamodb scan \
  --table-name MumBaseTable \
  --select COUNT \
  --region us-east-1

# View a sample record
aws dynamodb scan \
  --table-name MumBaseTable \
  --limit 1 \
  --region us-east-1
```

---

### Step 2: Trigger the Workflow Manually

**Option A: Trigger via Lambda (Recommended for Testing)**

```bash
# Get Lambda function name
FUNCTION_NAME=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertComputeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`RecipientsToLocationsFnName`].OutputValue' \
  --output text \
  --region us-east-1)

echo "Function name: $FUNCTION_NAME"

# Trigger the workflow with today's date (use current date in YYYY-MM-DD format)
aws lambda invoke \
  --function-name $FUNCTION_NAME \
  --cli-binary-format raw-in-base64-out \
  --payload '{"todayDate":"2025-11-07"}' \
  --region us-east-1 \
  response.json

# Check response
cat response.json
```

**Option B: Wait for Scheduled Trigger**

The EventBridge rule runs daily at 6 AM UTC (9 AM East Africa Time). You can check the schedule:

```bash
aws events list-rules \
  --name-prefix WeatherAlert \
  --region us-east-1
```

---

### Step 3: Monitor the Workflow Execution

**A. Check SQS Queue Depths**

```bash
# LocationFetch Queue (should populate first)
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name LocationFetch --region us-east-1 --query QueueUrl --output text) \
  --attribute-names ApproximateNumberOfMessages \
  --region us-east-1

# WeatherResult Queue (should populate after weather fetch)
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name WeatherResult --region us-east-1 --query QueueUrl --output text) \
  --attribute-names ApproximateNumberOfMessages \
  --region us-east-1

# NotifyQueue (final messages ready for delivery)
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name NotifyQueue --region us-east-1 --query QueueUrl --output text) \
  --attribute-names ApproximateNumberOfMessages \
  --region us-east-1
```

**B. View Lambda Logs**

```bash
# Tail logs for each Lambda function
aws logs tail /aws/lambda/WeatherAlert-RecipientsToLocations --follow --region us-east-1
aws logs tail /aws/lambda/WeatherAlert-WeatherFetch --follow --region us-east-1
aws logs tail /aws/lambda/WeatherAlert-MessageGenerator --follow --region us-east-1
```

**C. Check CloudWatch Dashboard**

```bash
# Get dashboard URL
aws cloudformation describe-stacks \
  --stack-name WeatherAlertMonitoringStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
  --output text \
  --region us-east-1
```

Open the URL in your browser to see:
- Lambda invocations and errors
- SQS queue depths
- End-to-end flow visualization

---

### Step 4: View Messages in Web UI

**Access the Web UI:**

```bash
# Get CloudFront URL
WEBSITE_URL=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertWebHostingStack \
  --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
  --output text \
  --region us-east-1)

echo "Web UI: $WEBSITE_URL"
```

**Login:**
- Username: `admin`
- Email: The email you provided when creating the Cognito user
- Temporary Password: The password you set when creating the user
- You'll be prompted to change password on first login

**What You'll See:**
- Dashboard with message statistics
- Map view showing locations with alerts
- Phone view displaying personalized messages
- Message cards with full advice text

---

## 🔍 Troubleshooting Common Issues

### Issue 1: No Messages in NotifyQueue

**Possible Causes:**
1. No data in DynamoDB
2. No locations meet temperature threshold (32°C)
3. All recipients already alerted today
4. Lambda function errors

**How to Debug:**

```bash
# 1. Check DynamoDB has data
aws dynamodb scan --table-name MumBaseTable --select COUNT --region us-east-1

# 2. Check Lambda logs for errors
aws logs tail /aws/lambda/WeatherAlert-RecipientsToLocations --region us-east-1

# 3. Check Dead Letter Queues
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name LocationFetchDLQ --region us-east-1 --query QueueUrl --output text) \
  --attribute-names ApproximateNumberOfMessages \
  --region us-east-1

# 4. Check if DEMO_MODE is enabled (bypasses temperature threshold)
# Look in lambda/weather-fetch/index.py for DEMO_MODE = True
```

### Issue 2: Weather API Errors

**Symptoms:** WeatherFetch Lambda fails with API errors

**Solutions:**

```bash
# 1. Verify secret exists
aws secretsmanager get-secret-value \
  --secret-id weather-alert-system/api-key \
  --region us-east-1

# 2. Check Tomorrow.io API quota
# Visit: https://app.tomorrow.io/development/keys

# 3. Check Lambda logs for specific error
aws logs tail /aws/lambda/WeatherAlert-WeatherFetch --region us-east-1
```

### Issue 3: Bedrock Access Denied

**Symptoms:** MessageGenerator Lambda fails with access denied

**Solutions:**

```bash
# 1. Verify Bedrock model access
# Go to: https://console.aws.amazon.com/bedrock/
# Navigate to: Model access
# Ensure Claude 3 Sonnet is enabled

# 2. Verify Knowledge Base exists
aws cloudformation list-exports --region us-east-1 | grep WeatherAlertBedrockKBId

# 3. Check Lambda IAM role has Bedrock permissions
aws iam get-role-policy \
  --role-name WeatherAlertComputeStack-AdviceFnRole \
  --policy-name BedrockPolicy \
  --region us-east-1
```

### Issue 4: Web UI Not Loading

**Symptoms:** CloudFront URL returns error or blank page

**Solutions:**

```bash
# 1. Check if web UI was built and deployed
WEB_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertWebHostingStack \
  --query 'Stacks[0].Outputs[?OutputKey==`WebBucketName`].OutputValue' \
  --output text \
  --region us-east-1)

aws s3 ls s3://$WEB_BUCKET/

# 2. Rebuild and redeploy web UI
cd web-ui
npm install
npm run build
aws s3 sync build/ s3://$WEB_BUCKET/ --delete --region us-east-1

# 3. Invalidate CloudFront cache
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertWebHostingStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text \
  --region us-east-1)

aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

---

## 📝 Documentation Gaps Identified

### Issue #5: Unclear Testing Instructions (PROPOSED)

**Problem:** 
- The documentation doesn't clearly explain the complete end-to-end testing workflow
- Users don't know how to trigger the system after deployment
- No clear guidance on verifying each step of the workflow
- Sample data files are referenced but not included

**Impact:**
- Users complete deployment but don't know what to do next
- Difficult to verify if the system is working correctly
- No way to test without waiting for scheduled trigger

**Proposed Fix:**

1. **Add this TESTING_WORKFLOW.md file** to the repository
2. **Create sample data file** (`scripts/sample-data-template.csv`) with 5-10 example records
3. **Update QUICK_START.md** to reference testing workflow
4. **Add "Testing" section** to DEPLOYMENT_GUIDE.md with link to this file

**Files to Update:**
- Add: `TESTING_WORKFLOW.md` (this file)
- Add: `scripts/sample-data-template.csv` (sample data)
- Update: `QUICK_START.md` (add Step 11: Test the System)
- Update: `DEPLOYMENT_GUIDE.md` (add Testing section)
- Update: `README.md` (add link to testing workflow)

---

## ✅ Complete Testing Checklist

Use this checklist to verify your deployment:

- [ ] **Infrastructure Deployed**
  - [ ] WeatherAlertBedrockKB stack created
  - [ ] WeatherAlertDataStack deployed
  - [ ] WeatherAlertComputeStack deployed
  - [ ] WeatherAlertWebHostingStack deployed
  - [ ] WeatherAlertMonitoringStack deployed

- [ ] **Secrets Configured**
  - [ ] Weather API key stored in Secrets Manager
  - [ ] Secret name matches: `weather-alert-system/api-key`

- [ ] **Bedrock Setup**
  - [ ] Knowledge Base created
  - [ ] Claude 3 Sonnet model access enabled
  - [ ] Titan Embeddings model access enabled
  - [ ] KB ID exported via CloudFormation

- [ ] **Data Loaded**
  - [ ] Sample data file prepared
  - [ ] Data uploaded to S3
  - [ ] Data loaded into DynamoDB
  - [ ] Verified records exist in table

- [ ] **Cognito Configured**
  - [ ] Admin user created
  - [ ] User can login to web UI
  - [ ] Password changed from temporary

- [ ] **Workflow Tested**
  - [ ] Manually triggered Lambda function
  - [ ] LocationFetch queue populated
  - [ ] WeatherResult queue populated
  - [ ] NotifyQueue populated
  - [ ] Messages visible in web UI

- [ ] **Monitoring Verified**
  - [ ] CloudWatch Dashboard accessible
  - [ ] Lambda logs showing successful executions
  - [ ] No messages in Dead Letter Queues
  - [ ] SNS alarm topic subscribed

---

## 🎓 Key Learnings for Public Users

### What Works Well
1. ✅ CDK deployment is straightforward
2. ✅ Infrastructure stacks deploy cleanly
3. ✅ Bedrock integration is well-designed
4. ✅ Web UI is intuitive and functional

### What Needs Improvement
1. ⚠️ Missing sample data files
2. ⚠️ Unclear testing instructions
3. ⚠️ No guidance on triggering workflow manually
4. ⚠️ Monitoring dashboard not mentioned in quick start
5. ⚠️ No troubleshooting guide for common issues

### Recommendations for GitHub Update
1. Add comprehensive testing documentation (this file)
2. Include sample data files with realistic examples
3. Add troubleshooting section to main README
4. Create video walkthrough or screenshots
5. Add FAQ section for common questions

---

## 📚 Related Documentation

- **Architecture**: See [ARCHITECTURE.md](ARCHITECTURE.md) for system design
- **Deployment**: See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for full deployment steps
- **Quick Start**: See [QUICK_START.md](QUICK_START.md) for 30-minute setup
- **Use Case**: See [examples/maternal-health/README.md](examples/maternal-health/README.md) for maternal health example
- **Data Loading**: See [scripts/README.md](scripts/README.md) for data loading details
- **Customization**: See [CUSTOMIZATION.md](CUSTOMIZATION.md) for adaptation guide

---

**Ready to test?** Follow the steps above to load data and trigger your first weather alert workflow! 🚀
