# Use Cases for Serverless Weather Alert System

This system is designed to be **industry-agnostic** and can be adapted to any scenario where weather conditions trigger personalized notifications. Below are detailed examples across multiple industries.

---

## 🏥 Maternal Health (Included Implementation)

**Status**: ✅ **Fully Implemented** - Working example with 240K+ profiles

### Scenario
Pregnant and postpartum mothers in Kenya receive personalized health advice when extreme weather conditions (heat, cold, storms) could affect their health or their baby's health.

### Business Value
- Protects vulnerable populations from weather-related health risks
- Reduces maternal and infant mortality
- Provides actionable health guidance
- Scales to reach underserved communities

### Data Schema
```json
{
  "id": "contact_uuid_123",
  "location_name": "Kenyatta National Hospital",
  "latitude": -1.3028,
  "longitude": 36.8070,
  "recipient_type": "pregnant",
  "context_data": {
    "pregnancy_week": 28,
    "medical_conditions": "gestational diabetes",
    "delivery_date": "2025-03-15"
  },
  "phone_number": "+254712345678",
  "language": "en"
}
```

### Weather Thresholds
- **Heat Alert**: Temperature > 32°C (89.6°F)
- **Cold Alert**: Temperature < 10°C (50°F)
- **Storm Alert**: Heavy rainfall or high winds

### Sample Bedrock Prompt
```
You are a maternal health advisor in Kenya. Based on the weather forecast 
and the mother's health profile, provide specific, actionable health advice.

Mother's Profile:
- Status: {pregnancy_status} (pregnant/postpartum)
- Pregnancy Week: {pregnancy_week}
- Medical Conditions: {medical_conditions}
- Location: {facility_name}

Weather Forecast:
- Max Temperature: {temperature_max}°C
- Conditions: {weather_conditions}

Provide advice in {language} (English or Swahili) that includes:
1. Specific health risks for this mother
2. Actionable steps to stay safe
3. When to seek medical attention
4. Hydration and activity recommendations

Keep the message supportive, clear, and under 300 words.
```

### Sample Output
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

Stay cool and hydrated. Your health matters! 💚

- Weather Alert System
```

### Deployment Configuration
```bash
# .env for maternal health
USE_CASE_NAME=maternal-health
RECIPIENT_TYPE_FIELD=pregnancy_status
WEATHER_THRESHOLD_FIELD=temperature
THRESHOLD_VALUE=32
BEDROCK_SYSTEM_PROMPT="You are a maternal health advisor..."

# UI Labels
REACT_APP_TITLE="Maternal Health Weather Alerts"
REACT_APP_RECIPIENT_LABEL="Mothers"
REACT_APP_LOCATION_LABEL="Health Facility"
```

---

## 🌾 Agriculture (Conceptual Example)

**Status**: 📝 **Documentation Only** - Adaptation guide provided

### Scenario
Farmers receive frost warnings, irrigation alerts, and harvest timing recommendations based on weather forecasts and crop conditions.

### Business Value
- Reduces crop loss from frost, drought, or flooding
- Optimizes irrigation schedules
- Improves harvest timing decisions
- Increases yield and profitability

### Data Schema
```json
{
  "id": "farm_001",
  "location_name": "Green Valley Farm",
  "latitude": 0.0236,
  "longitude": 37.9062,
  "recipient_type": "wheat",
  "context_data": {
    "crop_type": "wheat",
    "planting_date": "2024-11-01",
    "crop_stage": "flowering",
    "irrigation_system": "drip",
    "soil_type": "clay loam"
  },
  "phone_number": "+254722334455",
  "language": "en"
}
```

### Weather Thresholds
- **Frost Warning**: Temperature < 0°C (32°F)
- **Drought Alert**: No rainfall for 7+ days AND temperature > 30°C
- **Flood Warning**: Heavy rainfall > 50mm in 24 hours
- **Wind Alert**: Wind speed > 40 km/h during flowering

### Sample Bedrock Prompt
```
You are an agricultural advisor. Based on the weather forecast and crop 
information, provide specific farming recommendations.

Farm Profile:
- Crop: {crop_type}
- Growth Stage: {crop_stage}
- Planting Date: {planting_date}
- Irrigation: {irrigation_system}
- Soil Type: {soil_type}

Weather Forecast:
- Min Temperature: {temperature_min}°C
- Max Temperature: {temperature_max}°C
- Rainfall: {rainfall}mm
- Wind Speed: {wind_speed} km/h

