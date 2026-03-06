const { getPrompt } = require('./prompt-manager');
const { jsonrepair } = require('jsonrepair');
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const {
  emitRewriteRequested,
  emitRewriteCompleted,
  emitRewriteFailed
} = require('./telemetry-emitter');

// Environment variables
const getEnv = (key, defaultValue = undefined) => process.env[key] || defaultValue;

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({});
const ddbDoc = DynamoDBDocumentClient.from(ddbClient);
const secretsClient = new SecretsManagerClient({});

const getMistralKey = async () => {
  const command = new GetSecretValueCommand({
    SecretId: getEnv('SECRET_NAME', 'AVI_MISTRAL_API_KEY')
  });
  const response = await secretsClient.send(command);
  const secret = JSON.parse(response.SecretString);
  const apiKey = secret.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY not found in secret');
  }
  return apiKey;
};

const normalizeText = (value) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
};

const clampString = (value, maxLen = 0) => {
  const text = String(value || '');
  if (!Number.isFinite(maxLen) || maxLen <= 0) return text;
  return text.length > maxLen ? text.slice(0, maxLen) : text;
};

const sanitizeContextNode = (node) => {
  if (!node || typeof node !== 'object') return null;
  return {
    ref: clampString(node.ref || node.node_ref || '', 120),
    type: clampString(node.type || node.block_type || '', 80),
    text: clampString(node.text || '', 320)
  };
};

const sanitizeIssueContext = (issueContext) => {
  if (!issueContext || typeof issueContext !== 'object') return null;
  const headingChain = Array.isArray(issueContext.heading_chain)
    ? issueContext.heading_chain
      .filter((item) => typeof item === 'string' && item.trim())
      .slice(-5)
      .map((item) => clampString(item, 180))
    : [];
  const surroundingNodes = Array.isArray(issueContext.surrounding_nodes)
    ? issueContext.surrounding_nodes
      .map((node) => sanitizeContextNode(node))
      .filter(Boolean)
      .slice(0, 10)
    : [];
  const sectionNodes = Array.isArray(issueContext.section_nodes)
    ? issueContext.section_nodes
      .map((node) => sanitizeContextNode(node))
      .filter(Boolean)
      .slice(0, 12)
    : [];
  const sectionRange = issueContext.section_range && typeof issueContext.section_range === 'object'
    ? {
      start_ref: clampString(issueContext.section_range.start_ref || '', 120) || null,
      end_ref: clampString(issueContext.section_range.end_ref || '', 120) || null,
      node_count: Number.isFinite(Number(issueContext.section_range.node_count))
        ? Number(issueContext.section_range.node_count)
        : sectionNodes.length
    }
    : null;

  return {
    run_id: clampString(issueContext.run_id || '', 120),
    check_id: clampString(issueContext.check_id || '', 120),
    check_name: clampString(issueContext.check_name || '', 180),
    category_id: clampString(issueContext.category_id || '', 120),
    verdict: clampString(issueContext.verdict || '', 40),
    message: clampString(issueContext.message || '', 500),
    failure_reason: issueContext.failure_reason ? clampString(issueContext.failure_reason, 120) : null,
    snippet: clampString(issueContext.snippet || '', 500),
    node_ref: issueContext.node_ref ? clampString(issueContext.node_ref, 120) : null,
    instance_index: Number.isFinite(Number(issueContext.instance_index))
      ? Number(issueContext.instance_index)
      : 0,
    target_mode: issueContext.target_mode ? clampString(issueContext.target_mode, 80) : null,
    target_operation: issueContext.target_operation ? clampString(issueContext.target_operation, 80) : null,
    target_node_refs: Array.isArray(issueContext.target_node_refs)
      ? issueContext.target_node_refs.map((ref) => clampString(ref, 120)).filter(Boolean).slice(0, 12)
      : [],
    heading_chain: headingChain,
    surrounding_nodes: surroundingNodes,
    section_range: sectionRange,
    section_nodes: sectionNodes,
    section_text: clampString(issueContext.section_text || '', 3600),
    post_context: issueContext.post_context && typeof issueContext.post_context === 'object'
      ? {
        total_blocks: Number.isFinite(Number(issueContext.post_context.total_blocks))
          ? Number(issueContext.post_context.total_blocks)
          : null,
        plain_text_chars: Number.isFinite(Number(issueContext.post_context.plain_text_chars))
          ? Number(issueContext.post_context.plain_text_chars)
          : null
      }
      : null
  };
};

