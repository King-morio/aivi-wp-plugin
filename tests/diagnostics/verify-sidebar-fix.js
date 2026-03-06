#!/usr/bin/env node
/**
 * Standalone Verification Script for Sidebar Data Flow Fix
 *
 * Run: node tests/diagnostics/verify-sidebar-fix.js
 *
 * This script verifies that getGroupedIssues() correctly handles
 * both analysis_summary.categories and legacy report.checks formats.
 */

// Extract getGroupedIssues logic for testing
function getGroupedIssues(report) {
    if (!report) return { groups: {}, allIssues: [], issueCount: 0 };

    // RESULT CONTRACT LOCK: Prefer analysis_summary.categories if available
    if (report.analysis_summary && Array.isArray(report.analysis_summary.categories)) {
        const categories = report.analysis_summary.categories;
        const groups = {};
        const allIssues = [];
        let issueCount = 0;

        categories.forEach(cat => {
            const categoryName = cat.name || cat.id || 'General';
            if (!groups[categoryName]) groups[categoryName] = [];

            const issues = cat.issues || [];
            issues.forEach(issue => {
                const mappedIssue = {
                    id: issue.check_id || issue.id || 'unknown',
                    check_id: issue.check_id || issue.id || 'unknown',
                    name: issue.name || issue.check_id || 'Unknown Check',
                    title: issue.name || issue.check_id || 'Unknown Check',
                    category: categoryName,
                    verdict: issue.ui_verdict || 'fail',
                    ui_verdict: issue.ui_verdict || 'fail',
                    instances: issue.instances || 1,
                    first_instance_node_ref: issue.first_instance_node_ref || null,
                    highlights: []
                };
                groups[categoryName].push(mappedIssue);
                allIssues.push(mappedIssue);

                if (mappedIssue.ui_verdict === 'fail' || mappedIssue.ui_verdict === 'partial') {
                    issueCount++;
                }
            });
        });

        return { groups, allIssues, issueCount };
    }

    // LEGACY FALLBACK: Use report.checks if analysis_summary not available
    if (!report.checks) return { groups: {}, allIssues: [], issueCount: 0 };

    const checksArray = Array.isArray(report.checks)
        ? report.checks
        : Object.entries(report.checks).map(([key, val]) => ({ ...val, id: key }));

    const mappedChecks = checksArray.map(c => ({
        id: c.id || 'unknown',
        check_id: c.id || 'unknown',
        name: c.title || c.id || 'Unknown',
        verdict: c.verdict || 'fail',
        ui_verdict: c.verdict || 'fail',
        category: c.category || 'General',
        instances: c.instances || 1
    }));

    const groups = {};
    mappedChecks.forEach(check => {
        if (!groups[check.category]) groups[check.category] = [];
        groups[check.category].push(check);
    });

    const issueCount = mappedChecks.filter(c =>
        c.verdict === 'fail' || c.verdict === 'partial'
    ).length;

    return { groups, allIssues: mappedChecks, issueCount };
}

// Test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${e.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
    }
}

// Run tests
console.log('\n=== Sidebar Data Flow Fix Verification ===\n');

console.log('Test Suite: Result Contract Lock Format');

