/**
 * Sidebar Payload Stripper - Hard Separation Enforcement
 *
 * SECURITY CRITICAL: This module ensures no sensitive data ever reaches the sidebar.
 * PRESENTATION LOCK: Enforces canonical 7-category grouping, no AEO/GEO labels.
 * NOISE ELIMINATION: Only fail/partial issues allowed, proper ordering enforced.
 *
 * Allowed fields in sidebar payload (WHITELIST ONLY):
 * - run_id, version, status, ok, completed_at, scores, details_token
 * - categories[]: id, name, issue_count
 * - issues[]: check_id, detail_ref, name, ui_verdict, instances, first_instance_node_ref,
 *             first_instance_snippet, first_instance_signature, first_instance_start, first_instance_end,
 *             review_summary, highlights[]
 *
 * FORBIDDEN fields (MUST NEVER be in sidebar payload):
 * - explanation, suggestions, snippets, offsets
 * - confidence, tone, authority, raw_*, full_*, checks (full object)
 * - AEO/GEO as grouping labels (scores only, never for grouping)
 * - pass verdicts in issues list
 *
 * Version: 2.1.0
 * Last Updated: 2026-01-29
 */

const FORBIDDEN_FIELDS = [
    'explanation',
    'suggestions',
    'snippets',
    'offsets',
    'confidence',
    'tone',
    'authority',
    'raw_response',
    'full_analysis',
    'checks',           // Full checks object
    'result',           // Full result object
    'result_url',       // Presigned URL to full result
    'result_s3',        // S3 URI to full result
    'raw_response_url',
    'raw_response_s3',
    'metadata',         // May contain sensitive info
    'audit',            // Internal audit data
    'pii_detected',     // PII detection results
    'content_hash'      // Content fingerprint
];

// PRESENTATION LOCK: Forbidden category IDs (AEO/GEO are scores, not grouping)
const FORBIDDEN_CATEGORY_IDS = ['aeo', 'geo', 'AEO', 'GEO'];

const CANONICAL_CATEGORY_IDS = [
    'intro_focus_factuality',
    'answer_extractability',
    'structure_readability',
    'schema_structured_data',
    'freshness_temporal_validity',
    'entities_semantic_clarity',
    'trust_neutrality_safety',
    'citability_verifiability'
];

const ALLOWED_ISSUE_FIELDS = [
    'check_id',
    'detail_ref',
    'check_name',
    'name',
    'ui_verdict',
    'instances',
    'first_instance_node_ref',
    'first_instance_snippet',
    'first_instance_signature',
    'first_instance_start',
    'first_instance_end',
    'analysis_ref',
    'rewrite_target',
    'repair_intent',
    'explanation_pack',
    'issue_explanation',
    'review_summary',
    'fix_assist_triage',
    'highlights'
];

const ALLOWED_HIGHLIGHT_FIELDS = [
    'node_ref',
    'signature',
    'start',
    'end',
    'snippet',
    'message',
    'type',
    'scope',
    'boundary',
    'text_quote_selector',
    'anchor_status',
    'anchor_strategy',
    'analysis_ref',
    'rewrite_target',
    'repair_intent',
    'explanation_pack',
    'issue_explanation',
    'review_summary',
    'fix_assist_triage'
];

const ALLOWED_CATEGORY_FIELDS = [
    'id',
    'name',
    'issue_count',
    'issues'
];

const ALLOWED_ROOT_FIELDS = [
    'ok',
    'run_id',
    'status',
    'partial',
    'version',
    'scores',
    'analysis_summary',
    'overlay_content',
    'billing_summary',
    'completed_at',
    'details_token',
    'prompt_provenance',
    'error',
    'message',
    'superseded_by_run_id'
];

const stripPartial = (partial) => {
    if (!partial || typeof partial !== 'object') return null;
    const stripped = {};
    const allowed = [
        'mode',
        'reason',
        'expected_ai_checks',
        'returned_ai_checks',
        'missing_ai_checks',
        'missing_ai_check_ids',
        'filtered_invalid_checks',
        'completed_checks'
    ];
    allowed.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(partial, field)) {
            stripped[field] = partial[field];
        }
    });
    return Object.keys(stripped).length ? stripped : null;
};

