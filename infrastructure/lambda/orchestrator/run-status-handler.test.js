const mockDdb = { send: jest.fn() };
const mockDdbDoc = { send: jest.fn() };
const mockS3 = { send: jest.fn() };
const mockUnmarshall = jest.fn();
const mockPrepareSidebarPayload = jest.fn();
const mockGenerateSessionToken = jest.fn();
const mockEmitTelemetry = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => mockDdb),
  GetItemCommand: jest.fn((input) => input)
}), { virtual: true });

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => mockDdbDoc)
  },
  UpdateCommand: jest.fn((input) => input)
}), { virtual: true });

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => mockS3),
  GetObjectCommand: jest.fn((input) => input)
}), { virtual: true });

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async () => 'https://example.com/presigned')
}), { virtual: true });

jest.mock('@aws-sdk/util-dynamodb', () => ({
  unmarshall: (...args) => mockUnmarshall(...args)
}), { virtual: true });

jest.mock('./analysis-serializer', () => ({
  prepareSidebarPayload: (...args) => mockPrepareSidebarPayload(...args),
  generateAbortedSummary: jest.fn(),
  mapErrorToAbortReason: jest.fn(() => 'analysis_failed')
}));

const analysisSerializer = require('./analysis-serializer');

jest.mock('./analysis-details-handler', () => ({
  generateSessionToken: (...args) => mockGenerateSessionToken(...args)
}));

jest.mock('./telemetry-emitter', () => ({
  emitTelemetry: (...args) => mockEmitTelemetry(...args)
}));

const { runStatusHandler } = require('./run-status-handler');

