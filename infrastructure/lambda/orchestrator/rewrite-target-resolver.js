const fs = require('fs');
const path = require('path');

let cachedRuntimeContract = null;

const isSectionFirstRewriteEnabled = () => {
    const raw = process.env.REWRITE_SECTION_FIRST_V1;
    if (raw === undefined || raw === null) return false;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === '1'
        || normalized === 'true'
        || normalized === 'yes'
        || normalized === 'on'
        || normalized === 'enabled';
};

const normalizeText = (value) => {
    if (typeof value !== 'string') return '';
    return value
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
};

const isHeadingLike = (blockType = '') => {
    const value = String(blockType || '').toLowerCase().trim();
    if (!value) return false;
    return value.includes('heading') || /\/h[1-6]$/.test(value) || /^h[1-6]$/.test(value);
};

const countWords = (text = '') => {
    return String(text || '').trim().split(/\s+/).filter(Boolean).length;
};

const isLikelyBoldBoundaryText = (value = '') => {
    const text = normalizeText(value);
    if (!text) return false;
    const words = countWords(text);
    if (words < 1 || words > 18) return false;
    if (text.length > 120) return false;
    if (/:$/.test(text)) return true;
    if (/\?$/.test(text) && words <= 12) return true;

    const endsLikeSentence = /[.!?]$/.test(text);
    const hasHeavyClausePunctuation = /[,;]/.test(text);
    const titleLike = /^[A-Z0-9][A-Za-z0-9 '&/()\-]+$/.test(text);
    if (!endsLikeSentence && !hasHeavyClausePunctuation && words <= 12) return true;
    if (titleLike && words <= 10) return true;
    return false;
};

const isBoldBoundaryNode = (node = null) => {
    if (!node || typeof node !== 'object') return false;
    const blockType = String(node.block_type || '').toLowerCase().trim();
    if (!blockType) return false;
    const paragraphLike = blockType.includes('paragraph') || blockType.includes('text') || blockType.includes('freeform');
    if (!paragraphLike) return false;
    return isLikelyBoldBoundaryText(node.text || '');
};

const getSectionBoundaryType = (node = null) => {
    if (!node || typeof node !== 'object') return '';
    if (isHeadingLike(node.block_type)) return 'heading';
    if (isBoldBoundaryNode(node)) return 'pseudo_heading';
    return '';
};

const isSectionBoundaryNode = (node = null) => {
    if (!node || typeof node !== 'object') return false;
    return !!getSectionBoundaryType(node);
};

const collectNodesInRange = ({ nodes, startIndex, endIndex }) => {
    if (!Array.isArray(nodes) || nodes.length === 0) return [];
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) return [];
    if (startIndex < 0 || endIndex < startIndex) return [];
    return nodes.slice(startIndex, endIndex + 1).filter((node) => node && node.text);
};

const resolveSectionBoundaryRange = ({ nodes, anchorIndex }) => {
    if (!Array.isArray(nodes) || nodes.length === 0) return null;
    if (!Number.isInteger(anchorIndex) || anchorIndex < 0 || anchorIndex >= nodes.length) return null;

    let sectionStart = 0;
    let sectionStartBoundaryType = '';
    for (let i = anchorIndex; i >= 0; i -= 1) {
        const boundaryType = getSectionBoundaryType(nodes[i]);
        if (boundaryType) {
            sectionStart = i;
            sectionStartBoundaryType = boundaryType;
            break;
        }
    }

    let sectionEnd = nodes.length - 1;
    let boundaryType = 'document_end';
    let boundaryNodeRef = null;
    for (let i = anchorIndex + 1; i < nodes.length; i += 1) {
        const nextBoundaryType = getSectionBoundaryType(nodes[i]);
        if (nextBoundaryType) {
            sectionEnd = i - 1;
            boundaryType = nextBoundaryType;
            boundaryNodeRef = nodes[i] && nodes[i].node_ref ? nodes[i].node_ref : null;
            break;
        }
    }

    if (sectionEnd < sectionStart) {
        sectionEnd = sectionStart;
    }

    const sectionNodes = collectNodesInRange({
        nodes,
        startIndex: sectionStart,
        endIndex: sectionEnd
    });
    if (!sectionNodes.length) return null;

    const sectionNodeRefs = sectionNodes.map((node) => node.node_ref);
    return {
        start_index: sectionStart,
        end_index: sectionEnd,
        node_refs: sectionNodeRefs,
        text: sectionNodes.map((node) => node.text).join('\n\n'),
        includes_heading_or_boundary: isSectionBoundaryNode(nodes[sectionStart]),
        section_start_node_ref: sectionNodeRefs[0] || null,
        section_end_node_ref: sectionNodeRefs[sectionNodeRefs.length - 1] || null,
        section_start_boundary_type: sectionStartBoundaryType || getSectionBoundaryType(nodes[sectionStart]) || '',
        boundary_type: boundaryType,
        boundary_node_ref: boundaryNodeRef
    };
};