const stripBillingSummary = (billing) => {
    if (!billing || typeof billing !== 'object') return null;
    const stripped = {
        billing_status: billing.billing_status ? String(billing.billing_status) : null,
        credits_used: Number.isInteger(billing.credits_used) ? billing.credits_used : null,
        reserved_credits: Number.isInteger(billing.reserved_credits) ? billing.reserved_credits : null,
        refunded_credits: Number.isInteger(billing.refunded_credits) ? billing.refunded_credits : null,
        previous_balance: Number.isInteger(billing.previous_balance) ? billing.previous_balance : null,
        current_balance: Number.isInteger(billing.current_balance) ? billing.current_balance : null
    };
    const hasAny = Object.values(stripped).some((value) => value !== null && value !== '');
    return hasAny ? stripped : null;
};

/**
 * Log helper for security events
 */
const securityLog = (level, message, data = {}) => {
    console.log(JSON.stringify({
        level,
        message,
        service: 'sidebar-stripper',
        security: true,
        ...data,
        timestamp: new Date().toISOString()
    }));
};

const stripAnalysisRef = (analysisRef) => {
    if (!analysisRef || typeof analysisRef !== 'object') return null;
    return {
        run_id: analysisRef.run_id || null,
        check_id: analysisRef.check_id || null,
        instance_index: Number.isInteger(analysisRef.instance_index) ? analysisRef.instance_index : 0
    };
};

const stripRewriteTarget = (rewriteTarget) => {
    if (!rewriteTarget || typeof rewriteTarget !== 'object') return null;
    const stripped = {
        actionable: rewriteTarget.actionable === true,
        mode: rewriteTarget.mode ? String(rewriteTarget.mode) : 'legacy',
        operation: rewriteTarget.operation ? String(rewriteTarget.operation) : null,
        primary_node_ref: rewriteTarget.primary_node_ref ? String(rewriteTarget.primary_node_ref) : null,
        anchor_node_ref: rewriteTarget.anchor_node_ref ? String(rewriteTarget.anchor_node_ref) : null,
        primary_repair_node_ref: rewriteTarget.primary_repair_node_ref ? String(rewriteTarget.primary_repair_node_ref) : null,
        node_refs: Array.isArray(rewriteTarget.node_refs)
            ? rewriteTarget.node_refs.map((ref) => String(ref || '')).filter(Boolean)
            : [],
        repair_node_refs: Array.isArray(rewriteTarget.repair_node_refs)
            ? rewriteTarget.repair_node_refs.map((ref) => String(ref || '')).filter(Boolean)
            : [],
        target_text: typeof rewriteTarget.target_text === 'string' ? rewriteTarget.target_text : null,
        quote: rewriteTarget.quote && typeof rewriteTarget.quote === 'object' && typeof rewriteTarget.quote.exact === 'string'
            ? { exact: rewriteTarget.quote.exact }
            : null,
        start: Number.isInteger(rewriteTarget.start) ? rewriteTarget.start : null,
        end: Number.isInteger(rewriteTarget.end) ? rewriteTarget.end : null,
        heading_node_ref: rewriteTarget.heading_node_ref ? String(rewriteTarget.heading_node_ref) : null,
        section_start_node_ref: rewriteTarget.section_start_node_ref ? String(rewriteTarget.section_start_node_ref) : null,
        section_end_node_ref: rewriteTarget.section_end_node_ref ? String(rewriteTarget.section_end_node_ref) : null,
        boundary_type: rewriteTarget.boundary_type ? String(rewriteTarget.boundary_type) : null,
        boundary_node_ref: rewriteTarget.boundary_node_ref ? String(rewriteTarget.boundary_node_ref) : null,
        scope_confidence: Number.isFinite(Number(rewriteTarget.scope_confidence)) ? Number(rewriteTarget.scope_confidence) : null,
        resolver_reason: rewriteTarget.resolver_reason ? String(rewriteTarget.resolver_reason) : null
    };
    if (Number.isInteger(rewriteTarget.rewrite_context_window)) {
        stripped.rewrite_context_window = rewriteTarget.rewrite_context_window;
    }
    return stripped;
};