const normalizeManifestNodes = (manifest) => {
  if (!manifest || typeof manifest !== 'object') return [];
  if (Array.isArray(manifest.nodes) && manifest.nodes.length > 0) {
    return manifest.nodes.map((node, index) => ({
      ref: node.ref || node.node_ref || `node-${index}`,
      type: node.type || node.block_type || 'block',
      text: normalizeText(node.text || '')
    }));
  }
  if (Array.isArray(manifest.block_map) && manifest.block_map.length > 0) {
    return manifest.block_map.map((node, index) => ({
      ref: node.node_ref || `block-${index}`,
      type: node.block_type || node.type || 'block',
      text: normalizeText(node.text || node.text_content || '')
    }));
  }
  return [];
};

const buildSuggestionFromRewriteTarget = (rewriteTarget) => {
  if (!rewriteTarget || typeof rewriteTarget !== 'object') return null;
  const nodeRefs = Array.isArray(rewriteTarget.node_refs) ? rewriteTarget.node_refs : [];
  const primaryNodeRef = rewriteTarget.primary_node_ref || nodeRefs[0] || '';
  const quote = rewriteTarget.quote && typeof rewriteTarget.quote === 'object'
    ? (rewriteTarget.quote.exact || '')
    : '';
  const targetText = rewriteTarget.target_text || quote || '';
  const text = normalizeText(targetText);
  if (!text) return null;
  return {
    text,
    node_ref: primaryNodeRef
  };
};

const normalizeRewriteRequestPayload = (body) => {
  const payload = body && typeof body === 'object' ? body : {};
  const suggestionId = payload.suggestion_id || '';
  const manifest = payload.manifest && typeof payload.manifest === 'object' ? payload.manifest : null;
  const suggestion = payload.suggestion && typeof payload.suggestion === 'object' ? payload.suggestion : null;
  const rewriteTarget = payload.rewrite_target && typeof payload.rewrite_target === 'object' ? payload.rewrite_target : null;
  const repairIntent = payload.repair_intent && typeof payload.repair_intent === 'object' ? payload.repair_intent : null;
  const analysisRef = payload.analysis_ref && typeof payload.analysis_ref === 'object' ? payload.analysis_ref : null;
  const issueContext = sanitizeIssueContext(
    payload.issue_context && typeof payload.issue_context === 'object'
      ? payload.issue_context
      : null
  );
  const options = payload.options && typeof payload.options === 'object' ? payload.options : {};
  const testMode = payload.test_mode === true;
  const synthesizedSuggestion = !suggestion ? buildSuggestionFromRewriteTarget(rewriteTarget) : null;

  return {
    suggestion_id: suggestionId,
    suggestion: suggestion || synthesizedSuggestion,
    manifest,
    rewrite_target: rewriteTarget,
    repair_intent: repairIntent,
    analysis_ref: analysisRef,
    issue_context: issueContext,
    options,
    test_mode: testMode
  };
};

/**
 * Fetch suggestion from DynamoDB by ID
 */
async function fetchSuggestionById(suggestionId) {
  try {
    const command = new GetCommand({
      TableName: getEnv('SUGGESTIONS_TABLE', 'aivi-suggestions-dev'),
      Key: { suggestion_id: suggestionId }
    });

    const response = await ddbDoc.send(command);
    return response.Item;
  } catch (error) {
    console.error('Failed to fetch suggestion:', error);
    return null;
  }
}

/**
 * Generate rewrite variants for a suggestion
 */
async function generateRewrites(suggestion, manifest, options = {}) {
  const { numVariants = 3, tone = 'neutral' } = options;
  const rewriteTarget = options.rewrite_target && typeof options.rewrite_target === 'object'
    ? options.rewrite_target
    : null;
  const repairIntent = options.repair_intent && typeof options.repair_intent === 'object'
    ? options.repair_intent
    : null;
  const issueContext = options.issue_context && typeof options.issue_context === 'object'
    ? options.issue_context
    : null;

  // Extract context around the suggestion
  const context = extractContext(suggestion, manifest, { rewriteTarget, repairIntent, issueContext });

  const apiKey = await getMistralKey();
  const model = getEnv('MISTRAL_MODEL', 'mistral-large-latest');
  const systemPrompt = buildRewriteSystemPrompt();
  const maxAttempts = 2;
  let attempt = 0;
  let retryHint = null;
  let finalValidation = { valid: false, reason: 'unknown' };
  let lastVariants = [];

  while (attempt < maxAttempts) {
    const prompt = buildRewritePrompt(suggestion, context, tone, numVariants, {
      rewriteTarget,
      repairIntent,
      issueContext,
      retryHint
    });

    let response;
    try {
      response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.4,
          max_tokens: 2200,
          response_format: { type: 'json_object' }
        })
      });
    } catch (networkError) {
      throw new Error(`Mistral request failed: ${networkError && networkError.message ? networkError.message : 'network_error'}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mistral API error ${response.status}: ${errorText}`);
    }

    const responseJson = await response.json();
    const responseText = responseJson?.choices?.[0]?.message?.content || '';
    const variants = parseRewriteResponse(responseText, numVariants);
    const validation = validateVariantsForTarget(variants, rewriteTarget, suggestion && suggestion.text ? suggestion.text : '');

    lastVariants = variants;
    finalValidation = validation;

    if (validation.valid) {
      return {
        variants,
        validator_pass: true,
        retry_count: attempt,
        fallback_used: false,
        fallback_reason: null,
        validation_reason: validation.reason
      };
    }

    attempt += 1;
    retryHint = validation.reason;
  }

  const fallbackVariants = buildSafeFallbackVariants(
    suggestion,
    numVariants,
    rewriteTarget,
    finalValidation.reason || 'validation_failed'
  );
  return {
    variants: fallbackVariants.length ? fallbackVariants : lastVariants,
    validator_pass: false,
    retry_count: maxAttempts - 1,
    fallback_used: true,
    fallback_reason: finalValidation.reason || 'validation_failed',
    validation_reason: finalValidation.reason || 'validation_failed'
  };
}

