/**
 * End-to-End Analysis Simulation
 *
 * Simulates the complete flow from worker output to sidebar payload
 * to verify no breaking changes in Result Contract Lock implementation.
 */

const { prepareSidebarPayload, extractCheckDetails, enrichWithUiVerdict } = require('./analysis-serializer');
const { generateSessionToken, validateSessionToken } = require('./analysis-details-handler');

// Simulate a realistic full analysis result from Mistral/worker
const simulatedWorkerOutput = {
    scores: {
        AEO: 42,
        GEO: 35,
        GLOBAL: 77
    },
    classification: {
        content_type: 'how-to',
        confidence: 0.92
    },
    checks: {
        immediate_answer_placement: {
            verdict: 'pass',
            confidence: 0.95,
            explanation: 'Direct answer found within first 80 words.',
            highlights: [],
            suggestions: []
        },
        answer_sentence_concise: {
            verdict: 'partial',
            confidence: 0.78,
            explanation: 'First sentence is 72 words, slightly above optimal 40-60 range.',
            highlights: [
                { node_ref: 'block-intro-1', start: 0, end: 350 }
            ],
            suggestions: [
                { text: 'Consider breaking the opening sentence into 2 shorter sentences.' }
            ]
        },
        question_answer_alignment: {
            verdict: 'pass',
            confidence: 0.88,
            explanation: 'Strong semantic alignment between title and content.',
            highlights: [],
            suggestions: []
        },
        single_h1: {
            verdict: 'pass',
            confidence: 1.0,
            explanation: 'Exactly one H1 tag found.',
            highlights: [],
            suggestions: []
        },
        logical_heading_hierarchy: {
            verdict: 'fail',
            confidence: 0.95,
            explanation: 'Heading hierarchy skips from H2 to H4 in section 3.',
            highlights: [
                { node_ref: 'block-section-3-h4', start: 0, end: 45 }
            ],
            suggestions: [
                { text: 'Add an H3 heading before the H4 in section 3.' }
            ]
        },
        heading_topic_fulfillment: {
            verdict: 'pass',
            confidence: 0.90,
            explanation: 'All headings have adequate content.',
            highlights: [],
            suggestions: []
        },
        appropriate_paragraph_length: {
            verdict: 'partial',
            confidence: 0.82,
            explanation: 'One paragraph exceeds 150 words.',
            highlights: [
                { node_ref: 'block-para-7', start: 0, end: 800 }
            ],
            suggestions: [
                { text: 'Break paragraph 7 into smaller chunks for better readability.' }
            ]
        },
        valid_jsonld_schema: {
            verdict: 'pass',
            confidence: 1.0,
            explanation: 'Valid JSON-LD schema detected.',
            highlights: [],
            suggestions: []
        },
        howto_schema_presence_and_completeness: {
            verdict: 'fail',
            confidence: 0.88,
            explanation: 'HowTo schema missing required "step" property.',
            highlights: [
                { node_ref: 'script-jsonld', start: 50, end: 200 }
            ],
            suggestions: [
                { text: 'Add HowToStep items to your HowTo schema.' },
                { text: 'Include estimatedCost and supply properties.' }
            ]
        },
        author_identified: {
            verdict: 'pass',
            confidence: 0.95,
            explanation: 'Author meta tag found.',
            highlights: [],
            suggestions: []
        },
        author_bio_present: {
            verdict: 'fail',
            confidence: 0.90,
            explanation: 'No author bio section found.',
            highlights: [],
            suggestions: [
                { text: 'Add an author bio section with credentials.' }
            ]
        },
        duplicate_or_near_duplicate_detection: {
            verdict: 'pass',
            confidence: 0.85,
            explanation: 'No significant duplicate content detected.',
            highlights: [],
            suggestions: []
        }
    },
    schema_suggestions: {
        faq_jsonld: null,
        howto_jsonld: {
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: 'How to Configure AiVI Plugin'
        }
    },
    completed_at: new Date().toISOString()
};

