#!/usr/bin/env python3
"""
Load maternal data from S3 Excel file into DynamoDB.
Usage: python load-sample-data.py <s3-bucket> <s3-key> <table-name>
Example: python load-sample-data.py weather-alert-data-123456789 maternal-data.xlsx MumBaseTable

The script tracks progress and can resume from where it left off if interrupted.
"""

import sys
import boto3
import pandas as pd
from decimal import Decimal
import datetime
import io
import os
import json

def convert_to_dynamodb_format(value):
    """Convert pandas values to DynamoDB-compatible types."""
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    return str(value)

def load_excel_to_dynamodb(s3_bucket, s3_key, table_name):
    """Load Excel data from S3 into DynamoDB table with resume capability."""
    
    # Progress file to track where we left off
    progress_file = f".load_progress_{table_name}.json"
    start_index = 0
    
    # Check if we're resuming from a previous run
    if os.path.exists(progress_file):
        try:
            with open(progress_file, 'r', encoding='utf-8') as f:
                progress = json.load(f)
                start_index = progress.get('last_index', 0) + 1
                print(f"Resuming from row {start_index}...")
        except Exception as e:
            print(f"Could not read progress file: {e}")
            start_index = 0
    
    # Download Excel file from S3
    print(f"Downloading s3://{s3_bucket}/{s3_key}...")
    s3 = boto3.client('s3')
    
    try:
        response = s3.get_object(Bucket=s3_bucket, Key=s3_key)
        excel_data = response['Body'].read()
        
        # Read Excel file from memory
        print(f"Reading Excel data...")
        df = pd.read_excel(io.BytesIO(excel_data))
    except Exception as e:
        print(f"Error downloading or reading file from S3: {e}")
        sys.exit(1)
    
    total_records = len(df)
    print(f"Found {total_records} records")
    
    if start_index > 0:
        print(f"Skipping first {start_index} records (already loaded)")
    
    # Connect to DynamoDB
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(table_name)
    
    # Process each row
    success_count = 0
    error_count = 0
    
    for index, row in df.iterrows():
        # Skip already processed rows
        if index < start_index:
            continue
            
        try:
            # Build item dictionary
            item = {}
            for col in df.columns:
                value = convert_to_dynamodb_format(row[col])
                if value is not None:
                    # Clean column name (remove spaces, special chars)
                    clean_col = col.strip().replace(' ', '_').lower()
                    
                    # Force facility_code to be a string (GSI requirement)
                    if clean_col == 'facility_code' and value is not None:
                        item[clean_col] = str(value)
                    else:
                        item[clean_col] = value
            
            # Ensure required fields
            if 'contact_uuid' not in item:
                print(f"Row {index}: Missing contact_uuid, skipping")
                error_count += 1
                continue
            
            # Add default fields if missing
            if 'alertcount' not in item:
                item['alertcount'] = 0
            if 'alertedtoday' not in item:
                item['alertedtoday'] = False
            if 'alerttypelastsent' not in item:
                item['alerttypelastsent'] = 'none'
            if 'lastalerteddate' not in item:
                item['lastalerteddate'] = datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d')
            
            # Put item in DynamoDB
            table.put_item(Item=item)
            success_count += 1
            
            # Save progress every 100 records
            if success_count % 100 == 0:
                print(f"Loaded {success_count} records... (total: {start_index + success_count}/{total_records})")
                with open(progress_file, 'w', encoding='utf-8') as f:
                    json.dump({'last_index': index, 'success_count': success_count}, f)
                
        except Exception as e:
            print(f"Row {index}: Error - {e}")
            error_count += 1
            
            # Save progress even on errors
            if (success_count + error_count) % 100 == 0:
                with open(progress_file, 'w', encoding='utf-8') as f:
                    json.dump({'last_index': index, 'success_count': success_count}, f)
    
    print(f"\nComplete!")
    print(f"Success: {success_count}")
    print(f"Errors: {error_count}")
    
    # Clean up progress file on successful completion
    if os.path.exists(progress_file):
        os.remove(progress_file)
        print(f"Progress file removed.")

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python load-sample-data.py <s3-bucket> <s3-key> <table-name>")
        print("Example: python load-sample-data.py weather-alert-data-423277768248 maternal-data.xlsx MumBaseTable")
        sys.exit(1)
    
    s3_bucket = sys.argv[1]
    s3_key = sys.argv[2]
    table_name = sys.argv[3]
    
    load_excel_to_dynamodb(s3_bucket, s3_key, table_name)