const stripRepairIntent = (repairIntent) => {
    if (!repairIntent || typeof repairIntent !== 'object') return null;
    return {
        check_id: repairIntent.check_id ? String(repairIntent.check_id) : null,
        check_name: repairIntent.check_name ? String(repairIntent.check_name) : null,
        rule_hint: repairIntent.rule_hint ? String(repairIntent.rule_hint) : null,
        instruction: repairIntent.instruction ? String(repairIntent.instruction) : null,
        must_preserve: Array.isArray(repairIntent.must_preserve)
            ? repairIntent.must_preserve.map((item) => String(item || '')).filter(Boolean)
            : [],
        must_change: Array.isArray(repairIntent.must_change)
            ? repairIntent.must_change.map((item) => String(item || '')).filter(Boolean)
            : []
    };
};

const stripExplanationPack = (pack) => {
    if (!pack || typeof pack !== 'object') return null;
    const normalizeText = (value, max = 360) => {
        if (typeof value !== 'string') return '';
        const text = value.replace(/\s+/g, ' ').trim();
        if (!text) return '';
        if (text.length <= max) return text;
        return `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
    };
    const steps = Array.isArray(pack.how_to_fix_steps)
        ? pack.how_to_fix_steps
            .map((step) => normalizeText(step, 240))
            .filter(Boolean)
            .slice(0, 4)
        : [];
    const stripped = {
        what_failed: normalizeText(pack.what_failed, 320),
        why_it_matters: normalizeText(pack.why_it_matters, 340),
        how_to_fix_steps: steps,
        example_pattern: normalizeText(pack.example_pattern, 260)
    };
    const hasAny = stripped.what_failed || stripped.why_it_matters || stripped.how_to_fix_steps.length || stripped.example_pattern;
    return hasAny ? stripped : null;
};

const stripFixAssistTriage = (triage) => {
    if (!triage || typeof triage !== 'object') return null;
    const allowedStates = new Set([
        'rewrite_needed',
        'optional_improvement',
        'structural_guidance_only',
        'leave_as_is'
    ]);
    const normalizeText = (value, max = 360) => {
        if (typeof value !== 'string') return '';
        const text = value.replace(/\s+/g, ' ').trim();
        if (!text) return '';
        if (text.length <= max) return text;
        return `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
    };
    const state = allowedStates.has(String(triage.state || '').trim())
        ? String(triage.state).trim()
        : 'structural_guidance_only';
    return {
        state,
        label: normalizeText(triage.label, 80) || null,
        summary: normalizeText(triage.summary, 280) || null,
        framing: normalizeText(triage.framing, 320) || null,
        copilot_mode: normalizeText(triage.copilot_mode, 64) || null,
        requires_web_consent: triage.requires_web_consent === true,
        variants_allowed: triage.variants_allowed === true,
        keep_as_is_note: normalizeText(triage.keep_as_is_note, 220) || null
    };
};

/**
 * Strip an issue object to only allowed fields
 * @param {Object} issue - Raw issue object
 * @returns {Object} - Stripped issue with only allowed fields
 */