async function main() {
    console.log('='.repeat(60));
    console.log('RESULT CONTRACT LOCK - END-TO-END SIMULATION');
    console.log('='.repeat(60));

    console.log('\n[1] Worker enriches result with ui_verdict...');
    const enrichedResult = enrichWithUiVerdict(JSON.parse(JSON.stringify(simulatedWorkerOutput)));

    let uiVerdictCount = 0;
    Object.entries(enrichedResult.checks).forEach(([id, check]) => {
        if (check.ui_verdict) uiVerdictCount += 1;
        console.log(`   ${id}: verdict="${check.verdict}" -> ui_verdict="${check.ui_verdict}"`);
    });
    console.log(`OK: ${uiVerdictCount} checks have ui_verdict`);

    console.log('\n[2] Preparing sidebar payload...');
    const runId = 'sim-run-' + Date.now();
    const sidebarPayload = prepareSidebarPayload(enrichedResult, {
        runId,
        scores: enrichedResult.scores
    });

    console.log(`   run_id: ${sidebarPayload.run_id}`);
    console.log(`   status: success`);
    console.log(`   scores: AEO=${sidebarPayload.scores.AEO}, GEO=${sidebarPayload.scores.GEO}, GLOBAL=${sidebarPayload.scores.GLOBAL}`);
    console.log(`   analysis_summary version: ${sidebarPayload.analysis_summary.version}`);
    console.log(`   categories with issues: ${sidebarPayload.analysis_summary.categories.length}`);

    console.log('\n[3] Verifying analysis_summary structure...');
    let totalIssues = 0;
    let hasExplanation = false;
    let hasHighlights = false;
    let hasSuggestions = false;

    sidebarPayload.analysis_summary.categories.forEach((cat) => {
        console.log(`\n   Category: ${cat.name} (${cat.issue_count} issues)`);
        cat.issues.forEach((issue) => {
            totalIssues += 1;
            console.log(`      - ${issue.check_id}: ${issue.ui_verdict} (${issue.instances} instances)`);
            if (issue.explanation) hasExplanation = true;
            if (issue.highlights) hasHighlights = true;
            if (issue.suggestions) hasSuggestions = true;
        });
    });

    console.log(`\n   Total issues in analysis_summary: ${totalIssues}`);
    console.log(`   Contains explanation: ${hasExplanation ? 'NO' : 'OK'}`);
    console.log(`   Contains highlights: ${hasHighlights ? 'NO' : 'OK'}`);
    console.log(`   Contains suggestions: ${hasSuggestions ? 'NO' : 'OK'}`);

    console.log('\n[4] Testing session token generation...');
    const siteId = 'test-site.example.com';
    const token = await generateSessionToken(runId, siteId);
    if (!token) {
        throw new Error('Session token generation failed');
    }
    console.log(`   Generated token: ${token.substring(0, 40)}...`);

    const validation = await validateSessionToken(token, runId, siteId);
    console.log(`   Token validation: ${validation.valid ? 'OK' : 'FAIL: ' + validation.error}`);

    console.log('\n[5] Testing details extraction...');
    const testCheckId = 'logical_heading_hierarchy';
    const checkDetails = extractCheckDetails(enrichedResult, testCheckId, 0);

    if (checkDetails) {
        console.log(`   Retrieved details for: ${testCheckId}`);
        console.log(`   verdict: ${checkDetails.verdict}`);
        console.log(`   ui_verdict: ${checkDetails.ui_verdict}`);
        console.log(`   has explanation: ${!!checkDetails.explanation}`);
        console.log(`   has highlights: ${!!(checkDetails.highlights && checkDetails.highlights.length)}`);
        console.log(`   has suggestions: ${!!(checkDetails.suggestions && checkDetails.suggestions.length)}`);
        console.log(`   focused_highlight: ${checkDetails.focused_highlight ? checkDetails.focused_highlight.node_ref : 'none'}`);
    } else {
        throw new Error('Failed to retrieve check details');
    }

    console.log('\n[6] Verifying issue count accuracy...');
    const failPartialChecks = Object.entries(enrichedResult.checks).filter(([, check]) => check.verdict === 'fail' || check.verdict === 'partial');
    console.log(`   Checks with fail/partial verdict: ${failPartialChecks.length}`);
    console.log(`   Issues in analysis_summary: ${totalIssues}`);
    console.log(`   Match: ${totalIssues === failPartialChecks.length ? 'OK' : 'FAIL'}`);

    const allPassed = (
        uiVerdictCount === Object.keys(enrichedResult.checks).length &&
        !hasExplanation &&
        !hasHighlights &&
        !hasSuggestions &&
        validation.valid &&
        checkDetails !== null &&
        totalIssues === failPartialChecks.length
    );

    console.log('\n' + '='.repeat(60));
    if (!allPassed) {
        console.log('SIMULATION FAILED');
        console.log('='.repeat(60));
        process.exitCode = 1;
        return;
    }

    console.log('SIMULATION PASSED');
    console.log('='.repeat(60));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
