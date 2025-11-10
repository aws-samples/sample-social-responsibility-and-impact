import os
import json
import boto3

sqs = boto3.client('sqs')
NOTIFY_QUEUE_URL = os.environ['NOTIFY_QUEUE_URL']

def lambda_handler(event, context):
    """
    Polls NotifyQueue and returns messages for web UI display.
    """
    try:
        # Receive up to 10 messages
        response = sqs.receive_message(
            QueueUrl=NOTIFY_QUEUE_URL,
            MaxNumberOfMessages=10,
            WaitTimeSeconds=5,
            AttributeNames=['All'],
            MessageAttributeNames=['All']
        )
        
        messages = []
        if 'Messages' in response:
            for msg in response['Messages']:
                try:
                    body = json.loads(msg['Body'])
                    
                    # Transform message format for UI
                    # NOTE: Source data has lat/lon reversed - swap them here
                    source_lat = body.get('latitude', 0)
                    source_lon = body.get('longitude', 0)
                    
                    transformed = {
                        'id': msg['MessageId'],
                        'advice': body.get('advice', ''),
                        'temperature': body.get('temperatureMax', 0),
                        'facility': body.get('facility_name', 'Unknown Facility'),
                        'language': body.get('language', 'en'),
                        'latitude': source_lon,  # Swapped: use source longitude as latitude
                        'longitude': source_lat,  # Swapped: use source latitude as longitude
                        'timestamp': msg['Attributes'].get('SentTimestamp', ''),
                        'anc_pnc': body.get('anc_pnc_value', ''),
                        'medical_conditions': body.get('medical_conditions', '')
                    }
                    
                    messages.append(transformed)
                    
                    # Delete message after reading (optional - comment out to keep messages)
                    # sqs.delete_message(
                    #     QueueUrl=NOTIFY_QUEUE_URL,
                    #     ReceiptHandle=msg['ReceiptHandle']
                    # )
                except Exception as e:
                    print(f"Error parsing message: {e}")
                    continue
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'messages': messages,
                'count': len(messages)
            })
        }
    
    except Exception as e:
        print(f"Error polling queue: {e}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'error': str(e)
            })
        }