/**
 * Extract context around the text to rewrite
 */
function extractContext(suggestion, manifest, contextMeta = {}) {
  const { text, node_ref } = suggestion;
  const rewriteTarget = contextMeta && typeof contextMeta === 'object' ? contextMeta.rewriteTarget : null;
  const issueContext = contextMeta && typeof contextMeta === 'object' ? contextMeta.issueContext : null;
  const nodes = normalizeManifestNodes(manifest);

  if (!nodes.length) {
    return {
      before: '',
      after: '',
      full_context: text,
      node_type: 'text'
    };
  }

  if (rewriteTarget && Array.isArray(rewriteTarget.node_refs) && rewriteTarget.node_refs.length > 0) {
    const targetRefs = new Set(rewriteTarget.node_refs.map((ref) => String(ref || '').trim()).filter(Boolean));
    const targetNodes = nodes.filter((node) => targetRefs.has(String(node.ref || '').trim()));
    if (targetNodes.length > 0) {
      const firstIndex = nodes.findIndex((node) => node.ref === targetNodes[0].ref);
      const contextWindow = Number.isInteger(rewriteTarget.rewrite_context_window)
        ? Math.max(1, Math.min(6, rewriteTarget.rewrite_context_window))
        : 2;
      const startIdx = Math.max(0, firstIndex - contextWindow);
      const endIdx = Math.min(nodes.length - 1, firstIndex + contextWindow);
      const beforeNodes = nodes.slice(startIdx, firstIndex);
      const afterNodes = nodes.slice(firstIndex + targetNodes.length, endIdx + 1);
      return {
        before: beforeNodes.map((n) => n.text || '').join(' ').trim(),
        after: afterNodes.map((n) => n.text || '').join(' ').trim(),
        full_context: targetNodes.map((n) => n.text || '').join('\n\n').trim() || text,
        node_type: targetNodes[0].type || 'text',
        target_node_refs: targetNodes.map((n) => n.ref),
        target_mode: rewriteTarget.mode || ''
      };
    }
  }

  if (rewriteTarget && String(rewriteTarget.mode || '').toLowerCase().trim() === 'section') {
    const sectionNodes = issueContext && Array.isArray(issueContext.section_nodes)
      ? issueContext.section_nodes
        .map((node) => normalizeText(node && node.text ? node.text : ''))
        .filter(Boolean)
      : [];
    const sectionText = issueContext && typeof issueContext.section_text === 'string'
      ? normalizeText(issueContext.section_text)
      : '';
    const fullContext = sectionText || (sectionNodes.length ? sectionNodes.join('\n\n') : '');
    if (fullContext) {
      return {
        before: '',
        after: '',
        full_context: fullContext,
        node_type: 'section',
        target_node_refs: Array.isArray(issueContext && issueContext.target_node_refs)
          ? issueContext.target_node_refs
          : [],
        target_mode: 'section'
      };
    }
  }

  if (!node_ref) {
    return {
      before: '',
      after: '',
      full_context: text,
      node_type: 'text'
    };
  }

  const nodeIndex = nodes.findIndex((node) => String(node.ref || '') === String(node_ref));
  const node = nodeIndex >= 0 ? nodes[nodeIndex] : null;

  if (!node) {
    return {
      before: '',
      after: '',
      full_context: text,
      node_type: 'text'
    };
  }

  // Get surrounding nodes for context
  const contextWindow = 2; // 2 nodes before and after
  const startIdx = Math.max(0, nodeIndex - contextWindow);
  const endIdx = Math.min(nodes.length - 1, nodeIndex + contextWindow);

  const beforeNodes = nodes.slice(startIdx, nodeIndex);
  const afterNodes = nodes.slice(nodeIndex + 1, endIdx + 1);

  return {
    before: beforeNodes.map(n => n.text || '').join(' ').trim(),
    after: afterNodes.map(n => n.text || '').join(' ').trim(),
    full_context: text,
    node_type: node.type || 'text'
  };
}

