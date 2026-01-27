import os
import requests
import json
import ssl
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

# ENVIRONMENT VARIABLES (set by CDK)
AT_API_KEY = os.environ.get('AT_API_KEY', '')
AT_USERNAME = os.environ.get('AT_USERNAME', '')
AT_SENDER_ID = os.environ.get('AT_SENDER_ID', 'WeatherAlert')

# Create a custom SSL context that enforces TLS 1.2+
class TLSAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)

# Create a session with secure TLS configuration
session = requests.Session()
session.mount('https://', TLSAdapter())

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
    print(f"Attempting to send SMS. Message length: {len(message)} chars")
    print(f"AT_API_KEY: {'SET' if AT_API_KEY else 'NOT SET'}")
    print(f"AT_USERNAME: {'SET' if AT_USERNAME else 'NOT SET'}")
    print(f"AT_SENDER_ID: {AT_SENDER_ID}")
    
    try:
        # Timeout set to 30 seconds to prevent Lambda from hanging if API is unresponsive
        response = session.post(url, data=payload, headers=headers, timeout=30)
        response.raise_for_status()
        
        json_resp = response.json()
        # Log only status, not full response which may contain sensitive data
        status = json_resp.get('SMSMessageData', {}).get('Recipients', [{}])[0].get('status', 'unknown')
        print(f"Africa's Talking Response Status: {status}")
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
            
            print(f"[SendAdviceSMSFn] Sending SMS notification")
            result = send_sms(phone, advice)
            
            if 'error' not in result:
                processed += 1
                print(f"[SendAdviceSMSFn] Successfully sent SMS notification")
            else:
                print(f"[SendAdviceSMSFn] Failed to send SMS notification: {result['error']}")
                
        except Exception as e:
            print(f"[SendAdviceSMSFn] Error processing record: {e}")
            continue
    
    return {
        "statusCode": 200,
        "processed": processed
    }
