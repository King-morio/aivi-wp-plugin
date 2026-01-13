# Phase 4: AiVI Orchestrator & Agents - Milestone Plan

## Overview

Phase 4 implements the AI Orchestrator and Agents that power the semantic analysis capabilities of AiVI. This phase builds the backend infrastructure that receives preflight-validated content from WordPress, performs AI analysis using Anthropic's Sonnet model, and returns structured results.

### Technical Choices

**Language**: Node.js with TypeScript
- Rationale: Native AWS SDK support, better async handling, existing team expertise, faster cold starts in Lambda

**Architecture**:
- **Orchestrator**: AWS Lambda (fast autoscaling, low cost for sporadic usage)
- **Aggregator**: ECS Fargate (for longer-running analysis tasks)
- **Persistence**: DynamoDB for metadata, S3 for raw data
- **Queue**: SQS for async operations
- **Cache**: ElastiCache for token counters

---

## Milestone 1: Core Infrastructure & API Gateway

**Goal**: Establish foundational AWS infrastructure and API endpoints

### Deliverables
1. **Infrastructure as Code** (Terraform/CDK)
   - Lambda functions for orchestrator
   - API Gateway configuration
   - DynamoDB tables (PLACEHOLDER: need table names)
   - S3 buckets (PLACEHOLDER: need bucket names)
   - IAM roles and policies

2. **Core Orchestrator Service**
   - `/analyze` endpoint (replaces skeleton)
   - `/ping` endpoint (health check)
   - Request validation and routing
   - Error handling framework

3. **Database Schema**
   - `AiVI_Runs` table (PLACEHOLDER: confirm name)
   - `AiVI_Highlights` table (PLACEHOLDER: confirm name)
   - `AiVI_Suggestions` table (PLACEHOLDER: confirm name)

4. **Initial Tests**
   - Unit tests for core logic
   - Integration tests for API endpoints
   - Contract tests against schema

### Acceptance Criteria
- [ ] API Gateway deployed and accessible
- [ ] `/ping` returns `{ ok: true, service: "aivi-orchestrator" }`
- [ ] `/analyze` accepts preflight payload and returns 503 (not implemented yet)
- [ ] All DynamoDB tables created with proper indexes
- [ ] S3 buckets created with encryption
- [ ] CI/CD pipeline deploying to dev environment

### Owner(s)
- Backend Engineer (Primary)
- DevOps Engineer (Infrastructure)

### Branch/PR Convention
- Branch: `feature/phase4-m1-infrastructure`
- PR: `feat(phase4): core infrastructure and API gateway`

### Estimated Effort
- 5 days

### CI Jobs Required
1. `terraform-plan` - Validate infrastructure changes
2. `terraform-apply` - Deploy to dev (manual approval for prod)
3. `unit-tests` - Node.js/TypeScript unit tests
4. `integration-tests` - API endpoint tests
5. `security-scan` - Check IAM policies, secrets

---

## Milestone 2: Anthropic Integration & Prompt Management

**Goal**: Integrate Sonnet API and implement prompt versioning system

### Deliverables
1. **Anthropic Service**
   - Secure API client with retry logic
   - Token counting and quota management
   - Rate limiting implementation
   - Error handling for API failures

2. **Prompt Management**
   - S3 prompt templates (`s3://PLACEHOLDER-prompts/prompts/`)
   - Prompt versioning in DynamoDB
   - Template rendering engine
   - A/B testing framework for prompts

3. **Secrets Management**
   - Anthropic API key in Secrets Manager (PLACEHOLDER: path)
   - Rotation policy implementation
   - Access logging for secret access

4. **Schema Validation**
   - `analyzer_aggregator_schema.json`
   - Response validation middleware
   - Schema versioning strategy

### Acceptance Criteria
- [ ] Successful Sonnet API call with test prompt
- [ ] Prompt templates stored in S3 and versioned
- [ ] API key securely accessed from Secrets Manager
- [ ] All responses validate against schema
- [ ] Token counting accurate within 5% tolerance
- [ ] Rate limiting prevents quota exceeded