const stripIssue = (issue) => {
    if (!issue || typeof issue !== 'object') return null;

    const stripped = {};

    ALLOWED_ISSUE_FIELDS.forEach(field => {
        if (issue.hasOwnProperty(field)) {
            stripped[field] = issue[field];
        }
    });

    // Ensure required fields have defaults
    stripped.check_id = stripped.check_id || 'unknown';
    stripped.detail_ref = stripped.detail_ref || `check:${stripped.check_id}`;
    stripped.check_name = stripped.check_name || stripped.name || stripped.check_id;
    stripped.name = stripped.name || stripped.check_name || stripped.check_id;
    stripped.ui_verdict = stripped.ui_verdict || 'fail';
    stripped.instances = typeof stripped.instances === 'number' ? stripped.instances : 1;
    stripped.first_instance_node_ref = stripped.first_instance_node_ref || null;
    stripped.first_instance_snippet = typeof stripped.first_instance_snippet === 'string'
        ? stripped.first_instance_snippet
        : null;
    stripped.first_instance_signature = stripped.first_instance_signature || null;
    stripped.first_instance_start = Number.isInteger(stripped.first_instance_start)
        ? stripped.first_instance_start
        : null;
    stripped.first_instance_end = Number.isInteger(stripped.first_instance_end)
        ? stripped.first_instance_end
        : null;
    stripped.analysis_ref = stripAnalysisRef(issue.analysis_ref);
    stripped.rewrite_target = stripRewriteTarget(issue.rewrite_target);
    stripped.repair_intent = stripRepairIntent(issue.repair_intent);
    stripped.explanation_pack = stripExplanationPack(issue.explanation_pack);
    stripped.issue_explanation = typeof issue.issue_explanation === 'string'
        ? issue.issue_explanation.replace(/\s+/g, ' ').trim().slice(0, 1000)
        : null;
    stripped.review_summary = typeof issue.review_summary === 'string'
        ? issue.review_summary.replace(/\s+/g, ' ').trim().slice(0, 280)
        : null;
    stripped.fix_assist_triage = stripFixAssistTriage(issue.fix_assist_triage);
    if (Array.isArray(issue.highlights)) {
        stripped.highlights = issue.highlights.map(highlight => {
            if (!highlight || typeof highlight !== 'object') return null;
            const compact = {};
            ALLOWED_HIGHLIGHT_FIELDS.forEach(field => {
                if (highlight.hasOwnProperty(field)) {
                    compact[field] = highlight[field];
                }
            });
            compact.analysis_ref = stripAnalysisRef(highlight.analysis_ref);
            compact.rewrite_target = stripRewriteTarget(highlight.rewrite_target);
            compact.repair_intent = stripRepairIntent(highlight.repair_intent);
            compact.explanation_pack = stripExplanationPack(highlight.explanation_pack);
            compact.issue_explanation = typeof highlight.issue_explanation === 'string'
                ? highlight.issue_explanation.replace(/\s+/g, ' ').trim().slice(0, 1000)
                : null;
            compact.review_summary = typeof highlight.review_summary === 'string'
                ? highlight.review_summary.replace(/\s+/g, ' ').trim().slice(0, 280)
                : null;
            compact.fix_assist_triage = stripFixAssistTriage(highlight.fix_assist_triage);
            return compact;
        }).filter(highlight => highlight !== null);
    }

    return stripped;
};

/**
 * Strip a category object to only allowed fields
 * @param {Object} category - Raw category object
 * @returns {Object} - Stripped category with only allowed fields
 */
const stripCategory = (category) => {
    if (!category || typeof category !== 'object') return null;

    const stripped = {
        id: category.id || 'unknown',
        name: category.name || category.id || 'Unknown',
        issue_count: typeof category.issue_count === 'number' ? category.issue_count : 0,
        issues: []
    };

    // Strip each issue in the category
    if (Array.isArray(category.issues)) {
        stripped.issues = category.issues
            .map(stripIssue)
            .filter(issue => issue !== null);

        // Ensure issue_count matches actual issues
        stripped.issue_count = stripped.issues.length;
    }

    return stripped;
};

/**
 * Strip analysis_summary to only allowed fields
 * @param {Object} summary - Raw analysis_summary object
 * @returns {Object} - Stripped summary
 */
const stripAnalysisSummary = (summary) => {
    if (!summary || typeof summary !== 'object') return null;

    const stripped = {
        version: summary.version || '1.3.0',
        run_id: summary.run_id || null,
        categories: []
    };
    if (summary.status === 'success_partial') {
        stripped.status = 'success_partial';
    }
    const partial = stripPartial(summary.partial);
    if (partial) {
        stripped.partial = partial;
    }

    if (Array.isArray(summary.categories)) {
        stripped.categories = summary.categories
            .map(stripCategory)
            .filter(cat => cat !== null);
    }

    return stripped;
};

