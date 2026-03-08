const mockDdbDoc = { send: jest.fn() };
const mockS3 = { send: jest.fn() };
const mockSqs = { send: jest.fn() };
const mockSecrets = { send: jest.fn() };

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn()
}), { virtual: true });
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => mockDdbDoc)
  },
  GetCommand: jest.fn(),
  PutCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  ScanCommand: jest.fn()
}), { virtual: true });
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => mockS3),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn()
}), { virtual: true });
jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn(() => mockSqs),
  SendMessageCommand: jest.fn()
}), { virtual: true });
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => mockSecrets),
  GetSecretValueCommand: jest.fn()
}), { virtual: true });
jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(() => ({ send: jest.fn() })),
  ListEventSourceMappingsCommand: jest.fn()
}), { virtual: true });
jest.mock('./super-admin-mutation-handler', () => ({
  superAdminMutationHandler: jest.fn(async () => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      action: 'manual_credit_adjustment',
      audit_event_id: 'audit_test'
    })
  }))
}));
jest.mock('./super-admin-diagnostics-handler', () => ({
  superAdminDiagnosticsHandler: jest.fn(async () => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      item: {
        account_id: 'acct_123',
        webhook_health: {
          replay_eligible_count: 1
        }
      }
    })
  }))
}));
jest.mock('./account-connect-handler', () => ({
  accountConnectHandler: jest.fn(async () => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      message: 'Site connected successfully.',
      account_state: { account_id: 'acct_123', connection_status: 'connected' }
    })
  })),
  accountDisconnectHandler: jest.fn(async () => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      message: 'Site disconnected successfully.'
    })
  }))
}));

