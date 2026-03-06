const mockDdbDoc = { send: jest.fn() };
const mockS3 = { send: jest.fn() };
const mockSqs = { send: jest.fn() };
const mockSecrets = { send: jest.fn() };

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn()
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => mockDdbDoc)
  },
  GetCommand: jest.fn(),
  PutCommand: jest.fn(),
  UpdateCommand: jest.fn()
}));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => mockS3),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn()
}));
jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn(() => mockSqs),
  SendMessageCommand: jest.fn()
}));
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => mockSecrets),
  GetSecretValueCommand: jest.fn()
}));

const { handler } = require('./index');

describe('Orchestrator Lambda', () => {
  const mockEvent = {
    requestContext: {
      requestId: 'test-request-id',
      http: {
        method: 'GET',
        path: '/ping'
      }
    },
    routeKey: 'GET /ping'
  };

  const mockContext = {
    awsRequestId: 'test-request-id',
    callbackWaitsForEmptyEventLoop: false
  };

  beforeEach(() => {
    // Reset environment variables
    process.env.ENVIRONMENT = 'test';
    process.env.RUNS_TABLE = 'aivi-runs-dev';
    process.env.HIGHLIGHTS_TABLE = 'aivi-highlights-dev';
    process.env.SUGGESTIONS_TABLE = 'aivi-suggestions-dev';
    process.env.ARTIFACTS_BUCKET = 'aivi-artifacts-aivi-dev';
    process.env.PROMPTS_BUCKET = 'aivi-prompts-aivi-dev';
    process.env.REWRITE_QUEUE_URL = 'https://sqs.eu-north-1.amazonaws.com/123456789/test-queue';
    process.env.SECRET_NAME = 'AVI_CLAUDE_API_KEY';
    process.env.ENABLE_ANALYSIS = 'false';

    // Clear console.log mocks
    jest.clearAllMocks();

    // Mock console.log to capture logs
    console.log = jest.fn();

    mockDdbDoc.send.mockResolvedValue({});
    mockS3.send.mockResolvedValue({});
    mockSqs.send.mockResolvedValue({});
    mockSecrets.send.mockResolvedValue({ SecretString: JSON.stringify({ ANTHROPIC_API_KEY: 'test' }) });
  });

  describe('Ping Handler', () => {
    test('should return successful ping response', async () => {
      const response = await handler(mockEvent, mockContext);

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        ok: true,
        service: 'aivi-orchestrator',
        version: '1.0.0',
        features: {
          analysis: false
        }
      });
      expect(body.timestamp).toBeDefined();
      expect(body.environment).toBe('test'); // Explicit check
    });
  });

  describe('Analyze Handler', () => {
    const mockAnalyzeEvent = {
      requestContext: {
        requestId: 'test-request-id',
        http: {
          method: 'POST',
          path: '/analyze'
        }
      },
      routeKey: 'POST /analyze',
      body: JSON.stringify({
        title: 'Test Post',
        content_html: '<p>Test content</p>',
        site_id: 'test-site-123',
        post_id: 456,
        content_type: 'post',
        enable_web_lookups: false
      })
    };

    test('should return 202 for queued analysis requests', async () => {
      const response = await handler(mockAnalyzeEvent, mockContext);

      expect(response.statusCode).toBe(202);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        ok: true,
        status: 'queued'
      });
    });

    test('should return 400 for missing required fields', async () => {
      const invalidEvent = {
        ...mockAnalyzeEvent,
        body: JSON.stringify({
          title: 'Test Post'
          // Missing content_html and site_id
        })
      };

      const response = await handler(invalidEvent, mockContext);

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('missing_site_id');
    });

    test('should return 404 for unknown routes', async () => {
      const unknownEvent = {
        ...mockEvent,
        routeKey: 'GET /unknown'
      };

      const response = await handler(unknownEvent, mockContext);

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not found');
    });
  });

  describe('Error Handling', () => {
    test('should handle JSON parsing errors', async () => {
      const invalidEvent = {
        ...mockEvent,
        routeKey: 'POST /analyze',
        body: 'invalid json'
      };

      const response = await handler(invalidEvent, mockContext);

      expect(response.statusCode).toBe(400);
      expect(response.headers['Content-Type']).toBe('application/json');
    });

    test('should include response headers', async () => {
      const response = await handler(mockEvent, mockContext);

      expect(response.headers).toMatchObject({
        'Content-Type': 'application/json',
        'X-Request-ID': 'test-request-id',
        'X-Response-Time': expect.stringMatching(/\d+ms/)
      });
    });
  });
});