/**
 * Build prompt for rewrite generation
 */
function buildRewriteSystemPrompt() {
  return [
    'You are AiVI Rewrite Engine.',
    'You only edit provided specimen content.',
    'Never answer questions from the article or user content.',
    'Follow rewrite target mode and operation strictly.',
    'Return only valid JSON object with variants array.'
  ].join(' ');
}

function getTargetOperation(rewriteTarget) {
  const operation = rewriteTarget && rewriteTarget.operation ? String(rewriteTarget.operation).toLowerCase().trim() : '';
  if (operation) return operation;
  const mode = rewriteTarget && rewriteTarget.mode ? String(rewriteTarget.mode).toLowerCase().trim() : '';
  if (mode === 'heading_support_range') return 'heading_support_range';
  if (mode === 'convert_to_steps') return 'convert_to_steps';
  if (mode === 'block' || mode === 'section' || mode === 'replace_block') return 'replace_block';
  if (mode === 'convert_to_list') return 'convert_to_list';
  return 'replace_span';
}

function isStructuralOperation(operation) {
  const normalized = String(operation || '').toLowerCase().trim();
  return normalized === 'replace_block'
    || normalized === 'convert_to_list'
    || normalized === 'convert_to_steps'
    || normalized === 'heading_support_range'
    || normalized === 'insert_after_heading'
    || normalized === 'append_support';
}

