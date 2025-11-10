import boto3
import os
import json
import datetime
from decimal import Decimal

# Environment variables set by CDK
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ.get("RECIPIENTS_TABLE_NAME", os.environ.get("MUM_TABLE_NAME")))
sqs = boto3.client("sqs")
QUEUE_URL = os.environ["LOCATION_QUEUE_URL"]

def float_safe(val):
    """Convert Decimal or numeric types to float safely."""
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (float, int)):
        return float(val)
    try:
        return float(val)
    except Exception:
        return None

def lambda_handler(event, context):
    """
    Scans DynamoDB for recipient profiles, deduplicates by location,
    and queues unique locations for weather checking.
    """
    today = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    
    # Allow manual override for testing
    if isinstance(event, dict) and "todayDate" in event and event["todayDate"]:
        today = str(event["todayDate"])
    
    dedup_set = set()
    scanned = 0
    considered = 0

    scan_kwargs = {
        "ProjectionExpression": (
            "#cid,latitude,longitude,lastAlertedDate,#lang,anc_pnc_value,"
            "medical_conditions,#stat,facility_code,facility_name,phone_number"
        ),
        "ExpressionAttributeNames": {
            "#cid": "contact_uuid",
            "#lang": "language",
            "#stat": "status"
        }
    }
    
    response = table.scan(**scan_kwargs)
    items = response["Items"]

    while True:
        for item in items:
            scanned += 1
            lat = float_safe(item.get("latitude"))
            lon = float_safe(item.get("longitude"))
            
            # Skip if no valid coordinates or coordinates are (0, 0)
            if lat is None or lon is None or (lat == 0.0 and lon == 0.0):
                continue
            
            # One-alert-per-day logic
            if item.get("lastAlertedDate") == today:
                continue
            
            # Deduplicate by rounded location (3 decimal places ≈ 111m precision)
            loc_key = f"{round(lat,3)},{round(lon,3)}"
            if loc_key in dedup_set:
                continue

            # Build enriched SQS message with all needed fields
            msg = {
                "latitude": lat,
                "longitude": lon,
                "todayDate": today,
                "contact_uuid": item.get("contact_uuid"),
                "language": item.get("language", "en"),
                "anc_pnc_value": item.get("anc_pnc_value"),
                "medical_conditions": item.get("medical_conditions"),
                "status": item.get("status"),
                "facility_code": item.get("facility_code"),
                "facility_name": item.get("facility_name"),
                "phone_number": item.get("phone_number"),
                "lastAlertedDate": item.get("lastAlertedDate"),
            }
            
            print(f"[RecipientsToLocationsFn] Queuing location: {loc_key}")
            
            sqs.send_message(
                QueueUrl=QUEUE_URL,
                MessageBody=json.dumps(msg)
            )
            
            dedup_set.add(loc_key)
            considered += 1

        # Handle pagination
        if "LastEvaluatedKey" in response:
            response = table.scan(
                **scan_kwargs,
                ExclusiveStartKey=response["LastEvaluatedKey"]
            )
            items = response["Items"]
        else:
            break

    return {
        "statusCode": 200,
        "recipientsScanned": scanned,
        "uniqueLocationsQueued": considered,
        "todayDate": today
    }