describe('runStatusHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RUNS_TABLE = 'aivi-runs-dev';

    mockDdb.send.mockResolvedValue({ Item: { run_id: { S: 'run-123' } } });
    mockDdbDoc.send.mockResolvedValue({});
    mockS3.send.mockResolvedValue({
      Body: {
        transformToString: async () => JSON.stringify({
          run_id: 'run-123',
          scores: { AEO: 12, GEO: 8, GLOBAL: 20 },
          partial_context: {
            expected_ai_checks: 30,
            returned_ai_checks: 12,
            missing_ai_checks: 18,
            missing_ai_check_ids: ['lists_tables_presence', 'named_entities_detected']
          },
          audit: {
            partial_context: {
              expected_ai_checks: 30,
              returned_ai_checks: 12,
              missing_ai_checks: 18,
              missing_ai_check_ids: ['lists_tables_presence', 'named_entities_detected']
            }
          }
        })
      }
    });
    mockGenerateSessionToken.mockResolvedValue('details-token');
    mockPrepareSidebarPayload.mockReturnValue({
      ok: true,
      run_id: 'run-123',
      status: 'success',
      scores: { AEO: 12, GEO: 8, GLOBAL: 20 },
      analysis_summary: {
        version: '1.2.0',
        run_id: 'run-123',
        categories: []
      },
      completed_at: '2026-03-11T12:00:00.000Z'
    });
  });

  test('surfaces sanitized AI coverage summary on successful runs', async () => {
    mockUnmarshall.mockReturnValue({
      run_id: 'run-123',
      status: 'success',
      result_s3: 'runs/run-123/result.json',
      site_id: 'site-123',
      scores: { AEO: 12, GEO: 8, GLOBAL: 20 },
      created_at: '2026-03-11T11:58:00.000Z',
      completed_at: '2026-03-11T12:00:00.000Z'
    });

    const response = await runStatusHandler({
      pathParameters: {
        run_id: 'run-123'
      }
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.status).toBe('success');
    expect(body.partial).toEqual({
      expected_ai_checks: 30,
      returned_ai_checks: 12,
      missing_ai_checks: 18,
      missing_ai_check_ids: ['lists_tables_presence', 'named_entities_detected']
    });
    expect(body.analysis_summary).toEqual({
      version: '1.2.0',
      run_id: 'run-123',
      categories: []
    });
    expect(body.details_token).toBe('details-token');
  });

  test('normalizes legacy nested score payloads into the flat sidebar contract', async () => {
    mockUnmarshall.mockReturnValue({
      run_id: 'run-123',
      status: 'success',
      result_s3: 'runs/run-123/result.json',
      site_id: 'site-123',
      created_at: '2026-03-11T11:58:00.000Z',
      completed_at: '2026-03-11T12:00:00.000Z'
    });
    mockS3.send.mockResolvedValueOnce({
      Body: {
        transformToString: async () => JSON.stringify({
          run_id: 'run-123',
          scores: {
            global: {
              score: 21,
              AEO: { score: 13 },
              GEO: { score: 8 }
            },
            categories: {}
          }
        })
      }
    });
    mockPrepareSidebarPayload.mockReturnValueOnce({
      ok: true,
      run_id: 'run-123',
      status: 'success',
      scores: {
        global: {
          score: 21,
          AEO: { score: 13 },
          GEO: { score: 8 }
        },
        categories: {}
      },
      analysis_summary: {
        version: '1.2.0',
        run_id: 'run-123',
        categories: []
      },
      completed_at: '2026-03-11T12:00:00.000Z'
    });

    const response = await runStatusHandler({
      pathParameters: {
        run_id: 'run-123'
      }
    });

    const body = JSON.parse(response.body);
    expect(body.scores).toEqual({
      AEO: 13,
      GEO: 8,
      GLOBAL: 21
    });
  });

  test('returns superseded when a newer run is active for the same article', async () => {
    mockDdb.send
      .mockResolvedValueOnce({ Item: { run_id: { S: 'run-123' } } })
      .mockResolvedValueOnce({ Item: { run_id: { S: 'article_latest::site-123::88' } } });
    mockUnmarshall
      .mockReturnValueOnce({
        run_id: 'run-123',
        status: 'success',
        site_id: 'site-123',
        post_id: '88',
        article_key: 'site-123::88',
        created_at: '2026-03-11T11:58:00.000Z'
      })
      .mockReturnValueOnce({
        run_id: 'article_latest::site-123::88',
        latest_run_id: 'run-456',
        article_key: 'site-123::88'
      });

    const response = await runStatusHandler({
      pathParameters: {
        run_id: 'run-123'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('superseded');
    expect(body.run_id).toBe('run-123');
    expect(body.superseded_by_run_id).toBe('run-456');
    expect(body.message).toMatch(/newer analysis run/i);
    expect(mockPrepareSidebarPayload).not.toHaveBeenCalled();
  });

  test('relays reliability abort summary message for failed runs without exposing partials', async () => {
    mockUnmarshall.mockReturnValue({
      run_id: 'run-123',
      status: 'failed',
      error: 'analysis_reliability_abort',
      error_message: 'analysis aborted after reliability threshold exceeded',
      abort: {
        reason: 'failed_chunk_count_exceeded'
      },
      created_at: '2026-04-01T09:11:50.000Z',
      completed_at: '2026-04-01T09:15:22.000Z'
    });
    analysisSerializer.mapErrorToAbortReason.mockReturnValueOnce('reliability_threshold_exceeded');
    analysisSerializer.generateAbortedSummary.mockReturnValueOnce({
      version: '1.2.0',
      run_id: 'run-123',
      status: 'aborted',
      reason: 'reliability_threshold_exceeded',
      message: 'We stopped this analysis because the result quality dropped below our reliability threshold. Please run it again to get a cleaner result.',
      trace_id: 'trace-run-123'
    });

    const response = await runStatusHandler({
      pathParameters: {
        run_id: 'run-123'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ok).toBe(false);
    expect(body.status).toBe('failed');
    expect(body.error).toBe('reliability_threshold_exceeded');
    expect(body.message).toBe('We stopped this analysis because the result quality dropped below our reliability threshold. Please run it again to get a cleaner result.');
    expect(body.analysis_summary.status).toBe('aborted');
    expect(analysisSerializer.mapErrorToAbortReason).toHaveBeenCalledWith(
      'failed_chunk_count_exceeded',
      'analysis aborted after reliability threshold exceeded'
    );
  });
});
