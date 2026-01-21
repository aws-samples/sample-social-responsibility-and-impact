# Threat Model: Serverless Weather Alert System

**Version:** 2.0.0  
**Date:** November 26, 2025  
**Review Status:** Pending AppSec Review  
**Document Owner:** Weather Alert System Team

---

## Executive Summary

This threat model documents the security analysis of the Serverless Weather Alert System, an AWS Sample application that demonstrates event-driven architecture and AI-powered personalization using Amazon Bedrock. The system monitors weather conditions and generates personalized safety alerts for recipients (e.g., pregnant women, farmers, construction workers).

**Scope:** This threat model covers the complete system including Lambda functions, API Gateway, web UI, data storage, external API integrations, and AI/ML components.

---

## 1. System Description

### 1.1 Overview

The Serverless Weather Alert System is an event-driven application that:
- Monitors weather conditions for recipients stored in DynamoDB
- Fetches weather data from Tomorrow.io API
- Generates personalized advice using Amazon Bedrock (Claude 3 Sonnet with RAG)
- Displays alerts via a React web UI hosted on CloudFront
- Optionally sends SMS notifications via Africa's Talking API

**Current Deployment:** Production system protecting 240,000+ pregnant mothers in Kenya from heat-related health risks.

### 1.2 Key Components


**Backend Services:**
- 5 Lambda functions (Python 3.12)
- Amazon DynamoDB (recipient data)
- Amazon SQS (3 queues + 3 DLQs)
- Amazon EventBridge (scheduled triggers)
- Amazon Bedrock (Claude 3 Sonnet + Knowledge Base)
- Amazon OpenSearch Serverless (vector store)

**Frontend:**
- React 18 SPA
- Amazon CloudFront (CDN)
- Amazon S3 (static hosting)
- Amazon Cognito (authentication)
- Amazon API Gateway (REST API)

**External Dependencies:**
- Tomorrow.io Weather API (HTTPS)
- Africa's Talking SMS API (HTTPS)
- OpenStreetMap tiles (HTTPS)

### 1.3 Data Types Processed

Using AWS data type definitions:

**Customer Content:**
- Recipient personal information (names, phone numbers, medical conditions, location coordinates)
- Generated alert messages
- User authentication credentials

**Service Data:**
- Weather forecast data
- System logs and metrics
- API keys and secrets

**Metadata:**
- CloudWatch logs
- API Gateway access logs
- Lambda execution traces



---

## 2. Architecture Diagrams

### 2.1 High-Level Data Flow

```
┌─────────────────┐
│  EventBridge    │ (Daily Trigger)
│  Scheduled Rule │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ RecipientsToLocationsFn (Lambda)                            │
│ - Scans DynamoDB for recipients                             │
│ - Deduplicates by location (80% reduction)                  │
│ - Sends unique locations to LocationFetchQueue              │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ LocationFetch   │
│ SQS Queue       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ WeatherFetchFn (Lambda)                                     │
│ - Fetches weather from Tomorrow.io API (HTTPS)             │
│ - Filters by temperature threshold                          │
│ - Sends results to WeatherResultQueue                       │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ WeatherResult   │
│ SQS Queue       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ MessageGeneratorFn (Lambda)                                 │
│ - Retrieves context from Bedrock Knowledge Base            │
│ - Generates personalized advice via Claude 3 Sonnet        │
│ - Sends messages to NotifyQueue                             │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ NotifyQueue     │
│ SQS Queue       │
└────────┬────────┘
         │
         ├──────────────────────────────────────┐
         │                                      │
         ▼                                      ▼
┌──────────────────┐              ┌──────────────────────┐
│ SendSMSFn        │              │ SQSPollerFn          │
│ (Lambda)         │              │ (Lambda)             │
│ - Africa's       │              │ - API Gateway        │
│   Talking API    │              │ - Returns messages   │
└──────────────────┘              └──────────┬───────────┘
                                             │
                                             ▼
                                  ┌──────────────────────┐
                                  │ CloudFront + S3      │
                                  │ React Web UI         │
                                  │ (Cognito Auth)       │
                                  └──────────────────────┘
```



