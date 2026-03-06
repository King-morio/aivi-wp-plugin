// Mock AWS SDK before requiring the handler
const mockDDBDoc = {
  send: jest.fn()
};
const mockS3 = {
  send: jest.fn()
};
const mockSecrets = {
  send: jest.fn()
};

jest.mock('./prompt-manager');
jest.mock('./schema-validator');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => mockDDBDoc)
  },
  PutCommand: jest.fn(),
  UpdateCommand: jest.fn()
}));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => mockS3),
  PutObjectCommand: jest.fn()
}));
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => mockSecrets),
  GetSecretValueCommand: jest.fn()
}));
jest.mock('uuid');

const { getPrompt, buildCheckPromptRegistry } = require('./prompt-manager');
const { validateAnalyzerResponse } = require('./schema-validator');

// Now require the handler after mocks are set up
const {
  analyzeRunHandler,
  performAnalysis,
  buildAnalysisPrompt,
  detectContentType
} = require('./analyze-run-handler');
const { prepareSidebarPayload } = require('./analysis-serializer');
const { stripSidebarPayload, validateSidebarPayload } = require('./sidebar-payload-stripper');

describe('Analyze Run Handler', () => {
  let fetchSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock UUID
    const { v4: uuidv4 } = require('uuid');
    uuidv4.mockReturnValue('test-uuid-123');

    // Mock environment variables
    process.env.RUNS_TABLE = 'test-runs';
    process.env.ARTIFACTS_BUCKET = 'test-bucket';
    process.env.MISTRAL_MODEL = 'mistral-large-latest';
    process.env.INTRO_FOCUS_FACTUALITY_ENABLED = 'true';

    buildCheckPromptRegistry.mockReturnValue({ registry: [], count: 0 });

    // Mock AWS SDK responses
    mockDDBDoc.send.mockResolvedValue({});
    mockS3.send.mockResolvedValue({});
    mockSecrets.send.mockResolvedValue({
      SecretString: JSON.stringify({ MISTRAL_API_KEY: 'test-key' })
    });
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              run_id: 'test-id',
              classification: { primary_type: 'guide', confidence: 0.9 },
              checks: { single_h1: { verdict: 'pass', confidence: 1.0 } },
              highlights: [],
              scores: { AEO: 45, GEO: 38, GLOBAL: 83 },
              schema_suggestions: {},
              audit: {}
            })
          }
        }],
        usage: { prompt_tokens: 1000, completion_tokens: 500 }
      })
    });
  });

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
  });

  describe('detectContentType', () => {
    test('detects how-to content', () => {
      const manifest = {
        title: 'How to Fix a Leaky Faucet',
        plain_text: 'Step 1: Turn off water. Step 2: Remove handle.',
        metadata: { h2_count: 6 }
      };

      expect(detectContentType(manifest)).toBe('howto');
    });

    test('detects news content', () => {
      const manifest = {
        title: 'Breaking News Today',
        plain_text: 'According to reports, the incident occurred yesterday.',
        metadata: { h2_count: 2 }
      };

      expect(detectContentType(manifest)).toBe('news');
    });

    test('detects product content', () => {
      const manifest = {
        title: 'iPhone 15 Review',
        plain_text: 'The price is $999 and you can buy it online.',
        metadata: { h2_count: 3 }
      };

      expect(detectContentType(manifest)).toBe('product');
    });

    test('detects opinion content', () => {
      const manifest = {
        title: 'My Opinion on AI',
        plain_text: 'I think that AI is changing the world. In my opinion...',
        metadata: { h2_count: 2 }
      };

      expect(detectContentType(manifest)).toBe('opinion');
    });

    test('defaults to guide', () => {
      const manifest = {
        title: 'General Information',
        plain_text: 'This is some general content about various topics.',
        metadata: { h2_count: 2 }
      };

      expect(detectContentType(manifest)).toBe('guide');
    });
  });

  describe('buildAnalysisPrompt', () => {
    test('builds prompt with all components', async () => {
      const manifest = {
        title: 'Test Article',
        plain_text: 'Test content here.',
        wordEstimate: 100,
        metadata: { h1_count: 1, h2_count: 2 }
      };

      const checkDefinitions = {
        version: '1.0.0',
        categories: {}
      };

      const prompt = await buildAnalysisPrompt(manifest, ['all'], 'https://example.com', checkDefinitions);

      expect(prompt).toContain('Test Article');
      expect(prompt).toContain('100');
      expect(prompt).toContain('https://example.com');
      expect(prompt).toContain('guide');
      expect(prompt).toContain('CHECK DEFINITIONS');
      expect(prompt).toContain('CHECK QUERY BLOCKS');
    });
  });

  describe('performAnalysis', () => {
    test('performs analysis successfully', async () => {
      // Mock prompt
      getPrompt.mockResolvedValue({
        content: 'Test prompt',
        version: 'v1'
      });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                run_id: 'test-id',
                classification: { primary_type: 'guide', confidence: 0.9 },
                checks: { single_h1: { verdict: 'pass', confidence: 1.0 } },
                highlights: [],
                scores: { AEO: 45, GEO: 38, GLOBAL: 83 },
                schema_suggestions: {},
                audit: {}
              })
            }
          }],
          usage: { prompt_tokens: 1000, completion_tokens: 500 }
        })
      });

      const manifest = {
        title: 'Test',
        plain_text: 'Content',
        wordEstimate: 50,
        metadata: { h1_count: 1, h2_count: 2 }
      };

      const result = await performAnalysis(manifest, ['all'], 'v1', 'https://example.com');

      expect(result).toBeDefined();
      expect(result.run_id).toBe('test-id');
      expect(result.usage.input_tokens).toBe(1000);
    });

    test('handles JSON parse error', async () => {
      getPrompt.mockResolvedValue({
        content: 'Test prompt',
        version: 'v1'
      });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'invalid json'
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        })
      });

      const manifest = {
        title: 'Test',
        plain_text: 'Content',
        wordEstimate: 50,
        metadata: { h1_count: 1, h2_count: 2 }
      };

      await expect(performAnalysis(manifest, ['all'], 'v1', 'https://example.com'))
        .rejects.toThrow('Invalid JSON response from AI analysis');
    });
  });

  describe('analyzeRunHandler', () => {
    test('handles successful analysis run', async () => {
      // Mock all the things
      getPrompt.mockResolvedValue({ content: 'prompt', version: 'v1' });
      validateAnalyzerResponse.mockReturnValue({ valid: true });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                run_id: 'test-id',
                checks: {},
                scores: { AEO: 45, GEO: 38, GLOBAL: 83 }
              })
            }
          }],
          usage: { prompt_tokens: 1000, completion_tokens: 500 }
        })
      });

      const event = {
        body: {
          run_metadata: { site_id: 'test', post_id: '123' },
          manifest: {
            title: 'Test',
            plain_text: 'Content',
            wordEstimate: 50,
            metadata: { h1_count: 1, h2_count: 2, has_jsonld: false },
            jsonld: [],
            nodes: []
          },
          checks_list: ['all']
        }
      };

      const response = await analyzeRunHandler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
      expect(body.run_id).toBe('test-uuid-123');
    });

    test('normalizes highlights using manifest signatures and verified offsets', async () => {
      getPrompt.mockResolvedValue({ content: 'prompt', version: 'v1' });
      validateAnalyzerResponse.mockReturnValue({ valid: true });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                run_id: 'test-id',
                checks: {
                  test_check: {
                    verdict: 'fail',
                    confidence: 0.9,
                    explanation: 'Issue found.',
                    highlights: [
                      {
                        node_ref: 'p:nth-child(1)',
                        signature: 'sig-1',
                        start: 0,
                        end: 4,
                        text: 'beta gamma',
                        snippet: 'beta gamma',
                        message: 'The passage lacks a direct answer for LLM-based answer engines.',
                        type: 'issue'
                      }
                    ],
                    suggestions: []
                  }
                },
                schema_suggestions: {},
                audit: {}
              })
            }
          }],
          usage: { prompt_tokens: 1000, completion_tokens: 500 }
        })
      });

      const event = {
        body: {
          run_metadata: { site_id: 'test', post_id: '123', content_type: 'article' },
          manifest: {
            title: 'Test',
            plain_text: 'Content',
            wordEstimate: 50,
            metadata: { h1_count: 1, h2_count: 2, has_jsonld: false },
            jsonld: [],
            nodes: [],
            block_map: [
              {
                node_ref: 'block-0',
                signature: 'sig-1',
                text: 'Alpha beta gamma delta',
                text_length: 24
              }
            ]
          },
          checks_list: ['all']
        }
      };

      const response = await analyzeRunHandler(event);
      const body = JSON.parse(response.body);
      const highlight = body.result.checks.test_check.highlights[0];

      expect(highlight.node_ref).toBe('block-0');
      expect(highlight.signature).toBe('sig-1');
      expect(highlight.start).toBe(6);
      expect(highlight.end).toBe(16);
      expect(highlight.server_recalculated).toBe(true);
    });

    test('builds anchored highlights from candidate_highlights', async () => {
      getPrompt.mockResolvedValue({ content: 'prompt', version: 'v1' });
      validateAnalyzerResponse.mockReturnValue({ valid: true });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                run_id: 'test-id',
                checks: {
                  test_check: {
                    verdict: 'fail',
                    confidence: 0.9,
                    explanation: 'Issue found.',
                    candidate_highlights: [
                      {
                        signature: 'sig-1',
                        snippet: 'beta gamma',
                        message: 'This sentence is missing a clear, extractable answer.',
                        type: 'issue'
                      }
                    ],
                    suggestions: []
                  }
                },
                schema_suggestions: {},
                audit: {}
              })
            }
          }],
          usage: { prompt_tokens: 1000, completion_tokens: 500 }
        })
      });

      const event = {
        body: {
          run_metadata: { site_id: 'test', post_id: '123', content_type: 'article' },
          manifest: {
            title: 'Test',
            plain_text: 'Content',
            wordEstimate: 50,
            metadata: { h1_count: 1, h2_count: 2, has_jsonld: false },
            jsonld: [],
            nodes: [],
            block_map: [
              {
                node_ref: 'block-0',
                signature: 'sig-1',
                text: 'Alpha beta gamma delta',
                text_length: 24
              }
            ]
          },
          checks_list: ['all']
        }
      };

      const response = await analyzeRunHandler(event);
      const body = JSON.parse(response.body);
      const check = body.result.checks.test_check;
      const highlight = check.highlights[0];

      expect(check.candidate_highlights).toBeUndefined();
      expect(highlight.node_ref).toBe('block-0');
      expect(highlight.start).toBe(6);
      expect(highlight.end).toBe(16);
      expect(highlight.snippet).toBe('beta gamma');
      expect(highlight.message).toBe('This sentence is missing a clear, extractable answer.');
    });

    test('removes highlights that cannot be verified against manifest text', async () => {
      getPrompt.mockResolvedValue({ content: 'prompt', version: 'v1' });
      validateAnalyzerResponse.mockReturnValue({ valid: true });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                run_id: 'test-id',
                checks: {
                  test_check: {
                    verdict: 'fail',
                    confidence: 0.9,
                    explanation: 'Issue found.',
                    highlights: [
                      {
                        node_ref: 'block-0',
                        signature: 'sig-1',
                        start: 0,
                        end: 4,
                        text: 'missing text',
                        snippet: 'missing text',
                        message: 'This reference could not be verified against the content.',
                        type: 'issue'
                      }
                    ],
                    suggestions: []
                  }
                },
                schema_suggestions: {},
                audit: {}
              })
            }
          }],
          usage: { prompt_tokens: 1000, completion_tokens: 500 }
        })
      });

      const event = {
        body: {
          run_metadata: { site_id: 'test', post_id: '123', content_type: 'article' },
          manifest: {
            title: 'Test',
            plain_text: 'Content',
            wordEstimate: 50,
            metadata: { h1_count: 1, h2_count: 2, has_jsonld: false },
            jsonld: [],
            nodes: [],
            block_map: [
              {
                node_ref: 'block-0',
                signature: 'sig-1',
                text: 'Alpha beta gamma delta',
                text_length: 24
              }
            ]
          },
          checks_list: ['all']
        }
      };

      const response = await analyzeRunHandler(event);
      const body = JSON.parse(response.body);
      expect(body.result.checks.test_check.highlights).toHaveLength(0);
      expect(body.result.checks.test_check.failed_candidates).toHaveLength(1);
      expect(body.result.checks.test_check.failed_candidates[0].failure_reason).toBe('offset_resolution_failed');
    });

    test('simulates sidebar payload from test mode analysis', async () => {
      const event = {
        body: {
          test_mode: true,
          run_metadata: { site_id: 'test', post_id: '123', content_type: 'article' },
          manifest: {
            title: 'Test',
            plain_text: 'Alpha beta gamma delta',
            wordEstimate: 50,
            metadata: { h1_count: 1, h2_count: 2, has_jsonld: false },
            jsonld: [],
            nodes: [],
            block_map: [
              {
                node_ref: 'block-0',
                signature: 'sig-1',
                text: 'Alpha beta gamma delta',
                text_length: 24
              }
            ]
          },
          checks_list: ['all']
        }
      };

      const response = await analyzeRunHandler(event);
      const body = JSON.parse(response.body);
      const sidebarPayload = prepareSidebarPayload(body.result, {
        runId: body.run_id,
        scores: body.result.scores
      });

      expect(sidebarPayload.analysis_summary).toBeDefined();
      expect(Array.isArray(sidebarPayload.analysis_summary.categories)).toBe(true);

      const payload = {
        ok: true,
        run_id: body.run_id,
        status: 'success',
        scores: sidebarPayload.scores,
        analysis_summary: sidebarPayload.analysis_summary,
        completed_at: sidebarPayload.completed_at,
        details_token: 'details-test'
      };

      const stripped = stripSidebarPayload(payload, body.run_id);
      const validation = validateSidebarPayload(stripped);
      expect(validation.valid).toBe(true);
    });

    test('handles missing required fields', async () => {
      const event = {
        body: {
          run_metadata: { site_id: 'test' }
          // missing manifest
        }
      };

      const response = await analyzeRunHandler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing required fields');
    });

    test('handles analysis error', async () => {
      getPrompt.mockRejectedValue(new Error('Prompt not found'));

      const event = {
        body: {
          run_metadata: { site_id: 'test', post_id: '123' },
          manifest: {
            title: 'Test',
            plain_text: 'Content',
            wordEstimate: 50,
            metadata: { h1_count: 1, h2_count: 2, has_jsonld: false },
            jsonld: [],
            nodes: []
          },
          checks_list: ['all']
        }
      };

      const response = await analyzeRunHandler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(false);
      expect(body.run_id).toBe('test-uuid-123');
    });
  });
});
