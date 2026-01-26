# Maternal Health Use Case

This is the **reference implementation** included with the Serverless Weather Alert System. It demonstrates a real-world deployment protecting 240,000+ pregnant and postpartum mothers in Kenya.

---

## 📋 Overview

### Scenario
Pregnant and postpartum mothers receive personalized health advice when extreme weather conditions (particularly heat) could affect their health or their baby's health.

### Business Value
- Protects vulnerable populations from weather-related health risks
- Reduces maternal and infant mortality
- Provides actionable, AI-generated health guidance
- Scales to reach underserved communities
- Currently deployed in production in Kenya

### Current Scale
- **240,000+** maternal profiles
- **~1,300** unique health facility locations
- **Daily** weather monitoring
- **$47/month** operational cost

---

## 📊 Data Schema

### Required Fields

```json
{
  "id": "contact_uuid_12345",
  "location_name": "Kenyatta National Hospital",
  "latitude": -1.3028,
  "longitude": 36.8070
}
```

### Maternal Health Specific Fields

```json
{
  "recipient_type": "pregnant",
  "pregnancy_week": 28,
  "delivery_date": "2025-03-15",
  "medical_conditions": "gestational diabetes",
  "anc_pnc_value": "ANC",
  "status": "active",
  "phone_number": "+254712345678",
  "language": "en",
  "lastAlertedDate": "2025-11-03"
}
```

### Field Descriptions

| Field | Type | Description | Example Values |
|-------|------|-------------|----------------|
| `id` | String | Unique identifier | `contact_uuid_12345` |
| `location_name` | String | Health facility name | `Kenyatta National Hospital` |
| `latitude` | Number | GPS latitude | `-1.3028` |
| `longitude` | Number | GPS longitude | `36.8070` |
| `recipient_type` | String | Pregnancy status | `pregnant`, `postpartum` |
| `pregnancy_week` | Number | Current week of pregnancy | `1-42` |
| `delivery_date` | String | Expected/actual delivery | `2025-03-15` |
| `medical_conditions` | String | Health conditions | `gestational diabetes`, `none` |
| `anc_pnc_value` | String | Care type | `ANC` (antenatal), `PNC` (postnatal) |
| `status` | String | Profile status | `active`, `inactive` |
| `phone_number` | String | Contact number | `+254712345678` |
| `language` | String | Preferred language | `en`, `sw` (Swahili) |
| `lastAlertedDate` | String | Last alert sent | `2025-11-03` |

---

## 🌡️ Weather Thresholds

### Primary Threshold: Extreme Heat

**Trigger**: Maximum temperature ≥ 32°C (89.6°F)

**Rationale**:
- Pregnant women are more susceptible to heat stress
- Dehydration can trigger early contractions
- Heat exhaustion risk increases with gestational diabetes
- Kenya's climate makes heat the primary concern

### Additional Considerations

While not currently implemented, the system could be extended to monitor:
- **Cold Alerts**: Temperature < 10°C (50°F) - hypothermia risk
- **Storm Alerts**: Heavy rainfall or high winds - travel safety
- **Air Quality**: Pollution levels - respiratory concerns

---

## 🤖 Bedrock Configuration

### Knowledge Base Content

The Bedrock Knowledge Base should contain:

1. **Maternal Health Guidelines**
   - WHO pregnancy guidelines
   - Kenya Ministry of Health protocols
   - Heat safety for pregnant women
   - Hydration recommendations
   - Activity restrictions during pregnancy

2. **Medical Condition Information**
   - Gestational diabetes management
   - Preeclampsia warning signs
   - High-risk pregnancy care
   - Postpartum recovery guidelines

3. **Local Context**
   - Kenya-specific health resources
   - Local facility information
   - Cultural considerations
   - Language-appropriate terminology

### System Prompt

