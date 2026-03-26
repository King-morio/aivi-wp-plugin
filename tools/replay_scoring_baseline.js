#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const { performDeterministicChecks } = require('../infrastructure/lambda/orchestrator/preflight-handler');
const { scoreAnalysisResults } = require('../infrastructure/lambda/orchestrator/scoring-engine');
const { normalizeLegacyNoAnchorSemantics } = require('./scoring-fixture-normalizers');

const DEFAULT_MANIFEST = path.join(
    __dirname,
    '..',
    'fixtures',
    'scoring',
    'how-to-improve-website-performance-fast.manifest.json'
);

function getOptionValue(args, prefix) {
    const match = args.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : null;
}

function summarizeVerdicts(checks) {
    return Object.values(checks || {}).reduce((acc, check) => {
        const verdict = String(check?.verdict || 'unknown');
        if (!Object.prototype.hasOwnProperty.call(acc, verdict)) {
            acc[verdict] = 0;
        }
        acc[verdict] += 1;
        return acc;
    }, { pass: 0, partial: 0, fail: 0, not_applicable: 0 });
}

async function replayManifestScoring(manifestPath, contentType = 'article', semanticOverlayPath = null) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const deterministicChecks = await performDeterministicChecks(
        manifest,
        { content_type: contentType },
        {
            contentHtml: manifest.content_html || '',
            enableIntroFocusFactuality: true
        }
    );
    const semanticOverlay = semanticOverlayPath
        ? JSON.parse(fs.readFileSync(semanticOverlayPath, 'utf8'))
        : {};
    const checks = { ...deterministicChecks, ...semanticOverlay };

    const scored = scoreAnalysisResults({ checks }, contentType);
    const verdicts = summarizeVerdicts(checks);

    return {
        fixture: {
            manifest_path: manifestPath,
            semantic_overlay_path: semanticOverlayPath,
            title: manifest.title || null,
            content_type: contentType,
            word_count: Number(manifest.word_count || 0),
            metadata: manifest.metadata || {}
        },
        verdicts,
        deterministic_check_count: Object.keys(deterministicChecks).length,
        semantic_overlay_count: Object.keys(semanticOverlay).length,
        total_check_count: Object.keys(checks).length,
        scores: scored.scores,
        guardrails: scored.score_details?.guardrails || { applied: [] }
    };
}

async function replayAnalysisScoring(analysisPath, contentType = 'article', options = {}) {
    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    const rawChecks = analysis?.checks || {};
    const checks = options.normalizeLegacyNoAnchorSemantics
        ? normalizeLegacyNoAnchorSemantics(rawChecks)
        : rawChecks;
    const scored = scoreAnalysisResults({ checks }, contentType);
    const verdicts = summarizeVerdicts(checks);

    return {
        fixture: {
            analysis_path: analysisPath,
            title: analysis?.title || analysis?.manifest?.title || null,
            content_type: contentType
        },
        verdicts,
        total_check_count: Object.keys(checks).length,
        scores: scored.scores,
        guardrails: scored.score_details?.guardrails || { applied: [] }
    };
}

async function main() {
    const args = process.argv.slice(2);
    const manifestPath = getOptionValue(args, '--manifest=') || DEFAULT_MANIFEST;
    const analysisPath = getOptionValue(args, '--analysis=');
    const contentType = getOptionValue(args, '--content-type=') || 'article';
    const semanticOverlayPath = getOptionValue(args, '--semantic-overlay=');
    const normalizeLegacyAnalysis = args.includes('--normalize-legacy-no-anchor-semantics');
    const asJson = args.includes('--json');

    if (analysisPath && !fs.existsSync(analysisPath)) {
        console.error(`Fixture not found: ${analysisPath}`);
        process.exit(1);
    }
    if (!analysisPath && !fs.existsSync(manifestPath)) {
        console.error(`Fixture not found: ${manifestPath}`);
        process.exit(1);
    }

    const replay = analysisPath
        ? await replayAnalysisScoring(analysisPath, contentType, {
            normalizeLegacyNoAnchorSemantics: normalizeLegacyAnalysis
        })
        : await replayManifestScoring(manifestPath, contentType, semanticOverlayPath);

    if (asJson) {
        console.log(JSON.stringify(replay, null, 2));
        return;
    }

    console.log('Scoring baseline replay');
    console.log(`  Fixture: ${replay.fixture.title || '(untitled)'}`);
    if (replay.fixture.analysis_path) {
        console.log(`  Analysis: ${replay.fixture.analysis_path}`);
    } else {
        console.log(`  Manifest: ${replay.fixture.manifest_path}`);
    }
    if (replay.fixture.semantic_overlay_path) {
        console.log(`  Semantic overlay: ${replay.fixture.semantic_overlay_path}`);
    }
    console.log(`  Content type: ${replay.fixture.content_type}`);
    console.log(`  Word count: ${replay.fixture.word_count}`);
    console.log(`  Deterministic checks: ${replay.deterministic_check_count}`);
    if (replay.semantic_overlay_count > 0) {
        console.log(`  Semantic overlay checks: ${replay.semantic_overlay_count}`);
    }
    console.log(`  Total checks scored: ${replay.total_check_count}`);
    console.log(`  Verdicts: pass=${replay.verdicts.pass || 0}, partial=${replay.verdicts.partial || 0}, fail=${replay.verdicts.fail || 0}, n/a=${replay.verdicts.not_applicable || 0}`);
    console.log(`  AEO: ${replay.scores.AEO}/55`);
    console.log(`  GEO: ${replay.scores.GEO}/45`);
    console.log(`  GLOBAL: ${replay.scores.GLOBAL}/100`);
    if (Array.isArray(replay.guardrails.applied) && replay.guardrails.applied.length > 0) {
        const applied = replay.guardrails.applied
            .map((guardrail) => `${guardrail.guardrail_id}:${guardrail.level}`)
            .join(', ');
        console.log(`  Guardrails: ${applied}`);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_MANIFEST,
    replayManifestScoring,
    replayAnalysisScoring
};