const buildSectionScopeFromNode = (resolvedNode, nodes, options = {}) => {
    if (!resolvedNode || !Array.isArray(nodes) || nodes.length === 0) return null;
    const range = resolveSectionBoundaryRange({
        nodes,
        anchorIndex: resolvedNode.index
    });
    if (!range) return null;

    const maxNodes = Number.isInteger(options.maxNodes) ? options.maxNodes : 0;
    let repairStart = range.start_index;
    let repairEnd = range.end_index;

    if (maxNodes > 0) {
        if (options.includeLeadingBoundary === true) {
            repairStart = range.start_index;
            repairEnd = Math.min(range.end_index, range.start_index + maxNodes - 1);
        } else {
            repairStart = Math.max(range.start_index, resolvedNode.index - (maxNodes - 1));
            repairEnd = Math.min(range.end_index, repairStart + maxNodes - 1);
            if (repairEnd < resolvedNode.index) {
                repairEnd = resolvedNode.index;
                repairStart = Math.max(range.start_index, repairEnd - maxNodes + 1);
            }
        }
    }

    const repairNodes = collectNodesInRange({
        nodes,
        startIndex: repairStart,
        endIndex: repairEnd
    });
    if (!repairNodes.length) return null;

    const repairNodeRefs = repairNodes.map((node) => node.node_ref);
    return {
        anchor_node_ref: resolvedNode.node_ref,
        primary_repair_node_ref: repairNodeRefs.includes(resolvedNode.node_ref)
            ? resolvedNode.node_ref
            : (repairNodeRefs[0] || null),
        start_index: repairStart,
        end_index: repairEnd,
        node_refs: repairNodeRefs,
        repair_node_refs: repairNodeRefs,
        target_text: repairNodes.map((node) => node.text).join('\n\n'),
        includes_heading_or_boundary: range.includes_heading_or_boundary,
        section_start_node_ref: range.section_start_node_ref,
        section_end_node_ref: range.section_end_node_ref,
        section_start_boundary_type: range.section_start_boundary_type,
        boundary_type: range.boundary_type,
        boundary_node_ref: range.boundary_node_ref
    };
};

const resolveSectionTargetFromCandidate = (candidateValue, nodes, options = {}) => {
    if (!candidateValue || !Array.isArray(nodes) || nodes.length === 0) return null;
    const resolvedNode = resolveNodeFromCandidate(candidateValue, nodes);
    if (!resolvedNode) return null;
    return buildSectionScopeFromNode(resolvedNode, nodes, options);
};

const resolveRuntimeContractPath = () => {
    const candidates = [
        path.join(__dirname, 'shared', 'schemas', 'check-runtime-contract-v1.json'),
        path.join(__dirname, 'schemas', 'check-runtime-contract-v1.json'),
        path.join(__dirname, '..', 'shared', 'schemas', 'check-runtime-contract-v1.json')
    ];
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || null;
};

const loadRuntimeContract = () => {
    if (cachedRuntimeContract) return cachedRuntimeContract;
    const contractPath = resolveRuntimeContractPath();
    if (!contractPath) {
        cachedRuntimeContract = { checks: {} };
        return cachedRuntimeContract;
    }
    try {
        const raw = fs.readFileSync(contractPath, 'utf8');
        cachedRuntimeContract = JSON.parse(String(raw).replace(/^\uFEFF/, ''));
    } catch (error) {
        cachedRuntimeContract = { checks: {} };
    }
    return cachedRuntimeContract;
};

