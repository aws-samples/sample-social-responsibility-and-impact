# Data Loading Scripts

## Overview

This directory contains scripts to load recipient data into DynamoDB from files stored in S3.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Python 3.14+
- Required Python packages (install with `pip install -r requirements.txt`)

## Loading Data from S3

### Step 1: Prepare Your Data File

Create a CSV or Excel file with your recipient data. See `sample-data-template.csv` for the required format.

**Required fields:**
- `contact_uuid` - Unique identifier for each recipient (primary key)
- `latitude` - Latitude coordinate (decimal format)
- `longitude` - Longitude coordinate (decimal format)
- `phone_number` - Contact phone number

**Optional fields:**
- `name` - Recipient name
- `facility_code` - Facility or location code
- `edd` - Expected delivery date (for maternal health use case)
- `lmp` - Last menstrual period (for maternal health use case)
- Any other custom fields for your use case

### Step 2: Upload File to S3

```bash
# Get your data bucket name from CDK outputs
DATA_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name WeatherAlertDataStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DataBucketName`].OutputValue' \
  --output text \
  --region us-east-1)

# Upload your data file
aws s3 cp your-data.xlsx s3://$DATA_BUCKET/data/your-data.xlsx

# Or for CSV
aws s3 cp your-data.csv s3://$DATA_BUCKET/data/your-data.csv
```

### Step 3: Load Data into DynamoDB

```bash
# Install dependencies
pip install -r requirements.txt

# Load data from S3
python load-sample-data.py $DATA_BUCKET data/your-data.xlsx MumBaseTable

# The script will:
# - Download the file from S3
# - Validate and transform the data
# - Load records into DynamoDB
# - Track progress (can resume if interrupted)
```

## Usage Examples

### Example 1: Load Maternal Health Data

```bash
# Upload Excel file
aws s3 cp maternal-profiles.xlsx s3://weather-alert-data-123456789/maternal-profiles.xlsx

# Load into DynamoDB
python load-sample-data.py weather-alert-data-123456789 maternal-profiles.xlsx MumBaseTable
```

### Example 2: Load Agriculture Data

```bash
# Upload CSV file
aws s3 cp farmers.csv s3://weather-alert-data-123456789/farmers.csv

# Load into DynamoDB
python load-sample-data.py weather-alert-data-123456789 farmers.csv FarmersTable
```

### Example 3: Resume After Interruption

If the script is interrupted, it automatically saves progress. Simply run the same command again:

```bash
python load-sample-data.py weather-alert-data-123456789 data.xlsx MumBaseTable
# Output: "Resuming from row 1523..."
```

## Script Features

- ✅ **Resume capability** - Tracks progress, can resume if interrupted
- ✅ **Data validation** - Validates required fields before loading
- ✅ **Type conversion** - Automatically converts data types for DynamoDB
- ✅ **Progress tracking** - Shows progress every 100 records
- ✅ **Error handling** - Logs errors but continues processing
- ✅ **Supports CSV and Excel** - Works with .csv, .xlsx, and .xls files

## Data Format Requirements

### CSV Format

See `sample-data-template.csv` for a complete example with real data structure.

```csv
contact_uuid,language,status,anc_pnc_value,facility_code,medical_conditions,edd,delivery_date,facility_name,latitude,longitude
8115f2ad-a3e5-4b05-8190-48fd933f286b,SWH,active,PNC,11499.0,"anemia,",2025-06-26T17:25:16.797983+03:00,,Kongowea Health Centre,39.683949,-4.041399
```

### Excel Format

Same columns as CSV, but in Excel format (.xlsx or .xls). See `Climate_Riskscreening Mums-SAMPLE.xlsx` for a full example.

### Field Specifications

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| contact_uuid | String | Yes | Unique identifier (primary key) | 8115f2ad-a3e5-4b05-8190-48fd933f286b |
| latitude | Number | Yes | Latitude (-90 to 90) | -1.2921 |
| longitude | Number | Yes | Longitude (-180 to 180) | 36.8219 |
| language | String | No | Preferred language (ENG, SWH, etc.) | ENG |
| status | String | No | Status (active, inactive) | active |
| anc_pnc_value | String | No | ANC (antenatal) or PNC (postnatal) | ANC |
| facility_code | String | No | Facility identifier | 11499 |
| facility_name | String | No | Facility name | Kongowea Health Centre |
| medical_conditions | String | No | Comma-separated conditions | anemia, hypertension |
| edd | String | No | Expected delivery date (ISO format) | 2025-06-26T17:25:16+03:00 |
| delivery_date | String | No | Actual delivery date (ISO format) | 2025-01-03T11:56:53+03:00 |

**Note:** 
- Column names are case-insensitive and spaces are converted to underscores
- Coordinates of 0,0 are filtered out as invalid
- Additional custom fields can be added for your use case

## Troubleshooting

### Error: "File not found in S3"

```bash
# Verify file exists
aws s3 ls s3://your-bucket/your-file.xlsx

# Check bucket name
aws s3 ls | grep weather-alert
```

### Error: "Missing contact_uuid"

Ensure your data file has a `contact_uuid` column with unique values for each row.

### Error: "Invalid coordinates"

- Latitude must be between -90 and 90
- Longitude must be between -180 and 180
- Values cannot be null or 0,0

### Progress file exists

If you want to start fresh (not resume):

```bash
# Remove progress file
rm .load_progress_MumBaseTable.json

# Then run the script again
python load-sample-data.py ...
```

## Security Notes

- ⚠️ **Never commit data files to Git** - Data files are excluded via .gitignore
- ✅ Store data files in S3 with appropriate access controls
- ✅ Use IAM roles with least-privilege permissions
- ✅ Enable S3 bucket encryption
- ✅ Enable S3 versioning for data recovery

## Additional Scripts

- `prepare-for-gitlab.sh` - Prepares repository for GitLab push
- `verify-before-push.ps1` - Verifies no PII before pushing to Git

---

For more information, see the main [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md)