const { handler } = require('./index');
const { superAdminMutationHandler } = require('./super-admin-mutation-handler');
const { superAdminDiagnosticsHandler } = require('./super-admin-diagnostics-handler');
const { accountConnectHandler, accountDisconnectHandler } = require('./account-connect-handler');

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
    process.env.AIVI_ADMIN_BOOTSTRAP_TOKEN = 'bootstrap-test-token';

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

  describe('Account Summary Handler', () => {
    test('should return canonical account summary response', async () => {
      const response = await handler({
        requestContext: {
          requestId: 'test-request-id',
          http: {
            method: 'GET',
            path: '/aivi/v1/account/summary'
          }
        },
        routeKey: 'GET /aivi/v1/account/summary',
        queryStringParameters: {
          site_id: 'site-123',
          blog_id: '5',
          home_url: 'https://example.com/'
        },
        headers: {
          'x-aivi-plugin-version': '1.0.8'
        }
      }, mockContext);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
      expect(body.dashboard_summary).toMatchObject({
        schema_version: 'v1',
        site: {
          site_id: 'site-123',
          blog_id: 5,
          connected_domain: 'example.com'
        }
      });
    });
  });

  describe('Account Connect Handlers', () => {
    test('should route account connect requests through the account-connect handler', async () => {
      const response = await handler({
        requestContext: {
          requestId: 'test-request-id',
          http: {
            method: 'POST',
            path: '/aivi/v1/account/connect'
          }
        },
        routeKey: 'ANY /{proxy+}',
        rawPath: '/aivi/v1/account/connect',
        body: JSON.stringify({
          connection_token: 'signed-token',
          site: { site_id: 'site_123' }
        })
      }, mockContext);

      expect(accountConnectHandler).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({
        ok: true,
        account_state: {
          account_id: 'acct_123'
        }
      });
    });

    test('should route account disconnect requests through the account-connect handler', async () => {
      const response = await handler({
        requestContext: {
          requestId: 'test-request-id',
          http: {
            method: 'POST',
            path: '/aivi/v1/account/disconnect'
          }
        },
        routeKey: 'ANY /{proxy+}',
        rawPath: '/aivi/v1/account/disconnect',
        body: JSON.stringify({
          account_id: 'acct_123',
          site: { site_id: 'site_123' }
        })
      }, mockContext);

      expect(accountDisconnectHandler).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
    });
  });

  describe('Billing Checkout Handler', () => {
    test('should route subscription checkout requests through billing handler', async () => {
      const response = await handler({
        requestContext: {
          requestId: 'test-request-id',
          http: {
            method: 'POST',
            path: '/aivi/v1/billing/checkout/subscription'
          }
        },
        routeKey: 'POST /aivi/v1/billing/checkout/subscription',
        body: JSON.stringify({
          plan_code: 'starter',
          account: { account_id: 'acct_123' },
          site: { site_id: 'site_123' }
        })
      }, mockContext);

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('paypal_not_configured');
    });

    test('should resolve billing checkout through catch-all routes', async () => {
      const response = await handler({
        requestContext: {
          requestId: 'test-request-id',
          http: {
            method: 'POST',
            path: '/aivi/v1/billing/checkout/subscription'
          }
        },
        rawPath: '/aivi/v1/billing/checkout/subscription',
        routeKey: 'ANY /{proxy+}',
        body: JSON.stringify({
          plan_code: 'starter',
          account: { account_id: 'acct_123' },
          site: { site_id: 'site_123' }
        })
      }, mockContext);

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body).error).toBe('paypal_not_configured');
    });

    test('should route PayPal return callbacks through the billing handler', async () => {
      const response = await handler({
        requestContext: {
          requestId: 'test-request-id',
          http: {
            method: 'GET',
            path: '/aivi/v1/billing/return/paypal'
          }
        },
        rawPath: '/aivi/v1/billing/return/paypal',
        routeKey: 'ANY /{proxy+}',
        queryStringParameters: {
          token: 'ORDER123'
        }
      }, mockContext);

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body).error).toBe('paypal_not_configured');
    });
  });

  describe('Super Admin Read Handler', () => {
    test('should route admin account list requests through the super-admin read handler', async () => {
      mockDdbDoc.send.mockResolvedValueOnce({
        Items: [{
          account_id: 'acct_123',
          account_label: 'Acme Media',
          plan_code: 'growth',
          plan_name: 'Growth',
          subscription_status: 'active',
          trial_status: 'none',
          connected: true,
          site: {
            site_id: 'site_123',
            connected_domain: 'example.com'
          },
          credits: {
            included_remaining: 120000,
            topup_remaining: 0,
            total_remaining: 120000
          },
          updated_at: '2026-03-06T12:00:00.000Z'
        }]
      });

      const response = await handler({
        requestContext: {
          requestId: 'test-request-id',
          http: {
            method: 'GET',
            path: '/aivi/v1/admin/accounts'
          }
        },
        routeKey: 'GET /aivi/v1/admin/accounts',
        headers: {
          'x-aivi-admin-token': 'bootstrap-test-token'
        }
      }, mockContext);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
      expect(body.items[0]).toMatchObject({
        account_id: 'acct_123',
        plan_code: 'growth',
        credits_remaining: 120000
      });
    });

    test('should route admin account detail requests through the super-admin read handler', async () => {
      mockDdbDoc.send
        .mockResolvedValueOnce({
          Item: {
            account_id: 'acct_123',
            account_label: 'Acme Media',
            plan_code: 'growth',
            plan_name: 'Growth',
            subscription_status: 'active',
            connected: true,
            site: {
              site_id: 'site_123',
              connected_domain: 'example.com'
            },
            credits: {
              included_remaining: 120000,
              topup_remaining: 25000,
              total_remaining: 145000
            },
            usage: {
              analyses_this_month: 5
            }
          }
        })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] });

      const response = await handler({
        requestContext: {
          requestId: 'test-request-id',
          http: {
            method: 'GET',
            path: '/aivi/v1/admin/accounts/acct_123'
          }
        },
        routeKey: 'GET /aivi/v1/admin/accounts/{account_id}',
        pathParameters: {
          account_id: 'acct_123'
        },
        headers: {
          'x-aivi-admin-token': 'bootstrap-test-token'
        }
      }, mockContext);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
      expect(body.item).toMatchObject({
        account_id: 'acct_123',
        credits: {
          total_remaining: 145000
        }
      });
    });
  });

  describe('Super Admin Mutation Handler', () => {
    test('should route admin mutation requests through the super-admin mutation handler', async () => {
      const response = await handler({
        requestContext: {
          requestId: 'test-request-id',
          http: {
            method: 'POST',
            path: '/aivi/v1/admin/accounts/acct_123/actions'
          }
        },
        routeKey: 'POST /aivi/v1/admin/accounts/{account_id}/actions',
        pathParameters: {
          account_id: 'acct_123'
        },
        headers: {
          'x-aivi-admin-token': 'bootstrap-test-token'
        },
        body: JSON.stringify({
          action: 'manual_credit_adjustment',
          credits_delta: 5000,
          reason: 'Support credit grant'
        })
      }, mockContext);

      expect(superAdminMutationHandler).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({
        ok: true,
        action: 'manual_credit_adjustment',
        audit_event_id: 'audit_test'
      });
    });
  });

  describe('Super Admin Diagnostics Handler', () => {
    test('should route admin diagnostics requests through the diagnostics handler', async () => {
      const response = await handler({
        requestContext: {
          requestId: 'test-request-id',
          http: {
            method: 'GET',
            path: '/aivi/v1/admin/accounts/acct_123/diagnostics'
          }
        },
        routeKey: 'GET /aivi/v1/admin/accounts/{account_id}/diagnostics',
        pathParameters: {
          account_id: 'acct_123'
        },
        headers: {
          'x-aivi-admin-token': 'bootstrap-test-token'
        }
      }, mockContext);

      expect(superAdminDiagnosticsHandler).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({
        ok: true,
        item: {
          account_id: 'acct_123',
          webhook_health: {
            replay_eligible_count: 1
          }
        }
      });
    });

    test('should resolve diagnostics through catch-all routes', async () => {
      const response = await handler({
        requestContext: {
          requestId: 'test-request-id',
          http: {
            method: 'GET',
            path: '/aivi/v1/admin/accounts/acct_123/diagnostics'
          }
        },
        rawPath: '/aivi/v1/admin/accounts/acct_123/diagnostics',
        routeKey: 'ANY /{proxy+}',
        headers: {
          'x-aivi-admin-token': 'bootstrap-test-token'
        }
      }, mockContext);

      expect(superAdminDiagnosticsHandler).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
    });
  });

  describe('PayPal Webhook Handler', () => {
    test('should route PayPal webhook requests through the webhook handler', async () => {
      const response = await handler({
        requestContext: {
          requestId: 'test-request-id',
          http: {
            method: 'POST',
            path: '/aivi/v1/billing/webhook/paypal'
          }
        },
        routeKey: 'POST /aivi/v1/billing/webhook/paypal',
        headers: {},
        body: JSON.stringify({
          id: 'WH-EVENT-123',
          event_type: 'BILLING.SUBSCRIPTION.ACTIVATED'
        })
      }, mockContext);

      expect([400, 503]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(false);
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
