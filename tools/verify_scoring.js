#!/usr/bin/env node
/**
 * Scoring Verification Tool
 *
 * Loads analyzer output and recomputes AEO/GEO/GLOBAL scores,
 * then compares to stored values and reports discrepancies.
 *
 * Usage:
 *   node tools/verify_scoring.js <path_to_aggregator.json>
 *
 * Example:
 *   node tools/verify_scoring.js /tmp/diagnostics/run-123/aggregator.json
 */

const fs = require('fs');
const path = require('path');

// Load scoring config
const scoringConfigPath = path.join(__dirname, '..', 'infrastructure', 'lambda', 'orchestrator', 'schemas', 'scoring-config-v1.json');
let scoringConfig;

try {
    scoringConfig = JSON.parse(fs.readFileSync(scoringConfigPath, 'utf8'));
    console.log('✓ Loaded scoring config v' + scoringConfig.version);
} catch (e) {
    console.error('✗ Failed to load scoring config:', e.message);
    process.exit(1);
}

const GOLD_DATASETS = {
    synthetic_v1: {
        expected_verdicts: {
            direct_answer_first_120: 'fail',
            orphan_headings: 'partial'
        },
        expected_anchors: [
            { check_id: 'direct_answer_first_120', node_ref: 'block-0', signature: 'sig-1', snippet: 'direct answer missing' },
            { check_id: 'orphan_headings', node_ref: 'block-2', signature: 'sig-2', snippet: 'heading with no body' }
        ],
        thresholds: {
            min_anchor_precision: 0.5,
            min_anchor_recall: 0.5,
            max_abstention_rate: 0.5
        }
    },
    bad_article_500: {
        expected_verdicts: {
            direct_answer_first_120: 'fail',
            answer_sentence_concise: 'fail',
            orphan_headings: 'fail',
            appropriate_paragraph_length: 'fail',
            no_exaggerated_claims: 'fail',
            claim_provenance_and_evidence: 'fail',
            author_identified: 'fail',
            author_bio_present: 'fail',
            metadata_checks: 'fail',
            semantic_html_usage: 'fail',
            duplicate_or_near_duplicate_detection: 'partial',
            faq_structure_opportunity: 'partial'
        },
        expected_anchors: [],
        thresholds: {
            min_anchor_precision: 0.7,
            max_abstention_rate: 0.3
        }
    }
};

// Scoring functions (mirrored from scoring-engine.js)
function getConfidenceBucket(confidence) {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
}

function calculateCheckScore(checkResult, checkWeight) {
    if (checkResult.verdict === 'not_applicable') {
        return { score: 0, max_score: 0, applicable: false };
    }

    const confidenceBucket = getConfidenceBucket(checkResult.confidence || 0.8);
    const confidenceMultiplier = scoringConfig.scoring.confidence_multipliers[confidenceBucket] || 0.6;
    const verdictMultiplier = scoringConfig.scoring.verdict_multipliers[checkResult.verdict] || 0;
    const rawScore = checkWeight.max_points * verdictMultiplier * confidenceMultiplier;

    return {
        score: Math.round(rawScore * 100) / 100,
        max_score: checkWeight.max_points,
        applicable: true,
        verdict: checkResult.verdict,
        confidence: checkResult.confidence
    };
}

