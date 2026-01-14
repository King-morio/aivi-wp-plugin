terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "eu-north-1"
  
  default_tags {
    tags = {
      Project     = "AiVI"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

# S3 Buckets
resource "aws_s3_bucket" "prompts" {
  bucket = "aivi-prompts-aivi-dev"
  
  tags = {
    Prompts = "AiVI"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "prompts" {
  bucket = aws_s3_bucket.prompts.id
  
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = "alias/aivi-prompts-aivi-dev"
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_versioning" "prompts" {
  bucket = aws_s3_bucket.prompts.id
  versioning {
    enabled = true
  }
}

resource "aws_s3_bucket" "artifacts" {
  bucket = "aivi-artifacts-aivi-dev"
  
  tags = {
    Artifacts = "AiVI"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning {
    enabled = true
  }
}

# DynamoDB Tables
resource "aws_dynamodb_table" "runs" {
  name           = "aivi-runs-dev"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "run_id"
  
  attribute {
    name = "run_id"
    type = "S"
  }
  
  attribute {
    name = "site_id"
    type = "S"
  }
  
  attribute {
    name = "created_at"
    type = "N"
  }
  
  global_secondary_index {
    name     = "SiteIndex"
    hash_key = "site_id"
    range_key = "created_at"
    projection_type = "ALL"
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
  ttl {
    attribute_name = "ttl"
    expiration_attribute_name = "ttl"
  }
}

resource "aws_dynamodb_table" "highlights" {
  name           = "aivi-highlights-dev"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "highlight_id"
  
  attribute {
    name = "highlight_id"
    type = "S"
  }
  
  attribute {
    name = "run_id"
    type = "S"
  }
  
  global_secondary_index {
    name     = "RunIndex"
    hash_key = "run_id"
    projection_type = "ALL"
  }
  
  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "suggestions" {
  name           = "aivi-suggestions-dev"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "suggestion_id"
  
  attribute {
    name = "suggestion_id"
    type = "S"
  }
  
  attribute {
    name = "run_id"
    type = "S"
  }
  
  attribute {
    name = "created_at"
    type = "N"
  }
  
  global_secondary_index {
    name     = "RunIndex"
    hash_key = "run_id"
    range_key = "created_at"
    projection_type = "ALL"
  }
  
  point_in_time_recovery {
    enabled = true
  }
}

# SQS Queues
resource "aws_sqs_queue" "rewrite_queue" {
  name                      = "aivi-rewrite-queue-dev"
  message_retention_seconds = 1209600 # 14 days
  visibility_timeout_seconds = 1800   # 30 minutes
  delay_seconds             = 0
  receive_wait_time_seconds = 20      # Long polling
  
  tags = {
    Purpose = "rewrite-processing"
  }
}

resource "aws_sqs_queue" "rewrite_dlq" {
  name                      = "aivi-rewrite-dlq-dev"
  message_retention_seconds = 1209600 # 14 days
  
  tags = {
    Purpose = "rewrite-dead-letter"
  }
}

resource "aws_sqs_queue_redrive_allow_policy" "rewrite_queue" {
  queue_url = aws_sqs_queue.rewrite_queue.id
  
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue",
    sourceQueueArns   = [aws_sqs_queue.rewrite_dlq.arn]
  })
}

resource "aws_sqs_queue" "tasks_queue" {
  name                      = "aivi-tasks-queue-dev"
  message_retention_seconds = 1209600 # 14 days
  visibility_timeout_seconds = 1800   # 30 minutes
  delay_seconds             = 0
  receive_wait_time_seconds = 20      # Long polling
  
  tags = {
    Purpose = "task-processing"
  }
}

resource "aws_sqs_queue" "tasks_dlq" {
  name                      = "aivi-tasks-dlq-dev"
  message_retention_seconds = 1209600 # 14 days
  
  tags = {
    Purpose = "task-dead-letter"
  }
}

resource "aws_sqs_queue_redrive_allow_policy" "tasks_queue" {
  queue_url = aws_sqs_queue.tasks_queue.id
  
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue",
    sourceQueueArns   = [aws_sqs_queue.tasks_dlq.arn]
  })
}

# API Gateway
resource "aws_apigatewayv2_api" "main" {
  name          = "aivi-orchestrator-api"
  protocol_type = "HTTP"
  description   = "AiVI Orchestrator API"
  
  tags = {
    Service = "aivi-orchestrator"
  }
}

# API Gateway Stage
resource "aws_apigatewayv2_stage" "dev" {
  api_id = aws_apigatewayv2_api.main.id
  name   = "dev"
  
  auto_deploy = true
  
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId = "$context.requestId"
      ip = "$context.identity.sourceIp"
      caller = "$context.identity.caller"
      user = "$context.identity.user"
      requestTime = "$context.requestTime"
      httpMethod = "$context.httpMethod"
      resourcePath = "$context.resourcePath"
      status = "$context.status"
      protocol = "$context.protocol"
      responseLength = "$context.responseLength"
    })
  }
  
  default_route_settings {
    detailed_metrics_enabled = true
    throttling_burst_limit = 100
    throttling_rate_limit = 50
  }
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/api-gateway/aivi-orchestrator"
  retention_in_days = 30
}

# Lambda IAM Role
resource "aws_iam_role" "orchestrator" {
  name = "aivi-orchestrator-role-dev"
  
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
  
  tags = {
    Purpose = "orchestrator-lambda"
  }
}

resource "aws_iam_role_policy" "orchestrator" {
  name = "aivi-orchestrator-policy-dev"
  role = aws_iam_role.orchestrator.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.runs.arn,
          aws_dynamodb_table.highlights.arn,
          aws_dynamodb_table.suggestions.arn,
          "${aws_dynamodb_table.runs.arn}/index/*",
          "${aws_dynamodb_table.highlights.arn}/index/*",
          "${aws_dynamodb_table.suggestions.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "${aws_s3_bucket.prompts.arn}/*",
          "${aws_s3_bucket.artifacts.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          aws_sqs_queue.rewrite_queue.arn,
          aws_sqs_queue.tasks_queue.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:eu-north-1:173471018175:secret:AVI_CLAUDE_API_KEY*"
      }
    ]
  })
}

# Outputs
output "api_gateway_endpoint" {
  value = aws_apigatewayv2_api.main.api_endpoint
}

output "prompts_bucket" {
  value = aws_s3_bucket.prompts.bucket
}

output "artifacts_bucket" {
  value = aws_s3_bucket.artifacts.bucket
}

output "runs_table" {
  value = aws_dynamodb_table.runs.name
}

output "orchestrator_role" {
  value = aws_iam_role.orchestrator.arn
}
