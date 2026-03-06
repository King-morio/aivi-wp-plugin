const { scoreAnalysisResults } = require('./scoring-engine');
const { GOLD_DATASETS, scoreGoldDataset } = require('../../../tools/verify_scoring');

describe('scoreAnalysisResults', () => {
  test('returns normalized perfect scores for passing checks', () => {
    const perfectMockResult = {
      checks: {
        direct_answer_first_120: { verdict: 'pass', confidence: 1.0 },
        answer_sentence_concise: { verdict: 'pass', confidence: 1.0 },
        question_answer_alignment: { verdict: 'pass', confidence: 1.0 },
        clear_answer_formatting: { verdict: 'pass', confidence: 1.0 },
        faq_structure_opportunity: { verdict: 'pass', confidence: 1.0 },
        single_h1: { verdict: 'pass', confidence: 1.0 },
        logical_heading_hierarchy: { verdict: 'pass', confidence: 1.0 },
        appropriate_paragraph_length: { verdict: 'pass', confidence: 1.0 },
        metadata_checks: { verdict: 'pass', confidence: 1.0 },
        accessibility_basics: { verdict: 'pass', confidence: 1.0 }
      }
    };

    const result = scoreAnalysisResults(perfectMockResult, 'article');

    expect(result.scores.global.score).toBe(100);
    expect(result.scores.global.AEO.score).toBe(55);
    expect(result.scores.global.GEO.score).toBe(45);
  });

  test('filters inapplicable checks for content type', () => {
    const howtoResult = scoreAnalysisResults({
      checks: {
        direct_answer_first_120: { verdict: 'pass', confidence: 1.0 },
        faq_structure_opportunity: { verdict: 'pass', confidence: 1.0 },
        howto_schema_presence_and_completeness: { verdict: 'pass', confidence: 1.0 },
        howto_semantic_validity: { verdict: 'pass', confidence: 1.0 }
      }
    }, 'howto');

    expect(howtoResult.scores.categories.AEO.checks.direct_answer_first_120).toBeDefined();
    expect(howtoResult.scores.categories.AEO.checks.faq_structure_opportunity).toBeDefined();
    expect(howtoResult.scores.categories.GEO.checks.howto_schema_presence_and_completeness).toBeDefined();
    expect(howtoResult.scores.categories.GEO.checks.howto_semantic_validity).toBeDefined();
  });

  test('assigns confidence buckets correctly', () => {
    const confidenceTest = scoreAnalysisResults({
      checks: {
        single_h1: { verdict: 'pass', confidence: 0.9 },
        logical_heading_hierarchy: { verdict: 'pass', confidence: 0.7 },
        appropriate_paragraph_length: { verdict: 'pass', confidence: 0.3 }
      }
    }, 'article');

    expect(confidenceTest.scores.categories.GEO.checks.single_h1.confidence_bucket).toBe('high');
    expect(confidenceTest.scores.categories.GEO.checks.logical_heading_hierarchy.confidence_bucket).toBe('medium');
    expect(confidenceTest.scores.categories.GEO.checks.appropriate_paragraph_length.confidence_bucket).toBe('low');
  });

  test('scores intro focus composite in AEO', () => {
    const result = scoreAnalysisResults({
      checks: {
        'intro_focus_and_factuality.v1': { verdict: 'pass', confidence: 1.0 }
      }
    }, 'article');

    expect(result.scores.categories.AEO.checks['intro_focus_and_factuality.v1']).toBeDefined();
    expect(result.scores.categories.AEO.score).toBeGreaterThan(0);
  });
});

describe('gold scorecard gates', () => {
  test('treats empty expected anchors as full recall and precision when none produced', () => {
    const analysisResult = {
      checks: {
        direct_answer_first_120: { verdict: 'fail' },
        answer_sentence_concise: { verdict: 'fail' },
        orphan_headings: { verdict: 'fail' },
        appropriate_paragraph_length: { verdict: 'fail' },
        no_exaggerated_claims: { verdict: 'fail' },
        claim_provenance_and_evidence: { verdict: 'fail' },
        author_identified: { verdict: 'fail' },
        author_bio_present: { verdict: 'fail' },
        metadata_checks: { verdict: 'fail' },
        semantic_html_usage: { verdict: 'fail' },
        duplicate_or_near_duplicate_detection: { verdict: 'partial' },
        faq_structure_opportunity: { verdict: 'partial' }
      },
      anchor_verification: {
        candidates_total: 0,
        anchored_total: 0,
        failed_total: 0,
        checks_abstained: 0,
        anchored_rate: 0,
        failed_rate: 0,
        abstention_rate: 0
      }
    };

    const scorecard = scoreGoldDataset(analysisResult, GOLD_DATASETS.bad_article_500);
    expect(scorecard.anchorPrecision).toBe(1);
    expect(scorecard.anchorRecall).toBe(1);
    expect(scorecard.verdictAccuracy).toBe(1);
  });

  test('flags precision when unexpected anchors appear without gold anchors', () => {
    const analysisResult = {
      checks: {
        direct_answer_first_120: {
          verdict: 'fail',
          highlights: [{ node_ref: 'block-1', snippet: 'sample', signature: 'sig-1' }]
        }
      },
      anchor_verification: {
        candidates_total: 1,
        anchored_total: 1,
        failed_total: 0,
        checks_abstained: 0,
        anchored_rate: 1,
        failed_rate: 0,
        abstention_rate: 0
      }
    };

    const scorecard = scoreGoldDataset(analysisResult, GOLD_DATASETS.bad_article_500);
    expect(scorecard.anchorRecall).toBe(1);
    expect(scorecard.anchorPrecision).toBe(0);
  });
});