/**
 * MAIN STRIPPER: Strip entire sidebar payload to only allowed fields
 * This is the FINAL gate before any data goes to the sidebar.
 *
 * @param {Object} payload - Raw payload that might contain forbidden fields
 * @param {string} runId - Run ID for logging
 * @returns {Object} - Completely stripped payload safe for sidebar
 */
const stripSidebarPayload = (payload, runId = 'unknown') => {
    if (!payload || typeof payload !== 'object') {
        securityLog('WARN', 'Null or invalid payload to strip', { run_id: runId });
        return { ok: false, error: 'invalid_payload' };
    }

    // Start with empty object - whitelist approach
    const stripped = {};

    // Copy only allowed root fields
    ALLOWED_ROOT_FIELDS.forEach(field => {
        if (payload.hasOwnProperty(field)) {
            if (field === 'analysis_summary') {
                // Deep strip analysis_summary
                stripped[field] = stripAnalysisSummary(payload[field]);
            } else if (field === 'partial') {
                const partial = stripPartial(payload[field]);
                if (partial) {
                    stripped[field] = partial;
                }
            } else if (field === 'billing_summary') {
                const billingSummary = stripBillingSummary(payload[field]);
                if (billingSummary) {
                    stripped[field] = billingSummary;
                }
            } else if (field === 'scores' && typeof payload[field] === 'object') {
                // Only allow numeric score values
                stripped[field] = {};
                Object.entries(payload[field]).forEach(([key, value]) => {
                    if (typeof value === 'number') {
                        stripped[field][key] = value;
                    }
                });
            } else {
                stripped[field] = payload[field];
            }
        }
    });

    // Check for and log any forbidden fields that were present
    const forbiddenPresent = [];
    FORBIDDEN_FIELDS.forEach(field => {
        if (payload.hasOwnProperty(field)) {
            forbiddenPresent.push(field);
        }
    });

    if (forbiddenPresent.length > 0) {
        securityLog('WARN', 'Forbidden fields stripped from sidebar payload', {
            run_id: runId,
            stripped_fields: forbiddenPresent
        });
    }

    // Deep check: scan for any nested forbidden content
    const deepForbidden = scanForForbiddenContent(stripped);
    if (deepForbidden.length > 0) {
        securityLog('ERROR', 'Deep scan found forbidden content after strip', {
            run_id: runId,
            locations: deepForbidden
        });
        // Remove the offending content
        deepForbidden.forEach(loc => {
            removePath(stripped, loc);
        });
    }

    securityLog('INFO', 'Sidebar payload stripped successfully', {
        run_id: runId,
        original_keys: Object.keys(payload).length,
        stripped_keys: Object.keys(stripped).length,
        forbidden_removed: forbiddenPresent.length
    });

    return stripped;
};

/**
 * Deep scan object for any forbidden content
 * @param {Object} obj - Object to scan
 * @param {string} path - Current path (for recursion)
 * @returns {Array} - Array of paths where forbidden content was found
 */
const scanForForbiddenContent = (obj, path = '') => {
    const found = [];

    if (!obj || typeof obj !== 'object') return found;

    const forbiddenKeys = ['explanation', 'suggestions', 'snippets', 'offsets', 'confidence'];

    Object.entries(obj).forEach(([key, value]) => {
        const currentPath = path ? `${path}.${key}` : key;

        if (forbiddenKeys.includes(key)) {
            found.push(currentPath);
        } else if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    found.push(...scanForForbiddenContent(item, `${currentPath}[${index}]`));
                });
            } else {
                found.push(...scanForForbiddenContent(value, currentPath));
            }
        }
    });

    return found;
};

/**
 * Remove a nested path from an object
 * @param {Object} obj - Object to modify
 * @param {string} path - Dot-notation path to remove
 */
