import os
import json
import time
import requests
import boto3

# Environment variables set by CDK
TOMORROW_IO_API_KEY = os.environ['TOMORROW_IO_API_KEY']
WEATHER_RESULT_QUEUE_URL = os.environ['WEATHER_RESULT_QUEUE_URL']
TEMP_THRESHOLD_C = float(os.environ.get('TEMP_THRESHOLD_C', 32))

# Configurable threshold field and operator (for different use cases)
THRESHOLD_FIELD = os.environ.get('THRESHOLD_FIELD', 'temperature')
THRESHOLD_OPERATOR = os.environ.get('THRESHOLD_OPERATOR', 'gte')  # gte, lte, eq

sqs = boto3.client("sqs")

# DEMO MODE: Set to False for production filtering
DEMO_MODE = True  # Enabled for testing - processes all locations regardless of temperature

def lambda_handler(event, context):
    """
    Fetches weather forecasts from Tomorrow.io for queued locations.
    Filters by temperature threshold (unless DEMO_MODE is True).
    """
    records = event['Records']
    total_records = len(records)
    print(f"[WeatherFetchFn] Processing {total_records} location messages")

    # Rate limiting: process max 10 locations per invocation
    records = records[:10]
    processed = 0

    for record in records:
        msg = json.loads(record['body'])
        
        lat = msg.get("latitude")
        lon = msg.get("longitude")
        today = msg.get("todayDate")

        # Build Tomorrow.io API call for daily forecast
        url = (
            f"https://api.tomorrow.io/v4/weather/forecast?"
            f"location={lat},{lon}&apikey={TOMORROW_IO_API_KEY}&timesteps=1d"
        )

        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            print(f"[WeatherFetchFn] Failed to fetch weather for {lat},{lon}: {e}")
            continue

        try:
            daily = data["timelines"]["daily"][0]
            max_temp = float(daily["values"]["temperatureMax"])
        except Exception as e:
            print(f"[WeatherFetchFn] Could not parse forecast: {e}")
            continue

        # Temperature filtering logic
        # DEMO_MODE: Send all results regardless of temperature
        # Production: Only send if max_temp >= TEMP_THRESHOLD_C
        if DEMO_MODE or max_temp >= TEMP_THRESHOLD_C:
            result_msg = {
                "latitude": lat,
                "longitude": lon,
                "todayDate": today,
                "temperatureMax": max_temp,
                "contact_uuid": msg.get("contact_uuid"),
                "language": msg.get("language", "en"),
                "anc_pnc_value": msg.get("anc_pnc_value"),
                "medical_conditions": msg.get("medical_conditions"),
                "status": msg.get("status"),
                "facility_code": msg.get("facility_code"),
                "facility_name": msg.get("facility_name"),
                "phone_number": msg.get("phone_number"),
                "lastAlertedDate": msg.get("lastAlertedDate"),
            }
            
            sqs.send_message(
                QueueUrl=WEATHER_RESULT_QUEUE_URL,
                MessageBody=json.dumps(result_msg)
            )
            
            print(f"[WeatherFetchFn] Severe event at {lat},{lon}: {max_temp}°C")
            processed += 1

        # Rate limiting: Tomorrow.io free tier allows 500 calls/day
        # Sleep prevents hitting rate limits when processing multiple locations
        # NOTE: If SMS sending to Africa's Talking fails due to rate limits, uncomment the line below
        # time.sleep(0.5)  # nosemgrep: arbitrary-sleep

    return {
        "statusCode": 200,
        "processed_locations": processed,
        "original_messages": total_records
    }
