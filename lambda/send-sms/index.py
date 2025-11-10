import os
import requests
import json

# ENVIRONMENT VARIABLES (set by CDK)
AT_API_KEY = os.environ.get('AT_API_KEY', '')
AT_USERNAME = os.environ.get('AT_USERNAME', '')
AT_SENDER_ID = os.environ.get('AT_SENDER_ID', 'WeatherAlert')

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
    print(f"Attempting to send SMS to {phone}. Message (trimmed): {message[:120]}")
    print(f"AT_API_KEY: {'*' * 8 if AT_API_KEY else 'NOT SET'}")
    print(f"AT_USERNAME: {'*' * 8 if AT_USERNAME else 'NOT SET'}")
    print(f"AT_SENDER_ID: {AT_SENDER_ID}")
    
    try:
        response = requests.post(url, data=payload, headers=headers)
        print(f"Africa's Talking API Raw Response: {response.text}")
        response.raise_for_status()
        json_resp = response.json()
        print(f"Africa's Talking Response as JSON: {json_resp}")
        return json_resp
    except Exception as e:
        print(f"Exception sending SMS via Africa's Talking: {e}")
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
                print(f"Missing phone or advice in message: {msg}")
                continue
            
            print(f"[SendAdviceSMSFn] Sending to {phone}")
            result = send_sms(phone, advice)
            
            if 'error' not in result:
                processed += 1
                print(f"[SendAdviceSMSFn] Successfully sent to {phone}")
            else:
                print(f"[SendAdviceSMSFn] Failed to send to {phone}: {result['error']}")
                
        except Exception as e:
            print(f"[SendAdviceSMSFn] Error processing record: {e}")
            continue
    
    return {
        "statusCode": 200,
        "processed": processed
    }