const removePath = (obj, path) => {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        if (!current || typeof current !== 'object') return;
        current = current[parts[i]];
    }

    if (current && typeof current === 'object') {
        delete current[parts[parts.length - 1]];
    }
};

/**
 * Validate that a payload is safe for sidebar
 * Returns true only if payload passes all security checks
 *
 * @param {Object} payload - Payload to validate
 * @returns {Object} - { valid: boolean, violations: string[] }
 */
const validateSidebarPayload = (payload) => {
    const violations = [];

    if (!payload || typeof payload !== 'object') {
        return { valid: false, violations: ['invalid_payload'] };
    }

    // Check for forbidden root fields
    FORBIDDEN_FIELDS.forEach(field => {
        if (payload.hasOwnProperty(field)) {
            violations.push(`forbidden_root_field:${field}`);
        }
    });

    // Deep scan for forbidden content
    const deepForbidden = scanForForbiddenContent(payload);
    deepForbidden.forEach(path => {
        violations.push(`forbidden_nested:${path}`);
    });

    // Check analysis_summary structure
    if (payload.analysis_summary) {
        const summary = payload.analysis_summary;

        if (summary.categories && Array.isArray(summary.categories)) {
            summary.categories.forEach((cat, catIdx) => {
                // PRESENTATION LOCK: Check for forbidden AEO/GEO grouping
                if (cat.id && FORBIDDEN_CATEGORY_IDS.includes(cat.id)) {
                    violations.push(`forbidden_category_grouping:${cat.id}`);
                }
                if (cat.name && (cat.name.toUpperCase() === 'AEO' || cat.name.toUpperCase() === 'GEO')) {
                    violations.push(`forbidden_category_name:${cat.name}`);
                }

                if (cat.issues && Array.isArray(cat.issues)) {
                    let seenPartial = false;

                    cat.issues.forEach((issue, issueIdx) => {
                        // Check each issue has only allowed fields
                        Object.keys(issue).forEach(key => {
                            if (!ALLOWED_ISSUE_FIELDS.includes(key)) {
                                violations.push(`forbidden_issue_field:categories[${catIdx}].issues[${issueIdx}].${key}`);
                            }
                        });

                        // NOISE ELIMINATION: fail/partial allowed
                        if (issue.ui_verdict && !['fail', 'partial'].includes(issue.ui_verdict)) {
                            violations.push(`forbidden_verdict_in_issues:categories[${catIdx}].issues[${issueIdx}].ui_verdict=${issue.ui_verdict}`);
                        }

                        // ORDERING: fail -> partial
                        if (issue.ui_verdict === 'fail') {
                            if (seenPartial) violations.push(`ordering_violation:categories[${catIdx}].issues[${issueIdx}].fail_after_partial`);
                        }
                        if (issue.ui_verdict === 'partial') {
                            seenPartial = true;
                        }

                        if (Array.isArray(issue.highlights)) {
                            issue.highlights.forEach((highlight, highlightIdx) => {
                                Object.keys(highlight).forEach(key => {
                                    if (!ALLOWED_HIGHLIGHT_FIELDS.includes(key)) {
                                        violations.push(`forbidden_highlight_field:categories[${catIdx}].issues[${issueIdx}].highlights[${highlightIdx}].${key}`);
                                    }
                                });
                            });
                        }

                        // INSTANCE CONTRACT: if instances > 0, first_instance_node_ref should be present
                        // (null is acceptable if no highlights available)
                    });
                }
            });
        }
    }

    return {
        valid: violations.length === 0,
        violations
    };
};

module.exports = {
    stripSidebarPayload,
    stripAnalysisSummary,
    stripCategory,
    stripIssue,
    validateSidebarPayload,
    scanForForbiddenContent,
    FORBIDDEN_FIELDS,
    FORBIDDEN_CATEGORY_IDS,
    CANONICAL_CATEGORY_IDS,
    ALLOWED_ISSUE_FIELDS,
    ALLOWED_HIGHLIGHT_FIELDS,
    ALLOWED_CATEGORY_FIELDS,
    ALLOWED_ROOT_FIELDS
};