const getContractEntry = (checkId) => {
    const contract = loadRuntimeContract();
    const checks = contract && typeof contract === 'object' ? contract.checks : null;
    if (!checks || typeof checks !== 'object') return null;
    const entry = checks[checkId];
    if (!entry || typeof entry !== 'object') return null;
    return entry;
};

const collectManifestNodes = (manifest) => {
    const blockMap = Array.isArray(manifest?.block_map) ? manifest.block_map : [];
    if (blockMap.length > 0) {
        return blockMap.map((block, index) => {
            const nodeRef = String(block?.node_ref || `block-${index}`).trim();
            const text = normalizeText(block?.text || block?.text_content || '');
            return {
                node_ref: nodeRef,
                signature: block?.signature || null,
                block_type: String(block?.block_type || '').trim(),
                text,
                index
            };
        }).filter((node) => node.text);
    }

    const nodes = Array.isArray(manifest?.nodes) ? manifest.nodes : [];
    return nodes.map((node, index) => {
        const nodeRef = String(node?.ref || node?.node_ref || `node-${index}`).trim();
        return {
            node_ref: nodeRef,
            signature: node?.signature || null,
            block_type: String(node?.type || node?.block_type || '').trim(),
            text: normalizeText(node?.text || ''),
            index
        };
    }).filter((node) => node.text);
};

const pickCandidate = (checkDetails, instanceIndex = null) => {
    if (!checkDetails || typeof checkDetails !== 'object') return null;
    if (checkDetails.focused_highlight && typeof checkDetails.focused_highlight === 'object') {
        return { source: 'focused_highlight', value: checkDetails.focused_highlight };
    }
    if (checkDetails.focused_failed_candidate && typeof checkDetails.focused_failed_candidate === 'object') {
        return { source: 'focused_failed_candidate', value: checkDetails.focused_failed_candidate };
    }

    const highlightList = Array.isArray(checkDetails.highlights) ? checkDetails.highlights : [];
    const candidateList = Array.isArray(checkDetails.candidate_highlights) ? checkDetails.candidate_highlights : [];
    const failedList = Array.isArray(checkDetails.failed_candidates) ? checkDetails.failed_candidates : [];

    if (Number.isInteger(instanceIndex) && instanceIndex >= 0) {
        if (highlightList[instanceIndex]) return { source: 'highlight', value: highlightList[instanceIndex] };
        if (failedList[instanceIndex]) return { source: 'failed_candidate', value: failedList[instanceIndex] };
        if (candidateList[instanceIndex]) return { source: 'candidate_highlight', value: candidateList[instanceIndex] };
    }

    if (highlightList.length > 0) return { source: 'highlight', value: highlightList[0] };
    if (failedList.length > 0) return { source: 'failed_candidate', value: failedList[0] };
    if (candidateList.length > 0) return { source: 'candidate_highlight', value: candidateList[0] };
    return null;
};

const getCandidateSnippet = (candidateValue) => {
    if (!candidateValue || typeof candidateValue !== 'object') return '';
    const selector = candidateValue.text_quote_selector || candidateValue.quote || {};
    return normalizeText(
        candidateValue.snippet
        || candidateValue.text
        || selector.exact
        || ''
    );
};

const getCandidateNodeRef = (candidateValue) => {
    if (!candidateValue || typeof candidateValue !== 'object') return '';
    return String(candidateValue.node_ref || candidateValue.nodeRef || '').trim();
};

const getCandidateSignature = (candidateValue) => {
    if (!candidateValue || typeof candidateValue !== 'object') return '';
    return String(candidateValue.signature || '').trim();
};

