const fs = require('fs');
const path = require('path');

const {
  scoreImmediateAnswerVariant,
  scoreAnswerSentenceConciseVariant,
  scoreIntroFactualEntitiesVariant,
  scoreExternalAuthoritativeSourcesVariant,
  scoreHeadingTopicFulfillmentVariant,
  evaluateGeneratedVariants
} = require('../../tools/copilot-simulation-gate-lib');
const { buildFixAssistContract } = require('../../infrastructure/lambda/orchestrator/fix-assist-contract-builder');
const { buildFixAssistTriage } = require('../../infrastructure/lambda/orchestrator/fix-assist-triage');
const {
  buildSuggestionFromCopilotIssue,
  validateVariantsForTarget
} = require('../../infrastructure/lambda/orchestrator/rewrite-handler');

const loadCopilotFixture = (fileName) => JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'fixtures', 'copilot', fileName),
    'utf8'
  )
);

const immediateFixture = loadCopilotFixture('immediate-answer-placement-buried-prose.fixture.json');
const conciseFixture = loadCopilotFixture('answer-sentence-concise-overloaded-resume-snippet.fixture.json');
const introFixture = loadCopilotFixture('intro-factual-entities-wordpress-release.fixture.json');
const headingFixture = loadCopilotFixture('heading-topic-fulfillment-totality-duration.fixture.json');
const externalSourceFixture = loadCopilotFixture('external-authoritative-sources-epilepsy-source-gap.fixture.json');

const representativeGeneratedByFixtureId = Object.freeze({
  'immediate-answer-placement-buried-prose': {
    variants: [
      {
        label: 'Most concise',
        text: 'A solar eclipse happens when the Moon passes between Earth and the Sun, blocking some or all of the Sun from view. This only happens when those bodies align precisely despite their constant motion and the Moon\'s tilted orbit.'
      },
      {
        label: 'Balanced',
        text: 'A solar eclipse occurs when the Moon moves between Earth and the Sun and blocks part or all of the Sun from view. The alignment is uncommon because the Earth, Moon, and Sun must line up precisely while the Moon\'s orbit remains tilted relative to Earth.'
      },
      {
        label: 'Evidence-first',
        text: 'The direct cause of a solar eclipse is the Moon passing between Earth and the Sun and blocking the Sun from view. That only happens when their orbital positions line up precisely, even though the Moon\'s path is tilted relative to Earth.'
      }
    ]
  },
  'answer-sentence-concise-overloaded-resume-snippet': {
    variants: [
      {
        label: 'Most concise',
        text: 'The three main resume formats are chronological, functional, and combination. Chronological formats highlight work history, functional formats emphasize transferable skills, and combination formats blend both when you need a balanced resume that still stays easy for employers to scan.'
      },
      {
        label: 'Balanced',
        text: 'The three main resume formats are chronological, functional, and combination. Chronological resumes foreground work history, functional resumes focus on skills, and combination resumes balance both approaches when you want employers to see experience and strengths in the same document.'
      },
      {
        label: 'Evidence-first',
        text: 'The three main resume formats are chronological, functional, and combination. Chronological resumes make work history easiest to scan, functional resumes stress skills, and combination resumes bring both elements together when you need a resume that shows experience and flexibility clearly.'
      }
    ]
  },
  'intro-factual-entities-wordpress-release': {
    variants: [
      {
        label: 'Most concise',
        text: 'WordPress 6.9 shipped on March 29, 2026 with 3 notable editor improvements. The release sharpened block controls, sped up style revisions, and improved editor performance for site owners and creators.'
      },
      {
        label: 'Balanced',
        text: 'WordPress 6.9 shipped on March 29, 2026 and introduced 3 notable editor improvements for site owners and creators. The update improved block controls, faster style revisions, and smoother editor performance.'
      },
      {
        label: 'Evidence-first',
        text: 'WordPress 6.9 shipped on March 29, 2026 with 3 notable editor improvements. It delivered better block controls, faster style revisions, and smoother editor performance for creators and site owners.'
      }
    ]
  },
  'heading-topic-fulfillment-totality-duration': {
    variants: [
      {
        label: 'Most concise',
        text: 'During a solar eclipse, totality usually lasts only a few minutes, and the theoretical maximum is about 7 minutes 30 seconds. The exact timing still depends on eclipse geometry and where you stand in the path.'
      },
      {
        label: 'Balanced',
        text: 'Totality during a solar eclipse usually lasts only a few minutes, although the theoretical maximum is about 7 minutes 30 seconds. The precise duration still depends on the eclipse geometry and your position in the path.'
      },
      {
        label: 'Evidence-first',
        text: 'A solar eclipse\'s totality usually lasts only a few minutes, and even the longest possible totality is about 7 minutes 30 seconds. Your exact experience still depends on the eclipse geometry and where you stand in the path.'
      }
    ]
  },
  'external-authoritative-sources-epilepsy-source-gap': {
    verification_result: {
      requested: true,
      verification_intent: 'verify_first',
      status: 'support_found',
      selected_results: [
        {
          title: 'Epilepsy basics - CDC',
          domain: 'cdc.gov'
        }
      ]
    },
    variants: [
      {
        label: 'Most concise',
        text: 'According to the CDC, epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.'
      },
      {
        label: 'Balanced',
        text: 'The CDC describes epilepsy as a brain disorder that causes recurring seizures because of abnormal electrical activity in the brain.'
      },
      {
        label: 'Evidence-first',
        text: 'CDC guidance describes epilepsy as a brain disorder involving recurring seizures linked to abnormal electrical activity in the brain.'
      }
    ]
  }
});