```
You are a maternal health advisor working in Kenya. 
Your role is to provide supportive, actionable health advice to pregnant 
and postpartum mothers based on weather forecasts.

Guidelines:
- Use warm, supportive language
- Provide specific, actionable steps
- Include when to seek medical attention
- Consider local context (Kenya)
- Be culturally sensitive
- Keep messages under 300 words
- Use simple, clear language

Context provided:
- Mother's pregnancy status (pregnant/postpartum)
- Pregnancy week or delivery date
- Medical conditions
- Weather forecast (temperature, conditions)
- Health facility location

Your advice should include:
1. Specific health risks for this mother
2. Actionable steps to stay safe
3. When to seek medical attention
4. Hydration and activity recommendations
5. Supportive encouragement

Respond in the requested language (English or Swahili).
```

### User Prompt Template

```
Mother's Profile:
- Status: {anc_pnc_value} ({recipient_type})
- Pregnancy Week: {pregnancy_week}
- Medical Conditions: {medical_conditions}
- Location: {location_name}

Weather Forecast:
- Max Temperature: {temperatureMax}°C
- Date: {todayDate}

Please provide personalized health advice for this mother based on the 
extreme heat forecast. Include specific actions she should take to protect 
her health and her baby's health.

Language: {language}
```

---

## 💬 Sample Messages

### Example 1: Pregnant Mother with Gestational Diabetes

**Input**:
- Pregnancy Week: 28
- Medical Condition: Gestational diabetes
- Temperature: 35°C
- Language: English

**Output**:
```
⚠️ Heat Advisory for Kenyatta National Hospital

Dear Mother,

Tomorrow's temperature will reach 35°C. As you're in week 28 of pregnancy 
with gestational diabetes, please take these precautions:

🌡️ HEALTH RISKS:
- Dehydration can affect blood sugar levels
- Heat stress may trigger early contractions
- Increased risk of heat exhaustion

💧 STAY SAFE:
- Drink 10-12 glasses of water throughout the day
- Avoid outdoor activities between 10 AM - 4 PM
- Rest in cool, shaded areas
- Monitor blood sugar more frequently

🚨 SEEK HELP IF:
- You feel dizzy or have severe headaches
- Contractions become regular
- You notice reduced baby movement
- Blood sugar levels are unstable

Stay cool and hydrated. Your health matters! 💚

- Maternal Health Team
```

### Example 2: Postpartum Mother (Swahili)

**Input**:
- Status: Postpartum (2 weeks)
- Medical Condition: None
- Temperature: 33°C
- Language: Swahili

**Output**:
```
⚠️ Onyo la Joto - Hospitali ya Kenyatta

Mama mpendwa,

Joto kesho litafikia 33°C. Kwa kuwa umezaa wiki 2 zilizopita, chukua 
tahadhari hizi:

🌡️ HATARI ZA AFYA:
- Ukosefu wa maji unaweza kupunguza maziwa
- Joto kali linaweza kusababisha uchovu
- Hatari ya kuzirai

💧 KUJILINDA:
- Nywa maji mengi - angalau gilasi 10 kwa siku
- Epuka shughuli za nje saa 4 asubuhi - 10 jioni
- Pumzika mahali pa kivuli
- Vaa nguo za rangi nyepesi

🚨 TAFUTA MSAADA IKIWA:
- Unahisi kizunguzungu au maumivu ya kichwa
- Maziwa yamepungua sana
- Unahisi uchovu mwingi sana
- Mtoto hanyonyi vizuri

Jilinde na mtoto wako. Afya yako ni muhimu! 💚

- Timu ya Afya ya Mama
```

---

## ⚙️ Configuration

### Environment Variables

