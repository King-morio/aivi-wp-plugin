const { buildFlatScoreContract } = require('./score-contract');

const DEFAULT_CONFIDENCE_MULTIPLIERS = { high: 1.0, medium: 0.8, low: 0.6 };
const DEFAULT_VERDICT_MULTIPLIERS = { pass: 1.0, partial: 0.6, fail: 0.0 };
const DEFAULT_CATEGORY_MAX_POINTS = { AEO: 55, GEO: 45 };
const DEFAULT_GUARDRAIL_VERDICT_POINTS = { fail: 2, partial: 1, pass: 0 };
const INTRO_CATEGORY_ID = 'intro_focus_factuality';
const AEO_CATEGORY = 'AEO';
const GEO_CATEGORY = 'GEO';
const DEFAULT_GUARDRAIL_STATE = Object.freeze({ applied: [] });

const roundScore = (value) => Math.round(Number(value || 0) * 100) / 100;

const normalizeVerdict = (verdict, fallback = 'fail') => {
  if (typeof verdict !== 'string') return fallback;
  const normalized = verdict.toLowerCase().trim();
  const map = {
    pass: 'pass',
    passed: 'pass',
    ok: 'pass',
    partial: 'partial',
    fail: 'fail',
    failed: 'fail',
    issue: 'fail',
    warning: 'fail',
    not_applicable: 'fail',
    'n/a': 'fail',
    na: 'fail'
  };
  return map[normalized] || fallback;
};

const parseConfidence = (confidence, fallback = 0.8) => {
  if (typeof confidence === 'number' && Number.isFinite(confidence)) {
    return Math.max(0, Math.min(1, confidence));
  }
  if (typeof confidence === 'string') {
    const parsed = parseFloat(confidence);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, parsed));
    }
  }
  return fallback;
};

const getConfidenceBucket = (confidence) => {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
};

const flattenCheckWeights = (scoringConfig) => {
  const allCheckWeights = {};
  const groups = scoringConfig?.scoring?.check_weights;
  if (!groups || typeof groups !== 'object') return allCheckWeights;
  Object.values(groups).forEach((category) => {
    if (category && typeof category === 'object') {
      Object.assign(allCheckWeights, category);
    }
  });
  return allCheckWeights;
};

const getApplicableCheckWeights = (scoringConfig, contentType) => {
  const allCheckWeights = flattenCheckWeights(scoringConfig);
  const applicableWeights = {};

  Object.entries(allCheckWeights).forEach(([checkId, checkWeight]) => {
    const contentTypes = Array.isArray(checkWeight?.applicable_content_types)
      ? checkWeight.applicable_content_types
      : [];
    const isApplicable = contentTypes.includes('all') || contentTypes.includes(contentType);
    if (isApplicable) {
      applicableWeights[checkId] = checkWeight;
    }
  });

  return applicableWeights;
};

const getConfiguredIntroCheckIds = (scoringConfig) => {
  const introGroup = scoringConfig?.scoring?.check_weights?.[INTRO_CATEGORY_ID];
  if (!introGroup || typeof introGroup !== 'object') {
    return new Set();
  }
  return new Set(Object.keys(introGroup));
};

const cloneCategoryScores = (categoryScores) => (
  Object.entries(categoryScores || {}).reduce((acc, [category, catScore]) => {
    acc[category] = {
      ...catScore,
      checks: { ...(catScore?.checks || {}) }
    };
    return acc;
  }, {})
);

const isScoreNeutralCheckResult = (checkResult) => {
  if (!checkResult || typeof checkResult !== 'object') return false;
  if (checkResult.score_neutral === true) return true;
  const details = checkResult.details;
  return Boolean(details && typeof details === 'object' && details.score_neutral === true);
};

const syncCategoryPercentages = (categoryScores) => {
  Object.values(categoryScores || {}).forEach((catScore) => {
    const maxScore = Number(catScore?.max_score || 0);
    catScore.score = roundScore(catScore.score);
    catScore.percentage = maxScore > 0
      ? Math.round((Number(catScore.score || 0) / maxScore) * 100)
      : 0;
  });
};