const resolveNodeFromCandidate = (candidateValue, nodes) => {
    if (!candidateValue || !Array.isArray(nodes) || nodes.length === 0) return null;

    const nodeRef = getCandidateNodeRef(candidateValue);
    if (nodeRef) {
        const byRef = nodes.find((node) => node.node_ref === nodeRef);
        if (byRef) return byRef;
    }

    const snippet = getCandidateSnippet(candidateValue);
    if (snippet) {
        const normalizedSnippet = snippet.toLowerCase();
        const byExactSnippet = nodes.find((node) => node.text.toLowerCase() === normalizedSnippet);
        if (byExactSnippet) return byExactSnippet;
        const bySnippet = nodes.find((node) => node.text.toLowerCase().includes(normalizedSnippet));
        if (bySnippet) return bySnippet;
    }

    // Signature remains available, but only as a last-resort analyzer hint.
    const signature = getCandidateSignature(candidateValue);
    if (signature) {
        const bySignature = nodes.find((node) => node.signature && node.signature === signature);
        if (bySignature) return bySignature;
    }

    return null;
};

const findHeadingForCandidate = (candidateValue, nodes) => {
    if (!Array.isArray(nodes) || nodes.length === 0) return null;
    const direct = resolveNodeFromCandidate(candidateValue, nodes);
    if (direct && isHeadingLike(direct.block_type)) {
        return direct;
    }

    const snippet = getCandidateSnippet(candidateValue);
    if (!snippet) return null;
    const normalizedSnippet = snippet.toLowerCase();
    return nodes.find((node) => isHeadingLike(node.block_type) && node.text.toLowerCase().includes(normalizedSnippet)) || null;
};

const resolveHeadingSupportNodes = (headingNode, nodes, contextWindow = 3) => {
    if (!headingNode || !Array.isArray(nodes) || nodes.length === 0) return [];
    const headingIndex = nodes.findIndex((node) => node.node_ref === headingNode.node_ref);
    if (headingIndex === -1) return [];

    const supportNodes = [];
    for (let i = headingIndex + 1; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (isSectionBoundaryNode(node)) break;
        if (!node.text) continue;
        supportNodes.push(node);
        if (supportNodes.length >= Math.max(1, contextWindow)) break;
    }
    return supportNodes;
};

const derivePolicy = (checkId, checkDetails) => {
    const entry = getContractEntry(checkId);
    const policy = String(entry?.rewrite_target_policy || '').trim();
    if (policy) return policy;
    if (checkDetails?.cannot_anchor) return 'section';
    return 'inline_span';
};

const deriveAllowedOps = (checkId) => {
    const entry = getContractEntry(checkId);
    if (!Array.isArray(entry?.rewrite_allowed_ops)) return [];
    return entry.rewrite_allowed_ops
        .map((op) => String(op || '').trim())
        .filter(Boolean);
};

const deriveContextWindow = (checkId) => {
    const entry = getContractEntry(checkId);
    if (Number.isInteger(entry?.rewrite_context_window)) {
        return Math.max(1, Math.min(6, entry.rewrite_context_window));
    }
    return 2;
};

const deriveRewriteMode = (checkId) => {
    const entry = getContractEntry(checkId);
    return String(entry?.rewrite_mode || '').trim().toLowerCase();
};

const deriveEvidenceMode = (checkId) => {
    const entry = getContractEntry(checkId);
    return String(entry?.evidence_mode || '').trim().toLowerCase();
};

const hasStrongInlineAnchor = (candidateValue) => {
    if (!candidateValue || typeof candidateValue !== 'object') return false;
    const hasRef = !!getCandidateNodeRef(candidateValue);
    const hasSignature = !!getCandidateSignature(candidateValue);
    const hasOffsets = Number.isFinite(candidateValue.start)
        && Number.isFinite(candidateValue.end)
        && candidateValue.end > candidateValue.start;
    return hasRef || hasSignature || hasOffsets;
};

const deriveSectionOperation = (allowedOps = []) => {
    const normalized = (Array.isArray(allowedOps) ? allowedOps : [])
        .map((op) => String(op || '').trim().toLowerCase())
        .filter(Boolean);
    const preferredOrder = [
        'convert_to_steps',
        'convert_to_list',
        'replace_block',
        'insert_after_heading',
        'append_support'
    ];
    for (const preferred of preferredOrder) {
        if (normalized.includes(preferred)) return preferred;
    }
    const firstNonInline = normalized.find((op) => op !== 'replace_span');
    if (firstNonInline) return firstNonInline;
    return 'replace_block';
};

