# Known Issues - Phase 4 Infrastructure

## API Gateway Routing Issue

**Status**: Under Investigation

**Description**: 
The API Gateway endpoints return "Healthy Connection" instead of routing to the new Lambda function. Direct Lambda invocation works correctly.

**Affected Endpoints**:
- `https://8lm09nbxuf.execute-api.eu-north-1.amazonaws.com/ping`
- `https://dnvo4w1sca.execute-api.eu-north-1.amazonaws.com/ping`

**Working Alternative**:
Lambda direct invocation via AWS SDK works correctly:
```bash
aws lambda invoke --function-name aivi-orchestrator-run-dev --payload <base64-event> output.json
```

**Root Cause Analysis**:
1. The old `avi-orchestrator-test` Lambda had a `lambda.js` handler that returns "Healthy Connection"
2. API Gateway integrations may be cached or misconfigured
3. The existing API Gateways may have legacy configurations

**Workarounds**:
1. Use Lambda Function URL (requires IAM auth or public access configuration)
2. Use direct Lambda invocation via AWS SDK
3. Create a completely new API Gateway with fresh configuration

**Resolution Plan**:
1. Debug existing API Gateway configurations
2. Consider using REST API instead of HTTP API for more control
3. May need elevated AWS permissions to fully resolve

## Lambda Function URL Forbidden

**Status**: Under Investigation

**Description**:
Lambda Function URL returns 403 Forbidden despite having public access policy.

**URL**: `https://fsaufh2pz5w5zn3vmjwuv5nfbm0wuatf.lambda-url.eu-north-1.on.aws/`

**Workaround**:
Use direct Lambda invocation via AWS SDK.

---

## Deployed Resources

### Working
- **Lambda Function**: `aivi-orchestrator-run-dev`
  - Runtime: nodejs20.x
  - Handler: index.handler
  - Direct invocation: ✅ Working
  - Returns correct JSON response

### Partially Working
- **API Gateway**: `aivi-orchestrator-api-v2` (dnvo4w1sca)
  - Routes configured: /ping, /analyze
  - Integration: Points to correct Lambda
  - Issue: Returns old response

### Legacy (To Clean Up)
- **Lambda Function**: `avi-orchestrator-test` (old code still present)
- **API Gateways**: Two `avi-orchestrator-api` instances

---

## Next Steps

1. Request elevated AWS permissions for debugging
2. Clean up legacy resources
3. Create fresh API Gateway with REST API type
4. Test with proper CloudWatch logging enabled
