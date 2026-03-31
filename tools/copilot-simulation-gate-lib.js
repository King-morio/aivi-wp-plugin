const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const countWords = (value) => {
  const text = normalizeText(value);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
};

const countSentences = (value) => normalizeText(value)
  .split(/(?<=[.!?])\s+/)
  .map((sentence) => sentence.trim())
  .filter(Boolean)
  .length;

function scoreImmediateAnswerVariant(variantText) {
  const text = normalizeText(variantText);
  const lower = text.toLowerCase();
  const words = countWords(text);
  const failures = [];
  const warnings = [];

  if (!text) {
    failures.push('empty_variant');
    return { pass: false, failures, warnings, score: 0 };
  }

  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  const firstSentenceLower = firstSentence.toLowerCase();
  const openingWindow = lower.split(/\s+/).slice(0, 14).join(' ');
  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);

  if (words < 28 || words > 90) {
    failures.push('word_count_extreme');
  } else if (words < 40 || words > 60) {
    warnings.push('preferred_word_band_missed');
  }
  if (sentences.length > 4) {
    failures.push('sentence_count_out_of_range');
  } else if (sentences.length < 2) {
    warnings.push('preferred_sentence_band_missed');
  }
  if (!/(solar eclipse|solar eclipses)/.test(firstSentenceLower)) {
    failures.push('missing_subject_in_opening');
  }
  if (!/(happens when|occurs when|is when|is caused by|the direct cause .* is|when the moon passes)/.test(firstSentenceLower)) {
    failures.push('missing_direct_answer_pattern');
  }
  if (!/(moon)/.test(firstSentenceLower) || !/(earth)/.test(firstSentenceLower) || !/(sun)/.test(firstSentenceLower)) {
    failures.push('missing_core_entities');
  }
  if (!/(between)/.test(firstSentenceLower)) {
    failures.push('missing_between_relation');
  }
  if (/^because\b|^solar eclipses happen for a number of reasons\b|^these bodies\b/.test(firstSentenceLower)) {
    failures.push('still_buried_in_setup');
  }
  if (/reasons tied to orbital motion|exact geometry has to line up very precisely/.test(openingWindow)) {
    failures.push('opening_still_leads_with_setup');
  }
  if (/\b(maybe|might|could|several reasons)\b/.test(firstSentenceLower)) {
    failures.push('opening_is_too_hedged_or_vague');
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    score: Math.max(0, 100 - failures.length * 18 - warnings.length * 6)
  };
}

function scoreAnswerSentenceConciseVariant(variantText) {
  const text = normalizeText(variantText);
  const lower = text.toLowerCase();
  const words = countWords(text);
  const sentences = countSentences(text);
  const failures = [];
  const warnings = [];
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  const firstSentenceLower = firstSentence.toLowerCase();

  if (!text) {
    failures.push('empty_variant');
    return { pass: false, failures, warnings, score: 0 };
  }

  if (words < 30 || words > 80) {
    failures.push('word_count_out_of_range');
  } else if (words < 40 || words > 60) {
    warnings.push('preferred_word_band_missed');
  }
  if (sentences > 4) {
    failures.push('sentence_count_out_of_range');
  } else if (sentences < 2) {
    warnings.push('preferred_sentence_band_missed');
  }
  if (!/resume/.test(lower)) {
    failures.push('missing_subject');
  }
  if (!/(chronological)/.test(lower) || !/(functional)/.test(lower) || !/(combination)/.test(lower)) {
    failures.push('missing_core_answer_items');
  }
  if (!/(three main resume formats are|main resume formats are|three resume formats are)/.test(firstSentenceLower)) {
    failures.push('opening_not_direct_enough');
  }
  if (/choosing the right resume format|job seekers often wonder|different employers prefer/.test(firstSentenceLower)) {
    failures.push('opening_still_leads_with_setup');
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    score: Math.max(0, 100 - failures.length * 18 - warnings.length * 6)
  };
}