const calculateCheckScore = (checkResult, checkWeight, scoringConfig) => {
  const verdict = normalizeVerdict(checkResult?.verdict || checkResult?.ui_verdict, 'fail');
  const confidence = parseConfidence(checkResult?.confidence);
  const confidenceBucket = getConfidenceBucket(confidence);
  const confidenceMultiplier = scoringConfig?.scoring?.confidence_multipliers?.[confidenceBucket]
    ?? DEFAULT_CONFIDENCE_MULTIPLIERS[confidenceBucket];
  const verdictMultiplier = scoringConfig?.scoring?.verdict_multipliers?.[verdict]
    ?? DEFAULT_VERDICT_MULTIPLIERS[verdict]
    ?? 0;
  const maxPoints = Number(checkWeight?.max_points);
  const effectiveMaxPoints = Number.isFinite(maxPoints) && maxPoints >= 0 ? maxPoints : 0;
  if (isScoreNeutralCheckResult(checkResult)) {
    return {
      score: 0,
      max_score: 0,
      weighted_score: 0,
      applicable: false,
      confidence,
      confidence_bucket: confidenceBucket,
      verdict,
      score_neutral: true,
      score_neutral_reason: checkResult?.score_neutral_reason
        || checkResult?.details?.score_neutral_reason
        || 'scope_not_triggered'
    };
  }
  const rawScore = effectiveMaxPoints * verdictMultiplier * confidenceMultiplier;

  return {
    score: roundScore(rawScore),
    max_score: effectiveMaxPoints,
    weighted_score: rawScore,
    applicable: true,
    confidence,
    confidence_bucket: confidenceBucket,
    verdict
  };
};

const calculateCategoryScores = (checkResults, scoringConfig, contentType, options = {}) => {
  const categoryMaxPoints = scoringConfig?.scoring?.category_max_points || DEFAULT_CATEGORY_MAX_POINTS;
  const introWeight = typeof scoringConfig?.scoring?.intro_weight_in_aeo === 'number'
    ? scoringConfig.scoring.intro_weight_in_aeo
    : null;
  const allCheckWeights = flattenCheckWeights(scoringConfig);
  const applicableCheckWeights = getApplicableCheckWeights(scoringConfig, contentType);
  const introCheckIds = getConfiguredIntroCheckIds(scoringConfig);
  const resolveCategory = typeof options.resolveCategory === 'function'
    ? options.resolveCategory
    : (() => null);
  const onUnknownCheck = typeof options.onUnknownCheck === 'function'
    ? options.onUnknownCheck
    : null;

  const categoryScores = {
    [AEO_CATEGORY]: { score: 0, raw_max_score: 0, normalized_max_score: categoryMaxPoints.AEO || 55, checks: {} },
    [GEO_CATEGORY]: { score: 0, raw_max_score: 0, normalized_max_score: categoryMaxPoints.GEO || 45, checks: {} }
  };

  Object.entries(checkResults || {}).forEach(([checkId, checkResult]) => {
    const knownCheckWeight = allCheckWeights[checkId] || null;
    const checkWeight = applicableCheckWeights[checkId] || null;
    const category = (checkWeight?.category === AEO_CATEGORY || checkWeight?.category === GEO_CATEGORY)
      ? checkWeight.category
      : (knownCheckWeight ? null : resolveCategory(checkId, checkResult, applicableCheckWeights));

    if (!categoryScores[category]) {
      if (!knownCheckWeight && onUnknownCheck) onUnknownCheck(checkId, checkResult);
      return;
    }

    const normalizedWeight = checkWeight || { category, max_points: 1 };
    const checkScore = calculateCheckScore(checkResult, normalizedWeight, scoringConfig);
    categoryScores[category].score += checkScore.score;
    categoryScores[category].raw_max_score += checkScore.max_score;
    categoryScores[category].checks[checkId] = checkScore;
  });

  Object.keys(categoryScores).forEach((category) => {
    const catScore = categoryScores[category];
    const neutralChecks = new Set(
      Object.entries(checkResults || {})
        .filter(([, result]) => isScoreNeutralCheckResult(result))
        .map(([checkId]) => checkId)
    );
    const expectedChecks = Object.entries(applicableCheckWeights)
      .filter(([checkId, weight]) => (
        weight.category === category
        && Number(weight.max_points) > 0
        && !neutralChecks.has(checkId)
      ))
      .map(([checkId, weight]) => ({ checkId, weight }));
    const expectedMaxScore = expectedChecks.reduce((sum, { weight }) => sum + Number(weight.max_points || 0), 0);

    if (category === AEO_CATEGORY && introWeight !== null && introCheckIds.size > 0) {
      const introExpectedMax = expectedChecks
        .filter(({ checkId }) => introCheckIds.has(checkId))
        .reduce((sum, { weight }) => sum + Number(weight.max_points || 0), 0);
      const otherExpectedMax = expectedChecks
        .filter(({ checkId }) => !introCheckIds.has(checkId))
        .reduce((sum, { weight }) => sum + Number(weight.max_points || 0), 0);
      const introObservedScore = Object.entries(catScore.checks)
        .filter(([checkId]) => introCheckIds.has(checkId))
        .reduce((sum, [, check]) => sum + Number(check.score || 0), 0);
      const otherObservedScore = Object.entries(catScore.checks)
        .filter(([checkId]) => !introCheckIds.has(checkId))
        .reduce((sum, [, check]) => sum + Number(check.score || 0), 0);
      const introNormalized = introExpectedMax > 0
        ? (introObservedScore / introExpectedMax) * catScore.normalized_max_score * introWeight
        : 0;
      const otherNormalized = otherExpectedMax > 0
        ? (otherObservedScore / otherExpectedMax) * catScore.normalized_max_score * (1 - introWeight)
        : 0;
      catScore.score = roundScore(introNormalized + otherNormalized);
    } else if (expectedMaxScore > 0) {
      catScore.score = roundScore((catScore.score / expectedMaxScore) * catScore.normalized_max_score);
    }

    catScore.max_score = catScore.normalized_max_score;
    delete catScore.raw_max_score;
    delete catScore.normalized_max_score;
    catScore.percentage = catScore.max_score > 0
      ? Math.round((catScore.score / catScore.max_score) * 100)
      : 0;
  });

  return categoryScores;
};

