# Customization Guide

This guide shows you how to adapt the Serverless Weather Alert System for your specific industry and use case.

---

## 🎯 Quick Start: 5 Steps to Customize

1. **Choose your use case** (maternal health, agriculture, construction, etc.)
2. **Define your data schema** (what information about recipients?)
3. **Set weather thresholds** (what triggers an alert?)
4. **Customize AI prompts** (what advice to generate?)
5. **Update UI labels** (how to display information?)

---

## 1️⃣ Choose Your Use Case

The system works for any scenario where weather conditions trigger personalized notifications.

### Included Examples

| Use Case | Recipients | Weather Trigger | Message Type |
|----------|-----------|-----------------|--------------|
| **Maternal Health** | Pregnant women | Heat > 32°C | Health advice |
| **Agriculture** | Farmers | Frost < 0°C | Crop protection |
| **Construction** | Site managers | Wind > 40 km/h | Safety protocols |
| **Public Safety** | Citizens | Severe weather | Evacuation guidance |
| **Transportation** | Fleet managers | Ice, fog, floods | Route warnings |

See [USE_CASES.md](USE_CASES.md) for detailed examples.

---

## 2️⃣ Define Your Data Schema

### Required Fields

Every recipient record must have:

```json
{
  "id": "unique_identifier",
  "location_name": "Human-readable location",
  "latitude": -1.2921,
  "longitude": 36.8219
}
```

### Recommended Fields

Add these for better personalization:

```json
{
  "recipient_type": "Category of recipient",
  "phone_number": "+254712345678",
  "language": "en",
  "lastAlertedDate": "2025-11-03"
}
```

### Custom Context Data

Add any fields relevant to your use case:

**Maternal Health**:
```json
{
  "pregnancy_week": 28,
  "medical_conditions": "gestational diabetes",
  "delivery_date": "2025-03-15"
}
```

**Agriculture**:
```json
{
  "crop_type": "wheat",
  "planting_date": "2024-11-01",
  "crop_stage": "flowering",
  "irrigation_system": "drip"
}
```

**Construction**:
```json
{
  "project_type": "high-rise",
  "construction_phase": "structural",
  "floor_level": 15,
  "crew_size": 45
}
```

### DynamoDB Table Structure

The system uses a single DynamoDB table with flexible schema:

```typescript
// cdk/lib/data-stack.ts
const recipientsTable = new dynamodb.Table(this, 'Recipients', {
  partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  encryption: dynamodb.TableEncryption.AWS_MANAGED,
  pointInTimeRecovery: true,
});
```

**No schema changes needed!** DynamoDB is schema-less, so you can add any fields you want.

---

## 3️⃣ Set Weather Thresholds

### Configure in CDK

Edit `cdk/lib/compute-stack.ts`:

```typescript
// Weather threshold configuration
const weatherThreshold = new cdk.CfnParameter(this, 'WeatherThreshold', {
  type: 'Number',
  default: 32,
  description: 'Weather threshold value (e.g., 32 for temperature in Celsius)'
});

const weatherThresholdField = new cdk.CfnParameter(this, 'WeatherThresholdField', {
  type: 'String',
  default: 'temperature',
  description: 'Weather field to check (temperature, rainfall, wind_speed, etc.)'
});
```

### Pass to Lambda Functions

```typescript
const weatherFetchFn = new lambda.Function(this, 'WeatherFetch', {
  // ...
  environment: {
    TEMP_THRESHOLD_C: weatherThreshold.valueAsString,
    THRESHOLD_FIELD: weatherThresholdField.valueAsString,
  }
});
```

### Common Thresholds by Use Case

| Use Case | Field | Threshold | Condition |
|----------|-------|-----------|-----------|
| Heat alerts | `temperature` | 32°C | >= |
| Frost warnings | `temperature` | 0°C | <= |
| Heavy rain | `rainfall` | 50mm | >= |
| High winds | `wind_speed` | 40 km/h | >= |
| Poor visibility | `visibility` | 100m | <= |

### Multiple Conditions

For complex logic, modify `lambda/weather-fetch/index.py`:

```python
def should_alert(weather_data, recipient):
    """Custom alert logic."""
    temp = weather_data.get('temperatureMax')
    rain = weather_data.get('rainfall')
    
    # Example: Alert if hot AND dry (irrigation needed)
    if temp > 30 and rain < 5:
        return True
    
    # Example: Alert if cold AND wet (frost risk)
    if temp < 5 and rain > 10:
        return True
    
    return False
```

---

## 4️⃣ Customize AI Prompts