test('Should read from analysis_summary.categories when present', () => {
    const report = {
        ok: true,
        run_id: 'test-run-123',
        status: 'success',
        scores: { AEO: 25, GEO: 20, GLOBAL: 45 },
        analysis_summary: {
            version: '1.2.0',
            run_id: 'test-run-123',
            categories: [
                {
                    id: 'answer_extractability',
                    name: 'Answer Extractability',
                    issue_count: 2,
                    issues: [
                        {
                            check_id: 'direct_answer_first_120',
                            name: 'Direct Answer in First 120 Words',
                            ui_verdict: 'fail',
                            instances: 1
                        },
                        {
                            check_id: 'answer_sentence_concise',
                            name: 'Concise First Sentence',
                            ui_verdict: 'partial',
                            instances: 1
                        }
                    ]
                },
                {
                    id: 'structure_readability',
                    name: 'Structure & Readability',
                    issue_count: 1,
                    issues: [
                        {
                            check_id: 'orphan_headings',
                            name: 'Orphan Headings',
                            ui_verdict: 'fail',
                            instances: 3
                        }
                    ]
                }
            ]
        }
    };

    const result = getGroupedIssues(report);
    assertEqual(result.issueCount, 3, 'issueCount');
    assertEqual(result.allIssues.length, 3, 'allIssues.length');
    assertEqual(Object.keys(result.groups).length, 2, 'groups count');

    const checkIds = result.allIssues.map(i => i.check_id);
    assert(checkIds.includes('direct_answer_first_120'), 'Missing direct_answer_first_120');
    assert(checkIds.includes('orphan_headings'), 'Missing orphan_headings');
});

test('REGRESSION: Should NOT return 0 issues when analysis_summary has categories', () => {
    const report = {
        ok: true,
        status: 'success',
        analysis_summary: {
            categories: [
                {
                    id: 'trust_neutrality_safety',
                    name: 'Trust, Neutrality & Safety',
                    issue_count: 1,
                    issues: [
                        {
                            check_id: 'no_exaggerated_claims',
                            name: 'No Exaggerated Claims',
                            ui_verdict: 'fail',
                            instances: 1
                        }
                    ]
                }
            ]
        }
    };

    const result = getGroupedIssues(report);
    assert(result.issueCount > 0, 'issueCount should NOT be 0');
    assertEqual(result.issueCount, 1, 'issueCount');
});

console.log('\nTest Suite: Legacy Format Fallback');

test('Should fall back to report.checks when analysis_summary missing', () => {
    const report = {
        checks: {
            'single_h1': {
                verdict: 'pass',
                confidence: 1.0,
                category: 'Structure'
            },
            'metadata_checks': {
                verdict: 'fail',
                confidence: 0.9,
                category: 'Trust'
            }
        }
    };

    const result = getGroupedIssues(report);
    assertEqual(result.issueCount, 1, 'issueCount');
    assertEqual(result.allIssues.length, 2, 'allIssues.length');
});

console.log('\nTest Suite: Edge Cases');

test('Should return empty when report is null', () => {
    const result = getGroupedIssues(null);
    assertEqual(result.issueCount, 0, 'issueCount');
    assertEqual(result.allIssues.length, 0, 'allIssues.length');
});

test('Should return empty when both analysis_summary and checks are missing', () => {
    const report = {
        ok: true,
        status: 'success',
        scores: { AEO: 50, GEO: 40 }
    };

    const result = getGroupedIssues(report);
    assertEqual(result.issueCount, 0, 'issueCount');
});

test('Should correctly count only fail and partial verdicts', () => {
    const report = {
        analysis_summary: {
            categories: [
                {
                    id: 'test_category',
                    name: 'Test Category',
                    issues: [
                        { check_id: 'check1', ui_verdict: 'fail', instances: 1 },
                        { check_id: 'check2', ui_verdict: 'partial', instances: 1 },
                        { check_id: 'check3', ui_verdict: 'pass', instances: 1 },
                        { check_id: 'check4', ui_verdict: 'not_applicable', instances: 1 }
                    ]
                }
            ]
        }
    };

    const result = getGroupedIssues(report);
    assertEqual(result.issueCount, 2, 'issueCount (fail+partial only)');
    assertEqual(result.allIssues.length, 4, 'allIssues.length (all issues)');
});

// Summary
console.log('\n=== Summary ===');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);

if (failed > 0) {
    console.log('\n✗ VERIFICATION FAILED - Fix may not be working correctly\n');
    process.exit(1);
} else {
    console.log('\n✓ ALL TESTS PASSED - Fix verified!\n');
    process.exit(0);
}