### Owner(s)
- Backend Engineer (Primary)
- ML Engineer (Prompts)

### Branch/PR Convention
- Branch: `feature/phase4-m2-anthropic-integration`
- PR: `feat(phase4): Anthropic Sonnet integration and prompt management`

### Estimated Effort
- 7 days

### CI Jobs Required
1. `unit-tests` - Include Anthropic client tests (mocked)
2. `schema-validation` - Validate all schemas
3. `security-scan` - Check for hardcoded secrets
4. `prompt-tests` - Validate prompt templates

### JSON Contracts

**Input Contract** (from WordPress):
```json
{
  "title": "string",
  "content_html": "string",
  "post_id": "number",
  "content_type": "post|page",
  "site_id": "string",
  "enable_web_lookups": "boolean"
}
```

**Output Contract** (aggregator schema):
```json
{
  "$schema": "./analyzer_aggregator_schema.json",
  "run_id": "uuid",
  "scores": {
    "AEO": "number (0-55)",
    "GEO": "number (0-45)"
  },
  "checks": [{
    "id": "string",
    "title": "string",
    "verdict": "pass|partial|fail",
    "confidence": "number (0-1)",
    "explanation": "string",
    "highlights": [{
      "node_ref": "string",
      "text": "string",
      "suggestion": "string"
    }]
  }],
  "schema_suggestions": {
    "faq_jsonld": "object"
  },
  "metadata": {
    "model": "claude-3-5-sonnet-20241022",
    "prompt_version": "string",
    "tokens_used": "number",
    "processing_time_ms": "number"
  }
}
```

---

## Milestone 3: Analysis Engine & Check Implementations

**Goal**: Implement the core analysis engine and all AEO/GEO checks

### Deliverables
1. **Analysis Orchestrator**
   - Content preprocessing pipeline
   - Check execution engine
   - Confidence scoring algorithm
   - Highlight generation logic

2. **AEO Checks** (Answer Engine Optimization)
   - Direct answer detection
   - FAQ structure validation
   - Entity recognition and markup
   - Question-answer pairing
   - Schema.org validation

3. **GEO Checks** (Generative Engine Optimization)
   - Content comprehensiveness
   - Source attribution
   - Factual accuracy checks
   - E-E-A-T signals
   - Natural language patterns

4. **Aggregator Service**
   - Combine all check results
   - Calculate final scores
   - Generate suggestions
   - Create schema suggestions

### Acceptance Criteria
- [ ] All 15 AEO checks implemented and passing tests
- [ ] All 12 GEO checks implemented and passing tests
- [ ] Scores calculated correctly (AEO max 55, GEO max 45)
- [ ] Highlights generated with proper node references
- [ ] FAQ JSON-LD schema valid and complete
- [ ] Processing time < 30 seconds for 10k word content

### Owner(s)
- Backend Engineer (Primary)
- ML Engineer (Algorithms)

### Branch/PR Convention
- Branch: `feature/phase4-m3-analysis-engine`
- PR: `feat(phase4): analysis engine and AEO/GEO check implementations`

### Estimated Effort
- 12 days

### CI Jobs Required
1. `unit-tests` - All check implementations
2. `integration-tests` - End-to-end analysis
3. `performance-tests` - Ensure < 30s runtime
4. `accuracy-tests` - Validate scoring on test dataset

### Database Operations
```javascript
// Create run
DynamoDB.put(AiVI_Runs, {
  run_id: uuid,
  site_id: string,
  post_id: number,
  status: "running|completed|failed",
  created_at: timestamp,
  metadata: object
});

// Store highlights
DynamoDB.batchWrite(AiVI_Highlights, [{
  run_id: uuid,
  check_id: string,
  node_ref: string,
  text: string,
  suggestion: string
}]);

// Store suggestions
DynamoDB.put(AiVI_Suggestions, {
  run_id: uuid,
  type: "rewrite|schema|content",
  content: object,
  applied: boolean
});
```

---

## Milestone 4: Async Operations & Rewrite Suggestions

**Goal**: Implement async processing for long-running tasks and rewrite suggestions