### 2.3 Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    AWS Account Boundary                      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Customer-Facing Components                  │    │
│  │  - CloudFront                                       │    │
│  │  - API Gateway (Cognito-authorized)                 │    │
│  │  - Cognito User Pool                                │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Internal Processing Layer                   │    │
│  │  - Lambda Functions                                 │    │
│  │  - SQS Queues                                       │    │
│  │  - DynamoDB                                         │    │
│  │  - Bedrock (Claude + KB)                            │    │
│  │  - OpenSearch Serverless                            │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Secrets & Configuration                     │    │
│  │  - Secrets Manager (API keys)                       │    │
│  │  - CloudWatch Logs                                  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌──────────────┐
│ Tomorrow.io   │  │ Africa's      │  │ OpenStreetMap│
│ Weather API   │  │ Talking API   │  │ (Client-side)│
│ (External)    │  │ (External)    │  │ (External)   │
└───────────────┘  └───────────────┘  └──────────────┘
```



---

## 3. Assets

### 3.1 Critical Assets

| Asset | Type | Sensitivity | Storage Location | Access Control |
|-------|------|-------------|------------------|----------------|
| Recipient PII | Customer Content | HIGH | DynamoDB | IAM roles (Lambda only) |
| Phone Numbers | Customer Content | HIGH | DynamoDB | IAM roles (Lambda only) |
| Medical Conditions | Customer Content | HIGH | DynamoDB | IAM roles (Lambda only) |
| Location Coordinates | Customer Content | MEDIUM | DynamoDB, SQS | IAM roles |
| Generated Alerts | Customer Content | MEDIUM | SQS, API responses | Cognito + IAM |
| API Keys (Weather) | Service Data | HIGH | Secrets Manager | IAM roles (Lambda only) |
| API Keys (SMS) | Service Data | HIGH | Secrets Manager | IAM roles (Lambda only) |
| Cognito User Credentials | Customer Content | HIGH | Cognito User Pool | AWS-managed |
| JWT Tokens | Customer Content | MEDIUM | Client-side (browser) | HTTPS only |
| Bedrock KB Documents | Service Data | MEDIUM | S3, OpenSearch | IAM roles |
| CloudWatch Logs | Metadata | LOW-MEDIUM | CloudWatch | IAM roles |

### 3.2 Data Flow Summary

**Ingress:**
- User authentication (Cognito)
- API requests (API Gateway)
- Scheduled triggers (EventBridge)

**Processing:**
- DynamoDB scans
- External API calls (Tomorrow.io, Africa's Talking)
- AI generation (Bedrock)
- Queue processing (SQS)

**Egress:**
- API responses (JSON)
- SMS messages (Africa's Talking)
- CloudWatch logs
- Web UI content (CloudFront)



---

## 4. Threat Analysis (STRIDE)

### 4.1 Spoofing Threats

#### T1.1: Unauthorized API Access
**Description:** Attacker attempts to access API Gateway without valid Cognito credentials.  
**Impact:** HIGH - Could expose recipient data and alert messages.  
**Likelihood:** MEDIUM - Cognito provides strong authentication.  
**STRIDE Category:** Spoofing  
**Affected Components:** API Gateway, SQSPollerFn  

**Mitigations:**
- ✅ **Implemented:** Cognito User Pool with email verification
- ✅ **Implemented:** API Gateway Cognito authorizer
- ✅ **Implemented:** HTTPS-only (TLS 1.2+)
- ✅ **Implemented:** JWT token validation
- 🔄 **Recommended:** Implement MFA for admin users
- 🔄 **Recommended:** Add rate limiting on API Gateway

**Tickets:** N/A (recommendations for future enhancement)

---

#### T1.2: Lambda Execution Role Assumption
**Description:** Attacker attempts to assume Lambda execution roles to access AWS resources.  
**Impact:** CRITICAL - Could access DynamoDB, Secrets Manager, Bedrock.  
**Likelihood:** LOW - Requires AWS account compromise.  
**STRIDE Category:** Spoofing  
**Affected Components:** All Lambda functions  

**Mitigations:**
- ✅ **Implemented:** Least privilege IAM policies
- ✅ **Implemented:** Service-specific execution roles
- ✅ **Implemented:** No cross-account access
- ✅ **Implemented:** CloudTrail logging enabled
- ✅ **Implemented:** IAM policy conditions (service principals)

**Tickets:** N/A (properly implemented)



---

### 4.2 Tampering Threats

#### T2.1: Message Tampering in SQS Queues
**Description:** Attacker modifies messages in SQS queues to alter alert content or recipient data.  
**Impact:** HIGH - Could send incorrect health advice or target wrong recipients.  
**Likelihood:** LOW - Requires IAM compromise.  
**STRIDE Category:** Tampering  
**Affected Components:** LocationFetchQueue, WeatherResultQueue, NotifyQueue  

**Mitigations:**
- ✅ **Implemented:** IAM policies restrict queue access to specific Lambda functions
- ✅ **Implemented:** Encryption at rest (SQS SSE)
- ✅ **Implemented:** Encryption in transit (TLS)
- ✅ **Implemented:** CloudTrail logging of queue operations
- 🔄 **Recommended:** Implement message signing/HMAC for critical data

**Tickets:** Consider for v3.0 if tampering becomes a concern

---

#### T2.2: DynamoDB Data Modification
**Description:** Unauthorized modification of recipient data in DynamoDB.  
**Impact:** CRITICAL - Could expose wrong people to alerts or leak PII.  
**Likelihood:** LOW - Requires IAM compromise.  
**STRIDE Category:** Tampering  
**Affected Components:** DynamoDB RecipientsTable  

**Mitigations:**
- ✅ **Implemented:** IAM policies restrict write access to data loading scripts only
- ✅ **Implemented:** Lambda functions have read-only access
- ✅ **Implemented:** Point-in-time recovery enabled
- ✅ **Implemented:** CloudTrail logging
- ✅ **Implemented:** Encryption at rest
- 🔄 **Recommended:** Implement DynamoDB Streams for audit trail

**Tickets:** N/A (adequately protected)



#### T2.3: Prompt Injection in Bedrock
**Description:** Attacker manipulates input data to inject malicious prompts into Bedrock, causing harmful advice generation.  
**Impact:** CRITICAL - Could generate dangerous health advice.  
**Likelihood:** MEDIUM - Input comes from DynamoDB (controlled) but weather data is external.  
**STRIDE Category:** Tampering  
**Affected Components:** MessageGeneratorFn, Bedrock  

**Mitigations:**
- ✅ **Implemented:** Structured prompts with clear system instructions
- ✅ **Implemented:** Input validation on recipient data
- ✅ **Implemented:** Weather data from trusted API (Tomorrow.io)
- 🔄 **Recommended:** Implement Bedrock Guardrails
- 🔄 **Recommended:** Add output validation/filtering
- 🔄 **Recommended:** Human review for high-risk scenarios

**Tickets:** HIGH PRIORITY - Implement Bedrock Guardrails in next sprint

---

### 4.3 Repudiation Threats

#### T3.1: Lack of Audit Trail for Alert Generation
**Description:** Unable to prove which alerts were sent to which recipients and when.  
**Impact:** MEDIUM - Compliance and accountability issues.  
**Likelihood:** HIGH - Current logging may be insufficient.  
**STRIDE Category:** Repudiation  
**Affected Components:** All Lambda functions  

**Mitigations:**
- ✅ **Implemented:** CloudWatch Logs for all Lambda executions
- ✅ **Implemented:** CloudTrail for API calls
- ✅ **Implemented:** Structured logging with recipient IDs
- 🔄 **Recommended:** Implement centralized audit log in DynamoDB
- 🔄 **Recommended:** Add log retention policy (7 years for healthcare)
- 🔄 **Recommended:** Implement log integrity verification

**Tickets:** MEDIUM PRIORITY - Design audit log schema



---

### 4.4 Information Disclosure Threats

#### T4.1: PII Exposure in CloudWatch Logs
**Description:** Sensitive recipient data (phone numbers, medical conditions) logged to CloudWatch.  
**Impact:** CRITICAL - GDPR/HIPAA violation, privacy breach.  
**Likelihood:** MEDIUM - Developers may accidentally log sensitive data.  
**STRIDE Category:** Information Disclosure  
**Affected Components:** All Lambda functions  

**Mitigations:**
- ✅ **Implemented:** Credential masking in logs (API keys shown as `***`)
- ✅ **Implemented:** Structured logging with controlled fields
- 🔄 **Recommended:** Implement automated PII detection/redaction
- 🔄 **Recommended:** Regular log audits
- 🔄 **Recommended:** Developer training on secure logging

**Tickets:** HIGH PRIORITY - Implement log scrubbing Lambda

---

#### T4.2: API Key Exposure
**Description:** Weather API or SMS API keys exposed through logs, code, or configuration.  
**Impact:** HIGH - Unauthorized API usage, cost implications.  
**Likelihood:** LOW - Keys stored in Secrets Manager.  
**STRIDE Category:** Information Disclosure  
**Affected Components:** WeatherFetchFn, SendSMSFn  

**Mitigations:**
- ✅ **Implemented:** API keys stored in Secrets Manager
- ✅ **Implemented:** IAM policies restrict access
- ✅ **Implemented:** Keys masked in logs
- ✅ **Implemented:** No keys in code or environment variables
- ✅ **Implemented:** Secrets rotation capability
- 🔄 **Recommended:** Implement automated secret rotation (90 days)

**Tickets:** MEDIUM PRIORITY - Set up secret rotation schedule



#### T4.3: Unauthorized Access to DynamoDB Data
**Description:** Attacker gains read access to DynamoDB table containing recipient PII.  
**Impact:** CRITICAL - Mass PII exposure.  
**Likelihood:** LOW - Strong IAM controls.  
**STRIDE Category:** Information Disclosure  
**Affected Components:** DynamoDB RecipientsTable  

**Mitigations:**
- ✅ **Implemented:** IAM policies restrict access to Lambda functions only
- ✅ **Implemented:** No public access
- ✅ **Implemented:** Encryption at rest (AWS-managed keys)
- ✅ **Implemented:** VPC endpoints (optional, not currently used)
- 🔄 **Recommended:** Implement field-level encryption for sensitive fields
- 🔄 **Recommended:** Use customer-managed KMS keys

**Tickets:** Consider for compliance requirements

---

#### T4.4: JWT Token Theft
**Description:** Attacker steals JWT tokens from client browser to impersonate users.  
**Impact:** MEDIUM - Limited to read-only access to alerts.  
**Likelihood:** MEDIUM - XSS or browser compromise.  
**STRIDE Category:** Information Disclosure  
**Affected Components:** React Web UI, API Gateway  

**Mitigations:**
- ✅ **Implemented:** HTTPS-only (prevents MITM)
- ✅ **Implemented:** HttpOnly cookies (if using cookie storage)
- ✅ **Implemented:** Short token expiration (1 hour)
- ✅ **Implemented:** Token refresh mechanism
- 🔄 **Recommended:** Implement Content Security Policy (CSP)
- 🔄 **Recommended:** Add XSS protection headers
- 🔄 **Recommended:** Implement token binding

**Tickets:** MEDIUM PRIORITY - Add security headers to CloudFront



---

### 4.5 Denial of Service Threats

#### T5.1: API Gateway Rate Limiting Bypass
**Description:** Attacker floods API Gateway with requests to cause service degradation.  
**Impact:** MEDIUM - Service unavailability for legitimate users.  
**Likelihood:** MEDIUM - No rate limiting currently implemented.  
**STRIDE Category:** Denial of Service  
**Affected Components:** API Gateway, SQSPollerFn  

**Mitigations:**
- ✅ **Implemented:** Lambda concurrency limits
- ✅ **Implemented:** SQS queue throttling
- 🔄 **Recommended:** Implement API Gateway throttling (1000 req/sec)
- 🔄 **Recommended:** Implement per-user rate limiting
- 🔄 **Recommended:** Add WAF rules for DDoS protection

**Tickets:** HIGH PRIORITY - Configure API Gateway throttling

---

#### T5.2: Lambda Function Exhaustion
**Description:** Malicious or buggy code causes Lambda functions to consume all concurrency.  
**Impact:** HIGH - System-wide processing failure.  
**Likelihood:** LOW - Concurrency limits in place.  
**STRIDE Category:** Denial of Service  
**Affected Components:** All Lambda functions  

**Mitigations:**
- ✅ **Implemented:** Reserved concurrency on critical functions
- ✅ **Implemented:** Lambda timeout limits (30-60 seconds)
- ✅ **Implemented:** Dead Letter Queues for failed messages
- ✅ **Implemented:** CloudWatch alarms on errors
- ✅ **Implemented:** HTTP timeouts on external API calls (30 seconds)

**Tickets:** N/A (adequately protected)



#### T5.3: DynamoDB Throttling
**Description:** Excessive scan operations cause DynamoDB throttling, blocking legitimate requests.  
**Impact:** MEDIUM - Delayed alert processing.  
**Likelihood:** LOW - On-demand capacity mode.  
**STRIDE Category:** Denial of Service  
**Affected Components:** RecipientsToLocationsFn, DynamoDB  

**Mitigations:**
- ✅ **Implemented:** On-demand capacity mode (auto-scaling)
- ✅ **Implemented:** Efficient scan with pagination
- ✅ **Implemented:** Location deduplication (80% reduction)
- ✅ **Implemented:** CloudWatch alarms on throttling
- 🔄 **Recommended:** Implement exponential backoff on retries

**Tickets:** N/A (low risk with current design)

---

#### T5.4: External API Dependency Failure
**Description:** Tomorrow.io or Africa's Talking API outage causes system failure.  
**Impact:** HIGH - No alerts generated or sent.  
**Likelihood:** MEDIUM - External dependencies.  
**STRIDE Category:** Denial of Service  
**Affected Components:** WeatherFetchFn, SendSMSFn  

**Mitigations:**
- ✅ **Implemented:** HTTP timeouts (30 seconds)
- ✅ **Implemented:** Error handling and logging
- ✅ **Implemented:** Dead Letter Queues for retries
- ✅ **Implemented:** CloudWatch alarms on failures
- 🔄 **Recommended:** Implement circuit breaker pattern
- 🔄 **Recommended:** Add fallback weather data source
- 🔄 **Recommended:** Implement graceful degradation

**Tickets:** MEDIUM PRIORITY - Design circuit breaker implementation



---

### 4.6 Elevation of Privilege Threats

#### T6.1: IAM Policy Misconfiguration
**Description:** Overly permissive IAM policies allow Lambda functions to access unauthorized resources.  
**Impact:** CRITICAL - Could access other AWS services or customer data.  
**Likelihood:** LOW - Policies reviewed and tested.  
**STRIDE Category:** Elevation of Privilege  
**Affected Components:** All Lambda functions  

**Mitigations:**
- ✅ **Implemented:** Least privilege IAM policies
- ✅ **Implemented:** Service-specific execution roles
- ✅ **Implemented:** Resource-level permissions (ARN-based)
- ✅ **Implemented:** No wildcard (*) permissions
- ✅ **Implemented:** IAM policy validation in CDK
- 🔄 **Recommended:** Implement IAM Access Analyzer
- 🔄 **Recommended:** Regular IAM policy audits

**Tickets:** MEDIUM PRIORITY - Enable IAM Access Analyzer

---

#### T6.2: Cognito User Privilege Escalation
**Description:** Regular user gains admin privileges through Cognito misconfiguration.  
**Impact:** MEDIUM - Limited impact (read-only API).  
**Likelihood:** LOW - Simple user model.  
**STRIDE Category:** Elevation of Privilege  
**Affected Components:** Cognito User Pool, API Gateway  

**Mitigations:**
- ✅ **Implemented:** Single user group (no role-based access)
- ✅ **Implemented:** API is read-only (no mutating operations)
- ✅ **Implemented:** Admin user creation via CLI only
- 🔄 **Recommended:** Implement role-based access control (RBAC)
- 🔄 **Recommended:** Add admin-only APIs with separate authorization

**Tickets:** Consider for future multi-tenant scenarios



#### T6.3: Lambda Function Escape
**Description:** Attacker exploits Lambda runtime vulnerability to escape sandbox.  
**Impact:** CRITICAL - Could compromise AWS account.  
**Likelihood:** VERY LOW - AWS-managed runtime.  
**STRIDE Category:** Elevation of Privilege  
**Affected Components:** All Lambda functions  

**Mitigations:**
- ✅ **Implemented:** AWS-managed Lambda runtime (Python 3.12)
- ✅ **Implemented:** Regular runtime updates
- ✅ **Implemented:** No custom runtime layers
- ✅ **Implemented:** Minimal dependencies
- ✅ **Implemented:** Dependency vulnerability scanning (probe results)

**Tickets:** N/A (AWS responsibility)

---

## 5. Additional Security Considerations

### 5.1 Supply Chain Security

**Threats:**
- Compromised npm packages in web UI
- Malicious Python packages in Lambda functions
- Compromised external APIs (Tomorrow.io, Africa's Talking)

**Mitigations:**
- ✅ **Implemented:** Package-lock.json committed (version pinning)
- ✅ **Implemented:** Security scanning (probe results reviewed)
- ✅ **Implemented:** Minimal dependencies
- ✅ **Implemented:** HTTPS for all external API calls
- 🔄 **Recommended:** Implement Dependabot or similar
- 🔄 **Recommended:** Regular dependency audits



### 5.2 Data Retention and Privacy

**Threats:**
- Indefinite storage of PII violates GDPR/privacy laws
- Lack of data deletion mechanism
- No consent management

**Mitigations:**
- 🔄 **Recommended:** Implement data retention policy (e.g., 90 days)
- 🔄 **Recommended:** Add DynamoDB TTL for automatic deletion
- 🔄 **Recommended:** Implement data deletion API
- 🔄 **Recommended:** Add consent management workflow
- 🔄 **Recommended:** Document data processing in privacy policy

**Tickets:** HIGH PRIORITY for GDPR compliance

### 5.3 Incident Response

**Threats:**
- Delayed detection of security incidents
- Lack of incident response procedures
- No security contact information

**Mitigations:**
- ✅ **Implemented:** CloudWatch alarms for errors
- ✅ **Implemented:** SNS notifications for critical issues
- ✅ **Implemented:** CloudTrail logging
- 🔄 **Recommended:** Document incident response procedures
- 🔄 **Recommended:** Implement security monitoring dashboard
- 🔄 **Recommended:** Add security contact in README

**Tickets:** MEDIUM PRIORITY - Create runbook



---

## 6. Threat Summary and Prioritization

### 6.1 Critical Threats (Immediate Action Required)

| ID | Threat | Priority | Status |
|----|--------|----------|--------|
| T2.3 | Prompt Injection in Bedrock | CRITICAL | 🔄 In Progress |
| T4.1 | PII Exposure in CloudWatch Logs | CRITICAL | 🔄 Planned |

### 6.2 High Priority Threats (Next Sprint)

| ID | Threat | Priority | Status |
|----|--------|----------|--------|
| T5.1 | API Gateway Rate Limiting | HIGH | 🔄 Planned |
| T3.1 | Audit Trail Enhancement | HIGH | 🔄 Planned |
| T4.2 | API Key Rotation | HIGH | 🔄 Planned |

### 6.3 Medium Priority Threats (Backlog)

| ID | Threat | Priority | Status |
|----|--------|----------|--------|
| T1.1 | MFA for Admin Users | MEDIUM | 📋 Backlog |
| T4.4 | Security Headers (CSP) | MEDIUM | 📋 Backlog |
| T5.4 | Circuit Breaker Pattern | MEDIUM | 📋 Backlog |
| T6.1 | IAM Access Analyzer | MEDIUM | 📋 Backlog |

### 6.4 Low Priority Threats (Future Consideration)

| ID | Threat | Priority | Status |
|----|--------|----------|--------|
| T2.1 | Message Signing | LOW | 📋 Backlog |
| T4.3 | Field-Level Encryption | LOW | 📋 Backlog |
| T6.2 | RBAC Implementation | LOW | 📋 Backlog |



---

## 7. Security Controls Summary

### 7.1 Implemented Controls

**Authentication & Authorization:**
- ✅ Amazon Cognito User Pool with email verification
- ✅ API Gateway Cognito authorizer
- ✅ IAM roles with least privilege
- ✅ Service-specific execution roles

**Encryption:**
- ✅ TLS 1.2+ for all communications
- ✅ DynamoDB encryption at rest (AWS-managed keys)
- ✅ S3 encryption at rest (SSE-S3)
- ✅ SQS encryption at rest (SSE-SQS)
- ✅ Secrets Manager encryption

**Network Security:**
- ✅ HTTPS-only (CloudFront, API Gateway)
- ✅ No public database access
- ✅ AWS-managed VPC for Lambda

**Logging & Monitoring:**
- ✅ CloudWatch Logs for all Lambda functions
- ✅ CloudTrail for API calls
- ✅ CloudWatch Alarms for errors and throttling
- ✅ SNS notifications for critical issues

**Input Validation:**
- ✅ API Gateway request validation
- ✅ Lambda input validation
- ✅ Structured prompts for Bedrock

**Error Handling:**
- ✅ Dead Letter Queues (3 retries)
- ✅ HTTP timeouts (30 seconds)
- ✅ Lambda timeout limits
- ✅ Graceful error responses



### 7.2 Recommended Controls (Not Yet Implemented)

**High Priority:**
- 🔄 Bedrock Guardrails for prompt injection protection
- 🔄 Automated PII detection/redaction in logs
- 🔄 API Gateway throttling and rate limiting
- 🔄 Automated secret rotation (90 days)
- 🔄 Data retention policy with DynamoDB TTL

**Medium Priority:**
- 🔄 Content Security Policy (CSP) headers
- 🔄 MFA for admin users
- 🔄 IAM Access Analyzer
- 🔄 Circuit breaker pattern for external APIs
- 🔄 Centralized audit log

**Low Priority:**
- 🔄 Message signing/HMAC
- 🔄 Field-level encryption in DynamoDB
- 🔄 Customer-managed KMS keys
- 🔄 Role-based access control (RBAC)
- 🔄 WAF rules for DDoS protection

---

## 8. Assumptions and Dependencies

### 8.1 Assumptions

1. **AWS Security:** AWS services (Lambda, DynamoDB, Cognito, etc.) are secure and properly maintained by AWS.
2. **External APIs:** Tomorrow.io and Africa's Talking maintain secure APIs and protect their infrastructure.
3. **Deployment Environment:** System is deployed in a single AWS account with proper IAM controls.
4. **User Trust:** Admin users with Cognito access are trusted and properly vetted.
5. **Data Source:** Recipient data loaded into DynamoDB is accurate and properly consented.



### 8.2 Dependencies

**External Services:**
- Tomorrow.io Weather API (weather data)
- Africa's Talking SMS API (notifications)
- OpenStreetMap (map tiles, client-side)

**AWS Services:**
- Amazon Bedrock (Claude 3 Sonnet, Knowledge Base)
- Amazon Cognito (authentication)
- Amazon CloudFront (CDN)
- Amazon API Gateway (REST API)
- AWS Lambda (compute)
- Amazon DynamoDB (data storage)
- Amazon SQS (message queuing)
- Amazon S3 (static hosting, documents)
- Amazon OpenSearch Serverless (vector store)
- AWS Secrets Manager (API keys)
- Amazon CloudWatch (monitoring)
- AWS CloudTrail (audit logging)

**Third-Party Libraries:**
- React 18 (web UI)
- AWS Amplify (authentication)
- boto3 (AWS SDK for Python)
- requests (HTTP library)
- React Leaflet (maps)

---

## 9. Out of Scope

The following are explicitly out of scope for this threat model:

1. **AWS Service Security:** Internal security of AWS services (Lambda, DynamoDB, etc.)
2. **Physical Security:** Data center physical security (AWS responsibility)
3. **Network Infrastructure:** AWS network infrastructure security
4. **Client Device Security:** End-user device security (browser, OS)
5. **Social Engineering:** Phishing attacks targeting users
6. **Insider Threats:** Malicious AWS employees (AWS responsibility)



---

## 10. Review and Approval

### 10.1 Review History

| Date | Reviewer | Role | Status | Comments |
|------|----------|------|--------|----------|
| 2025-11-26 | System Team | Authors | Draft | Initial threat model created |
| TBD | Guardian | Security Review | Pending | Awaiting Guardian review |
| TBD | AppSec | Security Review | Pending | Awaiting AppSec review |

### 10.2 Next Review Date

**Scheduled Review:** Q1 2026 or upon significant architecture changes

**Triggers for Review:**
- New features or components added
- Changes to data flow or trust boundaries
- Security incidents or vulnerabilities discovered
- Compliance requirement changes
- External dependency changes

---

## 11. References

### 11.1 Internal Documentation

- [Architecture Documentation](../ARCHITECTURE.md)
- [Deployment Guide](../DEPLOYMENT_GUIDE.md)
- [Security Probe Results](../Probe%20results.csv)
- [README](../README.md)

### 11.2 AWS Security Resources

- [AWS Well-Architected Framework - Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/)
- [AWS Security Best Practices](https://aws.amazon.com/security/best-practices/)
- [Amazon Bedrock Security](https://docs.aws.amazon.com/bedrock/latest/userguide/security.html)
- [AWS Lambda Security](https://docs.aws.amazon.com/lambda/latest/dg/lambda-security.html)



### 11.3 Threat Modeling Resources

- [STRIDE Threat Modeling](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)
- [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling)
- [AWS Threat Modeling Wiki](https://w.amazon.com/bin/view/AWS/Teams/Security/AppSec/ThreatModeling/)

---

## 12. Appendix

### 12.1 Glossary

- **PII:** Personally Identifiable Information
- **STRIDE:** Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege
- **RAG:** Retrieval Augmented Generation
- **JWT:** JSON Web Token
- **DLQ:** Dead Letter Queue
- **IAM:** Identity and Access Management
- **TLS:** Transport Layer Security
- **GDPR:** General Data Protection Regulation
- **HIPAA:** Health Insurance Portability and Accountability Act

### 12.2 Contact Information

**Security Contact:** [Your Team Email]  
**Guardian:** [Guardian Name/Email if assigned]  
**AppSec Reviewer:** [To be assigned]

---

## Document Control

**Document Version:** 1.0  
**Last Updated:** November 26, 2025  
**Next Review:** Q1 2026  
**Classification:** Internal  
**Distribution:** Security Team, Development Team, AppSec

---

*This threat model is a living document and should be updated as the system evolves.*