function recomputeScores(analysisResult, contentType = 'article') {
    const checks = analysisResult.checks || {};

    // Flatten check weights
    const allCheckWeights = {};
    Object.values(scoringConfig.scoring.check_weights).forEach(category => {
        Object.assign(allCheckWeights, category);
    });

    const categoryScores = {
        AEO: { score: 0, raw_max: 0, checks: {} },
        GEO: { score: 0, raw_max: 0, checks: {} }
    };

    // Process each check
    Object.entries(checks).forEach(([checkId, checkResult]) => {
        const checkWeight = allCheckWeights[checkId];
        if (!checkWeight) {
            console.warn(`  ⚠ Unknown check ID: ${checkId}`);
            return;
        }

        // Check applicability
        const isApplicable = checkWeight.applicable_content_types.includes('all') ||
                             checkWeight.applicable_content_types.includes(contentType);
        if (!isApplicable) return;

        const checkScore = calculateCheckScore(checkResult, checkWeight);
        const category = checkWeight.category;

        if (categoryScores[category]) {
            categoryScores[category].score += checkScore.score;
            categoryScores[category].raw_max += checkScore.max_score;
            categoryScores[category].checks[checkId] = checkScore;
        }
    });

    // Normalize to category max points
    const maxAEO = scoringConfig.scoring.category_max_points.AEO;
    const maxGEO = scoringConfig.scoring.category_max_points.GEO;

    const normalizedAEO = categoryScores.AEO.raw_max > 0
        ? (categoryScores.AEO.score / categoryScores.AEO.raw_max) * maxAEO
        : 0;
    const normalizedGEO = categoryScores.GEO.raw_max > 0
        ? (categoryScores.GEO.score / categoryScores.GEO.raw_max) * maxGEO
        : 0;

    return {
        computed: {
            AEO: Math.round(normalizedAEO),
            GEO: Math.round(normalizedGEO),
            GLOBAL: Math.round(normalizedAEO + normalizedGEO)
        },
        details: categoryScores
    };
}

function getAnchorStats(analysisResult) {
    const stats = analysisResult.anchor_verification || {};
    if (typeof stats.candidates_total === 'number') {
        return {
            candidates_total: stats.candidates_total || 0,
            anchored_total: stats.anchored_total || 0,
            failed_total: stats.failed_total || 0,
            checks_abstained: stats.checks_abstained || 0,
            anchored_rate: typeof stats.anchored_rate === 'number' ? stats.anchored_rate : 0,
            failed_rate: typeof stats.failed_rate === 'number' ? stats.failed_rate : 0,
            abstention_rate: typeof stats.abstention_rate === 'number' ? stats.abstention_rate : 0
        };
    }
    const checks = analysisResult.checks || {};
    let candidates_total = 0;
    let anchored_total = 0;
    let failed_total = 0;
    let checks_abstained = 0;
    Object.values(checks).forEach(check => {
        const highlights = Array.isArray(check.highlights) ? check.highlights : [];
        const failed = Array.isArray(check.failed_candidates) ? check.failed_candidates : [];
        candidates_total += highlights.length + failed.length;
        anchored_total += highlights.length;
        failed_total += failed.length;
        if (check.cannot_anchor) {
            checks_abstained += 1;
        }
    });
    const anchored_rate = candidates_total > 0 ? anchored_total / candidates_total : 0;
    const failed_rate = candidates_total > 0 ? failed_total / candidates_total : 0;
    const checks_with_candidates = Object.values(checks).filter(check => {
        const highlights = Array.isArray(check.highlights) ? check.highlights : [];
        const failed = Array.isArray(check.failed_candidates) ? check.failed_candidates : [];
        return highlights.length + failed.length > 0;
    }).length;
    const abstention_rate = checks_with_candidates > 0 ? checks_abstained / checks_with_candidates : 0;
    return {
        candidates_total,
        anchored_total,
        failed_total,
        checks_abstained,
        anchored_rate,
        failed_rate,
        abstention_rate
    };
}

function buildAnchorKey(anchor) {
    const signature = anchor.signature || '';
    const nodeRef = anchor.node_ref || '';
    const snippet = anchor.snippet || '';
    return `${anchor.check_id || ''}::${signature}::${nodeRef}::${snippet}`;
}