function scoreIntroFactualEntitiesVariant(variantText) {
  const text = normalizeText(variantText);
  const lower = text.toLowerCase();
  const words = countWords(text);
  const failures = [];
  const warnings = [];
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  const firstSentenceLower = firstSentence.toLowerCase();

  if (!text) {
    failures.push('empty_variant');
    return { pass: false, failures, warnings, score: 0 };
  }

  if (words < 18 || words > 90) {
    failures.push('word_count_out_of_range');
  }
  if (!/wordpress/.test(lower) || !/\b6\.9\b/.test(lower)) {
    failures.push('missing_release_identity');
  }
  if (!/march 29, 2026/.test(lower)) {
    failures.push('missing_release_date');
  }
  if (!/(\b3\b|\bthree\b)/.test(lower)) {
    failures.push('missing_change_count');
  }

  const factualAnchors = [
    /block controls/.test(lower),
    /style revisions/.test(lower),
    /editor performance/.test(lower)
  ].filter(Boolean).length;
  if (factualAnchors < 2) {
    failures.push('missing_specific_supporting_facts');
  }
  if (!/wordpress/.test(firstSentenceLower) || !/\b6\.9\b/.test(firstSentenceLower)) {
    failures.push('opening_lacks_core_facts');
  }
  if (/latest release|this update|meaningful improvements/.test(firstSentenceLower) && !/(march 29, 2026|\b3\b|\bthree\b)/.test(firstSentenceLower)) {
    failures.push('opening_still_too_vague');
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    score: Math.max(0, 100 - failures.length * 18 - warnings.length * 6)
  };
}

function buildAuthorityPatterns(generated) {
  const patterns = new Set([
    'cdc',
    'nih',
    'ninds',
    'medlineplus',
    'mayo clinic',
    'mayoclinic',
    'nhs',
    'who',
    'world health organization'
  ]);
  const selectedResults = Array.isArray(generated && generated.verification_result && generated.verification_result.selected_results)
    ? generated.verification_result.selected_results
    : [];

  selectedResults.forEach((result) => {
    const domain = normalizeText(result && result.domain ? result.domain : '').toLowerCase();
    const title = normalizeText(result && result.title ? result.title : '').toLowerCase();
    if (domain) {
      const root = domain.split('.')[0];
      if (root) patterns.add(root);
      patterns.add(domain);
    }
    title
      .split(/\s[-:]\s|—|–/)
      .map((segment) => normalizeText(segment).toLowerCase())
      .filter((segment) => segment.length >= 8)
      .forEach((segment) => patterns.add(segment));
    if (title.includes('cdc')) patterns.add('cdc');
    if (title.includes('nih')) patterns.add('nih');
    if (title.includes('ninds')) patterns.add('ninds');
    if (title.includes('national institute of neurological disorders')) {
      patterns.add('national institute of neurological disorders');
      patterns.add('national institute of neurological disorders and stroke');
    }
    if (title.includes('medlineplus')) patterns.add('medlineplus');
    if (title.includes('mayo clinic')) patterns.add('mayo clinic');
    if (title.includes('nhs')) patterns.add('nhs');
    if (title.includes('world health organization')) patterns.add('world health organization');
  });

  return Array.from(patterns);
}

function scoreExternalAuthoritativeSourcesVariant(variantText, context = {}) {
  const text = normalizeText(variantText);
  const lower = text.toLowerCase();
  const words = countWords(text);
  const failures = [];
  const warnings = [];
  const generated = context && typeof context === 'object' ? context.generated : null;
  const verificationResult = generated && generated.verification_result && typeof generated.verification_result === 'object'
    ? generated.verification_result
    : null;
  const verificationStatus = String(verificationResult && verificationResult.status ? verificationResult.status : '').trim().toLowerCase();
  const authorityPatterns = buildAuthorityPatterns(generated);

  if (!text) {
    failures.push('empty_variant');
    return { pass: false, failures, warnings, score: 0 };
  }

  if (!verificationResult || verificationResult.requested !== true) {
    failures.push('verification_not_exercised');
  } else if (verificationStatus !== 'support_found' && verificationStatus !== 'weak_support') {
    failures.push('verification_did_not_return_related_support');
  }

  if (words < 16 || words > 95) {
    failures.push('word_count_out_of_range');
  }
  if (!/epilepsy/.test(lower)) {
    failures.push('missing_core_subject');
  }
  if (!/(seizure|seizures|abnormal electrical activity|brain disorder)/.test(lower)) {
    failures.push('missing_core_claim');
  }
  if (/\d/.test(text)) {
    failures.push('invented_numeric_detail');
  }
  if (/\b(always|guarantees|proves|cures|never fails)\b/.test(lower)) {
    failures.push('unsupported_certainty');
  }
  if (!authorityPatterns.some((pattern) => pattern && lower.includes(pattern))) {
    failures.push('missing_named_source');
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    score: Math.max(0, 100 - failures.length * 18 - warnings.length * 6)
  };
}