### Deliverables
1. **SQS Integration**
   - Rewrite queue (PLACEHOLDER: queue name)
   - Long-running task queue
   - Dead letter queue configuration
   - Visibility timeout handling

2. **Rewrite Service**
   - Content rewriting engine
   - Suggestion generation
   - Version control for rewrites
   - Manual application workflow

3. **ECS Fargate Service**
   - Task definition for heavy processing
   - Auto-scaling configuration
   - VPC networking setup
   - Container monitoring

4. **Web Lookup Service**
   - External link validation
   - Fact-checking integration
   - Source verification
   - Rate limiting for external calls

### Acceptance Criteria
- [ ] Rewrite suggestions generated and stored
- [ ] Long-running analysis (>30s) moved to async
- [ ] Web lookups performed when enabled
- [ ] SQS queues processing without dead letters
- [ ] Fargate tasks scale based on queue depth
- [ ] All rewrites require manual approval

### Owner(s)
- Backend Engineer (Primary)
- DevOps Engineer (ECS)

### Branch/PR Convention
- Branch: `feature/phase4-m4-async-operations`
- PR: `feat(phase4): async operations and rewrite suggestions`

### Estimated Effort
- 8 days

### CI Jobs Required
1. `unit-tests` - Async service tests
2. `queue-tests` - SQS integration tests
3. `ecs-tests` - Fargate task tests
4. `e2e-tests` - Full async workflow

### S3 Structure
```
s3://PLACEHOLDER-artifacts/
├── runs/
│   └── {run_id}/
│       ├── input.json
│       ├── prompt.txt
│       ├── response.json
│       └── result.json
├── rewrites/
│   └── {rewrite_id}/
│       ├── original.html
│       ├── suggested.html
│       └── diff.html
└── cache/
    └── {hash}/
        └── result.json
```

---

## Milestone 5: Production Readiness & Monitoring

**Goal**: Hardening, monitoring, and production deployment

### Deliverables
1. **Observability**
   - CloudWatch dashboards
   - Custom metrics (latency, error rates, tokens)
   - Alerting configuration
   - Log aggregation and analysis

2. **Security Hardening**
   - VPC endpoints for private access
   - WAF rules for API Gateway
   - Certificate rotation
   - Audit logging

3. **Performance Optimization**
   - Lambda provisioned concurrency
   - DynamoDB auto-scaling
   - CloudFront CDN for static assets
   - Response caching

4. **Documentation & Runbooks**
   - API documentation
   - Troubleshooting guides
   - Kill switch procedures
   - Migration guide

### Acceptance Criteria
- [ ] P99 latency < 5 seconds for preflight
- [ ] P99 latency < 30 seconds for analysis
- [ ] 99.9% uptime SLA met
- [ ] All security scans pass
- [ ] Monitoring alerts functional
- [ ] Runbooks tested and validated

### Owner(s)
- DevOps Engineer (Primary)
- Backend Engineer (Support)

### Branch/PR Convention
- Branch: `feature/phase4-m5-production-readiness`
- PR: `feat(phase4): production readiness and monitoring`

### Estimated Effort
- 6 days

### CI Jobs Required
1. `security-scan` - Full security assessment
2. `performance-tests` - Load testing
3. `chaos-tests` - Failure injection
4. `docs-tests` - Documentation validation

---

## Testing Strategy

### Unit Tests
- Mock all AWS services
- Test individual check logic
- Validate schema compliance
- Cover edge cases and error paths

### Integration Tests
- Test against local DynamoDB
- Validate API contracts
- Test SQS message flow
- Verify end-to-end workflows

### Contract Tests
- Validate against WordPress plugin
- Ensure backward compatibility
- Test schema evolution
- Verify error responses

### Mocking Sonnet for CI
```typescript
// Mock Anthropic client
const mockSonnet = {
  messages: {
    create: jest.fn().mockResolvedValue({
      content: [{ text: JSON.stringify(mockAnalysisResult) }],
      usage: { input_tokens: 1000, output_tokens: 500 }
    })
  }
};
```

---

## Security Checklist