const shouldAutoRouteWeakInlineToSection = ({
    policy,
    evidenceMode,
    candidateValue,
    checkDetails
}) => {
    if (!isSectionFirstRewriteEnabled()) return false;
    if (String(policy || '').trim().toLowerCase() !== 'inline_span') return false;
    if (!candidateValue || typeof candidateValue !== 'object') return false;
    if (checkDetails && checkDetails.cannot_anchor) return true;
    if (String(evidenceMode || '').trim().toLowerCase() === 'absence_sensitive') return true;
    if (hasStrongInlineAnchor(candidateValue)) return false;
    return !!getCandidateSnippet(candidateValue);
};

const buildRepairIntent = (checkId, checkDetails, rewritePolicy, candidateValue, rewriteOperation = '') => {
    const checkName = String(checkDetails?.name || checkDetails?.title || checkId || '').trim();
    const explanation = normalizeText(checkDetails?.explanation || '');
    const snippet = getCandidateSnippet(candidateValue);
    const mustPreserve = [];
    const mustChange = [];

    if (rewritePolicy === 'heading_support_range') {
        if (snippet) mustPreserve.push(`Keep heading wording: "${snippet}"`);
        mustChange.push('Improve supporting content directly under the heading.');
    } else if (rewritePolicy === 'inline_span') {
        mustPreserve.push('Keep surrounding sentence meaning and tone.');
        mustChange.push('Rewrite only the flagged inline span.');
    } else if (rewriteOperation === 'convert_to_list') {
        mustPreserve.push('Keep section intent and factual meaning.');
        mustChange.push('Convert dense prose into a clear bullet list without losing key points.');
    } else if (rewritePolicy === 'block') {
        mustPreserve.push('Keep section intent and factual meaning.');
        mustChange.push('Rewrite the targeted block for clarity and citability.');
    } else {
        mustPreserve.push('Keep article intent and topic continuity.');
        mustChange.push('Improve the most relevant section for this issue.');
    }

    return {
        check_id: checkId,
        check_name: checkName || checkId,
        rule_hint: explanation || `Improve content for ${checkName || checkId}.`,
        instruction: mustChange[0],
        must_preserve: mustPreserve,
        must_change: mustChange
    };
};