function scoreGoldDataset(analysisResult, goldDataset) {
    const expectedVerdicts = goldDataset.expected_verdicts || {};
    const checks = analysisResult.checks || {};
    let verdictMatched = 0;
    let verdictTotal = 0;
    const verdictMismatches = [];
    Object.entries(expectedVerdicts).forEach(([checkId, expected]) => {
        verdictTotal += 1;
        const actual = checks[checkId]?.verdict;
        if (actual === expected) {
            verdictMatched += 1;
        } else {
            verdictMismatches.push({ checkId, expected, actual: actual || 'missing' });
        }
    });
    const expectedAnchors = Array.isArray(goldDataset.expected_anchors) ? goldDataset.expected_anchors : [];
    const actualAnchors = [];
    Object.entries(checks).forEach(([checkId, check]) => {
        const highlights = Array.isArray(check.highlights) ? check.highlights : [];
        highlights.forEach((highlight) => {
            actualAnchors.push({ ...highlight, check_id: checkId });
        });
    });
    const expectedKeys = new Set(expectedAnchors.map(buildAnchorKey));
    const actualKeys = new Set(actualAnchors.map(buildAnchorKey));
    let matchedAnchors = 0;
    expectedKeys.forEach(key => {
        if (actualKeys.has(key)) {
            matchedAnchors += 1;
        }
    });
    let anchorPrecision = actualKeys.size > 0 ? matchedAnchors / actualKeys.size : 0;
    let anchorRecall = expectedKeys.size > 0 ? matchedAnchors / expectedKeys.size : 0;
    if (expectedKeys.size === 0 && actualKeys.size === 0) {
        anchorPrecision = 1;
        anchorRecall = 1;
    } else if (expectedKeys.size === 0 && actualKeys.size > 0) {
        anchorRecall = 1;
    }
    const anchorStats = getAnchorStats(analysisResult);
    return {
        verdictMatched,
        verdictTotal,
        verdictAccuracy: verdictTotal > 0 ? verdictMatched / verdictTotal : 0,
        verdictMismatches,
        anchorPrecision,
        anchorRecall,
        anchorStats
    };
}

