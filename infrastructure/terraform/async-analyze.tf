# AiVI Analyzer Worker Lambda - Terraform Configuration
# Region: eu-north-1
# Account: 173471018175

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "eu-north-1"
}

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------
variable "environment" {
  default = "dev"
}

variable "account_id" {
  default = "173471018175"
}

# -----------------------------------------------------------------------------
# Data Sources - Reference existing resources
# -----------------------------------------------------------------------------
data "aws_sqs_queue" "tasks_queue" {
  name = "aivi-tasks-queue-dev"
}

data "aws_dynamodb_table" "runs_table" {
  name = "aivi-runs-dev"
}

data "aws_s3_bucket" "artifacts_bucket" {
  bucket = "aivi-artifacts-aivi-dev"
}

data "aws_s3_bucket" "prompts_bucket" {
  bucket = "aivi-prompts-aivi-dev"
}

data "aws_secretsmanager_secret" "mistral_key" {
  name = "AVI_MISTRAL_API_KEY"
}

data "aws_lambda_function" "orchestrator" {
  function_name = "aivi-orchestrator-run-dev"
}

# -----------------------------------------------------------------------------
# Update Orchestrator Lambda env vars (Fix #2: Add TASKS_QUEUE_URL)
# -----------------------------------------------------------------------------
resource "aws_lambda_function_event_invoke_config" "orchestrator_config" {
  function_name = data.aws_lambda_function.orchestrator.function_name

  # This doesn't add env vars directly - use aws_lambda_function instead
  # See null_resource below for env var update
}

# Use null_resource to update orchestrator env vars (TASKS_QUEUE_URL)
resource "null_resource" "update_orchestrator_env" {
  triggers = {
    tasks_queue_url = data.aws_sqs_queue.tasks_queue.url
  }

  provisioner "local-exec" {
    command = <<EOF
aws lambda update-function-configuration \
  --function-name aivi-orchestrator-run-dev \
  --environment "Variables={RUNS_TABLE=aivi-runs-dev,SUGGESTIONS_TABLE=aivi-suggestions-dev,HIGHLIGHTS_TABLE=aivi-highlights-dev,ARTIFACTS_BUCKET=aivi-artifacts-aivi-dev,PROMPTS_BUCKET=aivi-prompts-aivi-dev,REWRITE_QUEUE_URL=https://sqs.eu-north-1.amazonaws.com/173471018175/aivi-rewrite-queue-dev,SECRET_NAME=AVI_MISTRAL_API_KEY,ENVIRONMENT=dev,ENABLE_ANALYSIS=true,MISTRAL_MODEL=mistral-large-latest,MISTRAL_FALLBACK_MODEL=magistral-small-latest,TASKS_QUEUE_URL=${data.aws_sqs_queue.tasks_queue.url},WORKER_FUNCTION_NAME=aivi-analyzer-worker-dev,ANCHOR_V2_ENABLED=false,DEFER_DETAILS_ENABLED=false,PARTIAL_RESULTS_ENABLED=true,COMPACT_PROMPT_ENABLED=true,AI_COMPLETION_FIRST_ENABLED=true,AI_SOFT_ANALYSIS_TARGET_MS=90000,AI_MAX_ANALYSIS_LATENCY_MS=420000,AI_LAMBDA_RESERVE_MS=20000}" \
  --region eu-north-1
EOF
  }
}

# -----------------------------------------------------------------------------
# IAM Role for Worker Lambda
# -----------------------------------------------------------------------------
resource "aws_iam_role" "worker_lambda_role" {
  name = "aivi-analyzer-worker-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "worker_lambda_policy" {
  name = "aivi-analyzer-worker-policy-${var.environment}"
  role = aws_iam_role.worker_lambda_role.id

  policy = file("${path.module}/worker-lambda-policy.json")
}

# -----------------------------------------------------------------------------
# Worker Lambda Function
# -----------------------------------------------------------------------------
resource "aws_lambda_function" "analyzer_worker" {
  function_name = "aivi-analyzer-worker-${var.environment}"
  role          = aws_iam_role.worker_lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 600  # 10 minutes for Sonnet processing
  memory_size   = 1024

  # Package will be built by build.sh before terraform apply
  filename         = "${path.module}/../lambda/worker/worker.zip"
  source_code_hash = filebase64sha256("${path.module}/../lambda/worker/worker.zip")

  environment {
    variables = {
      ENVIRONMENT       = var.environment
      RUNS_TABLE        = data.aws_dynamodb_table.runs_table.name
      ARTIFACTS_BUCKET  = data.aws_s3_bucket.artifacts_bucket.id
      PROMPTS_BUCKET    = data.aws_s3_bucket.prompts_bucket.id
      SECRET_NAME       = data.aws_secretsmanager_secret.mistral_key.name
      MISTRAL_MODEL     = "mistral-large-latest"
      MISTRAL_FALLBACK_MODEL = "magistral-small-latest"
      ANCHOR_V2_ENABLED = "false"
      DEFER_DETAILS_ENABLED = "false"
      PARTIAL_RESULTS_ENABLED = "true"
      COMPACT_PROMPT_ENABLED = "true"
      AI_COMPLETION_FIRST_ENABLED = "true"
      AI_SOFT_ANALYSIS_TARGET_MS = "90000"
      AI_MAX_ANALYSIS_LATENCY_MS = "420000"
      AI_LAMBDA_RESERVE_MS = "20000"
      AI_CHECK_CHUNK_SIZE = "8"
      AI_CHUNK_MAX_TOKENS = "1600"
      AI_CHUNK_RETRY_MAX_TOKENS = "2200"
      AI_CHUNK_REQUEST_MAX_ATTEMPTS = "2"
      AI_CHUNK_RETRY_BASE_DELAY_MS = "500"
    }
  }

  tags = {
    Project     = "AiVI"
    Environment = var.environment
    Component   = "analyzer-worker"
  }
}

# -----------------------------------------------------------------------------
# SQS Trigger for Worker Lambda
# -----------------------------------------------------------------------------
resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn = data.aws_sqs_queue.tasks_queue.arn
  function_name    = aws_lambda_function.analyzer_worker.arn
  batch_size       = 1  # Process one job at a time for reliability
  enabled          = true

  # Wait for messages to arrive
  maximum_batching_window_in_seconds = 0
}

# -----------------------------------------------------------------------------
# CloudWatch Alarms
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "worker_errors" {
  alarm_name          = "aivi-analyzer-worker-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300  # 5 minutes
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Triggers when worker Lambda error rate exceeds threshold"

  dimensions = {
    FunctionName = aws_lambda_function.analyzer_worker.function_name
  }

  tags = {
    Project = "AiVI"
  }
}

resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "aivi-tasks-dlq-messages-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Triggers when messages arrive in DLQ"

  dimensions = {
    QueueName = "aivi-tasks-dlq-dev"
  }

  tags = {
    Project = "AiVI"
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------
output "worker_lambda_arn" {
  value = aws_lambda_function.analyzer_worker.arn
}

output "worker_lambda_name" {
  value = aws_lambda_function.analyzer_worker.function_name
}

output "sqs_trigger_uuid" {
  value = aws_lambda_event_source_mapping.sqs_trigger.uuid
}

output "tasks_queue_url" {
  value = data.aws_sqs_queue.tasks_queue.url
}
