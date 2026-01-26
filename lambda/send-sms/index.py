import os
import requests
import json

# ENVIRONMENT VARIABLES (set by CDK)
AT_API_KEY = os.environ.get('AT_API_KEY', '')
AT_USERNAME = os.environ.get('AT_USERNAME', '')
AT_SENDER_ID = os.environ.get('AT_SENDER_ID', 'WeatherAlert')

def mask_phone(phone):
    """Mask phone number for logging (show last 4 digits only)."""
    if not phone or len(phone) < 4:
        return "****"
    return f"****{phone[-4:]}"

def send_sms(phone, message):
    """Send SMS via Africa's Talking API."""
    url = "https://api.africastalking.com/version1/messaging"
    headers = {
        "apiKey": AT_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded"
    }
    payload = {
        "username": AT_USERNAME,
        "to": phone,
        "message": message,
        "from": AT_SENDER_ID
    }
    masked_phone = mask_phone(phone)
    print(f"Attempting to send SMS to {masked_phone}. Message length: {len(message)} chars")
    print(f"AT_API_KEY: {'SET' if AT_API_KEY else 'NOT SET'}")
    print(f"AT_USERNAME: {'SET' if AT_USERNAME else 'NOT SET'}")
    print(f"AT_SENDER_ID: {AT_SENDER_ID}")
    
    try:
        # Timeout set to 30 seconds to prevent Lambda from hanging if API is unresponsive
        response = requests.post(url, data=payload, headers=headers, timeout=30)
        response.raise_for_status()
        json_resp = response.json()
        # Log success status only, not full response which may contain sensitive data
        status = json_resp.get('SMSMessageData', {}).get('Message', 'Unknown status')
        print(f"Africa's Talking API Response status: {status}")
        return json_resp
    except Exception as e:
        print(f"Exception sending SMS: {type(e).__name__}")
        return {"error": str(e)}

def lambda_handler(event, context):
    """
    Process messages from NotifyQueue and send SMS.
    """
    processed = 0
    
    for record in event.get('Records', []):
        try:
            msg = json.loads(record['body'])
            phone = msg.get('phone_number')
            advice = msg.get('advice')
            
            if not phone or not advice:
                print(f"Missing phone or advice in message")
                continue
            
            masked_phone = mask_phone(phone)
            print(f"[SendAdviceSMSFn] Sending to {masked_phone}")
            result = send_sms(phone, advice)
            
            if 'error' not in result:
                processed += 1
                print(f"[SendAdviceSMSFn] Successfully sent to {masked_phone}")
            else:
                print(f"[SendAdviceSMSFn] Failed to send to {masked_phone}")
                
        except Exception as e:
            print(f"[SendAdviceSMSFn] Error processing record: {e}")
            continue
    
    return {
        "statusCode": 200,
        "processed": processed
    }