### System Prompt Configuration

The system prompt defines the AI's role and expertise.

#### Option A: Environment Variable (Simple)

Set in CDK:

```typescript
const messageGeneratorFn = new lambda.Function(this, 'MessageGenerator', {
  // ...
  environment: {
    BEDROCK_SYSTEM_PROMPT: 'You are an agricultural advisor specializing in crop protection...',
  }
});
```

#### Option B: Prompt Template File (Advanced)

Create `lambda/message-generator/prompts/agriculture.txt`:

```
You are an agricultural advisor with expertise in {region} farming practices.

Your role:
- Provide actionable farming recommendations
- Consider local crop varieties and practices
- Use terminology familiar to {region} farmers
- Include specific timing and quantities

Context provided:
- Crop type and growth stage
- Weather forecast
- Soil and irrigation details
- Farmer's experience level

Output requirements:
- Clear, practical advice
- Specific actions with timing
- Equipment or supplies needed
- Risk assessment and mitigation
- Under 300 words
```

Load in Lambda:

```python
import os

def load_prompt_template(use_case):
    """Load prompt template for use case."""
    template_path = f"prompts/{use_case}.txt"
    with open(template_path, 'r') as f:
        return f.read()

SYSTEM_PROMPT = load_prompt_template(os.environ.get('USE_CASE', 'maternal-health'))
```

### User Prompt Construction

Modify `lambda/message-generator/index.py`:

```python
def build_user_prompt(recipient, weather):
    """Build user prompt with recipient and weather data."""
    
    # Extract relevant fields
    recipient_type = recipient.get('recipient_type', 'unknown')
    location = recipient.get('location_name', 'Unknown')
    
    # Build context from custom fields
    context_parts = []
    
    # Add use-case specific context
    if 'crop_type' in recipient:
        context_parts.append(f"Crop: {recipient['crop_type']}")
    if 'crop_stage' in recipient:
        context_parts.append(f"Growth Stage: {recipient['crop_stage']}")
    if 'pregnancy_week' in recipient:
        context_parts.append(f"Pregnancy Week: {recipient['pregnancy_week']}")
    
    context = "\n".join(context_parts)
    
    # Build weather summary
    weather_summary = f"""
Weather Forecast for {location}:
- Max Temperature: {weather.get('temperatureMax')}°C
- Min Temperature: {weather.get('temperatureMin')}°C
- Rainfall: {weather.get('rainfall', 0)}mm
- Wind Speed: {weather.get('windSpeed', 0)} km/h
"""
    
    # Combine into full prompt
    prompt = f"""
Recipient Profile:
{context}

{weather_summary}

Provide personalized advice based on this information.
"""
    
    return prompt
```

### Bedrock Knowledge Base Integration

The system uses Bedrock Knowledge Base for RAG (Retrieval Augmented Generation):

```python
def build_kb_query(recipient, weather):
    """Build search query for Knowledge Base."""
    keywords = []
    
    # Add weather-related keywords
    temp = float(weather.get('temperatureMax', 0))
    if temp > 32:
        keywords.append("extreme heat")
    elif temp < 0:
        keywords.append("frost protection")
    
    # Add recipient-specific keywords
    if 'crop_type' in recipient:
        keywords.append(recipient['crop_type'])
    if 'pregnancy_status' in recipient:
        keywords.append(recipient['pregnancy_status'])
    
    # Add use case keywords
    keywords.append(os.environ.get('USE_CASE_KEYWORDS', 'weather advice'))
    
    return " ".join(keywords)
```

### Language Support

The system supports multiple languages:

```python
def get_language_instruction(language_code):
    """Get language instruction for Bedrock."""
    language_map = {
        'en': 'Respond in English',
        'sw': 'Respond in Swahili',
        'es': 'Respond in Spanish',
        'fr': 'Respond in French',
    }
    return language_map.get(language_code, 'Respond in English')

# In prompt construction
language = recipient.get('language', 'en')
prompt += f"\n\n{get_language_instruction(language)}"
```

---

## 5️⃣ Update UI Labels

### Using the Config Layer

The UI uses a centralized config file: `web-ui/src/config/labels.js`

#### Option A: Environment Variables

Create `.env.local` in `web-ui/`:

```bash
# Maternal Health
REACT_APP_TITLE="Maternal Health Weather Alerts"
REACT_APP_RECIPIENT_LABEL="Mothers"
REACT_APP_LOCATION_LABEL="Health Facility"
REACT_APP_MESSAGE_LABEL="Health Advice"
```

