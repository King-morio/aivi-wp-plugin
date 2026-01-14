# Phase 4 Implementation Decisions

## Overview
This document captures key technical decisions for Phase 4 implementation based on the provided AWS configuration.

## AWS Resource Mapping

### Confirmed Resources
| Resource Type | Name | Notes |
|---------------|------|-------|
| AWS Account | 173471018175 | Primary account |
| Region | eu-north-1 | All resources here |
| S3 Prompts | aivi-prompts-aivi-dev | KMS alias: aivi-prompts-aivi-dev |
| S3 Artifacts | aivi-artifacts-aivi-dev | AWS-managed KMS |
| DynamoDB Runs | aivi-runs-dev | Analysis runs metadata |
| DynamoDB Highlights | aivi-highlights-dev | Content highlights |
| DynamoDB Suggestions | aivi-suggestions-dev | Rewrite suggestions |
| Secret | AVI_CLAUDE_API_KEY | Anthropic API key |
| SQS Rewrite | aivi-rewrite-queue-dev | With DLQ |
| SQS Tasks | aivi-tasks-queue-dev | With DLQ |
| API Gateway | avi-orchestrator-api | Test which one works |

## Technical Decisions

### 1. API Gateway Strategy
**Decision**: Test and reuse existing `avi-orchestrator-api`
**Rationale**: 
- Reduces deployment complexity
- Existing infrastructure already in place
- Can delete duplicate if non-functional

**Implementation Steps**:
1. List both API gateways: `aws apigateway get-rest-apis`
2. Test each gateway's `/ping` endpoint
3. Identify working gateway ID
4. Update infrastructure code to use working gateway
5. Delete non-functional gateway if safe

### 2. Lambda Function Architecture
**Decision**: Use new naming convention, reuse existing if practical
**Rationale**: 
- Clear naming: `aivi-<component>-<action>-<env>`
- Can reuse `avi-orchestrator-test` for initial development
- Migration path clear

**Function Breakdown**:
- `aivi-orchestrator-run-dev` - Main orchestrator Lambda
- `aivi-analyzer-agent-dev` - Analysis logic (if separate)
- `aivi-rewrite-worker-dev` - Async rewrite processing
- `aivi-web-lookup-dev` - External link validation

### 3. DynamoDB Schema Design

#### aivi-runs-dev Table
```javascript
{
  run_id: "string (PK)",
  site_id: "string (GSI1)",
  post_id: "number",
  status: "string", // running|completed|failed
  created_at: "number",
  completed_at: "number",
  metadata: {
    model: "string",
    prompt_version: "string",
    tokens_used: "object",
    processing_time_ms: "number"
  }
}
```

#### aivi-highlights-dev Table
```javascript
{
  highlight_id: "string (PK)",
  run_id: "string (GSI1)",
  check_id: "string",
  node_ref: "string",
  text: "string",
  suggestion: "string",
  severity: "string"
}
```

#### aivi-suggestions-dev Table
```javascript
{
  suggestion_id: "string (PK)",
  run_id: "string (GSI1)",
  type: "string", // rewrite|schema|content
  content: "object",
  applied: "boolean",
  created_at: "number"
}
```

### 4. S3 Organization

#### Prompts Bucket (aivi-prompts-aivi-dev)
```
prompts/
├── current/
│   ├── analysis-v1.txt
│   ├── rewrite-v1.txt
│   └── validation-v1.txt
├── archive/
│   ├── analysis-v0.9.txt
│   └── ...
└── metadata/
    ├── prompts.json
    └── versions.json
```

#### Artifacts Bucket (aivi-artifacts-aivi-dev)
```
runs/{run_id}/
├── input.json      # Original request
├── prompt.txt      # Rendered prompt
├── response.json   # Sonnet response
└── result.json     # Processed result

rewrites/{rewrite_id}/
├── original.html
├── suggested.html
└── diff.html

cache/{hash}/
└── result.json     # Cached analysis
```

### 5. Security Implementation

#### IAM Roles Structure
```
aivi-orchestrator-role-dev
├── Read/Write: aivi-* tables
├── Read/Write: aivi-* buckets
├── Receive/Send: aivi-* queues
└── Get secret: AVI_CLAUDE_API_KEY

aivi-worker-role-dev
├── Read/Write: aivi-highlights-dev
├── Read/Write: aivi-suggestions-dev
├── Receive: aivi-rewrite-queue-dev
└── Read: aivi-artifacts-aivi-dev
```