function getOptionValue(args, name) {
    const prefix = `${name}=`;
    const match = args.find(arg => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : null;
}

// Main
function main() {
    const args = process.argv.slice(2);
    const inputPath = args.find(arg => !arg.startsWith('--'));
    const goldId = getOptionValue(args, '--gold');
    const goldFile = getOptionValue(args, '--gold-file');

    if (!inputPath) {
        console.log('Usage: node tools/verify_scoring.js <path_to_aggregator.json> [--gold=<id>] [--gold-file=<path>]');
        console.log('');
        console.log('This tool recomputes scores from analyzer output and compares');
        console.log('to stored values to verify scoring accuracy.');
        process.exit(1);
    }

    // Load analyzer output
    let analysisResult;
    try {
        analysisResult = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        console.log('✓ Loaded analysis result');
    } catch (e) {
        console.error('✗ Failed to load analysis result:', e.message);
        process.exit(1);
    }

    // Get stored scores
    const storedScores = analysisResult.scores || {};
    console.log('\n--- Stored Scores ---');
    console.log('  AEO:', storedScores.AEO || 'N/A');
    console.log('  GEO:', storedScores.GEO || 'N/A');
    console.log('  GLOBAL:', storedScores.GLOBAL || 'N/A');

    // Recompute scores
    const recomputed = recomputeScores(analysisResult);
    console.log('\n--- Recomputed Scores ---');
    console.log('  AEO:', recomputed.computed.AEO);
    console.log('  GEO:', recomputed.computed.GEO);
    console.log('  GLOBAL:', recomputed.computed.GLOBAL);

    // Compare
    console.log('\n--- Comparison ---');
    const discrepancies = [];

    ['AEO', 'GEO', 'GLOBAL'].forEach(key => {
        const stored = storedScores[key];
        const computed = recomputed.computed[key];
        const diff = stored !== undefined ? Math.abs(stored - computed) : 'N/A';

        if (diff !== 'N/A' && diff > 1) {
            discrepancies.push({ key, stored, computed, diff });
            console.log(`  ✗ ${key}: stored=${stored}, computed=${computed}, diff=${diff}`);
        } else if (diff === 'N/A') {
            console.log(`  ? ${key}: stored=N/A, computed=${computed}`);
        } else {
            console.log(`  ✓ ${key}: stored=${stored}, computed=${computed} (match)`);
        }
    });

    const anchorStats = getAnchorStats(analysisResult);

    // Check details
    console.log('\n--- Check-Level Details ---');
    const checksCount = Object.keys(analysisResult.checks || {}).length;
    console.log(`  Total checks: ${checksCount}`);

    const verdictCounts = { pass: 0, partial: 0, fail: 0, not_applicable: 0 };
    Object.values(analysisResult.checks || {}).forEach(check => {
        const v = check.verdict || 'unknown';
        if (verdictCounts.hasOwnProperty(v)) verdictCounts[v]++;
    });
    console.log(`  Verdicts: pass=${verdictCounts.pass}, partial=${verdictCounts.partial}, fail=${verdictCounts.fail}, n/a=${verdictCounts.not_applicable}`);
    console.log(`  Anchors: candidates=${anchorStats.candidates_total}, anchored=${anchorStats.anchored_total}, failed=${anchorStats.failed_total}`);
    console.log(`  Rates: anchored=${anchorStats.anchored_rate.toFixed(4)}, failed=${anchorStats.failed_rate.toFixed(4)}, abstention=${anchorStats.abstention_rate.toFixed(4)}`);

    let goldScorecard = null;
    if (goldFile) {
        try {
            const goldData = JSON.parse(fs.readFileSync(goldFile, 'utf8'));
            goldScorecard = scoreGoldDataset(analysisResult, goldData);
        } catch (e) {
            console.error('✗ Failed to load gold dataset file:', e.message);
            process.exit(1);
        }
    } else if (goldId) {
        const goldData = GOLD_DATASETS[goldId];
        if (!goldData) {
            console.error(`✗ Unknown gold dataset: ${goldId}`);
            process.exit(1);
        }
        goldScorecard = scoreGoldDataset(analysisResult, goldData);
    }

    // Summary
    console.log('\n--- Summary ---');
    if (discrepancies.length === 0) {
        console.log('✓ All scores match within tolerance');
    } else {
        console.log(`✗ ${discrepancies.length} discrepancies found:`);
        discrepancies.forEach(d => {
            console.log(`    ${d.key}: expected ${d.stored}, got ${d.computed} (diff: ${d.diff})`);
        });
    }

    if (goldScorecard) {
        console.log('\n--- Gold Scorecard ---');
        console.log(`  Verdict accuracy: ${(goldScorecard.verdictAccuracy * 100).toFixed(2)}%`);
        console.log(`  Anchor precision: ${(goldScorecard.anchorPrecision * 100).toFixed(2)}%`);
        console.log(`  Anchor recall: ${(goldScorecard.anchorRecall * 100).toFixed(2)}%`);
        if (goldScorecard.verdictMismatches.length > 0) {
            goldScorecard.verdictMismatches.forEach(mismatch => {
                console.log(`  ✗ ${mismatch.checkId}: expected=${mismatch.expected}, actual=${mismatch.actual}`);
            });
        }
        const thresholds = (goldFile ? null : GOLD_DATASETS[goldId]?.thresholds) || {};
        const gateFailures = [];
        if (typeof thresholds.min_anchor_precision === 'number' && goldScorecard.anchorPrecision < thresholds.min_anchor_precision) {
            gateFailures.push(`anchor_precision < ${thresholds.min_anchor_precision}`);
        }
        if (typeof thresholds.min_anchor_recall === 'number' && goldScorecard.anchorRecall < thresholds.min_anchor_recall) {
            gateFailures.push(`anchor_recall < ${thresholds.min_anchor_recall}`);
        }
        if (typeof thresholds.max_abstention_rate === 'number' && goldScorecard.anchorStats.abstention_rate > thresholds.max_abstention_rate) {
            gateFailures.push(`abstention_rate > ${thresholds.max_abstention_rate}`);
        }
        if (gateFailures.length > 0) {
            gateFailures.forEach(failure => console.log(`  ✗ Gate: ${failure}`));
        } else {
            console.log('  ✓ Anchor gates satisfied');
        }
        if (goldScorecard.verdictMismatches.length > 0 || gateFailures.length > 0) {
            discrepancies.push({ key: 'gold_scorecard', stored: 'pass', computed: 'fail', diff: gateFailures.length + goldScorecard.verdictMismatches.length });
        }
    }

    // Exit code
    process.exit(discrepancies.length > 0 ? 1 : 0);
}

if (require.main === module) {
    main();
}

module.exports = {
    GOLD_DATASETS,
    getConfidenceBucket,
    calculateCheckScore,
    recomputeScores,
    getAnchorStats,
    buildAnchorKey,
    scoreGoldDataset
};