describe('copilot simulation gate', () => {
  test('immediate answer scorer passes direct, reusable opening answers', () => {
    const result = scoreImmediateAnswerVariant(
      'A solar eclipse happens when the Moon passes between Earth and the Sun, blocking some or all of the Sun from view. This only happens when the three bodies align precisely despite their constant motion and the Moon\'s tilted orbit.'
    );

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test('immediate answer scorer rejects setup-heavy openings', () => {
    const result = scoreImmediateAnswerVariant(
      'Solar eclipses happen for a number of reasons tied to orbital motion and precise alignment before the Moon passes between Earth and the Sun.'
    );

    expect(result.pass).toBe(false);
    expect(result.failures).toContain('still_buried_in_setup');
  });

  test('answer snippet concise scorer passes complete reusable snippets in the preferred band', () => {
    const result = scoreAnswerSentenceConciseVariant(
      representativeGeneratedByFixtureId['answer-sentence-concise-overloaded-resume-snippet'].variants[0].text
    );

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test('intro factual entities scorer requires concrete factual grounding in the opening', () => {
    const result = scoreIntroFactualEntitiesVariant(
      representativeGeneratedByFixtureId['intro-factual-entities-wordpress-release'].variants[0].text
    );

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test('heading topic fulfillment scorer requires direct support for the heading promise', () => {
    const result = scoreHeadingTopicFulfillmentVariant(
      representativeGeneratedByFixtureId['heading-topic-fulfillment-totality-duration'].variants[0].text
    );

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test('fixture gate requires all three variants to solve the buried-answer issue', () => {
    const generated = representativeGeneratedByFixtureId['immediate-answer-placement-buried-prose'];

    const report = evaluateGeneratedVariants(immediateFixture, generated);
    expect(report.scorer_id).toBe('immediate_answer_opening_gate');
    expect(report.pass).toBe(true);
    expect(report.evaluations).toHaveLength(3);
    expect(report.evaluations.every((entry) => entry.evaluation.pass)).toBe(true);
  });

  test('fixture gate passes complete concise answer snippets', () => {
    const report = evaluateGeneratedVariants(
      conciseFixture,
      representativeGeneratedByFixtureId['answer-sentence-concise-overloaded-resume-snippet']
    );

    expect(report.scorer_id).toBe('answer_sentence_concise_gate');
    expect(report.pass).toBe(true);
    expect(report.evaluations.every((entry) => entry.evaluation.pass)).toBe(true);
  });

  test('fixture gate passes grounded intro factual rewrites', () => {
    const report = evaluateGeneratedVariants(
      introFixture,
      representativeGeneratedByFixtureId['intro-factual-entities-wordpress-release']
    );

    expect(report.scorer_id).toBe('intro_factual_entities_gate');
    expect(report.pass).toBe(true);
    expect(report.evaluations.every((entry) => entry.evaluation.pass)).toBe(true);
  });

  test('fixture gate passes heading support rewrites that fulfill the heading promise', () => {
    const report = evaluateGeneratedVariants(
      headingFixture,
      representativeGeneratedByFixtureId['heading-topic-fulfillment-totality-duration']
    );

    expect(report.scorer_id).toBe('heading_topic_fulfillment_gate');
    expect(report.pass).toBe(true);
    expect(report.evaluations.every((entry) => entry.evaluation.pass)).toBe(true);
  });

  test('external authoritative source scorer requires named source support from verification-aware variants', () => {
    const report = evaluateGeneratedVariants(
      externalSourceFixture,
      representativeGeneratedByFixtureId['external-authoritative-sources-epilepsy-source-gap']
    );

    expect(report.scorer_id).toBe('external_authoritative_sources_gate');
    expect(report.pass).toBe(true);
    expect(report.evaluations).toHaveLength(3);
    expect(report.evaluations.every((entry) => entry.evaluation.pass)).toBe(true);
  });

  test('external authoritative source scorer rejects variants that omit named source support', () => {
    const result = scoreExternalAuthoritativeSourcesVariant(
      'Epilepsy is a brain disorder marked by recurring seizures caused by abnormal electrical activity in the brain.',
      {
        generated: {
          verification_result: {
            requested: true,
            verification_intent: 'verify_first',
            status: 'support_found',
            selected_results: [
              {
                title: 'Epilepsy basics - CDC',
                domain: 'cdc.gov'
              }
            ]
          }
        }
      }
    );

    expect(result.pass).toBe(false);
    expect(result.failures).toContain('missing_named_source');
  });

  test('validator fixture sweep accepts representative copilot-capable families after preservation repair', () => {
    const fixtures = [
      immediateFixture,
      conciseFixture,
      introFixture,
      headingFixture,
      externalSourceFixture
    ];

    fixtures.forEach((fixture) => {
      const generated = representativeGeneratedByFixtureId[fixture.fixture_id];
      const suggestion = buildSuggestionFromCopilotIssue(fixture.copilot_issue);
      const triage = buildFixAssistTriage({
        checkId: fixture.check_id,
        checkName: fixture.check_name,
        snippet: fixture.copilot_issue.snippet,
        message: fixture.copilot_issue.analyzer_note,
        rewriteTarget: fixture.rewrite_target,
        repairIntent: fixture.repair_intent
      });
      const contract = buildFixAssistContract({
        suggestion,
        manifest: fixture.manifest,
        analysisRef: {
          check_id: fixture.check_id,
          instance_index: 0
        },
        rewriteTarget: fixture.rewrite_target,
        repairIntent: fixture.repair_intent,
        issueContext: fixture.copilot_issue,
        fixAssistTriage: triage
      });
      const validation = validateVariantsForTarget(
        generated.variants,
        fixture.rewrite_target,
        suggestion.text,
        contract
      );

      expect(validation.valid).toBe(true);
      expect(validation.reason).toBe('ok');
    });
  });
});