function scoreHeadingTopicFulfillmentVariant(variantText, context = {}) {
  const fixtureId = normalizeText(context && context.fixture && context.fixture.fixture_id ? context.fixture.fixture_id : '').toLowerCase();
  if (fixtureId === 'heading-intent-delayed-list-resume-donts') {
    const text = normalizeText(variantText);
    const lower = text.toLowerCase();
    const failures = [];
    const warnings = [];
    const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
    const firstSentenceLower = firstSentence.toLowerCase();

    if (!text) {
      failures.push('empty_variant');
      return { pass: false, failures, warnings, score: 0 };
    }

    if (countWords(text) < 18 || countWords(text) > 90) {
      failures.push('word_count_out_of_range');
    }
    if (!/resume/.test(lower)) {
      failures.push('missing_heading_topic');
    }
    const doNotCount = (text.match(/\bdo not\b/gi) || []).length;
    if (doNotCount < 3) {
      failures.push('missing_promised_do_not_structure');
    }
    if (!/(avoid|what not to do|do not)/.test(firstSentenceLower)) {
      failures.push('opening_not_direct_heading_fulfillment');
    }
    if (/resume mistakes can quietly weaken|small choices in wording|that is why it helps to slow down/.test(firstSentenceLower)) {
      failures.push('opening_still_leads_with_warmup');
    }
    if (!/(outdated email|phone number)/.test(lower)) {
      failures.push('missing_contact_example');
    }
    if (!/(best achievements|generic summaries)/.test(lower)) {
      failures.push('missing_achievement_example');
    }
    if (!/(spelling|grammar|formatting)/.test(lower)) {
      failures.push('missing_quality_control_example');
    }

    return {
      pass: failures.length === 0,
      failures,
      warnings,
      score: Math.max(0, 100 - failures.length * 18 - warnings.length * 6)
    };
  }

  const text = normalizeText(variantText);
  const lower = text.toLowerCase();
  const words = countWords(text);
  const failures = [];
  const warnings = [];
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  const firstSentenceLower = firstSentence.toLowerCase();

  if (!text) {
    failures.push('empty_variant');
    return { pass: false, failures, warnings, score: 0 };
  }

  if (words < 18 || words > 90) {
    failures.push('word_count_out_of_range');
  }
  if (!/(totality)/.test(lower)) {
    failures.push('missing_heading_topic');
  }
  if (!/(solar eclipse|eclipse)/.test(lower)) {
    failures.push('missing_parent_topic');
  }
  if (!/(few minutes|a few minutes)/.test(lower)) {
    failures.push('missing_typical_duration');
  }
  if (!/(7 minutes 30 seconds|7\.5 minutes|seven minutes 30 seconds)/.test(lower)) {
    failures.push('missing_max_duration_support');
  }
  if (!/(lasts|can last)/.test(firstSentenceLower)) {
    failures.push('opening_not_direct_duration_answer');
  }
  if (/it depends|timing varies/.test(firstSentenceLower) && !/(few minutes|7 minutes 30 seconds|7\.5 minutes)/.test(firstSentenceLower)) {
    failures.push('opening_still_too_generic');
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    score: Math.max(0, 100 - failures.length * 18 - warnings.length * 6)
  };
}