const resolveRewriteTarget = ({ checkId, checkDetails, manifest, instanceIndex = null }) => {
    const policy = derivePolicy(checkId, checkDetails);
    const allowedOps = deriveAllowedOps(checkId);
    const rewriteMode = deriveRewriteMode(checkId);
    const evidenceMode = deriveEvidenceMode(checkId);
    const contextWindow = deriveContextWindow(checkId);
    const nodes = collectManifestNodes(manifest);
    const candidate = pickCandidate(checkDetails, instanceIndex);
    const candidateValue = candidate ? candidate.value : null;
    const snippet = getCandidateSnippet(candidateValue);
    const primaryOperation = allowedOps[0] || null;
    const baseResult = {
        actionable: false,
        mode: policy,
        operation: primaryOperation,
        primary_node_ref: null,
        anchor_node_ref: null,
        primary_repair_node_ref: null,
        node_refs: [],
        repair_node_refs: [],
        target_text: null,
        quote: snippet ? { exact: snippet } : null,
        start: Number.isFinite(candidateValue?.start) ? candidateValue.start : null,
        end: Number.isFinite(candidateValue?.end) ? candidateValue.end : null,
        section_start_node_ref: null,
        section_end_node_ref: null,
        boundary_type: null,
        boundary_node_ref: null,
        resolver_reason: '',
        confidence: 0,
        scope_confidence: 0
    };

    if (rewriteMode === 'manual_review') {
        baseResult.resolver_reason = 'manual_review_policy';
        return {
            rewrite_target: baseResult,
            repair_intent: buildRepairIntent(checkId, checkDetails, policy, candidateValue, primaryOperation || '')
        };
    }

    if (!candidateValue) {
        baseResult.resolver_reason = 'no_candidate';
        return {
            rewrite_target: baseResult,
            repair_intent: buildRepairIntent(checkId, checkDetails, policy, candidateValue, primaryOperation || '')
        };
    }

    if (!nodes.length) {
        baseResult.resolver_reason = 'manifest_nodes_unavailable';
        return {
            rewrite_target: baseResult,
            repair_intent: buildRepairIntent(checkId, checkDetails, policy, candidateValue, primaryOperation || '')
        };
    }

    if (shouldAutoRouteWeakInlineToSection({
        policy,
        evidenceMode,
        candidateValue,
        checkDetails
    })) {
        const sectionTarget = resolveSectionTargetFromCandidate(candidateValue, nodes, {
            maxNodes: Math.max(4, contextWindow * 3)
        });
        if (sectionTarget) {
            const sectionOperation = deriveSectionOperation(allowedOps);
            return {
                rewrite_target: {
                    actionable: true,
                    mode: 'section',
                    operation: sectionOperation,
                    primary_node_ref: sectionTarget.primary_repair_node_ref || sectionTarget.anchor_node_ref || sectionTarget.node_refs[0] || null,
                    anchor_node_ref: sectionTarget.anchor_node_ref || null,
                    primary_repair_node_ref: sectionTarget.primary_repair_node_ref || sectionTarget.node_refs[0] || null,
                    node_refs: sectionTarget.node_refs,
                    repair_node_refs: sectionTarget.repair_node_refs || sectionTarget.node_refs,
                    target_text: sectionTarget.target_text,
                    quote: snippet ? { exact: snippet } : null,
                    start: null,
                    end: null,
                    section_start_node_ref: sectionTarget.section_start_node_ref || null,
                    section_end_node_ref: sectionTarget.section_end_node_ref || null,
                    boundary_type: sectionTarget.boundary_type || null,
                    boundary_node_ref: sectionTarget.boundary_node_ref || null,
                    resolver_reason: 'weak_inline_routed_to_section',
                    confidence: 0.84,
                    scope_confidence: 0.84
                },
                repair_intent: buildRepairIntent(checkId, checkDetails, 'section', candidateValue, sectionOperation)
            };
        }
    }

    if (policy === 'heading_support_range') {
        const headingNode = findHeadingForCandidate(candidateValue, nodes);
        if (!headingNode) {
            baseResult.resolver_reason = 'heading_not_found';
            return {
                rewrite_target: baseResult,
                repair_intent: buildRepairIntent(checkId, checkDetails, policy, candidateValue, primaryOperation || '')
            };
        }
        const supportNodes = resolveHeadingSupportNodes(headingNode, nodes, contextWindow);
        if (!supportNodes.length) {
            baseResult.resolver_reason = 'support_range_not_found';
            return {
                rewrite_target: baseResult,
                repair_intent: buildRepairIntent(checkId, checkDetails, policy, candidateValue, primaryOperation || '')
            };
        }

        const sectionRange = resolveSectionBoundaryRange({
            nodes,
            anchorIndex: headingNode.index
        });
        const repairNodeRefs = supportNodes.map((node) => node.node_ref);

        return {
            rewrite_target: {
                actionable: true,
                mode: policy,
                operation: allowedOps[0] || 'replace_block',
                primary_node_ref: supportNodes[0].node_ref,
                anchor_node_ref: headingNode.node_ref,
                primary_repair_node_ref: supportNodes[0].node_ref,
                node_refs: repairNodeRefs,
                repair_node_refs: repairNodeRefs,
                target_text: supportNodes.map((node) => node.text).join('\n\n'),
                quote: { exact: headingNode.text },
                heading_node_ref: headingNode.node_ref,
                start: null,
                end: null,
                section_start_node_ref: sectionRange ? sectionRange.section_start_node_ref : headingNode.node_ref,
                section_end_node_ref: sectionRange ? sectionRange.section_end_node_ref : (repairNodeRefs[repairNodeRefs.length - 1] || null),
                boundary_type: sectionRange ? sectionRange.boundary_type : 'document_end',
                boundary_node_ref: sectionRange ? sectionRange.boundary_node_ref : null,
                resolver_reason: 'heading_support_range_resolved',
                confidence: 0.9,
                scope_confidence: 0.9
            },
            repair_intent: buildRepairIntent(checkId, checkDetails, policy, { ...candidateValue, snippet: headingNode.text }, primaryOperation || '')
        };
    }

    const resolvedNode = resolveNodeFromCandidate(candidateValue, nodes);
    if (!resolvedNode) {
        baseResult.resolver_reason = 'node_unresolved';
        return {
            rewrite_target: baseResult,
            repair_intent: buildRepairIntent(checkId, checkDetails, policy, candidateValue, primaryOperation || '')
        };
    }

    if (policy === 'block' || policy === 'section') {
        const sectionScope = policy === 'section'
            ? buildSectionScopeFromNode(resolvedNode, nodes, {
                maxNodes: Math.max(1, (contextWindow * 2) - 1),
                includeLeadingBoundary: false
            })
            : null;
        const range = policy === 'section'
            ? collectNodesInRange({
                nodes,
                startIndex: sectionScope ? sectionScope.start_index : resolvedNode.index,
                endIndex: sectionScope ? sectionScope.end_index : resolvedNode.index
            })
            : [resolvedNode];
        const refs = range.map((node) => node.node_ref);
        return {
            rewrite_target: {
                actionable: true,
                mode: policy,
                operation: allowedOps[0] || 'replace_block',
                primary_node_ref: resolvedNode.node_ref,
                anchor_node_ref: resolvedNode.node_ref,
                primary_repair_node_ref: resolvedNode.node_ref,
                node_refs: refs,
                repair_node_refs: refs,
                target_text: range.map((node) => node.text).join('\n\n'),
                quote: snippet ? { exact: snippet } : { exact: resolvedNode.text },
                start: null,
                end: null,
                section_start_node_ref: sectionScope ? sectionScope.section_start_node_ref : null,
                section_end_node_ref: sectionScope ? sectionScope.section_end_node_ref : null,
                boundary_type: sectionScope ? sectionScope.boundary_type : null,
                boundary_node_ref: sectionScope ? sectionScope.boundary_node_ref : null,
                resolver_reason: policy === 'section' ? 'section_resolved' : 'block_resolved',
                confidence: policy === 'section' ? 0.8 : 0.88,
                scope_confidence: policy === 'section' ? 0.8 : 0.88
            },
            repair_intent: buildRepairIntent(checkId, checkDetails, policy, candidateValue, primaryOperation || '')
        };
    }

    return {
        rewrite_target: {
            actionable: true,
            mode: 'inline_span',
            operation: allowedOps[0] || 'replace_span',
            primary_node_ref: resolvedNode.node_ref,
            anchor_node_ref: resolvedNode.node_ref,
            primary_repair_node_ref: resolvedNode.node_ref,
            node_refs: [resolvedNode.node_ref],
            repair_node_refs: [resolvedNode.node_ref],
            target_text: snippet || resolvedNode.text,
            quote: snippet ? { exact: snippet } : { exact: resolvedNode.text },
            start: Number.isFinite(candidateValue?.start) ? candidateValue.start : null,
            end: Number.isFinite(candidateValue?.end) ? candidateValue.end : null,
            resolver_reason: 'inline_span_resolved',
            confidence: 0.92,
            scope_confidence: 0.92
        },
        repair_intent: buildRepairIntent(checkId, checkDetails, 'inline_span', candidateValue, primaryOperation || '')
    };
};

module.exports = {
    resolveRewriteTarget,
    __testHooks: {
        isSectionFirstRewriteEnabled,
        hasStrongInlineAnchor,
        deriveSectionOperation,
        shouldAutoRouteWeakInlineToSection,
        isLikelyBoldBoundaryText,
        isBoldBoundaryNode,
        getSectionBoundaryType,
        isSectionBoundaryNode,
        collectNodesInRange,
        buildSectionScopeFromNode,
        resolveSectionBoundaryRange,
        resolveSectionTargetFromCandidate,
        collectManifestNodes,
        pickCandidate,
        resolveNodeFromCandidate,
        findHeadingForCandidate,
        resolveHeadingSupportNodes,
        derivePolicy,
        deriveAllowedOps,
        deriveContextWindow
    }
};
