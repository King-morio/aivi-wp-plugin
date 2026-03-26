/**
 * Category Integrity Tests - Canonical Primary Category Mapping
 *
 * Validates:
 * 1. Exactly 8 primary categories exist
 * 2. No check_id appears in multiple categories
 * 3. All checks from definitions are mapped to a category
 * 4. No AEO/GEO grouping in sidebar payload
 * 5. Category order is stable and deterministic
 */

const fs = require('fs');
const path = require('path');

const {
    loadPrimaryCategoryMap,
    validateCategoryMapping,
    serializeForSidebar,
    buildCategoryLookup
} = require('./analysis-serializer');

const {
    validateSidebarPayload,
    FORBIDDEN_CATEGORY_IDS,
    CANONICAL_CATEGORY_IDS,
    ALLOWED_HIGHLIGHT_FIELDS
} = require('./sidebar-payload-stripper');

// Load test data
const primaryCategoryMap = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'schemas', 'primary-category-map.json'), 'utf8')
);

const checksDefinitions = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'shared', 'schemas', 'checks-definitions-v1.json'), 'utf8')
);

describe('Canonical Primary Category Mapping', () => {

    // ============================================
    // 1. CATEGORY COUNT VALIDATION
    // ============================================
    describe('1. Category Count', () => {

        test('primary category map has exactly 8 categories', () => {
            expect(primaryCategoryMap.categories.length).toBe(8);
        });

        test('CANONICAL_CATEGORY_IDS has exactly 8 entries', () => {
            expect(CANONICAL_CATEGORY_IDS.length).toBe(8);
        });

        test('all canonical category IDs are in primary map', () => {
            const mapIds = primaryCategoryMap.categories.map(c => c.id);
            CANONICAL_CATEGORY_IDS.forEach(id => {
                expect(mapIds).toContain(id);
            });
        });

        test('validateCategoryMapping passes', () => {
            const validation = validateCategoryMapping();
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });
    });

    // ============================================
    // 2. CHECK UNIQUENESS VALIDATION
    // ============================================
    describe('2. Check ID Uniqueness', () => {

        test('no check_id appears in multiple categories', () => {
            const seenCheckIds = new Set();
            const duplicates = [];

            primaryCategoryMap.categories.forEach(category => {
                category.check_ids.forEach(checkId => {
                    if (seenCheckIds.has(checkId)) {
                        duplicates.push(checkId);
                    }
                    seenCheckIds.add(checkId);
                });
            });

            expect(duplicates).toHaveLength(0);
        });

        test('category lookup returns unique mapping for each check', () => {
            const lookup = buildCategoryLookup();
            const checkIds = Object.keys(lookup);

            // Each check should map to exactly one category
            checkIds.forEach(checkId => {
                expect(lookup[checkId]).toBeDefined();
                expect(lookup[checkId].category_id).toBeDefined();
            });
        });
    });

    // ============================================
    // 3. DEFINITION COVERAGE VALIDATION
    // ============================================
    describe('3. Definition Coverage', () => {

        test('all checks from definitions are in category map', () => {
            const lookup = buildCategoryLookup();
            const unmapped = [];

            // Extract all check IDs from definitions
            Object.values(checksDefinitions.categories).forEach(categoryData => {
                if (categoryData.checks) {
                    Object.keys(categoryData.checks).forEach(checkId => {
                        if (!lookup[checkId]) {
                            unmapped.push(checkId);
                        }
                    });
                }
            });

            if (unmapped.length > 0) {
                console.log('Unmapped checks:', unmapped);
            }

            expect(unmapped).toHaveLength(0);
        });

        test('total check count matches definitions', () => {
            let totalInMap = 0;
            primaryCategoryMap.categories.forEach(cat => {
                totalInMap += cat.check_ids.length;
            });

            let totalInDefs = 0;
            Object.values(checksDefinitions.categories).forEach(categoryData => {
                if (categoryData.checks) {
                    totalInDefs += Object.keys(categoryData.checks).length;
                }
            });

            expect(totalInMap).toBe(totalInDefs);
        });
    });

    // ============================================
    // 4. NO AEO/GEO GROUPING
    // ============================================
    describe('4. No AEO/GEO Grouping', () => {

        test('FORBIDDEN_CATEGORY_IDS includes aeo and geo', () => {
            expect(FORBIDDEN_CATEGORY_IDS).toContain('aeo');
            expect(FORBIDDEN_CATEGORY_IDS).toContain('geo');
            expect(FORBIDDEN_CATEGORY_IDS).toContain('AEO');
            expect(FORBIDDEN_CATEGORY_IDS).toContain('GEO');
        });

        test('no category in map uses AEO/GEO as id', () => {
            primaryCategoryMap.categories.forEach(category => {
                expect(category.id.toLowerCase()).not.toBe('aeo');
                expect(category.id.toLowerCase()).not.toBe('geo');
            });
        });

        test('no category in map uses AEO/GEO as name', () => {
            primaryCategoryMap.categories.forEach(category => {
                expect(category.name.toUpperCase()).not.toBe('AEO');
                expect(category.name.toUpperCase()).not.toBe('GEO');
            });
        });

        test('serialized output has no AEO/GEO categories', () => {
            // Mock analysis with checks
            const mockAnalysis = {
                checks: {
                    single_h1: { verdict: 'fail', highlights: [] },
                    immediate_answer_placement: { verdict: 'partial', highlights: [] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            analysis_summary.categories.forEach(cat => {
                expect(cat.id.toLowerCase()).not.toBe('aeo');
                expect(cat.id.toLowerCase()).not.toBe('geo');
                expect(cat.name.toUpperCase()).not.toBe('AEO');
                expect(cat.name.toUpperCase()).not.toBe('GEO');
            });
        });

        test('validateSidebarPayload detects AEO/GEO violations', () => {
            const badPayload = {
                ok: true,
                analysis_summary: {
                    categories: [
                        { id: 'AEO', name: 'AEO Checks', issues: [] }
                    ]
                }
            };

            const validation = validateSidebarPayload(badPayload);

            expect(validation.valid).toBe(false);
            expect(validation.violations.some(v => v.includes('forbidden_category'))).toBe(true);
        });
    });

    // ============================================
    // 5. CATEGORY ORDER STABILITY
    // ============================================
    describe('5. Category Order Stability', () => {

        test('categories have sequential display_order 1-8', () => {
            const orders = primaryCategoryMap.categories.map(c => c.display_order).sort((a, b) => a - b);
            expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        });

        test('serialization preserves display order', () => {
            // Mock analysis with checks from different categories
            const mockAnalysis = {
                checks: {
                    single_h1: { verdict: 'fail', highlights: [] },
                    immediate_answer_placement: { verdict: 'fail', highlights: [] },
                    author_identified: { verdict: 'fail', highlights: [] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            // Categories should be in display_order sequence
            for (let i = 1; i < analysis_summary.categories.length; i++) {
                const prevCat = primaryCategoryMap.categories.find(c => c.id === analysis_summary.categories[i-1].id);
                const currCat = primaryCategoryMap.categories.find(c => c.id === analysis_summary.categories[i].id);
                expect(prevCat.display_order).toBeLessThan(currCat.display_order);
            }
        });

        test('order is deterministic across multiple serializations', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: { verdict: 'fail', highlights: [] },
                    immediate_answer_placement: { verdict: 'fail', highlights: [] }
                }
            };

            const result1 = serializeForSidebar(mockAnalysis, 'test-1');
            const result2 = serializeForSidebar(mockAnalysis, 'test-2');

            expect(result1.analysis_summary.categories.map(c => c.id))
                .toEqual(result2.analysis_summary.categories.map(c => c.id));
        });
    });

    // ============================================
    // 6. SERIALIZATION CORRECTNESS
    // ============================================
    describe('6. Serialization Correctness', () => {

        test('unmapped checks are excluded from sidebar', () => {
            // Mock analysis with a fake unmapped check
            const mockAnalysis = {
                checks: {
                    single_h1: { verdict: 'fail', highlights: [] },
                    fake_unmapped_check: { verdict: 'fail', highlights: [] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            // Find all check_ids in the output
            const allCheckIds = [];
            analysis_summary.categories.forEach(cat => {
                cat.issues.forEach(issue => {
                    allCheckIds.push(issue.check_id);
                });
            });

            expect(allCheckIds).not.toContain('fake_unmapped_check');
            expect(allCheckIds).toContain('single_h1');
        });

        test('only fail/partial verdicts appear as issues', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: { verdict: 'fail', highlights: [] },
                    logical_heading_hierarchy: { verdict: 'pass', highlights: [] },
                    heading_topic_fulfillment: { verdict: 'partial', highlights: [] }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            const allCheckIds = [];
            analysis_summary.categories.forEach(cat => {
                cat.issues.forEach(issue => {
                    allCheckIds.push(issue.check_id);
                });
            });

            expect(allCheckIds).toContain('single_h1');
            expect(allCheckIds).toContain('heading_topic_fulfillment');
            expect(allCheckIds).not.toContain('logical_heading_hierarchy');
        });

        test('issues have correct structure', () => {
            const mockAnalysis = {
                checks: {
                    single_h1: {
                        verdict: 'fail',
                        highlights: [{ node_ref: 'block-1' }]
                    }
                }
            };

            const { analysis_summary } = serializeForSidebar(mockAnalysis, 'test-run');

            const issue = analysis_summary.categories[0].issues[0];

            expect(issue).toHaveProperty('check_id', 'single_h1');
            expect(issue).toHaveProperty('name');
            expect(issue).toHaveProperty('ui_verdict', 'fail');
            expect(issue).toHaveProperty('instances', 1);
            expect(issue).toHaveProperty('first_instance_node_ref', 'block-1');

            // Should NOT have forbidden fields
            expect(issue).not.toHaveProperty('explanation');
            expect(issue).not.toHaveProperty('suggestions');
            expect(issue).toHaveProperty('highlights');
            issue.highlights.forEach(highlight => {
                Object.keys(highlight).forEach(key => {
                    expect(ALLOWED_HIGHLIGHT_FIELDS).toContain(key);
                });
            });
        });
    });
});

// Run tests if executed directly
if (require.main === module) {
    console.log('Run with: npx jest category-integrity.test.js');
}
