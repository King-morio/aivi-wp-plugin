import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import { RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';

export class AiviStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const environment = this.node.tryGetContext('environment') || 'dev';

    // S3 Buckets
    const promptsBucket = new s3.Bucket(this, 'PromptsBucket', {
      bucketName: 'aivi-prompts-aivi-dev',
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kms.Key.fromLookup(this, 'PromptsKmsKey', {
        aliasName: 'aivi-prompts-aivi-dev'
      }),
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      bucketName: 'aivi-artifacts-aivi-dev',
      encryption: s3.BucketEncryption.KMS_MANAGED,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'DeleteOldArtifacts',
          enabled: true,
          expiration: Duration.days(90),
          noncurrentVersionExpiration: Duration.days(30),
        }
      ]
    });

    // DynamoDB Tables
    const runsTable = new dynamodb.Table(this, 'RunsTable', {
      tableName: 'aivi-runs-dev',
      partitionKey: { name: 'run_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',
    });

    // Add GSI for site_id queries
    runsTable.addGlobalSecondaryIndex({
      indexName: 'SiteIndex',
      partitionKey: { name: 'site_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.NUMBER },
    });

    const highlightsTable = new dynamodb.Table(this, 'HighlightsTable', {
      tableName: 'aivi-highlights-dev',
      partitionKey: { name: 'highlight_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    highlightsTable.addGlobalSecondaryIndex({
      indexName: 'RunIndex',
      partitionKey: { name: 'run_id', type: dynamodb.AttributeType.STRING },
    });

    const suggestionsTable = new dynamodb.Table(this, 'SuggestionsTable', {
      tableName: 'aivi-suggestions-dev',
      partitionKey: { name: 'suggestion_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    suggestionsTable.addGlobalSecondaryIndex({
      indexName: 'RunIndex',
      partitionKey: { name: 'run_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.NUMBER },
    });

    // SQS Queues
    const rewriteQueue = new sqs.Queue(this, 'RewriteQueue', {
      queueName: 'aivi-rewrite-queue-dev',
      visibilityTimeout: Duration.minutes(30),
      retentionPeriod: Duration.days(14),
      receiveMessageWaitTime: Duration.seconds(20),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: new sqs.Queue(this, 'RewriteDLQ', {
          queueName: 'aivi-rewrite-dlq-dev',
          retentionPeriod: Duration.days(14),
        }),
      },
    });

    const tasksQueue = new sqs.Queue(this, 'TasksQueue', {
      queueName: 'aivi-tasks-queue-dev',
      visibilityTimeout: Duration.minutes(30),
      retentionPeriod: Duration.days(14),
      receiveMessageWaitTime: Duration.seconds(20),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: new sqs.Queue(this, 'TasksDLQ', {
          queueName: 'aivi-tasks-dlq-dev',
          retentionPeriod: Duration.days(14),
        }),
      },
    });

    // API Gateway
    const api = new apigatewayv2.HttpApi(this, 'AiviApi', {
      apiName: 'aivi-orchestrator-api',
      description: 'AiVI Orchestrator API',
      createDefaultStage: false,
    });

    // CloudWatch Log Group for API Gateway
    new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: '/aws/api-gateway/aivi-orchestrator',
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // API Gateway Stage with logging
    new apigatewayv2.HttpStage(this, 'ApiStage', {
      httpApi: api,
      stageName: 'dev',
      autoDeploy: true,
      // Note: Access logging and throttling configured at API level for HTTP APIs
      detailedMetricsEnabled: true,
    });

    // Lambda Function
    const orchestratorRole = new iam.Role(this, 'OrchestratorRole', {
      roleName: 'aivi-orchestrator-role-dev',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Add policies to the role
    orchestratorRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['arn:aws:logs:*:*:*'],
    }));

    orchestratorRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:PutItem',
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchWriteItem',
      ],
      resources: [
        runsTable.tableArn,
        highlightsTable.tableArn,
        suggestionsTable.tableArn,
        `${runsTable.tableArn}/index/*`,
        `${highlightsTable.tableArn}/index/*`,
        `${suggestionsTable.tableArn}/index/*`,
      ],
    }));

    orchestratorRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
      ],
      resources: [
        `${promptsBucket.bucketArn}/*`,
        `${artifactsBucket.bucketArn}/*`,
      ],
    }));

    orchestratorRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'sqs:SendMessage',
        'sqs:ReceiveMessage',
        'sqs:DeleteMessage',
        'sqs:GetQueueAttributes',
      ],
      resources: [
        rewriteQueue.queueArn,
        tasksQueue.queueArn,
      ],
    }));

    orchestratorRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'secretsmanager:GetSecretValue',
      ],
      resources: [
        'arn:aws:secretsmanager:eu-north-1:173471018175:secret:AVI_MISTRAL_API_KEY*',
      ],
    }));

    orchestratorRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'lambda:ListEventSourceMappings',
      ],
      resources: ['*'],
    }));

    // Lambda Function
    const orchestratorFn = new lambda.Function(this, 'OrchestratorFunction', {
      functionName: 'aivi-orchestrator-run-dev',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      role: orchestratorRole,
      code: lambda.Code.fromAsset('../lambda/orchestrator'),
      timeout: Duration.seconds(30),
      environment: {
        ENVIRONMENT: environment,
        RUNS_TABLE: runsTable.tableName,
        HIGHLIGHTS_TABLE: highlightsTable.tableName,
        SUGGESTIONS_TABLE: suggestionsTable.tableName,
        ARTIFACTS_BUCKET: artifactsBucket.bucketName,
        PROMPTS_BUCKET: promptsBucket.bucketName,
        REWRITE_QUEUE_URL: rewriteQueue.queueUrl,
        TASKS_QUEUE_URL: tasksQueue.queueUrl,
        WORKER_FUNCTION_NAME: 'aivi-analyzer-worker-dev',
        SECRET_NAME: 'AVI_MISTRAL_API_KEY',
        ENABLE_ANALYSIS: 'false', // Feature flag - start disabled
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // CloudWatch Log Group for Lambda
    new logs.LogGroup(this, 'OrchestratorLogGroup', {
      logGroupName: `/aws/lambda/${orchestratorFn.functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // API Gateway Integration
    const integration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'OrchestratorIntegration',
      orchestratorFn,
      {
        payloadFormatVersion: apigatewayv2.PayloadFormatVersion.VERSION_2_0,
      }
    );

    // Add routes
    api.addRoutes({
      path: '/ping',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: integration,
    });

    api.addRoutes({
      path: '/analyze',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: integration,
    });

    api.addRoutes({
      path: '/aivi/v1/worker/health',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: integration,
    });

    // Grant Lambda permission to be invoked by API Gateway
    orchestratorFn.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));

    // Outputs
    new CfnOutput(this, 'ApiEndpointOutput', {
      value: api.apiEndpoint,
      description: 'API Gateway endpoint URL',
    });

    new CfnOutput(this, 'PromptsBucketOutput', {
      value: promptsBucket.bucketName,
      description: 'S3 bucket for prompts',
    });

    new CfnOutput(this, 'ArtifactsBucketOutput', {
      value: artifactsBucket.bucketName,
      description: 'S3 bucket for artifacts',
    });

    new CfnOutput(this, 'RunsTableOutput', {
      value: runsTable.tableName,
      description: 'DynamoDB table for runs',
    });
  }
}