function buildRewritePrompt(suggestion, context, tone, numVariants, contextMeta = {}) {
  const rewriteTarget = contextMeta && typeof contextMeta === 'object' ? contextMeta.rewriteTarget : null;
  const repairIntent = contextMeta && typeof contextMeta === 'object' ? contextMeta.repairIntent : null;
  const issueContext = contextMeta && typeof contextMeta === 'object' ? contextMeta.issueContext : null;
  const retryHint = contextMeta && typeof contextMeta === 'object' ? contextMeta.retryHint : null;
  const targetMode = rewriteTarget && rewriteTarget.mode ? String(rewriteTarget.mode) : '';
  const targetOperation = getTargetOperation(rewriteTarget);
  const targetRefs = rewriteTarget && Array.isArray(rewriteTarget.node_refs) ? rewriteTarget.node_refs.filter(Boolean) : [];
  const checkId = repairIntent && repairIntent.check_id ? String(repairIntent.check_id) : '';
  const checkName = repairIntent && repairIntent.check_name ? String(repairIntent.check_name) : '';
  const ruleHint = repairIntent && repairIntent.rule_hint ? String(repairIntent.rule_hint) : '';
  const mustPreserve = repairIntent && Array.isArray(repairIntent.must_preserve)
    ? repairIntent.must_preserve.filter(Boolean).map((item) => `- ${item}`).join('\n')
    : '';
  const mustChange = repairIntent && Array.isArray(repairIntent.must_change)
    ? repairIntent.must_change.filter(Boolean).map((item) => `- ${item}`).join('\n')
    : '';
  const targetSection = targetMode || targetRefs.length || ruleHint
    ? `\nTARGET RESOLUTION:\n- mode: "${targetMode || 'legacy'}"\n- operation: "${targetOperation || 'replace_span'}"\n- node_refs: ${targetRefs.length ? JSON.stringify(targetRefs) : '[]'}\n- check_id: "${checkId || ''}"\n- check_name: "${checkName || ''}"\n- rule_hint: "${ruleHint || ''}"\n- must_preserve:\n${mustPreserve || '- Keep original intent and topical scope.'}\n- must_change:\n${mustChange || '- Address the flagged issue directly and precisely.'}\n`
    : '';

  const modeSpecificRules = (() => {
    if (targetOperation === 'convert_to_list') {
      return `MODE-SPECIFIC RULES:\n- Convert the targeted content into a clean bullet list (or numbered list when sequence matters).\n- Output must be list-form text or list HTML (<ul>/<ol>/<li>), not prose paragraph.\n- Keep factual meaning and keep all key comparative points.\n- Do not add unrelated claims.\n`;
    }
    if (targetOperation === 'convert_to_steps') {
      return `MODE-SPECIFIC RULES:\n- Convert targeted content into explicit sequential steps.\n- Output must be numbered list format or explicit Step 1/Step 2 style.\n- Keep factual meaning and preserve all key process constraints.\n- Do not answer unrelated questions.\n`;
    }
    if (targetMode === 'heading_support_range' || targetOperation === 'heading_support_range') {
      return `MODE-SPECIFIC RULES:\n- Rewrite only the supporting content under the flagged heading.\n- Do NOT rewrite the heading text itself.\n- Keep section topic continuity while adding concrete, citable support.\n`;
    }
    if (targetOperation === 'insert_after_heading' || targetOperation === 'append_support') {
      return `MODE-SPECIFIC RULES:\n- Add concise support content that directly fulfills the heading promise.\n- Keep local section scope; do not rewrite unrelated sections.\n- Produce concrete, citable statements with clear claims.\n`;
    }
    if (targetMode === 'block' || targetMode === 'section' || targetOperation === 'replace_block') {
      return `MODE-SPECIFIC RULES:\n- Rewrite the targeted block(s) as cohesive prose.\n- Preserve section intent and factual meaning.\n- Avoid introducing claims not present in source context.\n`;
    }
    return `MODE-SPECIFIC RULES:\n- Rewrite only the flagged inline span.\n- Keep surrounding sentence structure and intent.\n- Do not expand into unrelated parts of the paragraph.\n`;
  })();

  const issueContextSection = issueContext && typeof issueContext === 'object'
    ? `\nISSUE CONTEXT:\n${JSON.stringify({
      check_id: issueContext.check_id || '',
      check_name: issueContext.check_name || '',
      category_id: issueContext.category_id || '',
      verdict: issueContext.verdict || '',
      message: issueContext.message || '',
      failure_reason: issueContext.failure_reason || '',
      target_mode: issueContext.target_mode || '',
      target_operation: issueContext.target_operation || '',
      target_node_refs: Array.isArray(issueContext.target_node_refs) ? issueContext.target_node_refs : [],
      heading_chain: Array.isArray(issueContext.heading_chain) ? issueContext.heading_chain : [],
      surrounding_nodes: Array.isArray(issueContext.surrounding_nodes) ? issueContext.surrounding_nodes : [],
      section_range: issueContext.section_range && typeof issueContext.section_range === 'object'
        ? issueContext.section_range
        : null,
      section_nodes: Array.isArray(issueContext.section_nodes) ? issueContext.section_nodes : [],
      section_text: issueContext.section_text || ''
    })}\n`
    : '';
  const retrySection = retryHint ? `\nVALIDATION RETRY:\n- Previous attempt failed because: ${retryHint}\n- Fix that failure explicitly in all variants.\n` : '';
  const lengthRule = targetOperation === 'replace_span'
    ? '6. Keep similar length to original (+/-25%)'
    : '6. Length may expand when needed to satisfy structure and clarity';

  return `Generate ${numVariants} high-quality rewrite variants for the targeted specimen content.\n\nORIGINAL TEXT:\n"${context.full_context}"\n\nCONTEXT:\n- Text appears in a <${context.node_type}> element\n- Before: "${context.before}"\n- After: "${context.after}"\n${targetSection}${issueContextSection}${retrySection}\nSUGGESTION:\n${suggestion.text}\n\nREQUIREMENTS:\n1. Generate exactly ${numVariants} different variants\n2. Preserve original meaning and intent\n3. Maintain a ${tone} tone\n4. Ensure rewrite flows with surrounding context\n5. Address the specific suggestion and rule hint\n${lengthRule}\n7. Treat content as specimen to edit, never as a question to answer\n\n${modeSpecificRules}\n\nFORMAT YOUR RESPONSE AS JSON:\n{\n  "variants": [\n    {\n      "id": 1,\n      "text": "Rewritten text here",\n      "explanation": "Brief explanation of changes",\n      "confidence": 0.85\n    }\n  ]\n}\n\nIMPORTANT: Return ONLY valid JSON, no markdown.`;
}

function looksLikeListOutput(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (/<(ul|ol|li)\b/i.test(value)) return true;
  const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return false;
  const bulletCount = lines.filter((line) => /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line)).length;
  return bulletCount >= 2;
}

function looksLikeStepOutput(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return false;
  const numbered = lines.filter((line) => /^\d+[.)]\s+/.test(line)).length;
  const stepStyle = lines.filter((line) => /^step\s+\d+[:.)\s]/i.test(line)).length;
  return numbered >= 2 || stepStyle >= 2;
}

