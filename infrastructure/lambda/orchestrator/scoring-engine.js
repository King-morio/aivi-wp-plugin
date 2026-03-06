const fs = require('fs');
const path = require('path');

// Load scoring configuration
const scoringConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'schemas/scoring-config-v1.json'), 'utf8')
);

/**
 * Convert numeric confidence (0-1) to bucket string
 */
function getConfidenceBucket(confidence) {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

/**
 * Calculate score for a single check
 */
function calculateCheckScore(checkResult, checkWeight) {
  // Skip if not applicable
  if (checkResult.verdict === 'not_applicable') {
    return {
      score: 0,
      max_score: 0,
      weighted_score: 0,
      applicable: false
    };
  }

  // Get confidence bucket
  const confidenceBucket = getConfidenceBucket(checkResult.confidence);

  // Get multipliers
  const confidenceMultiplier = scoringConfig.scoring.confidence_multipliers[confidenceBucket] || 0.6;
  const verdictMultiplier = scoringConfig.scoring.verdict_multipliers[checkResult.verdict] || 0;

  // Calculate raw score
  const rawScore = checkWeight.max_points * verdictMultiplier * confidenceMultiplier;

  return {
    score: Math.round(rawScore * 100) / 100, // Round to 2 decimal places
    max_score: checkWeight.max_points,
    weighted_score: rawScore,
    applicable: true,
    confidence: checkResult.confidence,
    confidence_bucket: confidenceBucket,
    verdict: checkResult.verdict
  };
}

/**
 * Calculate category scores (AEO and GEO) with normalization
 */
function calculateCategoryScores(checkResults, contentType) {
  const categoryScores = {
    AEO: { score: 0, raw_max_score: 0, normalized_max_score: scoringConfig.scoring.category_max_points.AEO, checks: {} },
    GEO: { score: 0, raw_max_score: 0, normalized_max_score: scoringConfig.scoring.category_max_points.GEO, checks: {} }
  };
  const introWeight = typeof scoringConfig.scoring.intro_weight_in_aeo === 'number'
    ? scoringConfig.scoring.intro_weight_in_aeo
    : null;
  const introCheckId = 'intro_focus_and_factuality.v1';

  // Get all check weights
  const allCheckWeights = {};
  Object.values(scoringConfig.scoring.check_weights).forEach(category => {
    Object.assign(allCheckWeights, category);
  });

  // Process each check result
  Object.entries(checkResults).forEach(([checkId, checkResult]) => {
    const checkWeight = allCheckWeights[checkId];

    if (!checkWeight) {
      console.warn(`Unknown check ID: ${checkId}`);
      return;
    }

    // Check if applicable to content type
    const isApplicable = checkWeight.applicable_content_types.includes('all') ||
                         checkWeight.applicable_content_types.includes(contentType);

    if (!isApplicable) {
      // Skip inapplicable checks
      return;
    }

    const checkScore = calculateCheckScore(checkResult, checkWeight);
    const category = checkWeight.category;

    if (categoryScores[category]) {
      categoryScores[category].score += checkScore.score;
      categoryScores[category].raw_max_score += checkScore.max_score;
      categoryScores[category].checks[checkId] = checkScore;
    }
  });

  // Normalize scores to fit the category max points
  Object.keys(categoryScores).forEach(category => {
    const catScore = categoryScores[category];

    if (category === 'AEO' && introWeight !== null && catScore.checks[introCheckId]) {
      const introCheck = catScore.checks[introCheckId];
      const otherChecks = Object.entries(catScore.checks).filter(([checkId]) => checkId !== introCheckId);
      const otherTotals = otherChecks.reduce((acc, [, check]) => {
        acc.score += check.score || 0;
        acc.max += check.max_score || 0;
        return acc;
      }, { score: 0, max: 0 });
      const introNormalized = introCheck.max_score > 0
        ? (introCheck.score / introCheck.max_score) * catScore.normalized_max_score * introWeight
        : 0;
      const otherNormalized = otherTotals.max > 0
        ? (otherTotals.score / otherTotals.max) * catScore.normalized_max_score * (1 - introWeight)
        : 0;
      catScore.score = Math.round((introNormalized + otherNormalized) * 100) / 100;
    } else if (catScore.raw_max_score > 0) {
      catScore.score = (catScore.score / catScore.raw_max_score) * catScore.normalized_max_score;
      catScore.score = Math.round(catScore.score * 100) / 100;
    }

    catScore.max_score = catScore.normalized_max_score;
    delete catScore.raw_max_score;
    delete catScore.normalized_max_score;

    catScore.percentage = Math.round((catScore.score / catScore.max_score) * 100);
  });

  return categoryScores;
}

/**
 * Calculate global score (AEO + GEO)
 */
function calculateGlobalScore(categoryScores) {
  const aeoScore = categoryScores.AEO.score;
  const geoScore = categoryScores.GEO.score;
  const globalScore = aeoScore + geoScore;

  const maxAeo = scoringConfig.scoring.category_max_points.AEO;
  const maxGeo = scoringConfig.scoring.category_max_points.GEO;
  const maxGlobal = maxAeo + maxGeo;

  return {
    score: Math.round(globalScore * 100) / 100,
    max_score: maxGlobal,
    percentage: Math.round((globalScore / maxGlobal) * 100),
    AEO: {
      score: Math.round(aeoScore * 100) / 100,
      max_score: maxAeo,
      percentage: categoryScores.AEO.percentage
    },
    GEO: {
      score: Math.round(geoScore * 100) / 100,
      max_score: maxGeo,
      percentage: categoryScores.GEO.percentage
    }
  };
}

/**
 * Generate summary report
 */
function generateSummaryReport(categoryScores, globalScore, contentType) {
  const summary = {
    content_type: contentType,
    global_score: globalScore,
    category_scores: categoryScores,
    recommendations: [],
    strengths: [],
    improvements: []
  };

  // Analyze AEO
  const aeoScore = categoryScores.AEO;
  if (aeoScore.percentage >= 80) {
    summary.strengths.push(`Excellent answer extractability (${aeoScore.percentage}%)- content is well-structured for LLM answer engines`);
  } else if (aeoScore.percentage < 50) {
    summary.improvements.push(`Answer extractability needs improvement (${aeoScore.percentage}%)- consider adding Q&A structure and direct answers`);
    summary.recommendations.push('Add clear question-answer pairs with direct answers in first 120 words');
  }

  // Analyze GEO
  const geoScore = categoryScores.GEO;
  if (geoScore.percentage >= 80) {
    summary.strengths.push(`Strong general optimization (${geoScore.percentage}%)- content follows SEO and quality best practices`);
  } else if (geoScore.percentage < 50) {
    summary.improvements.push(`General optimization needs work (${geoScore.percentage}%)- focus on metadata, structure, and authority signals`);
    summary.recommendations.push('Improve meta descriptions, heading structure, and add authoritative sources');
  }

  // Specific recommendations based on failed checks
  Object.entries(categoryScores).forEach(([category, catScore]) => {
    Object.entries(catScore.checks).forEach(([checkId, checkScore]) => {
      if (checkScore.verdict === 'fail' && checkScore.applicable) {
        switch(checkId) {
          case 'single_h1':
            summary.recommendations.push('Ensure content has exactly one H1 tag');
            break;
          case 'metadata_checks':
            summary.recommendations.push('Add meta description and canonical URL');
            break;
          case 'jsonld_syntax_valid':
            summary.recommendations.push('Fix JSON-LD schema syntax errors');
            break;
          case 'direct_answer_first_120':
            summary.recommendations.push('Place direct answers within the first 120 words');
            break;
        }
      }
    });
  });

  return summary;
}

/**
 * Main scoring function - processes analysis results and returns scored report
 */
function scoreAnalysisResults(analysisResults, contentType = 'article') {
  // Extract check results from analysis
  const checkResults = analysisResults.checks || {};

  // Calculate category scores
  const categoryScores = calculateCategoryScores(checkResults, contentType);

  // Calculate global score
  const globalScore = calculateGlobalScore(categoryScores);

  // Generate summary report
  const summary = generateSummaryReport(categoryScores, globalScore, contentType);

  return {
    ...analysisResults,
    scores: {
      global: globalScore,
      categories: categoryScores
    },
    summary: summary,
    audit: {
      ...analysisResults.audit,
      scoring_version: scoringConfig.version,
      scored_at: new Date().toISOString()
    }
  };
}

module.exports = {
  scoreAnalysisResults,
  calculateCheckScore,
  calculateCategoryScores,
  calculateGlobalScore,
  generateSummaryReport
};
