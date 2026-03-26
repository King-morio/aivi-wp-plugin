const fs = require('fs');
const path = require('path');
const isPackagedLambdaRuntime = Boolean(process.env.AWS_EXECUTION_ENV);
const loadSharedModule = (moduleName) => {
  const candidates = isPackagedLambdaRuntime
    ? [`./shared/${moduleName}`, `../shared/${moduleName}`]
    : [`../shared/${moduleName}`, `./shared/${moduleName}`];

  let lastError = null;
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (error && error.code !== 'MODULE_NOT_FOUND') {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError || new Error(`Unable to load shared runtime module: ${moduleName}`);
};
const {
  calculateCheckScore,
  calculateCategoryScores,
  calculateGlobalScore,
  scoreChecksAgainstConfig
} = loadSharedModule('scoring-policy');

// Load scoring configuration
const scoringConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'schemas/scoring-config-v1.json'), 'utf8')
);

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

  const aeoScore = categoryScores.AEO;
  if (aeoScore.percentage >= 80) {
    summary.strengths.push(`Excellent answer extractability (${aeoScore.percentage}%)- content is well-structured for LLM answer engines`);
  } else if (aeoScore.percentage < 50) {
    summary.improvements.push(`Answer extractability needs improvement (${aeoScore.percentage}%)- consider adding Q&A structure and direct answers`);
    summary.recommendations.push('Add clear question-answer pairs with direct answers in first 120 words');
  }

  const geoScore = categoryScores.GEO;
  if (geoScore.percentage >= 80) {
    summary.strengths.push(`Strong general optimization (${geoScore.percentage}%)- content follows SEO and quality best practices`);
  } else if (geoScore.percentage < 50) {
    summary.improvements.push(`General optimization needs work (${geoScore.percentage}%)- focus on metadata, structure, and authority signals`);
    summary.recommendations.push('Improve meta descriptions, heading structure, and add authoritative sources');
  }

  Object.entries(categoryScores).forEach(([, catScore]) => {
    Object.entries(catScore.checks).forEach(([checkId, checkScore]) => {
      if (checkScore.verdict === 'fail' && checkScore.applicable) {
        switch (checkId) {
          case 'single_h1':
            summary.recommendations.push('Ensure content has exactly one H1 tag');
            break;
          case 'metadata_checks':
            summary.recommendations.push('Add meta description and canonical URL');
            break;
          case 'jsonld_syntax_valid':
            summary.recommendations.push('Fix JSON-LD schema syntax errors');
            break;
          case 'immediate_answer_placement':
            summary.recommendations.push('Place direct answers within the first 120 words');
            break;
        }
      }
    });
  });

  return summary;
}

function scoreAnalysisResults(analysisResults, contentType = 'article') {
  const checkResults = analysisResults.checks || {};
  const computed = scoreChecksAgainstConfig(checkResults, scoringConfig, contentType, {
    onUnknownCheck: (checkId) => {
      console.warn(`Unknown check ID: ${checkId}`);
    }
  });
  const summary = generateSummaryReport(
    computed.score_details.categories,
    computed.score_details.global,
    contentType
  );

  return {
    ...analysisResults,
    scores: computed.scores,
    score_details: computed.score_details,
    summary,
    audit: {
      ...analysisResults.audit,
      scoring_version: scoringConfig.version,
      scored_at: new Date().toISOString()
    }
  };
}

module.exports = {
  scoreAnalysisResults,
  calculateCheckScore: (checkResult, checkWeight) => calculateCheckScore(checkResult, checkWeight, scoringConfig),
  calculateCategoryScores: (checkResults, contentType) => calculateCategoryScores(checkResults, scoringConfig, contentType),
  calculateGlobalScore: (categoryScores) => calculateGlobalScore(categoryScores, scoringConfig),
  generateSummaryReport
};
