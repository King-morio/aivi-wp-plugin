# AiVI Infrastructure

This directory contains the Terraform configuration for deploying the AiVI orchestrator infrastructure.

## Prerequisites

1. Terraform >= 1.0
2. AWS CLI configured with appropriate permissions
3. Node.js 20+ (for Lambda functions)

## Structure

```
infrastructure/
├── terraform/
│   ├── main.tf          # Main infrastructure resources
│   ├── lambda.tf         # Lambda-specific resources
│   ├── variables.tf      # Input variables
│   └── outputs.tf        # Output values
├── lambda/
│   └── orchestrator/
│       ├── package.json  # Node.js dependencies
│       ├── index.js      # Lambda handler
│       └── index.test.js # Unit tests
└── README.md
```

## Deployment Steps

### 1. Initialize Terraform

```bash
cd infrastructure/terraform
terraform init
```

### 2. Review the Plan

```bash
terraform plan
```

### 3. Apply Changes

```bash
terraform apply
```

### 4. Deploy Lambda Code

```bash
cd ../lambda/orchestrator
npm install
npm test
zip -r ../orchestrator.zip .
cd ../../terraform
terraform apply -var="deploy_lambda=true"
```

## Resources Created

- **S3 Buckets**:
  - `aivi-prompts-aivi-dev`: Prompt templates
  - `aivi-artifacts-aivi-dev`: Analysis artifacts

- **DynamoDB Tables**:
  - `aivi-runs-dev`: Analysis runs
  - `aivi-highlights-dev`: Content highlights
  - `aivi-suggestions-dev`: Rewrite suggestions

- **SQS Queues**:
  - `aivi-rewrite-queue-dev`: Rewrite processing
  - `aivi-tasks-queue-dev`: Long-running tasks

- **API Gateway**: HTTP API for orchestrator endpoints

- **Lambda**: `aivi-orchestrator-run-dev` main function

## Testing

### Unit Tests

```bash
cd lambda/orchestrator
npm test
```

### Integration Tests

After deployment:

```bash
# Test ping endpoint
curl https://{api-id}.execute-api.eu-north-1.amazonaws.com/dev/ping

# Test analyze endpoint (will return 503 until Milestone 2)
curl -X POST https://{api-id}.execute-api.eu-north-1.amazonaws.com/dev/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test",
    "content_html": "<p>Test content</p>",
    "site_id": "test-123"
  }'
```

## Monitoring

- CloudWatch Logs: `/aws/lambda/aivi-orchestrator-run-dev`
- CloudWatch Metrics: Custom metrics for latency and error rates
- API Gateway Logs: `/aws/api-gateway/aivi-orchestrator`

## Security

- All resources encrypted at rest
- No secrets in code
- IAM roles follow least privilege principle
- VPC endpoints can be added for enhanced security

## Cost Optimization

- DynamoDB on-demand pricing
- Lambda pay-per-use
- S3 Intelligent-Tiering can be enabled for artifacts

## Troubleshooting

1. **Lambda Timeout**: Check logs for execution time
2. **Permission Errors**: Verify IAM role policies
3. **API Gateway Issues**: Check CORS and integration settings
4. **DynamoDB Errors**: Verify table names and IAM permissions
