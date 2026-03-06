# Lambda function for orchestrator
data "archive_file" "orchestrator_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/orchestrator"
  output_path = "${path.module}/../lambda/orchestrator.zip"
}

resource "aws_lambda_function" "orchestrator" {
  filename         = data.archive_file.orchestrator_zip.output_path
  source_code_hash = data.archive_file.orchestrator_zip.output_base64sha256
  function_name    = "aivi-orchestrator-run-dev"
  role            = aws_iam_role.orchestrator.arn
  runtime         = "nodejs20.x"
  handler         = "index.handler"
  timeout         = 30

  environment {
    variables = {
      ENVIRONMENT = "dev"
      RUNS_TABLE = aws_dynamodb_table.runs.name
      HIGHLIGHTS_TABLE = aws_dynamodb_table.highlights.name
      SUGGESTIONS_TABLE = aws_dynamodb_table.suggestions.name
      ARTIFACTS_BUCKET = aws_s3_bucket.artifacts.bucket
      PROMPTS_BUCKET = aws_s3_bucket.prompts.bucket
      REWRITE_QUEUE_URL = aws_sqs_queue.rewrite_queue.id
      TASKS_QUEUE_URL = aws_sqs_queue.tasks_queue.id
      WORKER_FUNCTION_NAME = "aivi-analyzer-worker-dev"
      SECRET_NAME = "AVI_MISTRAL_API_KEY"
      ENABLE_ANALYSIS = "false" # Feature flag - start disabled
    }
  }

  tags = {
    Service = "aivi-orchestrator"
  }
}

# Lambda log group
resource "aws_cloudwatch_log_group" "orchestrator" {
  name              = "/aws/lambda/aivi-orchestrator-run-dev"
  retention_in_days = 30
}

# API Gateway Integration
resource "aws_apigatewayv2_integration" "orchestrator" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"

  connection_type           = "INTERNET"
  description              = "Integration with orchestrator Lambda"
  integration_uri          = aws_lambda_function.orchestrator.arn
  payload_format_version   = "2.0"

  timeout_milliseconds = 29000 # 29 seconds, less than Lambda timeout
}

# API Gateway Routes
resource "aws_apigatewayv2_route" "ping" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /ping"
  target    = "integrations/${aws_apigatewayv2_integration.orchestrator.id}"
}

resource "aws_apigatewayv2_route" "analyze" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /analyze"
  target    = "integrations/${aws_apigatewayv2_integration.orchestrator.id}"
}

resource "aws_apigatewayv2_route" "analyze_run" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /aivi/v1/analyze/run"
  target    = "integrations/${aws_apigatewayv2_integration.orchestrator.id}"
}

resource "aws_apigatewayv2_route" "analyze_run_status" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /aivi/v1/analyze/run/{run_id}"
  target    = "integrations/${aws_apigatewayv2_integration.orchestrator.id}"
}

resource "aws_apigatewayv2_route" "analysis_details" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /aivi/v1/analysis/{run_id}/details"
  target    = "integrations/${aws_apigatewayv2_integration.orchestrator.id}"
}

resource "aws_apigatewayv2_route" "analysis_raw" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /aivi/v1/analysis/{run_id}/raw"
  target    = "integrations/${aws_apigatewayv2_integration.orchestrator.id}"
}

resource "aws_apigatewayv2_route" "worker_health" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /aivi/v1/worker/health"
  target    = "integrations/${aws_apigatewayv2_integration.orchestrator.id}"
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.orchestrator.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*/*"
}