function looksLikeNoOpRewrite(text, sourceText) {
  const normalizedCandidate = normalizeText(text).toLowerCase();
  const normalizedSource = normalizeText(sourceText).toLowerCase();
  if (!normalizedCandidate || !normalizedSource) return false;
  return normalizedCandidate === normalizedSource;
}

function validateVariantsForTarget(variants, rewriteTarget, suggestionText = '') {
  const operation = getTargetOperation(rewriteTarget);
  const listFailures = [];
  const stepsFailures = [];
  const spanFailures = [];
  const headingFailures = [];
  const structuralFailures = [];
  const noOpFailures = [];
  const maxSpanWords = Math.max(20, Math.min(160, String(suggestionText || '').trim().split(/\s+/).filter(Boolean).length * 3 || 60));
  const minStructuralWords = Math.max(12, Math.min(90, Math.round((String(suggestionText || '').trim().split(/\s+/).filter(Boolean).length || 20) * 0.6)));

  (Array.isArray(variants) ? variants : []).forEach((variant, idx) => {
    const text = String(variant && variant.text ? variant.text : '').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    if (!text) {
      if (operation === 'convert_to_list') listFailures.push(idx);
      if (operation === 'convert_to_steps') stepsFailures.push(idx);
      if (operation === 'replace_span') spanFailures.push(idx);
      if (operation === 'heading_support_range') headingFailures.push(idx);
      if (isStructuralOperation(operation)) structuralFailures.push(idx);
      return;
    }
    if (operation === 'convert_to_list' && !looksLikeListOutput(text)) {
      listFailures.push(idx);
    }
    if (operation === 'convert_to_steps' && !looksLikeStepOutput(text)) {
      stepsFailures.push(idx);
    }
    if (operation === 'replace_span' && words > maxSpanWords) {
      spanFailures.push(idx);
    }
    if (isStructuralOperation(operation) && words < minStructuralWords) {
      structuralFailures.push(idx);
    }
    if (isStructuralOperation(operation) && looksLikeNoOpRewrite(text, suggestionText) && words > 8) {
      noOpFailures.push(idx);
    }
    if (operation === 'heading_support_range') {
      const headingText = rewriteTarget && rewriteTarget.quote && rewriteTarget.quote.exact
        ? normalizeText(rewriteTarget.quote.exact)
        : '';
      if (headingText && normalizeText(text) === headingText) {
        headingFailures.push(idx);
      }
    }
  });

  if (operation === 'convert_to_list' && listFailures.length > 0) {
    return { valid: false, reason: 'convert_to_list_requires_list_output', invalid_indexes: listFailures };
  }
  if (operation === 'convert_to_steps' && stepsFailures.length > 0) {
    return { valid: false, reason: 'convert_to_steps_requires_step_output', invalid_indexes: stepsFailures };
  }
  if (operation === 'replace_span' && spanFailures.length > 0) {
    return { valid: false, reason: 'replace_span_scope_too_wide', invalid_indexes: spanFailures };
  }
  if (isStructuralOperation(operation) && noOpFailures.length > 0) {
    return { valid: false, reason: 'structural_no_effect_rewrite', invalid_indexes: noOpFailures };
  }
  if (isStructuralOperation(operation) && structuralFailures.length > 0) {
    return { valid: false, reason: 'structural_output_too_thin', invalid_indexes: structuralFailures };
  }
  if (operation === 'heading_support_range' && headingFailures.length > 0) {
    return { valid: false, reason: 'heading_support_range_must_not_replace_heading_only', invalid_indexes: headingFailures };
  }
  return { valid: true, reason: 'ok', invalid_indexes: [] };
}

function sentenceToBullets(text) {
  const fragments = String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const selected = fragments.slice(0, 6);
  if (selected.length >= 2) {
    return selected.map((part) => `- ${part.replace(/^[-*•]\s+/, '')}`).join('\n');
  }
  const compact = String(text || '').trim();
  if (!compact) return '- Add concise, scannable bullet points for this section.';
  return `- ${compact}`;
}