```bash
# CDK Configuration (cdk/lib/compute-stack.ts)
USE_CASE_NAME=maternal-health
TEMP_THRESHOLD_C=32
BEDROCK_SYSTEM_PROMPT="You are a maternal health advisor..."
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

# Web UI Configuration (web-ui/.env.local)
REACT_APP_TITLE="Maternal Health Weather Alerts"
REACT_APP_SUBTITLE="Protecting mothers and babies from extreme weather"
REACT_APP_RECIPIENT_LABEL="Mothers"
REACT_APP_RECIPIENT_LABEL_SINGULAR="Mother"
REACT_APP_LOCATION_LABEL="Health Facility"
REACT_APP_LOCATION_LABEL_PLURAL="Health Facilities"
REACT_APP_MESSAGE_LABEL="Health Advice"
REACT_APP_ADVICE_LABEL="Health Advisory"
```

### Lambda Function Names

- `ProfilesToLocationsFn` → Scans maternal profiles
- `WeatherFetchFn` → Fetches weather for facility locations
- `AdviceFn` → Generates personalized health advice
- `SqsPollerFn` → Serves messages to web UI

---

## 📈 Metrics & Performance

### Current Production Metrics

- **Profiles Scanned**: 240,000+ daily
- **Unique Locations**: ~1,300 (after deduplication)
- **API Calls Saved**: 80% reduction via deduplication
- **Processing Time**: 2-3 hours for full scan
- **Message Generation**: ~1,300 personalized messages/day
- **Cost**: ~$47/month
- **Uptime**: 99.9%

### CloudWatch Metrics

Monitor these key metrics:
- `ProfilesToLocationsFn` duration and errors
- `WeatherFetchFn` API call success rate
- `AdviceFn` Bedrock invocation latency
- SQS queue depth and age
- DynamoDB read/write capacity

---

## 🚀 Deployment

### 1. Prepare Knowledge Base

Upload maternal health documents to S3:
```bash
aws s3 cp maternal-health-guidelines.pdf s3://your-kb-bucket/
aws s3 cp kenya-health-protocols.pdf s3://your-kb-bucket/
```

Create Bedrock Knowledge Base via AWS Console and note the KB ID.

### 2. Deploy Infrastructure

```bash
cd cdk
cdk deploy --all
```

### 3. Load Maternal Data

```bash
cd scripts
python load-sample-data.py your-s3-bucket maternal-profiles.xlsx MumBaseTable
```

### 4. Configure UI

```bash
cd web-ui
cat > .env.local << EOF
REACT_APP_TITLE="Maternal Health Weather Alerts"
REACT_APP_RECIPIENT_LABEL="Mothers"
REACT_APP_LOCATION_LABEL="Health Facility"
EOF

npm run build
aws s3 sync build/ s3://your-web-bucket/
```

---

## 🧪 Testing

### Test with Sample Data

Create `test-profile.json`:
```json
{
  "id": "test_001",
  "location_name": "Test Health Facility",
  "latitude": -1.2921,
  "longitude": 36.8219,
  "recipient_type": "pregnant",
  "pregnancy_week": 20,
  "medical_conditions": "none",
  "anc_pnc_value": "ANC",
  "phone_number": "+254700000000",
  "language": "en"
}
```

Load and trigger:
```bash
# Load test data
python load-sample-data.py test-bucket test-profile.json MumBaseTable

# Trigger workflow
aws lambda invoke \
  --function-name ProfilesToLocationsFn \
  --payload '{"todayDate": "2025-11-04"}' \
  response.json
```

### Verify Results

Check CloudWatch Logs:
```bash
aws logs tail /aws/lambda/ProfilesToLocationsFn --follow
aws logs tail /aws/lambda/WeatherFetchFn --follow
aws logs tail /aws/lambda/AdviceFn --follow
```

Check web UI at your CloudFront URL.

---

## 📚 Additional Resources

- [WHO Pregnancy Guidelines](https://www.who.int/health-topics/maternal-health)
- [Kenya Ministry of Health](http://www.health.go.ke/)
- [Heat Safety During Pregnancy](https://www.acog.org/)
- [WHO Maternal Health](https://www.who.int/health-topics/maternal-health)

---

**This use case demonstrates the real-world impact of serverless architecture and AI-powered personalization in healthcare.**
