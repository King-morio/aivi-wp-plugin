const fs = require('fs');
const path = require('path');
const { buildFixAssistTriage } = require('./fix-assist-triage');

let cachedContractSchema = null;

const readJsonFile = (filePath) => {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(String(raw).replace(/^\uFEFF/, ''));
};

const resolveContractSchemaPath = () => {
    const candidates = [
        path.join(__dirname, 'shared', 'schemas', 'fix-assist-contract-v1.json'),
        path.join(__dirname, 'schemas', 'fix-assist-contract-v1.json'),
        path.join(__dirname, '..', 'shared', 'schemas', 'fix-assist-contract-v1.json')
    ];
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || candidates[0];
};

const loadContractSchema = () => {
    if (cachedContractSchema) return cachedContractSchema;
    cachedContractSchema = readJsonFile(resolveContractSchemaPath());
    return cachedContractSchema;
};

const normalizeText = (value, max = 0) => {
    if (typeof value !== 'string') return '';
    const text = value.replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (!Number.isFinite(max) || max <= 0 || text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
};

const toArray = (value) => {
    if (Array.isArray(value)) return value.slice();
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
};

const uniqueStrings = (values, max = 0) => {
    const seen = new Set();
    const output = [];
    toArray(values).forEach((value) => {
        const normalized = normalizeText(String(value || ''), 240);
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        output.push(normalized);
    });
    return max > 0 ? output.slice(0, max) : output;
};

const uniqueLiteralDetails = (details, max = 0) => {
    const seen = new Set();
    const output = [];
    (Array.isArray(details) ? details : []).forEach((detail) => {
        if (!detail || typeof detail !== 'object') return;
        const value = normalizeText(String(detail.value || ''), 240);
        const literalClass = normalizeText(String(detail.literal_class || ''), 40).toLowerCase();
        const sourceType = normalizeText(String(detail.source_type || ''), 80).toLowerCase();
        const sourceField = normalizeText(String(detail.source_field || ''), 120);
        if (!value || !literalClass || !sourceType) return;
        const key = `${literalClass}:${value.toLowerCase()}:${sourceType}:${sourceField.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        output.push({
            value,
            literal_class: literalClass,
            source_type: sourceType,
            source_field: sourceField || null
        });
    });
    return max > 0 ? output.slice(0, max) : output;
};

const normalizeManifestNodes = (manifest) => {
    if (!manifest || typeof manifest !== 'object') return [];
    if (Array.isArray(manifest.nodes) && manifest.nodes.length > 0) {
        return manifest.nodes.map((node, index) => ({
            ref: node.ref || node.node_ref || `node-${index}`,
            type: node.type || node.block_type || 'block',
            text: normalizeText(node.text || '', 600)
        }));
    }
    if (Array.isArray(manifest.block_map) && manifest.block_map.length > 0) {
        return manifest.block_map.map((node, index) => ({
            ref: node.node_ref || `block-${index}`,
            type: node.block_type || node.type || 'block',
            text: normalizeText(node.text || node.text_content || '', 600)
        }));
    }
    return [];
};

const collectHeadingOutline = (manifest) => {
    const nodes = normalizeManifestNodes(manifest);
    return nodes
        .filter((node) => /heading/i.test(String(node.type || '')) && node.text)
        .map((node) => node.text)
        .slice(0, 12);
};

const extractNumberLiterals = (text) => {
    const matches = String(text || '').match(/\b\d[\d,.:/%-]*\b/g);
    return uniqueStrings(matches || [], 10);
};

const extractDateLiterals = (text) => {
    const source = String(text || '');
    const matches = [];
    const monthPattern = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?\b/gi;
    const isoPattern = /\b\d{4}-\d{2}-\d{2}\b/g;
    const yearPattern = /\b(?:19|20)\d{2}\b/g;
    const collect = (pattern) => {
        const found = source.match(pattern);
        if (found && found.length) matches.push(...found);
    };
    collect(monthPattern);
    collect(isoPattern);
    collect(yearPattern);
    return uniqueStrings(matches, 10);
};

const ENTITY_LITERAL_STOPWORDS = new Set([
    'A', 'An', 'And', 'As', 'At', 'Because', 'But', 'By', 'For', 'From', 'How',
    'If', 'In', 'Into', 'Is', 'It', 'Of', 'On', 'Or', 'That', 'The', 'These',
    'This', 'Those', 'To', 'What', 'When', 'Where', 'Which', 'Who', 'Why', 'With'
]);

const GENERIC_HEADING_OPENERS = new Set([
    'Best', 'Better', 'Clear', 'Common', 'Direct', 'Effective', 'Good', 'Immediate',
    'Main', 'Original', 'Proper', 'Relevant', 'Right', 'Successful'
]);

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const countCaseInsensitiveOccurrences = (source, candidate) => {
    const haystack = String(source || '').trim();
    const needle = String(candidate || '').trim();
    if (!haystack || !needle) return 0;
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(needle)}(?=$|[^A-Za-z0-9])`, 'gi');
    const matches = haystack.match(pattern);
    return Array.isArray(matches) ? matches.length : 0;
};

const hasStrongEntityShape = (value) => {
    const text = String(value || '').trim();
    if (!text) return false;
    if (/[A-Z]{2,}/.test(text)) return true;
    if (/[a-z][A-Z]|[A-Z][a-z]+[A-Z]/.test(text)) return true;
    if (/\d/.test(text) && /[A-Za-z]/.test(text)) return true;
    if (/[&/+.-]/.test(text) && /[A-Za-z]/.test(text)) return true;
    return false;
};

const isSentenceStartIndex = (source, index) => {
    if (!Number.isFinite(index) || index <= 0) return true;
    let cursor = index - 1;
    while (cursor >= 0 && /[\s"'([{]/.test(source[cursor])) {
        cursor -= 1;
    }
    if (cursor < 0) return true;
    return /[.!?\n:]/.test(source[cursor]);
};

const isQuestionLikeHeading = (value) => {
    const text = normalizeText(String(value || ''), 220);
    if (!text) return false;
    if (/\?$/.test(text)) return true;
    return /^(what|why|how|when|where|which|who|can|could|does|do|is|are|should|will)\b/i.test(text);
};

const isWeakHeadingEntityCandidate = (candidate) => {
    const words = String(candidate || '')
        .split(/\s+/)
        .map((word) => word.replace(/[^A-Za-z0-9+-]/g, ''))
        .filter(Boolean);
    if (!words.length) return true;
    const firstWord = words[0];
    if (GENERIC_HEADING_OPENERS.has(firstWord)) return true;
    return false;
};

const determineSnippetLiteralSourceMeta = (suggestion, issueContext, rewriteTarget) => {
    if (suggestion && typeof suggestion.text === 'string' && suggestion.text.trim()) {
        return {
            source_type: 'analyzer_text',
            source_field: 'suggestion.text'
        };
    }
    if (issueContext && typeof issueContext.snippet === 'string' && issueContext.snippet.trim()) {
        return {
            source_type: 'issue_packet',
            source_field: 'issue_context.snippet'
        };
    }
    if (rewriteTarget && typeof rewriteTarget.target_text === 'string' && rewriteTarget.target_text.trim()) {
        return {
            source_type: 'analyzer_text',
            source_field: 'rewrite_target.target_text'
        };
    }
    if (rewriteTarget && rewriteTarget.quote && typeof rewriteTarget.quote.exact === 'string' && rewriteTarget.quote.exact.trim()) {
        return {
            source_type: 'analyzer_text',
            source_field: 'rewrite_target.quote.exact'
        };
    }
    return {
        source_type: 'analyzer_text',
        source_field: 'suggestion.text'
    };
};

const extractEntityLiterals = (text, headingChain = []) => {
    const snippetText = String(text || '');
    const headings = toArray(headingChain).map((value) => String(value || '')).filter(Boolean);
    const combinedSource = [snippetText, ...headings].join(' ');
    const pattern = /\b(?:[A-Z][A-Za-z0-9+-]*|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z0-9+-]*|[A-Z]{2,})){0,2}\b/g;
    const candidates = [];
    for (const match of snippetText.matchAll(pattern)) {
        candidates.push({
            value: match[0],
            sourceType: 'snippet',
            index: Number.isFinite(match.index) ? match.index : 0,
            sourceText: snippetText
        });
    }
    headings.forEach((headingText) => {
        for (const match of headingText.matchAll(pattern)) {
            candidates.push({
                value: match[0],
                sourceType: 'heading',
                index: Number.isFinite(match.index) ? match.index : 0,
                sourceText: headingText
            });
        }
    });

    return uniqueStrings(candidates.map((candidate) => candidate.value), 12).filter((value) => {
        if (value.length <= 2) return false;
        const words = value.split(/\s+/).filter(Boolean);
        if (!words.length) return false;
        if (words.every((word) => ENTITY_LITERAL_STOPWORDS.has(word))) return false;
        const strongShape = hasStrongEntityShape(value);
        const occurrenceCount = countCaseInsensitiveOccurrences(combinedSource, value);
        const matchesForValue = candidates.filter((candidate) => normalizeText(candidate.value, 240).toLowerCase() === normalizeText(value, 240).toLowerCase());
        const hasSnippetMatch = matchesForValue.some((candidate) => candidate.sourceType === 'snippet');
        const hasHeadingMatch = matchesForValue.some((candidate) => candidate.sourceType === 'heading');

        if (hasSnippetMatch) {
            const snippetMatch = matchesForValue.find((candidate) => candidate.sourceType === 'snippet');
            const singleWord = words.length === 1;
            const sentenceStart = snippetMatch ? isSentenceStartIndex(snippetText, snippetMatch.index) : false;
            if (singleWord && sentenceStart && !strongShape && occurrenceCount < 2) {
                return false;
            }
            return true;
        }

        if (hasHeadingMatch) {
            const headingMatch = matchesForValue.find((candidate) => candidate.sourceType === 'heading');
            const headingLooksQuestion = headingMatch ? isQuestionLikeHeading(headingMatch.sourceText) : false;
            if (headingLooksQuestion && !strongShape) {
                if (occurrenceCount < 2) return false;
                if (isWeakHeadingEntityCandidate(value)) return false;
            }
            if (words.length === 1 && !strongShape && occurrenceCount < 2) {
                return false;
            }
            return true;
        }

        return false;
    }).slice(0, 8);
};

const buildPreservationLiteralDetails = ({ snippetText = '', snippetSourceMeta = null, headingChain = [] } = {}) => {
    const normalizedSnippet = String(snippetText || '');
    const headings = toArray(headingChain).map((value) => String(value || '')).filter(Boolean);
    const headingText = headings.join(' ').trim();
    const snippetMeta = snippetSourceMeta && typeof snippetSourceMeta === 'object'
        ? {
            source_type: normalizeText(String(snippetSourceMeta.source_type || ''), 80).toLowerCase() || 'analyzer_text',
            source_field: normalizeText(String(snippetSourceMeta.source_field || ''), 120) || 'suggestion.text'
        }
        : {
            source_type: 'analyzer_text',
            source_field: 'suggestion.text'
        };
    const details = [];
    const pushDetail = (value, literalClass, sourceType, sourceField) => {
        details.push({
            value,
            literal_class: literalClass,
            source_type: sourceType,
            source_field: sourceField
        });
    };

    extractNumberLiterals(normalizedSnippet).forEach((value) => {
        pushDetail(value, 'number', snippetMeta.source_type, snippetMeta.source_field);
    });
    extractDateLiterals(normalizedSnippet).forEach((value) => {
        pushDetail(value, 'date', snippetMeta.source_type, snippetMeta.source_field);
    });
    extractNumberLiterals(headingText).forEach((value) => {
        pushDetail(value, 'number', 'heading_chain', 'section_context.heading_chain');
    });
    extractDateLiterals(headingText).forEach((value) => {
        pushDetail(value, 'date', 'heading_chain', 'section_context.heading_chain');
    });

    extractEntityLiterals(normalizedSnippet, headings).forEach((value) => {
        const inSnippet = countCaseInsensitiveOccurrences(normalizedSnippet, value) > 0;
        pushDetail(
            value,
            'entity',
            inSnippet ? snippetMeta.source_type : 'heading_chain',
            inSnippet ? snippetMeta.source_field : 'section_context.heading_chain'
        );
    });

    return uniqueLiteralDetails(details, 24);
};

const summarizePreservationLiterals = (details = []) => ({
    numbers: uniqueStrings(
        (Array.isArray(details) ? details : [])
            .filter((detail) => detail && detail.literal_class === 'number')
            .map((detail) => detail.value),
        10
    ),
    dates: uniqueStrings(
        (Array.isArray(details) ? details : [])
            .filter((detail) => detail && detail.literal_class === 'date')
            .map((detail) => detail.value),
        10
    ),
    entities: uniqueStrings(
        (Array.isArray(details) ? details : [])
            .filter((detail) => detail && detail.literal_class === 'entity')
            .map((detail) => detail.value),
        8
    )
});

const determineCopilotMode = (entry, triage) => {
    const explicit = normalizeText(String(triage?.copilot_mode || entry?.copilot_mode || ''), 80).toLowerCase();
    if (explicit) return explicit;
    if (entry && typeof entry.schema_assist_mode === 'string' && entry.schema_assist_mode.trim()) {
        return 'schema_metadata_assist';
    }
    const repairMode = normalizeText(String(entry?.repair_mode || ''), 80).toLowerCase();
    if (repairMode === 'suggest_structure' || repairMode === 'expand_support') {
        return 'structural_transform';
    }
    if (repairMode === 'schema_metadata_assist') {
        return 'schema_metadata_assist';
    }
    if (repairMode === 'web_backed_evidence_assist') {
        return 'web_backed_evidence_assist';
    }
    if (repairMode === 'limited_technical_guidance') {
        return 'limited_technical_guidance';
    }
    return 'local_rewrite';
};

const determineRepairMode = (entry, rewriteTarget, rewriteNecessity, copilotMode) => {
    if (rewriteNecessity === 'leave_as_is') return 'no_change_recommended';
    if (copilotMode === 'schema_metadata_assist') return 'schema_metadata_assist';
    if (copilotMode === 'web_backed_evidence_assist') return 'web_backed_evidence_assist';
    if (copilotMode === 'limited_technical_guidance') return 'limited_technical_guidance';
    if (rewriteNecessity === 'structural_guidance_only') return 'manual_fix_steps';
    if (entry && typeof entry.repair_mode === 'string' && entry.repair_mode.trim()) {
        return String(entry.repair_mode).trim();
    }
    const operation = String(rewriteTarget?.operation || '').trim().toLowerCase();
    const mode = String(rewriteTarget?.mode || '').trim().toLowerCase();
    if (operation === 'convert_to_list') return 'suggest_structure';
    if (operation === 'convert_to_steps') return 'suggest_structure';
    if (operation === 'insert_after_heading' || operation === 'append_support' || mode === 'heading_support_range') {
        return 'expand_support';
    }
    if (operation === 'replace_span') return 'tighten';
    return 'rewrite';
};

const determineSeverity = (entry, rewriteNecessity, defaults) => {
    if (rewriteNecessity === 'leave_as_is' || rewriteNecessity === 'structural_guidance_only') {
        const map = defaults && defaults.severity_by_triage && typeof defaults.severity_by_triage === 'object'
            ? defaults.severity_by_triage
            : {};
        const mapped = map[String(rewriteNecessity || '').trim()];
        if (typeof mapped === 'string' && mapped.trim()) {
            return mapped.trim();
        }
    }
    if (entry && typeof entry.severity === 'string' && entry.severity.trim()) {
        return String(entry.severity).trim();
    }
    const map = defaults && defaults.severity_by_triage && typeof defaults.severity_by_triage === 'object'
        ? defaults.severity_by_triage
        : {};
    const mapped = map[String(rewriteNecessity || '').trim()];
    return typeof mapped === 'string' && mapped.trim() ? mapped.trim() : 'moderate';
};

const buildScopeGuard = (rewriteTarget) => ({
    target_mode: String(rewriteTarget?.mode || '').trim() || null,
    target_operation: String(rewriteTarget?.operation || '').trim() || null,
    actionable: rewriteTarget?.actionable === true,
    anchor_node_ref: String(rewriteTarget?.anchor_node_ref || rewriteTarget?.primary_node_ref || '').trim() || null,
    primary_repair_node_ref: String(rewriteTarget?.primary_repair_node_ref || rewriteTarget?.primary_node_ref || '').trim() || null,
    repair_node_refs: Array.isArray(rewriteTarget?.repair_node_refs)
        ? rewriteTarget.repair_node_refs.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 12)
        : [],
    section_start_node_ref: String(rewriteTarget?.section_start_node_ref || '').trim() || null,
    section_end_node_ref: String(rewriteTarget?.section_end_node_ref || '').trim() || null,
    boundary_type: String(rewriteTarget?.boundary_type || '').trim() || null,
    boundary_node_ref: String(rewriteTarget?.boundary_node_ref || '').trim() || null,
    scope_confidence: Number.isFinite(Number(rewriteTarget?.scope_confidence))
        ? Number(rewriteTarget.scope_confidence)
        : null,
    instruction: 'Only edit the resolved repair scope. Do not rewrite unrelated headings, later sections, or document-level structure.'
});