```bash
# Agriculture
REACT_APP_TITLE="Farm Weather Alerts"
REACT_APP_RECIPIENT_LABEL="Farmers"
REACT_APP_LOCATION_LABEL="Farm"
REACT_APP_MESSAGE_LABEL="Farming Advice"
```

#### Option B: Use Presets

The config file includes presets for common use cases:

```javascript
// web-ui/src/config/labels.js
import { useCasePresets } from './config/labels';

// Select preset based on environment
const useCase = process.env.REACT_APP_USE_CASE || 'maternal-health';
export const labels = useCasePresets[useCase];
```

### Update Components

Components automatically use the config:

```javascript
// web-ui/src/components/Dashboard.js
import { labels } from '../config/labels';

function Dashboard() {
  return (
    <div>
      <h1>{labels.appTitle}</h1>
      <p>{messages.length} alerts for {labels.recipientLabel}</p>
    </div>
  );
}
```

### Customizing Individual Components

For component-specific changes:

```javascript
// web-ui/src/components/MessageCard.js
import { labels } from '../config/labels';

function MessageCard({ message }) {
  return (
    <div className="message-card">
      <h3>{message.location_name || `Unknown ${labels.locationLabel}`}</h3>
      <p className="temperature">
        {labels.temperatureLabel}: {message.temperatureMax}°C
      </p>
      <div className="advice">
        <strong>{labels.adviceLabel}:</strong>
        <p>{message.advice}</p>
      </div>
    </div>
  );
}
```

---

## 🔧 Advanced Customizations

### Adding New Weather Providers

Currently uses Tomorrow.io. To add more providers:

1. **Create provider interface**:

```python
# lambda/weather-fetch/providers/base.py
class WeatherProvider:
    def get_forecast(self, lat, lon):
        """Return weather forecast for location."""
        raise NotImplementedError
```

2. **Implement provider**:

```python
# lambda/weather-fetch/providers/openweather.py
class OpenWeatherProvider(WeatherProvider):
    def __init__(self, api_key):
        self.api_key = api_key
    
    def get_forecast(self, lat, lon):
        url = f"https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid={self.api_key}"
        response = requests.get(url)
        data = response.json()
        
        return {
            'temperatureMax': data['list'][0]['main']['temp_max'],
            'temperatureMin': data['list'][0]['main']['temp_min'],
            'rainfall': data['list'][0].get('rain', {}).get('3h', 0),
        }
```

3. **Use factory pattern**:

```python
# lambda/weather-fetch/index.py
def get_weather_provider():
    provider_name = os.environ.get('WEATHER_PROVIDER', 'tomorrow_io')
    
    if provider_name == 'tomorrow_io':
        return TomorrowIOProvider(os.environ['TOMORROW_IO_API_KEY'])
    elif provider_name == 'openweather':
        return OpenWeatherProvider(os.environ['OPENWEATHER_API_KEY'])
    else:
        raise ValueError(f"Unknown provider: {provider_name}")

provider = get_weather_provider()
```

### Custom Alert Scheduling

Default: Daily at 6 AM UTC. To customize:

```typescript
// cdk/lib/compute-stack.ts
const scheduleRule = new events.Rule(this, 'DailyWeatherCheck', {
  schedule: events.Schedule.cron({
    minute: '0',
    hour: '6',      // Change this
    day: '*',
    month: '*',
    year: '*'
  }),
});

// Or use rate-based scheduling
const scheduleRule = new events.Rule(this, 'WeatherCheck', {
  schedule: events.Schedule.rate(cdk.Duration.hours(6)), // Every 6 hours
});
```

### Adding SMS Notifications

The system includes an SMS Lambda (currently optional):

```python
# lambda/send-sms/index.py
import os
from africastalking import SMS

def lambda_handler(event, context):
    """Send SMS via Africa's Talking."""
    sms = SMS(
        username=os.environ['AT_USERNAME'],
        api_key=os.environ['AT_API_KEY']
    )
    
    for record in event['Records']:
        msg = json.loads(record['body'])
        
        sms.send(
            message=msg['advice'],
            recipients=[msg['phone_number']]
        )
```

Enable in CDK:

```typescript
// cdk/lib/compute-stack.ts
const sendSmsFn = new lambda.Function(this, 'SendSMS', {
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: 'index.lambda_handler',
  code: lambda.Code.fromAsset('lambda/send-sms'),
  environment: {
    AT_USERNAME: 'your_username',
    AT_API_KEY: secretsmanager.Secret.fromSecretNameV2(
      this, 'ATApiKey', 'africastalking/api-key'
    ).secretValue.toString(),
  },
});

// Connect to NotifyQueue
notifyQueue.grantConsumeMessages(sendSmsFn);
sendSmsFn.addEventSource(new SqsEventSource(notifyQueue));
```

