# Security Policy

## Reporting Security Issues

If you discover a security vulnerability in this project, please report it by emailing the AWS Security team at aws-security@amazon.com. Please do not create public GitHub issues for security vulnerabilities.

## Security Scanning

This project uses GitHub CodeQL and Dependabot to continuously scan for security vulnerabilities.

### Recent Security Updates

#### February 2026 - fast-xml-parser DoS Vulnerability Fixed

**Issue**: CVE-2024-XXXXX - RangeError DoS Numeric Entities Bug in fast-xml-parser  
**Affected**: `web-ui` dependencies (transitive dependency via AWS Amplify)  
**Status**: ✅ **RESOLVED**  
**Fix**: Updated to fast-xml-parser v5.3.4+ via npm audit fix  
**Action Taken**:
- Updated aws-amplify to v6.16.2
- Updated @aws-amplify/ui-react to v6.14.0
- Added override for fast-xml-parser: "^5.3.4" to prevent regression
- Verified 0 vulnerabilities with npm audit

### Known False Positives

#### MD5/SHA512 Usage in requests Library

**Alert**: "Use of a broken or weak cryptographic hashing algorithm on sensitive data"  
**Location**: `lambda/*/requests/auth.py` (lines 148, 156, 164, 172)  
**Status**: ✅ **Not a vulnerability** - False positive

**Why this is safe:**

1. **We don't use HTTP Digest Authentication**
   - The flagged code is in the `HTTPDigestAuth` class
   - Our application uses modern authentication methods:
     - Tomorrow.io API: API key in URL query parameter
     - Africa's Talking API: API key in HTTP header
   - The vulnerable code path is never executed

2. **MD5/SHA512 required by RFC 2617**
   - HTTP Digest Authentication standard mandates these algorithms
   - This is not a flaw in the requests library
   - All HTTP clients (curl, wget, browsers) have the same code

3. **Not exploitable in our context**
   - MD5/SHA512 used for challenge-response, not password storage
   - All connections use TLS 1.2+ encryption (enforced in our code)
   - Authentication headers are encrypted in transit
   - No user passwords are ever hashed

4. **Industry standard library**
   - `requests` is maintained by the Python Software Foundation
   - Used by millions of applications worldwide
   - Latest version (2.32.5) is what we're using

**Mitigation in place:**
- ✅ TLS 1.2+ enforced for all HTTPS connections (see `TLSAdapter` in Lambda code)
- ✅ No use of HTTP Digest Authentication in our application
- ✅ All API authentication uses modern methods (Bearer tokens, API keys)
- ✅ CodeQL configured to exclude third-party library code from scans

**References:**
- [RFC 2617 - HTTP Authentication](https://www.ietf.org/rfc/rfc2617.txt)
- [requests library security](https://github.com/psf/requests/security)

## Security Best Practices Implemented

### 1. Secure Communication
- TLS 1.2+ minimum enforced for all external API calls
- Custom SSL context configuration in Lambda functions
- No plaintext HTTP connections

### 2. Secrets Management
- API keys stored in AWS Secrets Manager (not in code)
- Environment variables injected by CDK at deployment
- No credentials committed to repository

### 3. Data Protection
- Phone numbers masked in logs (show only first 4 digits)
- No API keys logged
- No PII (coordinates, UUIDs) in CloudWatch Logs
- Message content not logged

### 4. Dependency Management
- All dependencies pinned to latest secure versions
- Dependabot enabled for automated security updates
- Regular security audits of npm and pip packages

### 5. AWS Security
- Lambda functions run with least-privilege IAM roles
- DynamoDB encryption at rest enabled
- SQS queues encrypted
- VPC isolation where applicable

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

We recommend always using the latest version from the `main` branch.

## Security Updates

Security updates are released as soon as possible after a vulnerability is confirmed. Updates are announced via:
- GitHub Security Advisories
- Repository commit messages with `fix:` or `security:` prefix
- Updated SECURITY_FIXES.md (internal documentation, not committed)