function buildSafeFallbackVariants(suggestion, numVariants, rewriteTarget, reason) {
  const operation = getTargetOperation(rewriteTarget);
  const suggestionText = String(suggestion && suggestion.text ? suggestion.text : '').trim();
  const variants = Array.from({ length: numVariants }, (_, i) => {
    let text = suggestionText || 'Rewrite unavailable. Please refine manually.';
    if (operation === 'convert_to_list') {
      text = sentenceToBullets(suggestionText);
    } else if (operation === 'convert_to_steps') {
      const bulletLines = sentenceToBullets(suggestionText)
        .split('\n')
        .map((line) => line.replace(/^[-*â€¢]\s+/, '').trim())
        .filter(Boolean);
      text = bulletLines.length >= 2
        ? bulletLines.map((line, idx) => `${idx + 1}. ${line}`).join('\n')
        : '1. Identify the exact issue in this section.\n2. Rewrite the section with explicit, actionable steps.\n3. Verify clarity and factual consistency.';
    } else if (operation === 'insert_after_heading' || operation === 'append_support') {
      text = suggestionText || 'Add concise supporting content that directly fulfills the heading promise and improves extractability for answer engines.';
    }
    return {
      id: i + 1,
      text,
      explanation: `Fallback variant generated after validation failure (${reason}).`,
      confidence: 0.35,
      word_count: text ? text.split(/\s+/).length : 0,
      fallback_reason: reason
    };
  });
  return variants;
}

function parseRewriteResponse(responseText, expectedCount) {
  try {
    // Clean up response
    let cleanText = responseText.trim();

    // Remove markdown code blocks if present
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/```(?:json)?\s*/, '').replace(/```\s*$/, '');
    }

    // Try parsing with jsonrepair fallback
    let response;
    try {
      response = JSON.parse(cleanText);
    } catch (initialParseError) {
      console.log('Initial JSON.parse failed, attempting repair:', initialParseError.message);
      const repairedJson = jsonrepair(cleanText);
      response = JSON.parse(repairedJson);
      console.log('Successfully parsed after JSON repair');
    }

    // Validate structure
    if (!response.variants || !Array.isArray(response.variants)) {
      throw new Error('Invalid response structure');
    }

    // Ensure we have the right number of variants
    if (response.variants.length !== expectedCount) {
      console.warn(`Expected ${expectedCount} variants, got ${response.variants.length}`);
    }

    // Validate each variant
    return response.variants.map((variant, index) => ({
      id: variant.id || index + 1,
      text: variant.text || '',
      explanation: variant.explanation || '',
      confidence: variant.confidence || 0.5,
      word_count: variant.text ? variant.text.split(/\s+/).length : 0
    }));

  } catch (error) {
    console.error('Failed to parse rewrite response:', error);
    console.error('Response text:', responseText);

    // Return fallback variants
    return Array.from({ length: expectedCount }, (_, i) => ({
      id: i + 1,
      text: 'Unable to generate rewrite. Please try again.',
      explanation: 'Parsing error occurred',
      confidence: 0,
      word_count: 7
    }));
  }
}

/**
 * Main rewrite handler
 */