Provide advice that includes:
1. Immediate actions to protect crops
2. Irrigation adjustments needed
3. Harvest timing considerations
4. Equipment or supplies needed

Keep the message practical and actionable, under 300 words.
```

### Sample Output
```
🌾 Frost Warning for Green Valley Farm

Dear Farmer,

Tonight's temperature will drop to -2°C. Your wheat crop is in the 
flowering stage and at high risk of frost damage.

❄️ IMMEDIATE ACTIONS:
- Apply frost protection spray before sunset today
- Run irrigation system for 2-3 hours before midnight (ice coating protects)
- Cover vulnerable areas with frost blankets if available
- Monitor temperature throughout the night

🌡️ CROP IMPACT:
- Flowering wheat is highly sensitive to frost
- Potential 30-50% yield loss if unprotected
- Frost damage appears 24-48 hours after event

📅 NEXT STEPS:
- Inspect crop tomorrow afternoon for damage
- Document affected areas for insurance
- Consider delaying harvest by 1-2 weeks if damage occurs
- Adjust fertilizer plan based on damage assessment

🌤️ FORECAST:
- Frost risk continues for next 3 nights
- Temperatures return to normal by Friday

Protect your crop tonight. Good luck! 🌾
```

### Deployment Configuration
```bash
# .env for agriculture
USE_CASE_NAME=agriculture
RECIPIENT_TYPE_FIELD=crop_type
WEATHER_THRESHOLD_FIELD=temperature
THRESHOLD_VALUE=0
BEDROCK_SYSTEM_PROMPT="You are an agricultural advisor..."

# UI Labels
REACT_APP_TITLE="Farm Weather Alerts"
REACT_APP_RECIPIENT_LABEL="Farmers"
REACT_APP_LOCATION_LABEL="Farm"
```

---

## 🏗️ Construction (Conceptual Example)

**Status**: 📝 **Documentation Only** - Adaptation guide provided

### Scenario
Construction site managers receive weather delay notifications, safety alerts, and equipment protection recommendations.

### Business Value
- Improves worker safety during severe weather
- Reduces equipment damage from storms
- Optimizes project scheduling
- Minimizes weather-related delays and costs

### Data Schema
```json
{
  "id": "site_042",
  "location_name": "Nairobi Tower Project",
  "latitude": -1.2921,
  "longitude": 36.8219,
  "recipient_type": "high-rise",
  "context_data": {
    "project_type": "high-rise",
    "construction_phase": "structural",
    "floor_level": 15,
    "crew_size": 45,
    "critical_equipment": ["tower crane", "concrete pump"]
  },
  "phone_number": "+254733445566",
  "language": "en"
}
```

### Weather Thresholds
- **Wind Alert**: Wind speed > 40 km/h (crane operations)
- **Rain Alert**: Heavy rainfall > 25mm (concrete work)
- **Lightning Alert**: Thunderstorm within 10km
- **Heat Alert**: Temperature > 35°C (worker safety)

### Sample Bedrock Prompt
```
You are a construction safety advisor. Based on the weather forecast and 
project details, provide specific safety and operational recommendations.

Project Profile:
- Type: {project_type}
- Phase: {construction_phase}
- Current Level: {floor_level}
- Crew Size: {crew_size}
- Critical Equipment: {critical_equipment}

Weather Forecast:
- Wind Speed: {wind_speed} km/h
- Rainfall: {rainfall}mm
- Temperature: {temperature_max}°C
- Lightning Risk: {lightning_risk}

Provide advice that includes:
1. Safety protocols to implement
2. Work activities to suspend
3. Equipment protection measures
4. Schedule adjustments needed

Keep the message clear and actionable, under 300 words.
```

### Sample Output
```
⚠️ High Wind Alert for Nairobi Tower Project

Dear Site Manager,

Tomorrow's wind speeds will reach 55 km/h with gusts up to 70 km/h. 
Immediate action required for crew safety.

🚨 SUSPEND OPERATIONS:
- Tower crane operations (MANDATORY - exceeds 40 km/h limit)
- All work above floor 10
- Material hoisting and lifting
- Scaffolding assembly/disassembly

🔒 EQUIPMENT PROTECTION:
- Secure tower crane in weathervane mode
- Lower concrete pump boom to ground position
- Remove loose materials from elevated areas
- Secure all scaffolding and temporary structures
- Cover open concrete pours

