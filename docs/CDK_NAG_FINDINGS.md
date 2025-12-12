# CDK Nag Findings and Remediation Plan

**Date:** November 26, 2025  
**CDK Nag Version:** Latest  
**Rule Pack:** AwsSolutionsChecks

---

## Summary

Total findings from CDK Nag scan. These need to be addressed for AWS Samples publication.

### Finding Categories:

1. **S3 Bucket Security** (2 findings)
   - Missing server access logs
   - Missing SSL enforcement policy

2. **SQS Queue Security** (8 findings)
   - Missing SSL enforcement policies (6 queues)
   - Missing DLQs (2 queues: AdviceRequestQueue, NotifyQueue)

3. **IAM Permissions** (Multiple findings)
   - Use of AWS managed policies
   - Wildcard permissions

4. **Lambda Runtime** (Multiple findings)
   - Not using latest runtime version

5. **API Gateway** (Findings expected)
   - Access logging
   - WAF integration

---

## Remediation Plan

### Priority 1: Security Policies (SSL Enforcement)

**S3 Bucket - Enforce SSL:**
```typescript
const bucketPolicy = new iam.PolicyStatement({
  effect: iam.Effect.Deny,
  principals: [new iam.AnyPrincipal()],
  actions: ['s3:*'],
  resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
  conditions: {
    Bool: { 'aws:SecureTransport': 'false' }
  }
});
bucket.addToResourcePolicy(bucketPolicy);
```

**SQS Queues - Enforce SSL:**
```typescript
const queuePolicy = new iam.PolicyStatement({
  effect: iam.Effect.Deny,
  principals: [new iam.AnyPrincipal()],
  actions: ['sqs:*'],
  resources: [queue.queueArn],
  conditions: {
    Bool: { 'aws:SecureTransport': 'false' }
  }
});
queue.addToResourcePolicy(queuePolicy);
```

### Priority 2: Missing DLQs

Add DLQs for:
- AdviceRequestQueue
- NotifyQueue

### Priority 3: S3 Access Logging

Enable server access logging for data bucket.

### Priority 4: IAM Suppressions

Add NagSuppressions for legitimate use cases:
- AWS managed policies (AWSLambdaBasicExecutionRole)
- Wildcard permissions (where necessary)

---

## Status: In Progress

Next step: Apply fixes systematically to each stack.