async function rewriteHandler(event) {
  const startTime = Date.now();
  let telemetryContext = {
    run_id: null,
    check_id: null,
    instance_index: null,
    rewrite_target_mode: null,
    rewrite_operation: null,
    actionable: null
  };

  try {
    // Parse request body
    let body;
    if (typeof event.body === 'string') {
      body = JSON.parse(event.body);
    } else {
      body = event.body;
    }

    const normalized = normalizeRewriteRequestPayload(body);
    const {
      suggestion_id,
      suggestion,
      manifest,
      rewrite_target,
      repair_intent,
      analysis_ref,
      issue_context,
      options = {}
    } = normalized;
    telemetryContext = {
      run_id: analysis_ref && analysis_ref.run_id ? analysis_ref.run_id : null,
      check_id: analysis_ref && analysis_ref.check_id ? analysis_ref.check_id : null,
      instance_index: analysis_ref && Number.isFinite(Number(analysis_ref.instance_index))
        ? Number(analysis_ref.instance_index)
        : null,
      rewrite_target_mode: rewrite_target && rewrite_target.mode ? rewrite_target.mode : null,
      rewrite_operation: rewrite_target && rewrite_target.operation ? rewrite_target.operation : null,
      actionable: rewrite_target && Object.prototype.hasOwnProperty.call(rewrite_target, 'actionable')
        ? rewrite_target.actionable === true
        : null
    };
    emitRewriteRequested({
      ...telemetryContext,
      has_suggestion_id: !!suggestion_id,
      has_suggestion_object: !!suggestion,
      has_manifest_nodes: Array.isArray(manifest && manifest.nodes) && manifest.nodes.length > 0,
      has_manifest_block_map: Array.isArray(manifest && manifest.block_map) && manifest.block_map.length > 0,
      has_issue_context: !!issue_context
    });

    // Validate required fields
    if (!suggestion && !suggestion_id && !rewrite_target) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Missing rewrite target',
          message: 'Provide suggestion, suggestion_id, or rewrite_target'
        })
      };
    }

    if (!manifest) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Missing manifest',
          message: 'Manifest is required for context extraction'
        })
      };
    }

    // Fetch suggestion if only ID provided
    let actualSuggestion = suggestion;
    if (!actualSuggestion && suggestion_id) {
      actualSuggestion = await fetchSuggestionById(suggestion_id);
      if (!actualSuggestion) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ok: false,
            error: 'suggestion_not_found',
            message: `Suggestion with ID ${suggestion_id} not found`
          })
        };
      }
    }

    if (!actualSuggestion && rewrite_target) {
      actualSuggestion = buildSuggestionFromRewriteTarget(rewrite_target);
    }

    // Validate suggestion has text
    if (!actualSuggestion || !actualSuggestion.text) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Invalid suggestion',
          message: 'Suggestion must contain text to rewrite'
        })
      };
    }

    // Check for test mode
    if (body.test_mode === true || getEnv('TEST_MODE') === 'true') {
      return generateMockRewrite(actualSuggestion || { text: 'Sample text' }, {
        analysis_ref,
        rewrite_target
      });
    }

    // Generate rewrites
    const rewriteResult = await generateRewrites(
      actualSuggestion,
      manifest,
      {
        ...options,
        rewrite_target,
        repair_intent,
        analysis_ref,
        issue_context
      }
    );
    const variants = Array.isArray(rewriteResult?.variants) ? rewriteResult.variants : [];

    const processingTime = Date.now() - startTime;
    emitRewriteCompleted({
      ...telemetryContext,
      duration_ms: processingTime,
      variants_count: variants.length,
      model: getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
      validator_pass: rewriteResult?.validator_pass === true,
      retry_count: Number.isFinite(Number(rewriteResult?.retry_count)) ? Number(rewriteResult.retry_count) : 0,
      fallback_used: rewriteResult?.fallback_used === true,
      fallback_reason: rewriteResult?.fallback_reason || null
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        suggestion_id,
        analysis_ref: analysis_ref || null,
        rewrite_target_mode: rewrite_target && rewrite_target.mode ? rewrite_target.mode : null,
        variants,
        processing_time_ms: processingTime,
        metadata: {
          model: getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
          generated_at: new Date().toISOString(),
          variant_count: variants.length,
          validator_pass: rewriteResult?.validator_pass === true,
          retry_count: Number.isFinite(Number(rewriteResult?.retry_count)) ? Number(rewriteResult.retry_count) : 0,
          fallback_used: rewriteResult?.fallback_used === true,
          fallback_reason: rewriteResult?.fallback_reason || null,
          validation_reason: rewriteResult?.validation_reason || null
        }
      })
    };

  } catch (error) {
    console.error('Rewrite handler error:', error);
    emitRewriteFailed({
      ...telemetryContext,
      duration_ms: Date.now() - startTime,
      error: error && error.message ? String(error.message) : 'unknown_error'
    });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'rewrite_failed',
        message: error.message
      })
    };
  }
}

/**
 * Generate mock rewrite for test mode
 */
function generateMockRewrite(suggestion, meta = {}) {
  const rewriteTarget = meta && typeof meta === 'object' ? meta.rewrite_target : null;
  const analysisRef = meta && typeof meta === 'object' ? meta.analysis_ref : null;
  const mockVariants = [
    {
      id: 1,
      text: `Improved version of: "${suggestion.text}"`,
      explanation: 'Test mode: Enhanced clarity and readability',
      confidence: 0.85,
      word_count: suggestion.text.split(/\s+/).length + 2
    },
    {
      id: 2,
      text: `Alternative phrasing for: "${suggestion.text}"`,
      explanation: 'Test mode: More concise version',
      confidence: 0.80,
      word_count: suggestion.text.split(/\s+/).length - 1
    },
    {
      id: 3,
      text: `Rewritten with better flow: "${suggestion.text}"`,
      explanation: 'Test mode: Improved sentence structure',
      confidence: 0.75,
      word_count: suggestion.text.split(/\s+/).length
    }
  ];

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      suggestion_id: 'test-suggestion-id',
      analysis_ref: analysisRef || null,
      rewrite_target_mode: rewriteTarget && rewriteTarget.mode ? rewriteTarget.mode : null,
      variants: mockVariants,
      processing_time_ms: 50,
      metadata: {
        model: getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
        generated_at: new Date().toISOString(),
        variant_count: 3,
        test_mode: true
      }
    })
  };
}

module.exports = {
  rewriteHandler,
  generateRewrites,
  extractContext,
  buildRewritePrompt,
  validateVariantsForTarget,
  buildSafeFallbackVariants,
  parseRewriteResponse,
  normalizeRewriteRequestPayload,
  buildSuggestionFromRewriteTarget,
  normalizeManifestNodes
};