👷 CREW SAFETY:
- Conduct safety briefing before shift
- Assign ground-level tasks only
- Ensure all workers wear hard hats
- Establish wind speed monitoring protocol
- Prepare evacuation plan if winds increase

📅 SCHEDULE IMPACT:
- Estimated 1-day delay for structural work
- Reschedule concrete pour to Friday
- Use delay for ground-level prep work
- Update client and subcontractors

🌤️ FORECAST:
- High winds continue through tomorrow evening
- Conditions improve Thursday morning
- Safe to resume elevated work by Thursday noon

Safety first. Protect your crew and equipment. 🏗️
```

### Deployment Configuration
```bash
# .env for construction
USE_CASE_NAME=construction
RECIPIENT_TYPE_FIELD=project_type
WEATHER_THRESHOLD_FIELD=wind_speed
THRESHOLD_VALUE=40
BEDROCK_SYSTEM_PROMPT="You are a construction safety advisor..."

# UI Labels
REACT_APP_TITLE="Construction Site Weather Alerts"
REACT_APP_RECIPIENT_LABEL="Site Managers"
REACT_APP_LOCATION_LABEL="Construction Site"
```

---

## 🚨 Public Safety (Conceptual Example)

**Status**: 📝 **Documentation Only** - Adaptation guide provided

### Scenario
Citizens receive severe weather warnings, evacuation instructions, and safety guidance during emergencies.

### Business Value
- Saves lives during severe weather events
- Reduces emergency response burden
- Provides timely evacuation guidance
- Reaches vulnerable populations

### Data Schema
```json
{
  "id": "citizen_5678",
  "location_name": "Kibera District",
  "latitude": -1.3133,
  "longitude": 36.7870,
  "recipient_type": "resident",
  "context_data": {
    "household_size": 5,
    "vulnerability_factors": ["elderly", "children under 5"],
    "housing_type": "informal settlement",
    "mobility": "limited"
  },
  "phone_number": "+254744556677",
  "language": "sw"
}
```

### Weather Thresholds
- **Flood Warning**: Heavy rainfall > 100mm in 24 hours
- **Extreme Heat**: Temperature > 38°C for 3+ days
- **Storm Warning**: Wind speed > 80 km/h
- **Tornado Warning**: Tornado detected within 50km

### Sample Bedrock Prompt
```
You are a public safety emergency advisor. Based on the severe weather 
forecast and citizen profile, provide clear emergency instructions.

Citizen Profile:
- Location: {location_name}
- Household Size: {household_size}
- Vulnerability: {vulnerability_factors}
- Housing Type: {housing_type}
- Mobility: {mobility}

Weather Emergency:
- Event Type: {weather_event_type}
- Severity: {severity_level}
- Timing: {event_timing}
- Duration: {expected_duration}

Provide instructions that include:
1. Immediate actions to take
2. Evacuation routes and shelter locations
3. Emergency supplies needed
4. When and how to seek help

Use simple, clear language. This is life-critical information. Under 300 words.
```

### Sample Output
```
🚨 FLOOD WARNING - Kibera District

HALI YA HATARI - Mafuriko Yanakuja

IMMEDIATE ACTION REQUIRED:

🌊 WHAT'S HAPPENING:
Heavy rains will cause severe flooding in Kibera starting at 6 PM today. 
Water levels may reach 1-2 meters in low-lying areas.

🏃 EVACUATE NOW IF:
- You live in a ground-floor dwelling
- Your home is near the river or drainage channels
- You have elderly family members or young children

📍 EVACUATION CENTERS:
1. Olympic Primary School (500m north)
2. Kibera Social Hall (800m east)
3. Toi Market Community Center (1km west)

🎒 BRING WITH YOU:
- Identification documents
- Mobile phone and charger
- Drinking water and food for 24 hours
- Medications
- Blankets

⚠️ SAFETY RULES:
- DO NOT walk through flowing water
- Stay away from power lines
- Move to higher ground immediately
- Help elderly neighbors evacuate

📞 EMERGENCY CONTACTS:
- Red Cross: 1199
- Emergency Services: 999
- Flood Hotline: 0800-FLOOD

🌤️ FORECAST:
- Heavy rain continues until midnight
- Flooding risk remains high for 24 hours
- Return home only when authorities say it's safe