const buildSectionContext = (issueContext, rewriteTarget) => ({
    heading_chain: Array.isArray(issueContext?.heading_chain)
        ? issueContext.heading_chain.map((value) => normalizeText(String(value || ''), 180)).filter(Boolean).slice(0, 6)
        : [],
    target_node_refs: Array.isArray(issueContext?.target_node_refs)
        ? issueContext.target_node_refs.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 12)
        : (Array.isArray(rewriteTarget?.repair_node_refs)
            ? rewriteTarget.repair_node_refs.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 12)
            : []),
    section_range: issueContext?.section_range && typeof issueContext.section_range === 'object'
        ? {
            start_ref: normalizeText(String(issueContext.section_range.start_ref || ''), 120) || null,
            end_ref: normalizeText(String(issueContext.section_range.end_ref || ''), 120) || null,
            node_count: Number.isFinite(Number(issueContext.section_range.node_count))
                ? Number(issueContext.section_range.node_count)
                : null
        }
        : null,
    section_node_refs: Array.isArray(issueContext?.section_nodes)
        ? issueContext.section_nodes
            .map((node) => String(node && (node.ref || node.node_ref) || '').trim())
            .filter(Boolean)
            .slice(0, 12)
        : [],
    section_text: normalizeText(String(issueContext?.section_text || ''), 1800)
});

