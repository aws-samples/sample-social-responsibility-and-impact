import os
import requests
import json
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ENVIRONMENT VARIABLES (set by CDK)
AT_API_KEY = os.environ.get('AT_API_KEY', '')
AT_USERNAME = os.environ.get('AT_USERNAME', '')
AT_SENDER_ID = os.environ.get('AT_SENDER_ID', 'WeatherAlert')


def send_sms_request(recipient, content):
    """Send SMS via Africa's Talking API."""
    url = "https://api.africastalking.com/version1/messaging"
    headers = {
        "apiKey": AT_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded"
    }
    payload = {
        "username": AT_USERNAME,
        "to": recipient,
        "message": content,
        "from": AT_SENDER_ID
    }
    
    logger.info("Attempting to send SMS")
    logger.info("AT_API_KEY: %s", "SET" if AT_API_KEY else "NOT SET")
    logger.info("AT_USERNAME: %s", "SET" if AT_USERNAME else "NOT SET")
    logger.info("AT_SENDER_ID: %s", AT_SENDER_ID)
    
    try:
        response = requests.post(url, data=payload, headers=headers, timeout=30)
        response.raise_for_status()
        json_resp = response.json()
        status = json_resp.get('SMSMessageData', {}).get('Message', 'Unknown status')
        logger.info("SMS API response status: %s", status)
        return {"success": True}
    except requests.exceptions.RequestException:
        logger.error("SMS request failed")
        return {"success": False}


def lambda_handler(event, context):
    """
    Process messages from NotifyQueue and send SMS.
    """
    processed = 0
    failed = 0
    
    for record in event.get('Records', []):
        try:
            msg = json.loads(record['body'])
            recipient = msg.get('phone_number')
            content = msg.get('advice')
            
            if not recipient or not content:
                logger.warning("Missing required fields in message")
                failed += 1
                continue
            
            logger.info("[SendAdviceSMSFn] Processing SMS request")
            result = send_sms_request(recipient, content)
            
            if result.get("success"):
                processed += 1
                logger.info("[SendAdviceSMSFn] SMS sent successfully")
            else:
                failed += 1
                logger.error("[SendAdviceSMSFn] SMS send failed")
                
        except json.JSONDecodeError:
            logger.error("[SendAdviceSMSFn] Invalid JSON in record")
            failed += 1
        except Exception:
            logger.error("[SendAdviceSMSFn] Error processing record")
            failed += 1
    
    return {
        "statusCode": 200,
        "processed": processed,
        "failed": failed
    }