const calculateGlobalScore = (categoryScores, scoringConfig) => {
  const maxAeo = Number(scoringConfig?.scoring?.category_max_points?.AEO) || DEFAULT_CATEGORY_MAX_POINTS.AEO;
  const maxGeo = Number(scoringConfig?.scoring?.category_max_points?.GEO) || DEFAULT_CATEGORY_MAX_POINTS.GEO;
  const aeoScore = Number(categoryScores?.[AEO_CATEGORY]?.score || 0);
  const geoScore = Number(categoryScores?.[GEO_CATEGORY]?.score || 0);
  const globalScore = aeoScore + geoScore;
  const maxGlobal = maxAeo + maxGeo;

  return {
    score: roundScore(globalScore),
    max_score: maxGlobal,
    percentage: Math.round((globalScore / maxGlobal) * 100),
    AEO: {
      score: roundScore(aeoScore),
      max_score: maxAeo,
      percentage: Number(categoryScores?.[AEO_CATEGORY]?.percentage || 0)
    },
    GEO: {
      score: roundScore(geoScore),
      max_score: maxGeo,
      percentage: Number(categoryScores?.[GEO_CATEGORY]?.percentage || 0)
    }
  };
};

const evaluateGuardrailSignals = (checkResults, guardrailConfig) => {
  const primaryChecks = Array.isArray(guardrailConfig?.primary_checks)
    ? guardrailConfig.primary_checks
    : [];
  const supportingChecks = Array.isArray(guardrailConfig?.supporting_checks)
    ? guardrailConfig.supporting_checks
    : [];
  const verdictPoints = {
    ...DEFAULT_GUARDRAIL_VERDICT_POINTS,
    ...(guardrailConfig?.verdict_points || {})
  };
  const allChecks = Array.from(new Set([...primaryChecks, ...supportingChecks]));
  const matchedChecks = {};
  let signalPoints = 0;
  let primaryFailureCount = 0;

  allChecks.forEach((checkId) => {
    const checkResult = checkResults?.[checkId];
    const verdict = normalizeVerdict(checkResult?.verdict || checkResult?.ui_verdict, 'pass');
    const points = Number(verdictPoints[verdict] ?? 0);
    if (verdict === 'fail' && primaryChecks.includes(checkId)) {
      primaryFailureCount += 1;
    }
    if (points > 0) {
      matchedChecks[checkId] = {
        verdict,
        points
      };
      signalPoints += points;
    }
  });

  return {
    signal_points: signalPoints,
    primary_failure_count: primaryFailureCount,
    matched_checks: matchedChecks
  };
};

