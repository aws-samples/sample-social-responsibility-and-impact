import os
import json
import boto3

# AWS clients
sqs = boto3.client('sqs')
bedrock = boto3.client('bedrock-runtime')
bedrock_kb = boto3.client('bedrock-agent-runtime')

# Environment variables set by CDK
NOTIFY_QUEUE_URL = os.environ["NOTIFY_QUEUE_URL"]
KB_ID = os.environ["BEDROCK_KNOWLEDGE_BASE_ID"]
LLM_MODEL_ID = os.environ["BEDROCK_MODEL_ID"]

# Configurable system prompt (can be overridden for different use cases)
SYSTEM_PROMPT = os.environ.get(
    "BEDROCK_SYSTEM_PROMPT",
    "You are a weather advisory assistant providing personalized recommendations based on weather forecasts."
)

def build_query(anc_pnc, med_conds, temperatureMax):
    """Build search query for Bedrock Knowledge Base."""
    keywords = []
    
    try:
        temp = float(temperatureMax)
        if temp >= 32:
            keywords.append("extreme heat")
        elif temp >= 28:
            keywords.append("heat risk")
    except (ValueError, TypeError):
        pass
    
    if anc_pnc:
        if anc_pnc.upper() == "ANC":
            keywords.append("pregnancy")
        elif anc_pnc.upper() == "PNC":
            keywords.append("postpartum")
    
    if med_conds and med_conds.lower() != "none":
        keywords.append(med_conds)
    
    keywords.append("health advice Kenya mothers")
    return " ".join(keywords)

def call_bedrock_kb_retrieve(query, kb_id):
    """Search Bedrock KB and return top retrieved snippets as context."""
    try:
        response = bedrock_kb.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery={"text": query},
            retrievalConfiguration={
                "vectorSearchConfiguration": {
                    "numberOfResults": 3
                }
            }
        )
        
        summaries = []
        for r in response.get("retrievalResults", []):
            snippet = r.get("content", {}).get("text", "")
            if snippet:
                summaries.append(snippet)
        
        return "\n".join(summaries)
    except Exception as e:
        print(f"[MessageGeneratorFn] KB retrieval error: {e}")
        return ""

def build_sms_prompt(context_snippets, anc_pnc, med_conds, temperatureMax, is_swahili):
    """Build prompt for Claude to generate SMS advice."""
    prompt = (
        "You are drafting a weather-related health alert for a mother in Kenya.\n"
        f"User details: maternal status: {anc_pnc}; medical conditions: {med_conds}; "
        f"forecasted max temperature: {temperatureMax}°C.\n\n"
        f"Relevant health advice snippets:\n{context_snippets}\n\n"
        "Write a supportive and actionable SMS using clear everyday language for Kenyan mothers. "
        "Keep it concise (under 300 words) and include specific actions they should take."
    )
    
    if is_swahili:
        prompt += " Respond in Swahili."
    else:
        prompt += " Respond in English."
    
    return prompt

def call_bedrock_claude(prompt, model_id):
    """Call Claude via Bedrock to generate advice."""
    try:
        response = bedrock.invoke_model(
            modelId=model_id,
            body=json.dumps({
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500,
                "anthropic_version": "bedrock-2023-05-31"
            }),
            accept='application/json',
            contentType='application/json'
        )
        
        result = json.loads(response['body'].read())
        
        if "content" in result and isinstance(result["content"], list):
            return result["content"][0].get("text", "").strip()
        
        return result.get('completion', '').strip() or result.get('output', '').strip()
    except Exception as e:
        print(f"[MessageGeneratorFn] Bedrock Claude error: {e}")
        return f"Unable to generate personalized message at this time. Please check back later."

def parse_float(val):
    """Safely parse float from string or number."""
    try:
        return float(val)
    except (ValueError, TypeError):
        return None

def lambda_handler(event, context):
    """
    Generates personalized messages using Bedrock KB + Claude.
    Queues final messages to NotifyQueue.
    """
    processed = 0
    
    for record in event['Records']:
        msg = json.loads(record['body'])
        
        lat = parse_float(msg.get("latitude"))
        lon = parse_float(msg.get("longitude"))
        anc_pnc_value = msg.get("anc_pnc_value", "unknown")
        med_conds = msg.get("medical_conditions", "none")
        temp = msg.get("temperatureMax")
        
        # Parse language (accept sw, swh, swahili, etc.)
        language = str(msg.get("language", "en")).strip().lower()
        is_swahili = language.startswith("sw") or language == "swahili"
        
        # Step 1: Build query and retrieve context from KB
        query = build_query(anc_pnc_value, med_conds, temp)
        kb_snippets = call_bedrock_kb_retrieve(query, KB_ID)
        
        # Step 2: Generate advice with Claude
        prompt = build_sms_prompt(kb_snippets, anc_pnc_value, med_conds, temp, is_swahili)
        advice = call_bedrock_claude(prompt, LLM_MODEL_ID)
        
        # Step 3: Queue final message
        output = {
            "contact_uuid": msg.get("contact_uuid"),
            "latitude": lat,
            "longitude": lon,
            "todayDate": msg.get("todayDate"),
            "temperatureMax": temp,
            "anc_pnc_value": anc_pnc_value,
            "medical_conditions": med_conds,
            "advice": advice,
            "language": language,
            "phone_number": msg.get("phone_number"),
            "facility_name": msg.get("facility_name"),
        }
        
        sqs.send_message(
            QueueUrl=NOTIFY_QUEUE_URL,
            MessageBody=json.dumps(output)
        )
        
        print(f"[MessageGeneratorFn] Message generated successfully (length: {len(advice)} chars)")
        processed += 1
    
    return {
        "statusCode": 200,
        "processed_records": processed
    }