YOUR SAFETY IS MOST IMPORTANT. EVACUATE NOW. 🚨
```

### Deployment Configuration
```bash
# .env for public safety
USE_CASE_NAME=public-safety
RECIPIENT_TYPE_FIELD=housing_type
WEATHER_THRESHOLD_FIELD=rainfall
THRESHOLD_VALUE=100
BEDROCK_SYSTEM_PROMPT="You are a public safety emergency advisor..."

# UI Labels
REACT_APP_TITLE="Public Weather Alerts"
REACT_APP_RECIPIENT_LABEL="Citizens"
REACT_APP_LOCATION_LABEL="Area"
```

---

## 🚛 Transportation & Logistics (Conceptual Example)

**Status**: 📝 **Documentation Only** - Adaptation guide provided

### Scenario
Fleet managers receive route warnings, delay estimates, and alternative route recommendations based on weather conditions.

### Business Value
- Improves delivery reliability
- Reduces accidents and vehicle damage
- Optimizes route planning
- Minimizes fuel costs and delays

### Data Schema
```json
{
  "id": "vehicle_789",
  "location_name": "Mombasa-Nairobi Route",
  "latitude": -1.9706,
  "longitude": 37.9083,
  "recipient_type": "heavy_truck",
  "context_data": {
    "vehicle_type": "heavy_truck",
    "cargo_type": "perishable goods",
    "route": "Mombasa to Nairobi",
    "scheduled_delivery": "2025-11-05 14:00",
    "driver_experience": "senior"
  },
  "phone_number": "+254755667788",
  "language": "en"
}
```

### Weather Thresholds
- **Ice Warning**: Temperature < 2°C on mountain passes
- **Fog Alert**: Visibility < 100m
- **Wind Alert**: Wind speed > 60 km/h (high-profile vehicles)
- **Flood Alert**: Heavy rainfall on route

### Sample Output
```
⚠️ Route Weather Alert - Mombasa-Nairobi

Dear Fleet Manager,

Heavy fog and rain expected on your route tomorrow. Delivery delays likely.

🌫️ WEATHER CONDITIONS:
- Dense fog: 6 AM - 10 AM (visibility 50m)
- Heavy rain: 10 AM - 4 PM (25mm/hour)
- Road flooding risk: Moderate to High

🚛 VEHICLE IMPACT:
- Vehicle: Heavy Truck #789
- Cargo: Perishable goods (temperature-sensitive)
- Current ETA: Tomorrow 2 PM
- Revised ETA: Tomorrow 6 PM (+4 hours)

🛣️ ROUTE RECOMMENDATIONS:
- DELAY departure by 4 hours (leave at 10 AM instead of 6 AM)
- AVOID: Mtito Andei section (flooding risk)
- ALTERNATIVE: Use Emali bypass (adds 30 min, safer)
- REDUCE speed by 30% in rain

⚠️ SAFETY PROTOCOLS:
- Ensure fog lights functional
- Check tire tread depth
- Carry emergency supplies
- Maintain 100m following distance
- Brief driver on conditions

📦 CARGO PROTECTION:
- Verify refrigeration unit working
- Check cargo securing
- Monitor temperature throughout journey
- Have backup cooling plan

📞 SUPPORT:
- Weather updates every 2 hours
- Emergency dispatch: 0700-FLEET
- Roadside assistance: 0800-RESCUE

Plan for delays. Safety first. 🚛
```

---

## 🎯 How to Adapt for Your Industry

### Step 1: Define Your Use Case
- Who are your recipients?
- What weather conditions matter?
- What actions should they take?

### Step 2: Design Your Data Schema
- Required fields: id, location_name, latitude, longitude
- Custom fields: recipient_type, context_data
- See examples above for inspiration

### Step 3: Configure Weather Thresholds
- Set appropriate trigger values
- Consider multiple conditions
- Account for regional variations

### Step 4: Customize Bedrock Prompts
- Define the AI's role (advisor, safety officer, etc.)
- Specify output format and tone
- Include industry-specific terminology

### Step 5: Update UI Labels
- Use the config layer (web-ui/src/config/labels.js)
- Set environment variables
- Test with sample data

### Step 6: Load Your Data
- Prepare data in required schema
- Use scripts/load-sample-data.py
- Test with small dataset first

---

## 📚 Additional Resources

- **CUSTOMIZATION.md**: Detailed adaptation guide
- **ARCHITECTURE.md**: System design and components
- **DEPLOYMENT_GUIDE.md**: Step-by-step deployment instructions
- **examples/**: Sample data and configurations for each use case

---

**The system is designed to be flexible. Start with one of these examples and adapt it to your specific needs!**