const pickGuardrailLevel = (guardrailConfig, signals) => {
  const levels = Array.isArray(guardrailConfig?.levels) ? guardrailConfig.levels : [];
  return levels.reduce((selected, level) => {
    const minSignalPoints = Number(level?.min_signal_points ?? 0);
    const minPrimaryFailures = Number(level?.min_primary_failures ?? 0);
    if (
      signals.signal_points < minSignalPoints ||
      signals.primary_failure_count < minPrimaryFailures
    ) {
      return selected;
    }
    if (!selected) return level;
    const selectedSignalPoints = Number(selected?.min_signal_points ?? 0);
    const selectedPrimaryFailures = Number(selected?.min_primary_failures ?? 0);
    if (
      minSignalPoints > selectedSignalPoints ||
      (minSignalPoints === selectedSignalPoints && minPrimaryFailures > selectedPrimaryFailures)
    ) {
      return level;
    }
    return selected;
  }, null);
};

const applyIntegrityGuardrails = (checkResults, categoryScores, scoringConfig) => {
  const guardrails = scoringConfig?.scoring?.integrity_guardrails;
  if (!guardrails || typeof guardrails !== 'object') {
    return {
      categoryScores,
      globalScore: calculateGlobalScore(categoryScores, scoringConfig),
      guardrails: DEFAULT_GUARDRAIL_STATE
    };
  }

  const nextCategoryScores = cloneCategoryScores(categoryScores);
  const applied = [];

  Object.entries(guardrails).forEach(([guardrailId, guardrailConfig]) => {
    const signals = evaluateGuardrailSignals(checkResults, guardrailConfig);
    const level = pickGuardrailLevel(guardrailConfig, signals);

    if (!level) return;

    if (Number.isFinite(Number(level?.max_aeo_score))) {
      nextCategoryScores[AEO_CATEGORY].score = Math.min(
        Number(nextCategoryScores[AEO_CATEGORY]?.score || 0),
        Number(level.max_aeo_score)
      );
    }

    syncCategoryPercentages(nextCategoryScores);

    let globalScore = calculateGlobalScore(nextCategoryScores, scoringConfig);
    if (Number.isFinite(Number(level?.max_global_score))) {
      const cappedGlobal = Math.min(Number(globalScore.score || 0), Number(level.max_global_score));
      if (cappedGlobal < Number(globalScore.score || 0)) {
        const overflow = Number(globalScore.score || 0) - cappedGlobal;
        nextCategoryScores[AEO_CATEGORY].score = Math.max(
          0,
          roundScore(Number(nextCategoryScores[AEO_CATEGORY]?.score || 0) - overflow)
        );
        syncCategoryPercentages(nextCategoryScores);
        globalScore = calculateGlobalScore(nextCategoryScores, scoringConfig);
      }
    }

    applied.push({
      guardrail_id: guardrailId,
      level: String(level?.id || 'unnamed'),
      signal_points: signals.signal_points,
      primary_failure_count: signals.primary_failure_count,
      matched_checks: signals.matched_checks,
      caps: {
        max_aeo_score: Number.isFinite(Number(level?.max_aeo_score)) ? Number(level.max_aeo_score) : null,
        max_global_score: Number.isFinite(Number(level?.max_global_score)) ? Number(level.max_global_score) : null
      }
    });
  });

  syncCategoryPercentages(nextCategoryScores);

  return {
    categoryScores: nextCategoryScores,
    globalScore: calculateGlobalScore(nextCategoryScores, scoringConfig),
    guardrails: { applied }
  };
};

const scoreChecksAgainstConfig = (checkResults, scoringConfig, contentType, options = {}) => {
  const categoryScores = calculateCategoryScores(checkResults, scoringConfig, contentType, options);
  const guardedScores = applyIntegrityGuardrails(checkResults, categoryScores, scoringConfig);
  return {
    scores: buildFlatScoreContract(guardedScores.globalScore),
    score_details: {
      global: guardedScores.globalScore,
      categories: guardedScores.categoryScores,
      guardrails: guardedScores.guardrails
    }
  };
};

module.exports = {
  INTRO_CATEGORY_ID,
  normalizeVerdict,
  parseConfidence,
  getConfidenceBucket,
  flattenCheckWeights,
  getApplicableCheckWeights,
  calculateCheckScore,
  calculateCategoryScores,
  calculateGlobalScore,
  applyIntegrityGuardrails,
  scoreChecksAgainstConfig
};