const buildArticleContext = (manifest, issueContext) => ({
    title: normalizeText(String(manifest?.title || ''), 220) || null,
    heading_outline: collectHeadingOutline(manifest),
    total_blocks: Number.isFinite(Number(issueContext?.post_context?.total_blocks))
        ? Number(issueContext.post_context.total_blocks)
        : normalizeManifestNodes(manifest).length,
    plain_text_chars: Number.isFinite(Number(issueContext?.post_context?.plain_text_chars))
        ? Number(issueContext.post_context.plain_text_chars)
        : (typeof manifest?.plain_text === 'string' ? manifest.plain_text.length : null)
});

const buildFixAssistContract = (context = {}) => {
    const schema = loadContractSchema();
    const defaults = schema && typeof schema.defaults === 'object' ? schema.defaults : {};
    const contracts = schema && typeof schema.contracts === 'object' ? schema.contracts : {};
    const rewriteTarget = context.rewriteTarget && typeof context.rewriteTarget === 'object'
        ? context.rewriteTarget
        : null;
    const repairIntent = context.repairIntent && typeof context.repairIntent === 'object'
        ? context.repairIntent
        : null;
    const issueContext = context.issueContext && typeof context.issueContext === 'object'
        ? context.issueContext
        : null;
    const suggestion = context.suggestion && typeof context.suggestion === 'object'
        ? context.suggestion
        : null;
    const manifest = context.manifest && typeof context.manifest === 'object'
        ? context.manifest
        : null;
    const triage = context.fixAssistTriage && typeof context.fixAssistTriage === 'object'
        ? context.fixAssistTriage
        : buildFixAssistTriage({
            checkId: context.analysisRef?.check_id || issueContext?.check_id || repairIntent?.check_id || '',
            checkName: issueContext?.check_name || repairIntent?.check_name || '',
            snippet: suggestion?.text || issueContext?.snippet || rewriteTarget?.target_text || '',
            message: issueContext?.message || '',
            failureReason: issueContext?.failure_reason || '',
            rewriteTarget,
            repairIntent
        });

    const checkId = String(context.analysisRef?.check_id || issueContext?.check_id || repairIntent?.check_id || '').trim();
    const checkName = normalizeText(String(issueContext?.check_name || repairIntent?.check_name || checkId), 180) || checkId;
    const entry = contracts[checkId] && typeof contracts[checkId] === 'object'
        ? contracts[checkId]
        : null;
    const snippet = normalizeText(
        suggestion?.text
        || issueContext?.snippet
        || rewriteTarget?.target_text
        || rewriteTarget?.quote?.exact
        || '',
        1200
    );
    const issueSummary = normalizeText(
        triage.summary
        || issueContext?.message
        || repairIntent?.rule_hint
        || '',
        320
    );
    const rewriteNecessity = String(triage.state || '').trim() || 'rewrite_needed';
    const copilotMode = determineCopilotMode(entry, triage);

    const mustPreserve = uniqueStrings([
        ...(defaults.must_preserve || []),
        ...(entry?.must_preserve || []),
        ...(repairIntent?.must_preserve || [])
    ], 12);
    const mustChange = uniqueStrings([
        ...(entry?.must_change || []),
        ...(repairIntent?.must_change || [])
    ], 12);
    const doNotInvent = uniqueStrings(defaults.do_not_invent || [], 8);
    const toneGuard = uniqueStrings([
        ...(defaults.tone_guard || []),
        ...(entry?.tone_guard || [])
    ], 8);
    const scopeGuard = buildScopeGuard(rewriteTarget);
    const sectionContext = buildSectionContext(issueContext, rewriteTarget);
    const articleContext = buildArticleContext(manifest, issueContext);
    const snippetSourceMeta = determineSnippetLiteralSourceMeta(suggestion, issueContext, rewriteTarget);
    const preservationLiteralDetails = buildPreservationLiteralDetails({
        snippetText: snippet,
        snippetSourceMeta,
        headingChain: sectionContext.heading_chain
    });

    return {
        version: String(schema.version || '1.0.0'),
        check_id: checkId,
        check_name: checkName,
        issue_summary: issueSummary,
        copilot_mode: copilotMode,
        requires_web_consent: copilotMode === 'web_backed_evidence_assist',
        repair_mode: determineRepairMode(entry, rewriteTarget, rewriteNecessity, copilotMode),
        severity: determineSeverity(entry, rewriteNecessity, defaults),
        rewrite_necessity: rewriteNecessity,
        must_preserve: mustPreserve,
        must_change: mustChange,
        do_not_invent: doNotInvent,
        tone_guard: toneGuard,
        scope_guard: scopeGuard,
        section_context: sectionContext,
        article_context: articleContext,
        preservation_literals: summarizePreservationLiterals(preservationLiteralDetails),
        preservation_literal_details: preservationLiteralDetails
    };
};

module.exports = {
    buildFixAssistContract,
    __testHooks: {
        loadContractSchema,
        collectHeadingOutline,
        extractNumberLiterals,
        extractDateLiterals,
        extractEntityLiterals,
        determineSnippetLiteralSourceMeta,
        buildPreservationLiteralDetails,
        summarizePreservationLiterals
    }
};