function scoreListsTablesPresenceVariant(variantText) {
  const text = String(variantText || '').replace(/\r\n/g, '\n').trim();
  const lower = normalizeText(text).toLowerCase();
  const failures = [];
  const warnings = [];

  if (!text) {
    failures.push('empty_variant');
    return { pass: false, failures, warnings, score: 0 };
  }

  if (/<\/?(ul|ol|li|table|tr|td|th)\b/i.test(text)) {
    failures.push('raw_html_markup_present');
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLines = lines.filter((line) => /^(-|\*|\d+\.)\s+/.test(line));

  if (bulletLines.length < 3) {
    failures.push('insufficient_structured_lines');
  }

  const itemChecks = [
    /competition/,
    /refunds?/,
    /shipping delays?/,
    /supplier quality/,
    /ad fatigue/,
    /return policies?/,
    /compliance/,
    /taxes?/,
    /brand building/,
    /customer trust/,
    /product-market fit/
  ];
  const matchedConcepts = itemChecks.filter((pattern) => pattern.test(lower)).length;
  if (matchedConcepts < 5) {
    failures.push('missing_core_list_concepts');
  } else if (matchedConcepts < 7) {
    warnings.push('list_concepts_compressed_heavily');
  }

  if (bulletLines.some((line) => countWords(line) > 18)) {
    warnings.push('bullet_lines_running_long');
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    score: Math.max(0, 100 - failures.length * 18 - warnings.length * 6)
  };
}

const CHECK_SCORERS = Object.freeze({
  immediate_answer_placement: Object.freeze({
    scorer_id: 'immediate_answer_opening_gate',
    scoreVariant: scoreImmediateAnswerVariant
  }),
  answer_sentence_concise: Object.freeze({
    scorer_id: 'answer_sentence_concise_gate',
    scoreVariant: scoreAnswerSentenceConciseVariant
  }),
  intro_factual_entities: Object.freeze({
    scorer_id: 'intro_factual_entities_gate',
    scoreVariant: scoreIntroFactualEntitiesVariant
  }),
  external_authoritative_sources: Object.freeze({
    scorer_id: 'external_authoritative_sources_gate',
    scoreVariant: scoreExternalAuthoritativeSourcesVariant
  }),
  lists_tables_presence: Object.freeze({
    scorer_id: 'lists_tables_presence_gate',
    scoreVariant: scoreListsTablesPresenceVariant
  }),
  heading_topic_fulfillment: Object.freeze({
    scorer_id: 'heading_topic_fulfillment_gate',
    scoreVariant: scoreHeadingTopicFulfillmentVariant
  })
});

function getFixtureScorer(checkId) {
  return CHECK_SCORERS[String(checkId || '').trim()] || null;
}

function evaluateGeneratedVariants(fixture, generated) {
  const scorer = getFixtureScorer(fixture && fixture.check_id ? fixture.check_id : '');
  if (!scorer) {
    throw new Error(`No Copilot simulation scorer registered for check_id: ${fixture && fixture.check_id ? fixture.check_id : 'unknown'}`);
  }

  const variants = Array.isArray(generated && generated.variants) ? generated.variants : [];
  const evaluations = variants.map((variant, index) => ({
    index: index + 1,
    label: variant && variant.label ? variant.label : '',
    text: variant && variant.text ? variant.text : '',
    evaluation: scorer.scoreVariant(variant && variant.text ? variant.text : '', {
      variant,
      generated,
      fixture
    })
  }));
  const requiredCount = Number(fixture && fixture.acceptance && fixture.acceptance.required_variant_count) || 3;
  const pass = evaluations.length === requiredCount && evaluations.every((entry) => entry.evaluation.pass === true);

  return {
    scorer_id: scorer.scorer_id,
    required_variant_count: requiredCount,
    pass,
    evaluations
  };
}

module.exports = {
  normalizeText,
  countWords,
  countSentences,
  scoreImmediateAnswerVariant,
  scoreAnswerSentenceConciseVariant,
  scoreIntroFactualEntitiesVariant,
  scoreExternalAuthoritativeSourcesVariant,
  scoreListsTablesPresenceVariant,
  scoreHeadingTopicFulfillmentVariant,
  getFixtureScorer,
  evaluateGeneratedVariants
};