### IAM Roles
- [ ] Least privilege principle applied
- [ ] No wildcard permissions
- [ ] Role assumption for cross-service access
- [ ] MFA required for privileged actions

### Secrets Management
- [ ] No secrets in code or config
- [ ] API keys in Secrets Manager
- [ ] Automatic rotation enabled
- [ ] Access logged and monitored

### Data Protection
- [ ] S3 encryption at rest (SSE-KMS)
- [ ] DynamoDB encryption enabled
- [ ] TLS 1.2+ in transit
- [ ] Sensitive data redaction in logs

### Network Security
- [ ] VPC endpoints for AWS services
- [ ] Security groups restrict traffic
- [ ] WAF rules for common attacks
- [ ] DDoS protection enabled

---

## Migration Plan

### Phase 1: Shadow Mode
1. Deploy orchestrator alongside existing skeleton
2. Route 10% of traffic to new endpoint
3. Compare responses and validate
4. Monitor for errors and performance

### Phase 2: Gradual Rollout
1. Increase traffic to 50%
2. Enable feature flag in WordPress
3. Monitor error rates closely
4. Prepare rollback procedure

### Phase 3: Full Cutover
1. Route 100% to new endpoint
2. Remove old skeleton code
3. Update documentation
4. Communicate to stakeholders

### Rollback Procedure
```bash
# 1. Disable feature flag
aws lambda update-function-configuration \
  --function-name aivi-orchestrator \
  --environment Variables={ENABLE_ANALYSIS=false}

# 2. Route traffic back to skeleton
aws apigateway update-stage \
  --rest-api-id xxx \
  --stage-name prod \
  --patch-operations op=replace,path=/variables/endpoint,value=/skeleton

# 3. Monitor and verify
aws logs tail /aws/lambda/aivi-orchestrator --follow
```

---

## Kill Switch & Observability

### Kill Switches
1. **Feature Flag**: `ENABLE_ANALYSIS=false`
2. **Circuit Breaker**: Auto-disable on >50% errors
3. **Manual Override**: Lambda environment variable
4. **Quota Limit**: Disable when tokens exhausted

### Key Metrics
- Request latency (p50, p90, p99)
- Error rate by endpoint
- Token consumption rate
- Queue depth
- Lambda concurrency
- DynamoDB throttling

### Dashboards
- **Service Health**: Overall system status
- **Performance**: Latency and throughput
- **Cost**: Token usage and AWS spend
- **Business**: Analyses completed, success rate

---

## Branch Creation Checklist

### Required Branches
1. `feature/phase4-m1-infrastructure`
2. `feature/phase4-m2-anthropic-integration`
3. `feature/phase4-m3-analysis-engine`
4. `feature/phase4-m4-async-operations`
5. `feature/phase4-m5-production-readiness`
6. `release/phase4-v1.0` (for final integration)

### PR Templates
```markdown
## Description
[What this PR implements]

## AWS Changes
- [ ] IAM roles updated
- [ ] DynamoDB tables created
- [ ] Lambda functions deployed
- [ ] S3 buckets configured

## Testing
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Manual testing completed

## Security
- [ ] No secrets committed
- [ ] IAM permissions reviewed
- [ ] Security scan passed
```

---

## ⚠️ BLOCKERS - Missing AWS Configuration

The following must be provided before implementation:

1. **S3 Buckets**
   - Prompts bucket: `PLACEHOLDER`
   - Artifacts bucket: `PLACEHOLDER`

2. **DynamoDB Tables**
   - Runs table: `PLACEHOLDER`
   - Highlights table: `PLACEHOLDER`
   - Suggestions table: `PLACEHOLDER`

3. **Secrets Manager**
   - Anthropic key path: `PLACEHOLDER`

4. **SQS Queues**
   - Rewrite queue: `PLACEHOLDER`
   - Tasks queue: `PLACEHOLDER`

5. **Infrastructure**
   - AWS Account ID: `PLACEHOLDER`
   - Region: `PLACEHOLDER`
   - API Gateway domain: `PLACEHOLDER`

**DO NOT PROCEED** with actual infrastructure deployment until these values are provided by the product owner. Use placeholders for development and testing only.