#### Secrets Management
- Use existing `AVI_CLAUDE_API_KEY`
- Implement rotation policy (90 days)
- Log all secret access attempts
- No secrets in code/environment

### 6. Error Handling Strategy

#### Circuit Breaker Pattern
```typescript
class CircuitBreaker {
  private failures = 0;
  private threshold = 5;
  private timeout = 60000; // 1 minute
  
  async call(operation: Function) {
    if (this.failures >= this.threshold) {
      throw new Error('Circuit breaker open');
    }
    
    try {
      const result = await operation();
      this.reset();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
}
```

#### Retry Logic
```typescript
const retryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoff: 'exponential'
};
```

### 7. Monitoring & Observability

#### CloudWatch Metrics
- Custom metrics:
  - AnalysisRequestCount
  - AnalysisSuccessRate
  - AnalysisLatency (p50, p90, p99)
  - TokenConsumption
  - QueueDepth
  
- Alarms:
  - Error rate > 10%
  - P99 latency > 30s
  - Queue depth > 100
  - Lambda errors > 5%

#### Structured Logging
```javascript
{
  "timestamp": "2024-01-14T10:00:00Z",
  "level": "INFO",
  "service": "aivi-orchestrator",
  "run_id": "uuid",
  "site_id": "123",
  "action": "analysis_started",
  "metadata": {
    "word_count": 1500,
    "model": "claude-3-5-sonnet"
  }
}
```

### 8. Performance Optimization

#### Lambda Configuration
```yaml
aivi-orchestrator-run-dev:
  memory: 1024MB
  timeout: 30s
  provisioned_concurrency: 2
  reserved_concurrency: 10

aivi-rewrite-worker-dev:
  memory: 512MB
  timeout: 900s (15 minutes)
  batch_size: 5
```

#### DynamoDB Optimization
- Use GSI for site_id queries
- Enable TTL on old runs (30 days)
- Use on-demand pricing initially
- Enable DAX if needed

### 9. Testing Strategy

#### Local Development
- Use LocalStack for AWS services
- Mock Sonnet responses
- Use DynamoDB Local

#### CI/CD Pipeline
```yaml
test:
  - unit-tests
  - integration-tests (with LocalStack)
  - contract-tests
  - security-scan
  - performance-tests

deploy-dev:
  - terraform-plan
  - terraform-apply
  - smoke-tests

deploy-prod:
  - manual_approval
  - blue_green_deployment
  - health_checks
```

### 10. Migration Path

#### Phase 1: Infrastructure (Days 1-5)
1. Set up Terraform/CDK
2. Deploy Lambda functions
3. Configure API Gateway
4. Test basic connectivity

#### Phase 2: Integration (Days 6-12)
1. Implement Sonnet client
2. Connect to Secrets Manager
3. Test prompt templates
4. Validate responses

#### Phase 3: Analysis (Days 13-24)
1. Implement all checks
2. Test scoring algorithm
3. Optimize performance
4. Full integration testing

#### Phase 4: Async (Days 25-32)
1. Set up SQS queues
2. Implement workers
3. Add rewrite logic
4. Test async flow

#### Phase 5: Production (Days 33-38)
1. Add monitoring
2. Security hardening
3. Performance tuning
4. Documentation

## Risk Mitigation

### Technical Risks
1. **API Gateway Confusion**
   - Mitigation: Test both gateways early
   - Document working ID

2. **Performance Issues**
   - Mitigation: Implement caching
   - Use provisioned concurrency

3. **Cost Overrun**
   - Mitigation: Set budgets
   - Monitor token usage

### Operational Risks
1. **Secret Exposure**
   - Mitigation: No logs with secrets
   - Regular access reviews

2. **Data Loss**
   - Mitigation: Enable backups
   - Version S3 objects

## Next Steps

1. Create infrastructure repository
2. Set up Terraform/CDK
3. Test API Gateway connectivity
4. Begin Lambda development
5. Set up CI/CD pipeline

## Questions for Product Owner

1. Should we reuse `avi-orchestrator-test` Lambda?
2. Any specific requirements for prompt versioning?
3. Budget limits for Phase 4?
4. Required availability SLA?
5. Need for multi-region support?