### Custom Map Markers

Customize map appearance:

```javascript
// web-ui/src/components/MapView.js
import L from 'leaflet';

// Custom marker icons by temperature
function getMarkerIcon(temperature) {
  const color = temperature > 35 ? 'red' :
                temperature > 30 ? 'orange' :
                temperature > 25 ? 'yellow' : 'green';
  
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; 
                       width: 30px; height: 30px; 
                       border-radius: 50%; 
                       border: 2px solid white;">
             <span style="color: white; font-weight: bold;">
               ${Math.round(temperature)}°
             </span>
           </div>`,
  });
}

// Use in marker creation
L.marker([lat, lon], { 
  icon: getMarkerIcon(message.temperatureMax) 
}).addTo(map);
```

---

## 📊 Testing Your Customization

### 1. Test with Sample Data

Create a small test dataset:

```json
[
  {
    "id": "test_001",
    "location_name": "Test Location",
    "latitude": -1.2921,
    "longitude": 36.8219,
    "recipient_type": "test",
    "phone_number": "+254700000000",
    "language": "en"
  }
]
```

Load into DynamoDB:

```bash
cd scripts
python load-sample-data.py test-bucket test-data.json RecipientsTable
```

### 2. Test Lambda Functions Individually

```bash
# Test profiles-to-locations
aws lambda invoke \
  --function-name ProfilesToLocationsFn \
  --payload '{"todayDate": "2025-11-04"}' \
  response.json

# Test weather-fetch
aws lambda invoke \
  --function-name WeatherFetchFn \
  --payload '{"Records": [{"body": "{\"latitude\": -1.2921, \"longitude\": 36.8219}"}]}' \
  response.json

# Test message-generator
aws lambda invoke \
  --function-name MessageGeneratorFn \
  --payload '{"Records": [{"body": "{\"latitude\": -1.2921, \"longitude\": 36.8219, \"temperatureMax\": 35}"}]}' \
  response.json
```

### 3. Test End-to-End

Trigger the EventBridge rule manually:

```bash
aws events put-events \
  --entries '[{
    "Source": "test",
    "DetailType": "Manual Test",
    "Detail": "{\"test\": true}"
  }]'
```

Monitor CloudWatch Logs:

```bash
# Watch logs in real-time
aws logs tail /aws/lambda/ProfilesToLocationsFn --follow
aws logs tail /aws/lambda/WeatherFetchFn --follow
aws logs tail /aws/lambda/MessageGeneratorFn --follow
```

### 4. Test UI

```bash
cd web-ui
npm start  # Local development server
```

Visit http://localhost:3000 and verify:
- Labels display correctly
- Messages appear in all three views
- Map markers show correct locations
- Refresh works

---

## 🚀 Deployment Checklist

Before deploying your customized system:

- [ ] Data schema defined and documented
- [ ] Sample data prepared and validated
- [ ] Weather thresholds configured in CDK
- [ ] Bedrock prompts customized and tested
- [ ] UI labels updated in config file
- [ ] Environment variables set
- [ ] Lambda functions tested individually
- [ ] End-to-end workflow tested
- [ ] CloudWatch alarms configured
- [ ] Documentation updated

---

## 📚 Additional Resources

- **USE_CASES.md**: Detailed industry examples
- **ARCHITECTURE.md**: System design and components
- **DEPLOYMENT.md**: Step-by-step deployment guide
- **CODE_CHANGES_CHECKLIST.md**: File-by-file modification guide

---

## 💡 Need Help?

Common customization questions:

**Q: Can I use multiple weather thresholds?**  
A: Yes! Modify the `should_alert()` function in `lambda/weather-fetch/index.py` to check multiple conditions.

**Q: Can I add more recipient fields?**  
A: Yes! DynamoDB is schema-less. Just add fields to your data and reference them in Lambda functions.

**Q: Can I change the alert frequency?**  
A: Yes! Modify the EventBridge schedule in `cdk/lib/compute-stack.ts`.

**Q: Can I use a different AI model?**  
A: Yes! Change `BEDROCK_MODEL_ID` in CDK. Supported models: Claude 3 Sonnet, Claude 3 Haiku, etc.

**Q: Can I add email notifications?**  
A: Yes! Add an SES Lambda function similar to the SMS function.

---

**Happy customizing! 🎉**
