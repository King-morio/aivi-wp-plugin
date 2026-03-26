const { scoreAnalysisResults } = require('./scoring-engine');
const { GOLD_DATASETS, scoreGoldDataset } = require('../../../tools/verify_scoring');
const { performDeterministicChecks } = require('./preflight-handler');
const { normalizeLegacyNoAnchorSemantics } = require('../../../tools/scoring-fixture-normalizers');
const fs = require('fs');
const path = require('path');
const scoringConfig = require('./schemas/scoring-config-v1.json');

function buildPerfectChecks(contentType = 'article') {
  const checks = {};

  Object.values(scoringConfig.scoring.check_weights).forEach((group) => {
    Object.entries(group).forEach(([checkId, weight]) => {
      const contentTypes = Array.isArray(weight?.applicable_content_types)
        ? weight.applicable_content_types
        : [];
      const isApplicable = contentTypes.includes('all') || contentTypes.includes(contentType);
      if (isApplicable) {
        checks[checkId] = { verdict: 'pass', confidence: 1.0 };
      }
    });
  });

  return checks;
}

function loadScoringFixture(name) {
  const fixturePath = path.resolve(
    __dirname,
    `../../../fixtures/scoring/${name}`
  );
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function loadAnalysisFixtureChecks(name, { normalizeLegacyNoAnchor = false } = {}) {
  const fixture = loadScoringFixture(name);
  const checks = fixture?.checks || {};
  return normalizeLegacyNoAnchor ? normalizeLegacyNoAnchorSemantics(checks) : checks;
}

describe('scoreAnalysisResults', () => {
  test('returns normalized perfect scores for passing checks', () => {
    const perfectMockResult = {
      checks: buildPerfectChecks('article')
    };

    const result = scoreAnalysisResults(perfectMockResult, 'article');

    expect(result.scores.GLOBAL).toBe(100);
    expect(result.scores.AEO).toBe(55);
    expect(result.scores.GEO).toBe(45);
  });

  test('filters inapplicable checks for content type', () => {
    const howtoResult = scoreAnalysisResults({
      checks: {
        immediate_answer_placement: { verdict: 'pass', confidence: 1.0 },
        faq_structure_opportunity: { verdict: 'pass', confidence: 1.0 },
        howto_jsonld_presence_and_completeness: { verdict: 'pass', confidence: 1.0 },
        howto_semantic_validity: { verdict: 'pass', confidence: 1.0 }
      }
    }, 'howto');

    expect(howtoResult.score_details.categories.AEO.checks.immediate_answer_placement).toBeDefined();
    expect(howtoResult.score_details.categories.AEO.checks.faq_structure_opportunity).toBeDefined();
    expect(howtoResult.score_details.categories.GEO.checks.howto_jsonld_presence_and_completeness).toBeDefined();
    expect(howtoResult.score_details.categories.GEO.checks.howto_semantic_validity).toBeDefined();
  });

  test('assigns confidence buckets correctly', () => {
    const confidenceTest = scoreAnalysisResults({
      checks: {
        single_h1: { verdict: 'pass', confidence: 0.9 },
        logical_heading_hierarchy: { verdict: 'pass', confidence: 0.7 },
        appropriate_paragraph_length: { verdict: 'pass', confidence: 0.3 }
      }
    }, 'article');

    expect(confidenceTest.score_details.categories.GEO.checks.single_h1.confidence_bucket).toBe('high');
    expect(confidenceTest.score_details.categories.GEO.checks.logical_heading_hierarchy.confidence_bucket).toBe('medium');
    expect(confidenceTest.score_details.categories.GEO.checks.appropriate_paragraph_length.confidence_bucket).toBe('low');
  });

  test('scores the redistributed intro checks in AEO', () => {
    const result = scoreAnalysisResults({
      checks: {
        intro_wordcount: { verdict: 'pass', confidence: 1.0 },
        intro_readability: { verdict: 'pass', confidence: 1.0 },
        intro_factual_entities: { verdict: 'pass', confidence: 1.0 }
      }
    }, 'article');

    expect(result.score_details.categories.AEO.checks.intro_wordcount).toBeDefined();
    expect(result.score_details.categories.AEO.checks.intro_readability).toBeDefined();
    expect(result.score_details.categories.AEO.checks.intro_factual_entities).toBeDefined();
    expect(result.score_details.categories.AEO.score).toBeGreaterThan(0);
  });

  test('does not award a full GEO bucket when only one GEO check is present', () => {
    const result = scoreAnalysisResults({
      checks: {
        single_h1: { verdict: 'pass', confidence: 1.0 }
      }
    }, 'article');

    expect(result.scores.GEO).toBeLessThan(10);
    expect(result.scores.GLOBAL).toBeLessThan(10);
  });

  test('does not award points for scope-neutral deterministic passes', () => {
    const result = scoreAnalysisResults({
      checks: {
        valid_jsonld_schema: { verdict: 'pass', confidence: 1.0, score_neutral: true },
        supported_schema_types_validation: { verdict: 'pass', confidence: 1.0, score_neutral: true },
        schema_matches_content: { verdict: 'partial', confidence: 1.0, score_neutral: true },
        content_updated_12_months: { verdict: 'pass', confidence: 1.0, score_neutral: true },
        no_broken_internal_links: { verdict: 'pass', confidence: 1.0, score_neutral: true }
      }
    }, 'article');

    expect(result.scores.GEO).toBe(0);
    expect(result.scores.GLOBAL).toBe(0);
    expect(result.score_details.categories.GEO.checks.valid_jsonld_schema.applicable).toBe(false);
    expect(result.score_details.categories.GEO.checks.valid_jsonld_schema.score_neutral).toBe(true);
  });

  test('keeps the bad local manifest fixture below the optimistic pre-remediation range', async () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../../fixtures/scoring/how-to-improve-website-performance-fast.manifest.json'
    );
    const manifest = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const checks = await performDeterministicChecks(
      manifest,
      { content_type: 'article' },
      {
        contentHtml: manifest.content_html || '',
        enableIntroFocusFactuality: true
      }
    );

    const result = scoreAnalysisResults({ checks }, 'article');

    expect(result.scores.GLOBAL).toBeLessThan(20);
    expect(result.scores.GEO).toBeLessThan(20);
  });

  test('caps unsupported-claim articles even when semantic answer-clarity checks are optimistic', async () => {
    const manifest = loadScoringFixture('coffee-10-cups-health.manifest.json');
    const semanticOverlay = loadScoringFixture('coffee-10-cups-health.semantic-checks.json');
    const checks = await performDeterministicChecks(
      manifest,
      { content_type: 'article' },
      {
        contentHtml: manifest.content_html || '',
        enableIntroFocusFactuality: true
      }
    );

    const result = scoreAnalysisResults({ checks: { ...checks, ...semanticOverlay } }, 'article');

    expect(result.scores.AEO).toBeLessThanOrEqual(28);
    expect(result.scores.GLOBAL).toBeLessThanOrEqual(60);
    expect(result.score_details.guardrails.applied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          guardrail_id: 'unsupported_claims',
          level: 'severe'
        })
      ])
    );
  });

  test('partial anchor-guarded answer checks score lower than legacy default-pass fallback', () => {
    const legacyDefaultPass = scoreAnalysisResults({
      checks: {
        immediate_answer_placement: { verdict: 'pass', confidence: 1.0 },
        answer_sentence_concise: { verdict: 'pass', confidence: 1.0 },
        question_answer_alignment: { verdict: 'pass', confidence: 1.0 },
        clear_answer_formatting: { verdict: 'pass', confidence: 1.0 }
      }
    }, 'article');
    const guardedPartial = scoreAnalysisResults({
      checks: {
        immediate_answer_placement: { verdict: 'partial', confidence: 1.0 },
        answer_sentence_concise: { verdict: 'partial', confidence: 1.0 },
        question_answer_alignment: { verdict: 'partial', confidence: 1.0 },
        clear_answer_formatting: { verdict: 'partial', confidence: 1.0 }
      }
    }, 'article');

    expect(guardedPartial.scores.AEO).toBeLessThan(legacyDefaultPass.scores.AEO);
    expect(guardedPartial.scores.GLOBAL).toBeLessThan(legacyDefaultPass.scores.GLOBAL);
  });

  test('missing FAQ structure no longer earns full credit by default', () => {
    const legacyFaqPass = scoreAnalysisResults({
      checks: {
        immediate_answer_placement: { verdict: 'partial', confidence: 1.0 },
        answer_sentence_concise: { verdict: 'partial', confidence: 1.0 },
        question_answer_alignment: { verdict: 'partial', confidence: 1.0 },
        clear_answer_formatting: { verdict: 'partial', confidence: 1.0 },
        faq_structure_opportunity: { verdict: 'pass', confidence: 1.0 },
        faq_jsonld_generation_suggestion: { verdict: 'pass', confidence: 1.0 }
      }
    }, 'article');
    const correctedFaqSemantics = scoreAnalysisResults({
      checks: {
        immediate_answer_placement: { verdict: 'partial', confidence: 1.0 },
        answer_sentence_concise: { verdict: 'partial', confidence: 1.0 },
        question_answer_alignment: { verdict: 'partial', confidence: 1.0 },
        clear_answer_formatting: { verdict: 'partial', confidence: 1.0 },
        faq_structure_opportunity: { verdict: 'fail', confidence: 1.0 },
        faq_jsonld_generation_suggestion: { verdict: 'partial', confidence: 1.0 }
      }
    }, 'article');

    expect(correctedFaqSemantics.scores.AEO).toBeLessThan(legacyFaqPass.scores.AEO);
    expect(correctedFaqSemantics.scores.GLOBAL).toBeLessThan(legacyFaqPass.scores.GLOBAL);
  });

  test('legacy not_applicable verdict is treated as fail in scoring', () => {
    const result = scoreAnalysisResults({
      checks: {
        immediate_answer_placement: { verdict: 'not_applicable', confidence: 1.0 }
      }
    }, 'article');

    expect(result.score_details.categories.AEO.checks.immediate_answer_placement.verdict).toBe('fail');
    expect(result.scores.AEO).toBe(0);
  });

  test('keeps the recovered dropshipping live run below the corrected ceiling', () => {
    const checks = loadAnalysisFixtureChecks('dropshipping-live-run.analysis.json', {
      normalizeLegacyNoAnchor: true
    });
    const result = scoreAnalysisResults({ checks }, 'article');

    expect(result.scores.GLOBAL).toBeLessThanOrEqual(45);
    expect(result.scores.AEO).toBeLessThanOrEqual(23.5);
    expect(result.score_details.guardrails.applied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          guardrail_id: 'unsupported_claims',
          level: 'severe'
        })
      ])
    );
  });
});

describe('gold scorecard gates', () => {
  test('treats empty expected anchors as full recall and precision when none produced', () => {
    const analysisResult = {
      checks: {
        immediate_answer_placement: { verdict: 'fail' },
        answer_sentence_concise: { verdict: 'fail' },
        heading_topic_fulfillment: { verdict: 'fail' },
        appropriate_paragraph_length: { verdict: 'fail' },
        no_exaggerated_claims: { verdict: 'fail' },
        claim_provenance_and_evidence: { verdict: 'fail' },
        author_identified: { verdict: 'fail' },
        author_bio_present: { verdict: 'fail' },
        metadata_checks: { verdict: 'fail' },
        semantic_html_usage: { verdict: 'fail' },
        duplicate_or_near_duplicate_detection: { verdict: 'partial' },
        faq_structure_opportunity: { verdict: 'partial' },
        howto_jsonld_presence_and_completeness: { verdict: 'partial' },
        howto_semantic_validity: { verdict: 'partial' }
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
        immediate_answer_placement: {
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
