const fs = require('fs');
const path = require('path');
const { getPrompt } = require('./prompt-manager');
const { jsonrepair } = require('jsonrepair');
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { buildFixAssistTriage } = require('./fix-assist-triage');
const { buildFixAssistContract } = require('./fix-assist-contract-builder');
const { buildUsageSettlementPreview } = require('./credit-pricing');
const { createSettlementEvent, persistLedgerEvent } = require('./credit-ledger');
const { createAccountBillingStateStore, applyLedgerEventToState, computeTotalRemaining } = require('./billing-account-state');
const { performEvidenceVerification } = require('./evidence-verifier');
const {
  emitRewriteRequested,
  emitRewriteCompleted,
  emitRewriteFailed,
  emitCopilotVariantsGenerated,
  emitCopilotGenerationFailed,
  emitCopilotGenerationSettled
} = require('./telemetry-emitter');

function loadSharedSchemaJson(...candidateRelativePaths) {
  for (const candidate of candidateRelativePaths) {
    const resolved = path.resolve(__dirname, candidate);
    if (fs.existsSync(resolved)) {
      return require(resolved);
    }
  }
  throw new Error(`Unable to locate shared schema JSON. Tried: ${candidateRelativePaths.join(', ')}`);
}

const CHECK_DEFINITIONS = loadSharedSchemaJson(
  '../shared/schemas/checks-definitions-v1.json',
  './shared/schemas/checks-definitions-v1.json'
);
const CHECK_RUNTIME_CONTRACT = loadSharedSchemaJson(
  '../shared/schemas/check-runtime-contract-v1.json',
  './shared/schemas/check-runtime-contract-v1.json'
);

// Environment variables
const getEnv = (key, defaultValue = undefined) => process.env[key] || defaultValue;

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({});
const ddbDoc = DynamoDBDocumentClient.from(ddbClient);
const secretsClient = new SecretsManagerClient({});

const FIX_ASSIST_VARIANT_PROFILES = Object.freeze([
  Object.freeze({
    id: 'most_concise',
    label: 'Most concise',
    promptHint: 'Make this the tightest usable answer while preserving all required facts and scope.'
  }),
  Object.freeze({
    id: 'balanced',
    label: 'Balanced',
    promptHint: 'Balance clarity, context, and natural editorial flow.'
  }),
  Object.freeze({
    id: 'evidence_first',
    label: 'Evidence-first',
    promptHint: 'Lead with a direct answer first, then emphasize support, precision, and trust signals without sounding stiff.'
  })
]);

function resolveScopedCheckId(options = {}) {
  const copilotIssue = options.copilotIssue && typeof options.copilotIssue === 'object'
    ? options.copilotIssue
    : null;
  const issueContext = options.issueContext && typeof options.issueContext === 'object'
    ? options.issueContext
    : null;
  const fixAssistContract = options.fixAssistContract && typeof options.fixAssistContract === 'object'
    ? options.fixAssistContract
    : null;
  return String(
    (copilotIssue && (copilotIssue.check_id || (copilotIssue.selected_issue && copilotIssue.selected_issue.check_id)))
    || (issueContext && issueContext.check_id)
    || (fixAssistContract && fixAssistContract.check_id)
    || ''
  ).trim();
}

function getCheckDefinitionEntry(checkId) {
  const categories = CHECK_DEFINITIONS && CHECK_DEFINITIONS.categories && typeof CHECK_DEFINITIONS.categories === 'object'
    ? CHECK_DEFINITIONS.categories
    : {};
  if (!checkId) return null;
  for (const category of Object.values(categories)) {
    if (category && category.checks && category.checks[checkId]) {
      return category.checks[checkId];
    }
  }
  return null;
}

function getCheckRuntimeContractEntry(checkId) {
  if (!checkId) return null;
  const checks = CHECK_RUNTIME_CONTRACT && CHECK_RUNTIME_CONTRACT.checks && typeof CHECK_RUNTIME_CONTRACT.checks === 'object'
    ? CHECK_RUNTIME_CONTRACT.checks
    : {};
  return checks[checkId] || null;
}

function buildCheckRepairStandardSection(options = {}) {
  const checkId = resolveScopedCheckId(options);
  if (!checkId) return '';

  const definition = getCheckDefinitionEntry(checkId);
  const contract = getCheckRuntimeContractEntry(checkId);
  const fixAssistContract = options.fixAssistContract && typeof options.fixAssistContract === 'object'
    ? options.fixAssistContract
    : null;
  const copilotMode = String(
    (fixAssistContract && fixAssistContract.copilot_mode)
    || (contract && contract.copilot_mode)
    || ''
  ).trim().toLowerCase();
  const categoryId = String(contract && contract.category_id ? contract.category_id : '').trim().toLowerCase();
  const bullets = [];

  if (definition && definition.description) {
    bullets.push(`- Goal: ${definition.description}`);
  }

  switch (checkId) {
    case 'immediate_answer_placement':
      bullets.push('- Repair the first direct answer segment tied to the explicit question, not the setup or background around it.');
      bullets.push('- Lead with a query-matching answer immediately instead of broad topical framing, caveats, or throat-clearing.');
      bullets.push('- Keep the opening answer easy to quote or reuse before any supporting explanation follows.');
      bullets.push('- Keep the core Earth-Moon-Sun relation explicit: the Moon passes between Earth and the Sun.');
      break;
    case 'answer_sentence_concise':
      bullets.push('- Judge brevity and standalone completeness only; do not turn this repair into sourcing, trust, or claim-verification work.');
      bullets.push('- A strong reusable snippet is usually 40 to 60 words total and may span 1 to 3 short sentences.');
      bullets.push('- Two or three short sentences are often strongest when one sentence would feel cramped or fragmentary.');
      bullets.push('- Do not collapse a complete answer into a vague fragment just to make it shorter.');
      break;
    case 'question_answer_alignment':
      bullets.push('- The opening answer must resolve the same question, scope, and time frame as the selected anchor.');
      bullets.push('- Do not answer a broader topic, an adjacent claim, or a nearby but different question.');
      bullets.push('- Prefer explicit resolution over topical discussion.');
      break;
    case 'clear_answer_formatting':
      bullets.push('- Match the answer form to what the question actually asks for.');
      bullets.push('- A simple factual question can pass with one or two clear sentences when they are already easy to extract.');
      bullets.push('- Use bullets, steps, or separated sub-points only when the question is procedural, listable, comparative, or multi-part.');
      bullets.push('- Do not force list formatting when a direct sentence answer is already clean and extractable.');
      break;
    case 'external_authoritative_sources':
      bullets.push('- Keep named, recognizable source support close to the claim instead of leaving support generic or distant.');
      bullets.push('- If verification finds a close authority match, you may name that source briefly near the claim.');
      bullets.push('- If verification does not find a close source match, do not invent one; narrow the claim or keep the wording more careful instead.');
      break;
    case 'claim_provenance_and_evidence':
      bullets.push('- Strengthen visible support for the claim using named evidence, examples, dates, metrics, or source-aware framing when the context supports it.');
      bullets.push('- If verification finds closely related support, you may use that to frame the claim more safely.');
      bullets.push('- If verification is weak or absent, soften certainty or narrow the claim instead of pretending the support is stronger than it is.');
      break;
    default:
      if (copilotMode === 'structural_transform') {
        bullets.push('- Preserve the underlying facts and scope while changing structure, hierarchy, or presentation.');
        bullets.push('- Treat this as a formatting or organization repair, not a chance to invent new claims.');
      } else if (copilotMode === 'schema_metadata_assist') {
        bullets.push('- Treat this as a metadata or schema repair, not a normal prose rewrite.');
        bullets.push('- Keep output scoped to the metadata problem the selected issue surfaced.');
      } else if (copilotMode === 'limited_technical_guidance') {
        bullets.push('- This is better handled as a technical or editor-side fix than a prose rewrite.');
        bullets.push('- Keep any generated help practical, scoped, and truthful about what still needs manual action.');
      } else if (categoryId === 'intro_focus_factuality') {
        bullets.push('- Keep the opening tighter, clearer, and easier to reuse without turning it into a fragment.');
        bullets.push('- Remove filler or setup that weakens the opening, but preserve factual scope.');
      } else if (categoryId === 'structure_readability') {
        bullets.push('- Make the selected text easier to scan and easier to follow without changing its meaning.');
        bullets.push('- Prefer cleaner sentence flow, clearer support, and tighter transitions over generic simplification.');
      } else if (categoryId === 'entities_semantic') {
        bullets.push('- Keep named entities, references, and relationships explicit and internally consistent.');
        bullets.push('- Remove ambiguity about who or what each sentence refers to.');
      } else if (categoryId === 'trust_neutrality') {
        bullets.push('- Keep the wording careful, non-promotional, and proportional to the support available in context.');
        bullets.push('- Reduce hype, overclaiming, contradiction, or risky certainty without draining useful meaning.');
      } else if (categoryId === 'citability_verifiability') {
        bullets.push('- Keep the factual statement well formed, easy to cite, and internally coherent.');
        bullets.push('- Prefer explicit, publication-ready phrasing over ambiguous or drift-prone wording.');
      } else if (definition && definition.evaluation) {
        bullets.push(`- Evaluation focus: ${clampString(definition.evaluation, 520)}`);
      }
      if (!bullets.length && definition && definition.evaluation) {
        bullets.push(`- Evaluation focus: ${clampString(definition.evaluation, 520)}`);
      }
      break;
  }

  if (definition && definition.thresholds) {
    bullets.push(`- Threshold guidance: ${definition.thresholds}`);
  }

  if (contract && Array.isArray(contract.rewrite_allowed_ops) && contract.rewrite_allowed_ops.length) {
    bullets.push(`- Safe repair operations available here: ${contract.rewrite_allowed_ops.join(', ')}.`);
  }

  if (!bullets.length) return '';
  return `CHECK REPAIR STANDARD:\n${bullets.join('\n')}\n`;
}

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

const normalizeHeaderLookup = (headers = {}, names = []) => {
  if (!headers || typeof headers !== 'object') return '';
  for (const name of names) {
    const direct = headers[name];
    if (direct !== undefined && direct !== null && String(direct).trim()) {
      return String(direct).trim();
    }
    const lowerName = String(name || '').toLowerCase();
    const matchKey = Object.keys(headers).find((key) => String(key || '').toLowerCase() === lowerName);
    if (matchKey && headers[matchKey] !== undefined && headers[matchKey] !== null && String(headers[matchKey]).trim()) {
      return String(headers[matchKey]).trim();
    }
  }
  return '';
};

const normalizeGenerationRequestId = (value) => clampString(value || '', 160);
const normalizeVerificationIntent = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'verify_first' || normalized === 'local_only'
    ? normalized
    : '';
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

const sanitizeCopilotIssuePacket = (copilotIssue) => {
  if (!copilotIssue || typeof copilotIssue !== 'object') return null;
  const base = sanitizeIssueContext(copilotIssue);
  if (!base) return null;
  const selectedIssue = copilotIssue.selected_issue && typeof copilotIssue.selected_issue === 'object'
    ? {
      check_id: clampString(copilotIssue.selected_issue.check_id || '', 120),
      check_name: clampString(copilotIssue.selected_issue.check_name || '', 180),
      instance_index: Number.isFinite(Number(copilotIssue.selected_issue.instance_index))
        ? Number(copilotIssue.selected_issue.instance_index)
        : base.instance_index,
      analyzer_note: clampString(copilotIssue.selected_issue.analyzer_note || '', 500)
    }
    : null;
  return {
    ...base,
    issue_key: clampString(copilotIssue.issue_key || '', 160),
    analyzer_note: clampString(copilotIssue.analyzer_note || copilotIssue.message || '', 500),
    selected_issue: selectedIssue
  };
};

const buildSuggestionFromIssueContext = (issueContext) => {
  if (!issueContext || typeof issueContext !== 'object') return null;
  const sectionNodes = Array.isArray(issueContext.section_nodes)
    ? issueContext.section_nodes
      .map((node) => normalizeText(node && node.text ? node.text : ''))
      .filter(Boolean)
    : [];
  const candidateTexts = [
    issueContext.snippet,
    issueContext.section_text,
    sectionNodes.length ? sectionNodes.join('\n\n') : ''
  ].map((value) => normalizeText(value || ''));
  const text = candidateTexts.find((value) => value.length > 0) || '';
  if (!text) return null;
  const nodeRef = clampString(
    issueContext.node_ref
      || (issueContext.section_range && issueContext.section_range.start_ref)
      || (Array.isArray(issueContext.target_node_refs) ? issueContext.target_node_refs[0] : '')
      || (Array.isArray(issueContext.section_nodes) && issueContext.section_nodes[0] && issueContext.section_nodes[0].ref)
      || '',
    120
  );
  return {
    text,
    node_ref: nodeRef || ''
  };
};

const buildSuggestionFromCopilotIssue = (copilotIssue) => {
  if (!copilotIssue || typeof copilotIssue !== 'object') return null;
  const sectionNodes = Array.isArray(copilotIssue.section_nodes)
    ? copilotIssue.section_nodes
      .map((node) => normalizeText(node && node.text ? node.text : ''))
      .filter(Boolean)
    : [];
  const candidateTexts = [
    copilotIssue.snippet,
    copilotIssue.section_text,
    sectionNodes.length ? sectionNodes.join('\n\n') : ''
  ].map((value) => normalizeText(value || ''));
  const text = candidateTexts.find((value) => value.length > 0) || '';
  if (!text) return null;
  const nodeRef = clampString(
    copilotIssue.node_ref
      || (copilotIssue.section_range && copilotIssue.section_range.start_ref)
      || (Array.isArray(copilotIssue.target_node_refs) ? copilotIssue.target_node_refs[0] : '')
      || '',
    120
  );
  return {
    text,
    node_ref: nodeRef || ''
  };
};

const normalizeModelUsageFromProvider = (usage = {}) => {
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.inputTokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.outputTokens ?? 0);
  return {
    input_tokens: Number.isFinite(promptTokens) && promptTokens > 0 ? Math.floor(promptTokens) : 0,
    output_tokens: Number.isFinite(completionTokens) && completionTokens > 0 ? Math.floor(completionTokens) : 0
  };
};

const addUsageSnapshots = (left = {}, right = {}) => ({
  input_tokens: Math.max(0, Math.floor(Number(left.input_tokens || 0))) + Math.max(0, Math.floor(Number(right.input_tokens || 0))),
  output_tokens: Math.max(0, Math.floor(Number(left.output_tokens || 0))) + Math.max(0, Math.floor(Number(right.output_tokens || 0)))
});

const applyVariantProfiles = (variants = []) => {
  const source = Array.isArray(variants) ? variants : [];
  return source.slice(0, FIX_ASSIST_VARIANT_PROFILES.length).map((variant, index) => {
    const profile = FIX_ASSIST_VARIANT_PROFILES[index] || FIX_ASSIST_VARIANT_PROFILES[FIX_ASSIST_VARIANT_PROFILES.length - 1];
    return {
      ...variant,
      id: index + 1,
      profile_id: profile.id,
      label: profile.label
    };
  });
};

const buildCopilotBillingContext = (event = {}, normalized = {}) => {
  const headers = event && typeof event === 'object' ? (event.headers || {}) : {};
  return {
    account_id: clampString(normalizeHeaderLookup(headers, ['X-AIVI-Account-Id', 'x-aivi-account-id']), 160),
    site_id: clampString(
      normalizeHeaderLookup(headers, ['X-AIVI-Site-Id', 'x-aivi-site-id', 'X-Site-ID', 'x-site-id'])
      || normalized?.issue_context?.site_id
      || normalized?.analysis_ref?.site_id
      || '',
      160
    ),
    generation_request_id: normalizeGenerationRequestId(
      normalized?.generation_request_id
      || normalizeHeaderLookup(headers, ['X-AIVI-Generation-Request-Id', 'x-aivi-generation-request-id'])
    )
  };
};

const buildHttpErrorResponse = (statusCode, errorCode, message, extra = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ok: false,
    error: errorCode,
    message,
    ...extra
  })
});

async function assertCopilotGenerationAllowed(billingContext = {}) {
  if (!billingContext || !billingContext.account_id) {
    return {
      allowed: false,
      response: buildHttpErrorResponse(
        409,
        'account_connection_required',
        'Connect this site to an AiVI account before generating Fix Assist variants.'
      )
    };
  }

  const accountStateStore = createAccountBillingStateStore();
  const accountState = await accountStateStore.getAccountState(billingContext.account_id);
  if (!accountState) {
    return {
      allowed: false,
      response: buildHttpErrorResponse(
        409,
        'billing_account_not_found',
        'AiVI could not find a connected billing account for this site.'
      )
    };
  }

  if (accountState.entitlements?.analysis_allowed !== true) {
    return {
      allowed: false,
      response: buildHttpErrorResponse(
        402,
        'copilot_generation_not_allowed',
        'Copilot cannot generate variants for this account right now. Check your AiVI plan or credits, then try again.'
      )
    };
  }

  const availableCredits = computeTotalRemaining(accountState);
  if (availableCredits !== null && availableCredits <= 0) {
    return {
      allowed: false,
      response: buildHttpErrorResponse(
        402,
        'insufficient_credits',
        'This account does not have enough AiVI credits to generate Copilot variants right now.',
        {
          billing_summary: {
            billing_status: 'blocked',
            credits_used: 0,
            previous_balance: availableCredits,
            current_balance: availableCredits,
            reason_code: 'copilot_generation'
          }
        }
      )
    };
  }

  return {
    allowed: true,
    accountState,
    accountStateStore
  };
}

async function settleCopilotGenerationCharge({
  billingContext,
  accountState,
  accountStateStore,
  usage,
  model,
  analysisRef,
  rewriteTarget,
  fixAssistTriage
} = {}) {
  if (!billingContext || !billingContext.account_id) {
    return null;
  }

  const analysisInstanceIndex = analysisRef && Number.isFinite(Number(analysisRef.instance_index))
    ? Number(analysisRef.instance_index)
    : null;
  const activeState = accountState || await createAccountBillingStateStore().getAccountState(billingContext.account_id);
  const availableCredits = activeState ? computeTotalRemaining(activeState) : null;
  const preview = buildUsageSettlementPreview({
    model: model || getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
    usage: usage || { input_tokens: 0, output_tokens: 0 }
  });

  const settlementEvent = await persistLedgerEvent(createSettlementEvent({
    account_id: billingContext.account_id,
    site_id: billingContext.site_id || activeState?.site?.site_id || 'unknown',
    run_id: analysisRef && analysisRef.run_id ? analysisRef.run_id : null,
    reason_code: 'copilot_generation',
    external_ref: billingContext.generation_request_id || [
      analysisRef && analysisRef.check_id ? analysisRef.check_id : 'rewrite',
      analysisInstanceIndex === null ? 0 : analysisInstanceIndex,
      rewriteTarget && rewriteTarget.primary_repair_node_ref ? rewriteTarget.primary_repair_node_ref : 'scope',
      fixAssistTriage && fixAssistTriage.state ? fixAssistTriage.state : 'requested'
    ].join(':'),
    pricing_snapshot: preview.pricing_snapshot,
    usage_snapshot: preview.usage_snapshot,
    amounts: {
      settled_credits: preview.usage_snapshot.credits_used,
      balance_before: availableCredits,
      balance_after: availableCredits === null ? null : Math.max(availableCredits - preview.usage_snapshot.credits_used, 0)
    }
  }));

  try {
    if (activeState) {
      await (accountStateStore || createAccountBillingStateStore()).putAccountState(
        applyLedgerEventToState(activeState, settlementEvent)
      );
    }
  } catch (error) {
    console.warn('Failed to apply copilot generation settlement to account state', {
      account_id: billingContext.account_id,
      error: error && error.message ? error.message : 'unknown_error'
    });
  }

  const billingSummary = {
    billing_status: preview.usage_snapshot.credits_used > 0 ? 'settled' : 'zero_charge',
    credits_used: preview.usage_snapshot.credits_used,
    reserved_credits: 0,
    refunded_credits: 0,
    previous_balance: settlementEvent.amounts.balance_before,
    current_balance: settlementEvent.amounts.balance_after,
    reason_code: 'copilot_generation',
    billable_model: settlementEvent.pricing_snapshot.billable_model || null,
    generation_request_id: billingContext.generation_request_id || null
  };

  emitCopilotGenerationSettled({
    run_id: analysisRef && analysisRef.run_id ? analysisRef.run_id : null,
    check_id: analysisRef && analysisRef.check_id ? analysisRef.check_id : null,
    instance_index: analysisInstanceIndex,
    site_id: billingContext.site_id || null,
    credits_used: billingSummary.credits_used,
    billing_status: billingSummary.billing_status,
    billable_model: billingSummary.billable_model
  });

  return billingSummary;
}

const normalizeRewriteRequestPayload = (body) => {
  const payload = body && typeof body === 'object' ? body : {};
  const suggestionId = payload.suggestion_id || '';
  const manifest = payload.manifest && typeof payload.manifest === 'object' ? payload.manifest : null;
  const suggestion = payload.suggestion && typeof payload.suggestion === 'object' ? payload.suggestion : null;
  const rewriteTarget = payload.rewrite_target && typeof payload.rewrite_target === 'object' ? payload.rewrite_target : null;
  const repairIntent = payload.repair_intent && typeof payload.repair_intent === 'object' ? payload.repair_intent : null;
  const analysisRef = payload.analysis_ref && typeof payload.analysis_ref === 'object' ? payload.analysis_ref : null;
  const copilotIssue = sanitizeCopilotIssuePacket(
    payload.copilot_issue && typeof payload.copilot_issue === 'object'
      ? payload.copilot_issue
      : (payload.issue_context && typeof payload.issue_context === 'object' ? payload.issue_context : null)
  );
  const issueContext = sanitizeIssueContext(
    payload.issue_context && typeof payload.issue_context === 'object'
      ? payload.issue_context
      : (copilotIssue || null)
  );
  const synthesizedSuggestion = !suggestion
    ? (buildSuggestionFromCopilotIssue(copilotIssue) || buildSuggestionFromRewriteTarget(rewriteTarget) || buildSuggestionFromIssueContext(issueContext))
    : null;
  const fixAssistTriage = payload.fix_assist_triage && typeof payload.fix_assist_triage === 'object'
    ? payload.fix_assist_triage
    : buildFixAssistTriage({
      checkId: analysisRef?.check_id || copilotIssue?.check_id || issueContext?.check_id || repairIntent?.check_id || '',
      checkName: copilotIssue?.check_name || issueContext?.check_name || repairIntent?.check_name || '',
      snippet: suggestion?.text || synthesizedSuggestion?.text || copilotIssue?.snippet || issueContext?.snippet || '',
      message: copilotIssue?.analyzer_note || issueContext?.message || '',
      failureReason: issueContext?.failure_reason || '',
      rewriteTarget,
      repairIntent
    });
  const fixAssistContract = payload.fix_assist_contract && typeof payload.fix_assist_contract === 'object'
    ? payload.fix_assist_contract
    : buildFixAssistContract({
      suggestion: suggestion || synthesizedSuggestion,
      manifest,
      analysisRef: analysisRef,
      rewriteTarget,
      repairIntent,
      issueContext: copilotIssue || issueContext,
      fixAssistTriage
    });
  const verificationIntent = normalizeVerificationIntent(
    payload.verification_intent
    || (payload.options && typeof payload.options === 'object' ? payload.options.verification_intent : '')
  );
  const options = payload.options && typeof payload.options === 'object' ? { ...payload.options } : {};
  if (verificationIntent) {
    options.verification_intent = verificationIntent;
  }
  const testMode = payload.test_mode === true;

  return {
    suggestion_id: suggestionId,
    suggestion: suggestion || synthesizedSuggestion,
    manifest,
    rewrite_target: rewriteTarget,
    repair_intent: repairIntent,
    analysis_ref: analysisRef,
    copilot_issue: copilotIssue,
    issue_context: issueContext,
    fix_assist_triage: fixAssistTriage,
    fix_assist_contract: fixAssistContract,
    generation_request_id: normalizeGenerationRequestId(payload.generation_request_id),
    verification_intent: verificationIntent || null,
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
  const copilotIssue = options.copilot_issue && typeof options.copilot_issue === 'object'
    ? options.copilot_issue
    : null;
  const issueContext = options.issue_context && typeof options.issue_context === 'object'
    ? options.issue_context
    : (copilotIssue || null);
  const fixAssistContract = options.fix_assist_contract && typeof options.fix_assist_contract === 'object'
    ? options.fix_assist_contract
    : null;
  const verificationIntent = options && typeof options === 'object'
    ? normalizeVerificationIntent(options.verification_intent)
    : '';

  // Extract context around the suggestion
  const context = extractContext(suggestion, manifest, { rewriteTarget, repairIntent, issueContext });
  const verificationResult = await performEvidenceVerification({
    suggestion,
    manifest,
    rewriteTarget,
    repairIntent,
    issueContext,
    fixAssistContract,
    verification_intent: verificationIntent
  });

  const apiKey = await getMistralKey();
  const model = getEnv('MISTRAL_MODEL', 'mistral-large-latest');
  const systemPrompt = buildRewriteSystemPrompt();
  const maxAttempts = 2;
  let attempt = 0;
  let retryHint = null;
  let finalValidation = { valid: false, reason: 'unknown' };
  let lastVariants = [];
  let accumulatedUsage = { input_tokens: 0, output_tokens: 0 };

  while (attempt < maxAttempts) {
    const prompt = buildRewritePrompt(suggestion, context, tone, numVariants, {
      rewriteTarget,
      repairIntent,
      copilotIssue,
      issueContext,
      fixAssistContract,
      verificationResult,
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
    accumulatedUsage = addUsageSnapshots(accumulatedUsage, normalizeModelUsageFromProvider(responseJson?.usage));
    const responseText = responseJson?.choices?.[0]?.message?.content || '';
    const variants = parseRewriteResponse(responseText, numVariants, rewriteTarget);
    const validation = validateVariantsForTarget(
      variants,
      rewriteTarget,
      suggestion && suggestion.text ? suggestion.text : '',
      fixAssistContract,
      {
        verification_intent: verificationIntent,
        verification_result: verificationResult
      }
    );

    lastVariants = variants;
    finalValidation = validation;

    if (validation.valid) {
      return {
        variants: applyVariantProfiles(variants),
        validator_pass: true,
        retry_count: attempt,
        fallback_used: false,
        fallback_reason: null,
        validation_reason: validation.reason,
        validation_details: validation.details || null,
        usage_snapshot: accumulatedUsage,
        verification_result: verificationResult || null
      };
    }

    console.info(JSON.stringify({
      event: 'copilot_validation_failed',
      check_id: String(fixAssistContract && fixAssistContract.check_id ? fixAssistContract.check_id : '').trim() || null,
      attempt: attempt + 1,
      validation_reason: validation.reason,
      validation_rule: validation.details && validation.details.validator_rule ? validation.details.validator_rule : null,
      invalid_indexes: Array.isArray(validation.invalid_indexes) ? validation.invalid_indexes : [],
      validation_details: validation.details || null
    }));

    attempt += 1;
    retryHint = validation.reason;
  }

  if (finalValidation.reason === 'replace_span_scope_too_wide') {
    return {
      variants: [],
      validator_pass: false,
      retry_count: maxAttempts - 1,
      fallback_used: false,
      fallback_reason: null,
      validation_reason: finalValidation.reason,
      validation_details: finalValidation.details || null,
      usage_snapshot: accumulatedUsage,
      verification_result: verificationResult || null,
      unavailable_reason: finalValidation.reason,
      unavailable_message: buildVariantsUnavailableMessage(finalValidation.reason),
      client_ok: false
    };
  }

  const fallbackVariants = buildSafeFallbackVariants(
    suggestion,
    numVariants,
    rewriteTarget,
    finalValidation.reason || 'validation_failed'
  );
  return {
    variants: applyVariantProfiles(fallbackVariants.length ? fallbackVariants : lastVariants),
    validator_pass: false,
    retry_count: maxAttempts - 1,
    fallback_used: true,
    fallback_reason: finalValidation.reason || 'validation_failed',
    validation_reason: finalValidation.reason || 'validation_failed',
    validation_details: finalValidation.details || null,
    usage_snapshot: accumulatedUsage,
    verification_result: verificationResult || null
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
    'You are AiVI Copilot, an issue-scoped editorial repair assistant.',
    'You are not AiVI Analyzer.',
    'Do not re-score, re-diagnose, or restate the analyzer explanation as your main job.',
    'Your job is to repair the selected issue in the provided specimen text.',
    'Only edit provided specimen content.',
    'Never answer questions from the article or user content.',
    'Treat the repair contract and selected issue packet as the primary authority.',
    'Use rewrite_target, node_refs, signatures, and other analyzer anchors only as optional location hints.',
    'If analyzer hints conflict with the selected issue, local section evidence, or preservation requirements, ignore the hints.',
    'The repair contract is authoritative. Obey must_preserve, must_change, do_not_invent, tone_guard, and scope_guard exactly.',
    'If verification context is present, treat it as bounded support signal, not as proof.',
    'Do not imply stronger certainty than the verification context supports.',
    'If the contract limits edits to a scoped repair area, do not rewrite outside that scope.',
    'If preservation requirements and rewrite style conflict, preservation requirements win.',
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

function buildRepairContractSection(repairContract) {
  if (!repairContract || typeof repairContract !== 'object') return '';
  const mustPreserve = Array.isArray(repairContract.must_preserve)
    ? repairContract.must_preserve.filter(Boolean).map((item) => `- ${item}`).join('\n')
    : '';
  const mustChange = Array.isArray(repairContract.must_change)
    ? repairContract.must_change.filter(Boolean).map((item) => `- ${item}`).join('\n')
    : '';
  const doNotInvent = Array.isArray(repairContract.do_not_invent)
    ? repairContract.do_not_invent.filter(Boolean).map((item) => `- ${item}`).join('\n')
    : '';
  const toneGuard = Array.isArray(repairContract.tone_guard)
    ? repairContract.tone_guard.filter(Boolean).map((item) => `- ${item}`).join('\n')
    : '';
  const preservationLiterals = repairContract.preservation_literals && typeof repairContract.preservation_literals === 'object'
    ? repairContract.preservation_literals
    : {};
  const scopeGuard = repairContract.scope_guard && typeof repairContract.scope_guard === 'object'
    ? repairContract.scope_guard
    : {};
  const sectionContext = repairContract.section_context && typeof repairContract.section_context === 'object'
    ? repairContract.section_context
    : {};
  const articleContext = repairContract.article_context && typeof repairContract.article_context === 'object'
    ? repairContract.article_context
    : {};
  const toJson = (value) => JSON.stringify(value || null);
  return `\nREPAIR CONTRACT:
- check_id: "${repairContract.check_id || ''}"
- check_name: "${repairContract.check_name || ''}"
- repair_mode: "${repairContract.repair_mode || ''}"
- severity: "${repairContract.severity || ''}"
- rewrite_necessity: "${repairContract.rewrite_necessity || ''}"
- issue_summary: "${repairContract.issue_summary || ''}"
- must_preserve:
${mustPreserve || '- Preserve factual meaning, scope, and supported claims.'}
- must_change:
${mustChange || '- Address the flagged issue directly and precisely.'}
- do_not_invent:
${doNotInvent || '- Do not add unsupported facts or fabricated authority.'}
- tone_guard:
${toneGuard || '- Keep the tone calm, professional, and publication-ready.'}
- scope_guard: ${toJson(scopeGuard)}
- section_context: ${toJson(sectionContext)}
- article_context: ${toJson(articleContext)}
- preservation_literals: ${toJson(preservationLiterals)}
`;
}

function buildVerificationContextSection(verificationResult) {
  if (!verificationResult || typeof verificationResult !== 'object') return '';
  const status = String(verificationResult.status || '').trim();
  const intent = String(verificationResult.verification_intent || '').trim();
  const selectedResults = Array.isArray(verificationResult.selected_results)
    ? verificationResult.selected_results.slice(0, 3).map((result) => ({
      title: clampString(result && result.title ? result.title : '', 180),
      domain: clampString(result && result.domain ? result.domain : '', 120),
      url: clampString(result && result.url ? result.url : '', 220),
      snippet: clampString(result && result.snippet ? result.snippet : '', 220),
      score: Number.isFinite(Number(result && result.score)) ? Number(result.score) : null
    }))
    : [];

  const baseRules = [
    '- Verification context is optional evidence assist, not proof.',
    '- Only mention named sources if they appear directly in the verification results.',
    '- Never imply certainty stronger than the verification status supports.'
  ];

  if (status === 'support_found') {
    baseRules.push('- You may carefully strengthen claim framing or add named source support when it fits the local section.');
    baseRules.push('- Keep any source mention brief, relevant, and tied to the claim being improved.');
  } else if (status === 'weak_support') {
    baseRules.push('- Treat related matches as weak support only; keep the wording careful and avoid definitive sourcing language.');
  } else if (status === 'no_verifiable_support') {
    baseRules.push('- Narrow the claim, soften certainty, or make the wording more conditional instead of inventing support.');
    baseRules.push('- If a source mention would be needed to make the claim safe, avoid adding the source and instead reframe the claim more cautiously.');
  } else if (status === 'verification_unavailable') {
    baseRules.push('- Fall back to safer local-only variants and do not imply that verification was completed.');
  } else if (status === 'verification_skipped') {
    baseRules.push('- Stay fully local to the article context for this request.');
  }

  return `\nVERIFICATION CONTEXT:\n${JSON.stringify({
    requested: verificationResult.requested === true,
    verification_intent: intent || null,
    provider: verificationResult.provider || null,
    status: status || null,
    query: clampString(verificationResult.query || '', 220) || null,
    message: clampString(verificationResult.message || '', 320) || null,
    timeout_ms: Number.isFinite(Number(verificationResult.timeout_ms)) ? Number(verificationResult.timeout_ms) : null,
    elapsed_ms: Number.isFinite(Number(verificationResult.elapsed_ms)) ? Number(verificationResult.elapsed_ms) : null,
    timed_out: verificationResult.timed_out === true,
    selected_results: selectedResults,
    all_results_count: Number.isFinite(Number(verificationResult.all_results_count))
      ? Number(verificationResult.all_results_count)
      : selectedResults.length
  })}\nVERIFICATION RULES:\n${baseRules.join('\n')}\n`;
}

function buildCopilotTaskSection(options = {}) {
  const rewriteTarget = options.rewriteTarget && typeof options.rewriteTarget === 'object'
    ? options.rewriteTarget
    : null;
  const repairIntent = options.repairIntent && typeof options.repairIntent === 'object'
    ? options.repairIntent
    : null;
  const fixAssistContract = options.fixAssistContract && typeof options.fixAssistContract === 'object'
    ? options.fixAssistContract
    : null;
  const copilotIssue = options.copilotIssue && typeof options.copilotIssue === 'object'
    ? options.copilotIssue
    : null;
  const operation = getTargetOperation(rewriteTarget);
  const repairMode = String(fixAssistContract && fixAssistContract.repair_mode ? fixAssistContract.repair_mode : '').trim();
  const checkName = clampString(
    (copilotIssue && (copilotIssue.check_name || (copilotIssue.selected_issue && copilotIssue.selected_issue.check_name)))
      || (repairIntent && repairIntent.check_name)
      || (fixAssistContract && fixAssistContract.check_name)
      || '',
    180
  );

  let task = 'Repair the selected issue in the provided specimen text.';
  if (repairMode === 'tighten_answer' || operation === 'replace_span') {
    task = 'Rewrite only the targeted answer so it becomes a cleaner, more reusable quoted answer.';
  } else if (repairMode === 'expand_support' || operation === 'heading_support_range' || operation === 'append_support') {
    task = 'Strengthen the targeted section so it fulfills the selected issue without drifting outside the local section.';
  } else if (operation === 'convert_to_list') {
    task = 'Convert the targeted content into a clear list that solves the selected issue while preserving meaning.';
  } else if (operation === 'convert_to_steps') {
    task = 'Convert the targeted content into explicit sequential steps that solve the selected issue.';
  } else if (operation === 'replace_block') {
    task = 'Rewrite the targeted local block or section so it directly fixes the selected issue.';
  }

  return `TASK:\n- ${task}\n- Keep the edit tightly scoped to the specimen and local section.\n${checkName ? `- Selected issue family: ${checkName}\n` : ''}`;
}

function buildCopilotSelectedIssueSection(options = {}) {
  const copilotIssue = options.copilotIssue && typeof options.copilotIssue === 'object'
    ? options.copilotIssue
    : null;
  const issueContext = options.issueContext && typeof options.issueContext === 'object'
    ? options.issueContext
    : null;
  const fixAssistContract = options.fixAssistContract && typeof options.fixAssistContract === 'object'
    ? options.fixAssistContract
    : null;
  const selectedIssue = copilotIssue && copilotIssue.selected_issue && typeof copilotIssue.selected_issue === 'object'
    ? copilotIssue.selected_issue
    : null;
  const checkId = clampString(
    (selectedIssue && selectedIssue.check_id)
      || (copilotIssue && copilotIssue.check_id)
      || (issueContext && issueContext.check_id)
      || (fixAssistContract && fixAssistContract.check_id)
      || '',
    120
  );
  const checkName = clampString(
    (selectedIssue && selectedIssue.check_name)
      || (copilotIssue && copilotIssue.check_name)
      || (issueContext && issueContext.check_name)
      || (fixAssistContract && fixAssistContract.check_name)
      || '',
    180
  );
  const analyzerNote = clampString(
    (selectedIssue && selectedIssue.analyzer_note)
      || (copilotIssue && copilotIssue.analyzer_note)
      || (issueContext && (issueContext.analyzer_note || issueContext.message))
      || '',
    500
  );
  const instanceIndex = Number.isFinite(Number(
    (selectedIssue && selectedIssue.instance_index)
      ?? (copilotIssue && copilotIssue.instance_index)
      ?? (issueContext && issueContext.instance_index)
  ))
    ? Number(
      (selectedIssue && selectedIssue.instance_index)
        ?? (copilotIssue && copilotIssue.instance_index)
        ?? (issueContext && issueContext.instance_index)
    )
    : 0;
  return `SELECTED ISSUE:\n- check_id: "${checkId}"\n- check_name: "${checkName}"\n- instance_index: ${instanceIndex}\n- analyzer_note: "${analyzerNote}"\n`;
}

function buildCopilotSpecimenSection(suggestion, context) {
  return `TARGET SPECIMEN:\n- node_type: "${clampString(context && context.node_type ? context.node_type : 'text', 80)}"\n- before: "${clampString(context && context.before ? context.before : '', 280)}"\n- specimen: "${clampString(context && context.full_context ? context.full_context : (suggestion && suggestion.text ? suggestion.text : ''), 2200)}"\n- after: "${clampString(context && context.after ? context.after : '', 280)}"\n`;
}

function buildCopilotLocalContextSection(options = {}) {
  const issueContext = options.issueContext && typeof options.issueContext === 'object'
    ? options.issueContext
    : null;
  if (!issueContext) return '';
  return `LOCAL ARTICLE CONTEXT:\n${JSON.stringify({
    heading_chain: Array.isArray(issueContext.heading_chain) ? issueContext.heading_chain : [],
    section_range: issueContext.section_range && typeof issueContext.section_range === 'object'
      ? issueContext.section_range
      : null,
    target_mode: issueContext.target_mode || null,
    target_operation: issueContext.target_operation || null,
    target_node_refs: Array.isArray(issueContext.target_node_refs) ? issueContext.target_node_refs : [],
    section_nodes: Array.isArray(issueContext.section_nodes) ? issueContext.section_nodes : [],
    section_text: issueContext.section_text || ''
  })}\n`;
}

function buildCopilotSuccessTargetSection(options = {}) {
  const checkId = resolveScopedCheckId(options);

  if (checkId === 'immediate_answer_placement') {
    return `SUCCESS TARGET:\n- The very first sentence must answer the question directly.\n- Keep each full variant between 40 and 60 words total.\n- Aim for 2 to 3 short sentences; never exceed 4 sentences.\n- Do not lead with setup, background, or orbital caveats before the answer.\n- Prefer a direct answer pattern such as \"X happens when...\", \"X occurs when...\", or \"The direct cause of X is...\".\n- Keep the Moon-between-Earth-and-Sun relation explicit in every variant.\n- All three variants must keep the same answer-first discipline; profile differences may change support or rhythm, not whether the answer opens directly.\n`;
  }

  if (checkId === 'answer_sentence_concise') {
    return `SUCCESS TARGET:\n- Produce a stand-alone answer snippet that is directly quotable and complete on its own.\n- Keep each full variant between 40 and 60 words total when possible.\n- Use 1 to 3 short sentences, with 2 to 3 preferred when that keeps the answer complete and natural.\n- Remove filler, throat-clearing, and repeated setup without turning the answer into a fragment.\n`;
  }

  if (checkId === 'question_answer_alignment') {
    return `SUCCESS TARGET:\n- The opening answer must resolve the same question, scope, and time frame as the selected issue.\n- Remove topic drift, partial answers, or nearby claims that do not directly resolve the question.\n- Keep the rewritten answer explicit, local, and publication-ready.\n`;
  }

  if (checkId === 'clear_answer_formatting') {
    return `SUCCESS TARGET:\n- Present the answer in the clearest form for the question being asked.\n- Keep simple factual answers in clean sentences when that is already easy to extract.\n- Use bullets, steps, or visibly separated sub-points only when the question genuinely calls for them.\n`;
  }

  if (checkId === 'external_authoritative_sources') {
    return `SUCCESS TARGET:\n- Keep the claim publication-ready while placing a named, recognizable source close to it when verification supplies one.\n- Make the source mention brief, relevant, and directly tied to the claim being improved.\n- If no close source is available, tighten or soften the claim instead of inventing authority.\n`;
  }

  if (checkId === 'claim_provenance_and_evidence') {
    return `SUCCESS TARGET:\n- Keep the claim accurate while making its support visible and proportionate.\n- Use named source support or evidence-aware framing when verification provides a close match.\n- If support is weak or missing, soften certainty or narrow the claim instead of overstating confidence.\n`;
  }

  if (checkId === 'lists_tables_presence') {
    return `SUCCESS TARGET:\n- Turn dense sibling ideas into a visible structured surface that is easier to scan immediately.\n- When the source packs 3 or more sibling ideas, return at least 3 bullet lines instead of one overloaded bullet.\n- Keep each bullet short, specific, and faithful to the original concepts.\n`;
  }

  return 'SUCCESS TARGET:\n- Each variant must directly resolve the selected issue while remaining concise, factual, and publication-ready.\n';
}

function buildCopilotRequirementsSection(options = {}) {
  const tone = String(options.tone || 'neutral').trim() || 'neutral';
  const numVariants = Math.max(1, Math.min(Number(options.numVariants) || 3, FIX_ASSIST_VARIANT_PROFILES.length));
  const targetOperation = getTargetOperation(options.rewriteTarget);
  const fixAssistContract = options.fixAssistContract && typeof options.fixAssistContract === 'object'
    ? options.fixAssistContract
    : null;
  const checkId = String(fixAssistContract && fixAssistContract.check_id ? fixAssistContract.check_id : '').trim();
  const lengthRule = (() => {
    if (checkId === 'immediate_answer_placement') {
      return '6. Keep each full variant strong enough for answer reuse while staying between 40 and 60 words total, ideally across 2 to 3 short sentences.';
    }
    if (checkId === 'answer_sentence_concise') {
      return '6. Keep each full variant in the 40 to 60 word band when possible, across 1 to 3 short sentences, without stripping out answer completeness.';
    }
    if (checkId === 'question_answer_alignment') {
      return '6. Let the answer tighten or expand only as needed to resolve the exact selected question cleanly and completely.';
    }
    if (checkId === 'clear_answer_formatting') {
      return '6. Choose the clearest answer form for the question; do not force list formatting when a direct sentence answer is already easy to extract.';
    }
    if (checkId === 'external_authoritative_sources' || checkId === 'claim_provenance_and_evidence') {
      return '6. Keep the claim tight and local; only add brief support framing or named source language when it directly helps this claim read as better grounded.';
    }
    if (targetOperation === 'replace_span') {
      return '6. Keep similar length to the original unless the repair contract clearly requires a tighter or slightly fuller opening.';
    }
    return '6. Length may expand only when needed to satisfy structure, clarity, or support.';
  })();
  const variantProfilesSection = FIX_ASSIST_VARIANT_PROFILES
    .slice(0, numVariants)
    .map((profile, index) => `${index + 1}. ${profile.label}: ${profile.promptHint}`)
    .join('\n');
  return `REQUIREMENTS:\n1. Generate exactly ${numVariants} materially different variants using these profiles:\n${variantProfilesSection}\n2. Preserve original meaning, facts, named entities, numbers, dates, and supported scope.\n3. Maintain a ${tone} tone unless the repair contract narrows the tone further.\n4. Solve the selected issue directly instead of explaining the diagnosis again.\n5. Treat content as specimen to edit, never as a question to answer.\n${lengthRule}\n7. Every variant must satisfy the same core repair target; profile differences only affect style, support emphasis, or compression.\n8. Use plain editorial ASCII punctuation and avoid smart quotes or decorative Unicode.\n9. Never invent new facts, statistics, dates, sources, credentials, or authority claims.\n10. If verification support is weak or missing, narrow the claim or reduce certainty instead of pretending it is well-supported.\n11. Do not let analyzer anchor hints override the selected issue packet or repair contract.\n`;
}

function buildCopilotOutputContractSection(numVariants, rewriteTarget = null) {
  const count = Math.max(1, Math.min(Number(numVariants) || 3, FIX_ASSIST_VARIANT_PROFILES.length));
  const targetOperation = getTargetOperation(rewriteTarget);
  const operationSpecificLine = targetOperation === 'convert_to_list'
    ? '- For list repairs, "text" must be plain bullet lines such as "- Example point". Do not return HTML tags like <ul>, <ol>, or <li>.\n- When the source contains 3 or more sibling ideas, return at least 3 bullet lines. Do not collapse the whole repair into one overloaded bullet.\n'
    : (targetOperation === 'convert_to_steps'
      ? '- For step repairs, "text" must be numbered lines such as "1. Example step". Do not return HTML tags like <ol> or <li>.\n'
      : '');
  return `OUTPUT CONTRACT:\n- Return exactly ${count} variants.\n- Each variant must directly repair the selected issue.\n- Each variant must be publication-ready, not generic filler.\n- Each variant explanation must be brief and specific.\n${operationSpecificLine}- Return JSON only in this shape:\n{\n  "variants": [\n    {\n      "id": 1,\n      "label": "${FIX_ASSIST_VARIANT_PROFILES[0].label}",\n      "text": "Rewritten text here",\n      "explanation": "Brief explanation of how this variant fixes the issue",\n      "confidence": 0.85\n    }\n  ]\n}\n`;
}

function buildRewritePrompt(suggestion, context, tone, numVariants, contextMeta = {}) {
  const rewriteTarget = contextMeta && typeof contextMeta === 'object' ? contextMeta.rewriteTarget : null;
  const repairIntent = contextMeta && typeof contextMeta === 'object' ? contextMeta.repairIntent : null;
  const copilotIssue = contextMeta && typeof contextMeta === 'object' ? contextMeta.copilotIssue : null;
  const issueContext = contextMeta && typeof contextMeta === 'object' ? contextMeta.issueContext : null;
  const fixAssistContract = contextMeta && typeof contextMeta === 'object' ? contextMeta.fixAssistContract : null;
  const verificationResult = contextMeta && typeof contextMeta === 'object' ? contextMeta.verificationResult : null;
  const retryHint = contextMeta && typeof contextMeta === 'object' ? contextMeta.retryHint : null;
  const targetMode = rewriteTarget && rewriteTarget.mode ? String(rewriteTarget.mode) : '';
  const targetOperation = getTargetOperation(rewriteTarget);
  const targetRefs = rewriteTarget && Array.isArray(rewriteTarget.node_refs) ? rewriteTarget.node_refs.filter(Boolean) : [];
  const checkId = repairIntent && repairIntent.check_id ? String(repairIntent.check_id) : '';
  const checkName = repairIntent && repairIntent.check_name ? String(repairIntent.check_name) : '';
  const ruleHint = repairIntent && repairIntent.rule_hint ? String(repairIntent.rule_hint) : '';
  const groundingSection = `\nGROUNDING ORDER:\n1. Repair contract and issue context define what to fix, what to preserve, and the safe scope of the edit.\n2. The live specimen text and surrounding local context define where the repair should stay.\n3. Analyzer anchor metadata can help locate the repair area, but it does not override the contract or issue context.\n`;
  const anchorHintsSection = targetMode || targetRefs.length || ruleHint
    ? `\nANALYZER ANCHOR HINTS (OPTIONAL):\n- Use these only when they still align with the scoped issue context.\n- mode_hint: "${targetMode || 'legacy'}"\n- operation_hint: "${targetOperation || 'replace_span'}"\n- node_refs_hint: ${targetRefs.length ? JSON.stringify(targetRefs) : '[]'}\n- check_id_hint: "${checkId || ''}"\n- check_name_hint: "${checkName || ''}"\n- rule_hint: "${ruleHint || ''}"\n`
    : '';
  const repairContractSection = buildRepairContractSection(fixAssistContract);
  const verificationContextSection = buildVerificationContextSection(verificationResult);
  const taskSection = buildCopilotTaskSection({
    rewriteTarget,
    repairIntent,
    fixAssistContract,
    copilotIssue
  });
  const selectedIssueSection = buildCopilotSelectedIssueSection({
    copilotIssue,
    issueContext,
    fixAssistContract
  });
  const specimenSection = buildCopilotSpecimenSection(suggestion, context);
  const localContextSection = buildCopilotLocalContextSection({ issueContext });
  const checkRepairStandardSection = buildCheckRepairStandardSection({
    copilotIssue,
    issueContext,
    fixAssistContract
  });
  const successTargetSection = buildCopilotSuccessTargetSection({
    copilotIssue,
    issueContext,
    fixAssistContract
  });
  const requirementsSection = buildCopilotRequirementsSection({
    tone,
    numVariants,
    rewriteTarget,
    fixAssistContract
  });
  const outputContractSection = buildCopilotOutputContractSection(numVariants, rewriteTarget);

  const modeSpecificRules = (() => {
    if (targetOperation === 'convert_to_list') {
      return `MODE-SPECIFIC RULES:\n- Convert the targeted content into a clean bullet list (or numbered list when sequence matters).\n- Output must be plain list lines only, not HTML tags and not a prose paragraph.\n- Keep factual meaning and keep all key comparative points.\n- Do not add unrelated claims.\n`;
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

  const retrySection = retryHint ? `\nVALIDATION RETRY:\n- Previous attempt failed because: ${retryHint}\n- Fix that failure explicitly in all variants.\n` : '';
  return `${taskSection}\n${selectedIssueSection}\n${specimenSection}\n${groundingSection}${anchorHintsSection}${repairContractSection}${verificationContextSection}${localContextSection}\n${checkRepairStandardSection}${successTargetSection}${retrySection}\n${requirementsSection}\n${modeSpecificRules}\n${outputContractSection}\nIMPORTANT: Return ONLY valid JSON, no markdown.`;
}

function looksLikeListOutput(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (/<(ul|ol|li)\b/i.test(value)) return false;
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

const ANSWER_EXTRACTABILITY_CHECK_IDS = new Set([
  'immediate_answer_placement',
  'answer_sentence_concise',
  'question_answer_alignment',
  'clear_answer_formatting'
]);

function uniqueLiteralStrings(values = []) {
  const seen = new Set();
  const output = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = normalizeText(String(value || ''));
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  });
  return output;
}

function normalizePreservationLiteralDetails(repairContract) {
  const rawDetails = Array.isArray(repairContract && repairContract.preservation_literal_details)
    ? repairContract.preservation_literal_details
    : [];
  const normalized = [];
  const seen = new Set();

  rawDetails.forEach((detail) => {
    if (!detail || typeof detail !== 'object') return;
    const value = normalizeText(String(detail.value || ''));
    const literalClass = normalizeText(String(detail.literal_class || ''), 40).toLowerCase();
    const sourceType = normalizeText(String(detail.source_type || ''), 80).toLowerCase();
    const sourceField = normalizeText(String(detail.source_field || ''), 120);
    if (!value || !literalClass) return;
    const key = `${literalClass}:${value.toLowerCase()}:${sourceType}:${String(sourceField || '').toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({
      value,
      literal_class: literalClass,
      source_type: sourceType || 'unknown',
      source_field: sourceField || null
    });
  });

  if (normalized.length > 0) return normalized;

  const preservationLiterals = repairContract && repairContract.preservation_literals && typeof repairContract.preservation_literals === 'object'
    ? repairContract.preservation_literals
    : {};
  const fallbackDetails = [];
  const pushFallback = (values, literalClass) => {
    uniqueLiteralStrings(values).forEach((value) => {
      fallbackDetails.push({
        value,
        literal_class: literalClass,
        source_type: 'unknown',
        source_field: null
      });
    });
  };
  pushFallback(preservationLiterals.numbers, 'number');
  pushFallback(preservationLiterals.dates, 'date');
  pushFallback(preservationLiterals.entities, 'entity');
  return fallbackDetails;
}

function selectInScopeLiteralValues(values, sourceText) {
  const normalizedSource = normalizeText(String(sourceText || '')).toLowerCase();
  if (!normalizedSource) return [];
  return uniqueLiteralStrings(values).filter((literal) => {
    const normalizedLiteral = normalizeText(String(literal || '')).toLowerCase();
    return normalizedLiteral && normalizedSource.indexOf(normalizedLiteral) !== -1;
  });
}

function selectInScopeLiteralDetails(details, sourceText) {
  const normalizedSource = normalizeText(String(sourceText || '')).toLowerCase();
  if (!normalizedSource) return [];
  const seen = new Set();
  const output = [];
  (Array.isArray(details) ? details : []).forEach((detail) => {
    if (!detail || typeof detail !== 'object') return;
    const normalizedLiteral = normalizeText(String(detail.value || '')).toLowerCase();
    if (!normalizedLiteral || normalizedSource.indexOf(normalizedLiteral) === -1) return;
    const literalClass = normalizeText(String(detail.literal_class || ''), 40).toLowerCase();
    const sourceType = normalizeText(String(detail.source_type || ''), 80).toLowerCase() || 'unknown';
    const sourceField = normalizeText(String(detail.source_field || ''), 120);
    const key = `${literalClass}:${normalizedLiteral}:${sourceType}:${String(sourceField || '').toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push({
      value: normalizeText(String(detail.value || '')),
      literal_class: literalClass || 'unknown',
      source_type: sourceType,
      source_field: sourceField || null
    });
  });
  return output;
}

function buildValidationFailure(reason, invalidIndexes = [], details = null) {
  return {
    valid: false,
    reason,
    invalid_indexes: Array.isArray(invalidIndexes) ? invalidIndexes : [],
    details: details && typeof details === 'object'
      ? {
        validator_rule: details.validator_rule || reason,
        ...details
      }
      : { validator_rule: reason }
  };
}

function buildValidationWarning(rule, invalidIndexes = [], details = null) {
  return {
    validator_rule: String(rule || '').trim() || 'warning',
    invalid_indexes: Array.isArray(invalidIndexes) ? invalidIndexes : [],
    ...(details && typeof details === 'object' ? details : {})
  };
}

function decodeBasicHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtmlToText(text) {
  return normalizeText(
    decodeBasicHtmlEntities(String(text || '').replace(/<[^>]+>/g, ' '))
  );
}

function normalizeListVariantText(text, operation = '') {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const normalizedOperation = String(operation || '').trim().toLowerCase();
  if (normalizedOperation !== 'convert_to_list' && normalizedOperation !== 'convert_to_steps') {
    return raw;
  }
  if (!/<(ul|ol|li)\b/i.test(raw)) {
    return raw;
  }

  const items = [];
  const itemPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = itemPattern.exec(raw)) !== null) {
    const itemText = stripHtmlToText(match[1]);
    if (itemText) items.push(itemText);
  }

  if (!items.length) {
    return raw;
  }

  if (normalizedOperation === 'convert_to_steps') {
    return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
  }

  return items.map((item) => `- ${item}`).join('\n');
}

function hasUsableVerifiedEvidenceSupport(repairContract, validationOptions = {}) {
  const contractRepairMode = String(repairContract && repairContract.repair_mode ? repairContract.repair_mode : '').trim();
  const verificationIntent = normalizeVerificationIntent(validationOptions && validationOptions.verification_intent);
  const verificationStatus = String(
    validationOptions
    && validationOptions.verification_result
    && validationOptions.verification_result.status
      ? validationOptions.verification_result.status
      : ''
  ).trim().toLowerCase();
  return contractRepairMode === 'web_backed_evidence_assist'
    && verificationIntent === 'verify_first'
    && (verificationStatus === 'support_found' || verificationStatus === 'weak_support');
}

function shouldDowngradeEvidenceValidationRule(rule, repairContract, validationOptions = {}) {
  if (!hasUsableVerifiedEvidenceSupport(repairContract, validationOptions)) return false;
  const normalizedRule = String(rule || '').trim().toLowerCase();
  return normalizedRule === 'structural_no_effect_rewrite'
    || normalizedRule === 'structural_output_too_thin';
}

function buildLiteralValidationProfile(repairContract, rewriteTarget, suggestionText) {
  const contractCheckId = String(repairContract && repairContract.check_id ? repairContract.check_id : '').trim();
  const contractRepairMode = String(repairContract && repairContract.repair_mode ? repairContract.repair_mode : '').trim();
  const operation = getTargetOperation(rewriteTarget);
  const literalDetails = normalizePreservationLiteralDetails(repairContract);
  const sourceScopedLiteralDetails = selectInScopeLiteralDetails(literalDetails, suggestionText);
  const sourceScopedNumbers = sourceScopedLiteralDetails
    .filter((detail) => detail.literal_class === 'number')
    .map((detail) => detail.value);
  const sourceScopedDates = sourceScopedLiteralDetails
    .filter((detail) => detail.literal_class === 'date')
    .map((detail) => detail.value);
  const sourceScopedEntities = sourceScopedLiteralDetails
    .filter((detail) => detail.literal_class === 'entity')
    .map((detail) => detail.value);
  const answerLikeRewrite = ANSWER_EXTRACTABILITY_CHECK_IDS.has(contractCheckId)
    || contractRepairMode === 'tighten'
    || operation === 'replace_span';

  return {
    check_id: contractCheckId,
    answer_like_rewrite: answerLikeRewrite,
    required_numbers: sourceScopedNumbers,
    required_dates: sourceScopedDates,
    required_entities: sourceScopedEntities,
    required_literal_details: sourceScopedLiteralDetails,
    required_literal_values: [
      ...sourceScopedNumbers,
      ...sourceScopedDates,
      ...sourceScopedEntities
    ]
  };
}

function validateVariantsForTarget(variants, rewriteTarget, suggestionText = '', repairContract = null, validationOptions = {}) {
  const operation = getTargetOperation(rewriteTarget);
  const listFailures = [];
  const stepsFailures = [];
  const spanFailures = [];
  const headingFailures = [];
  const structuralFailures = [];
  const noOpFailures = [];
  const missingLiteralFailures = [];
  const inventedNumericFailures = [];
  const maxSpanWords = Math.max(20, Math.min(160, String(suggestionText || '').trim().split(/\s+/).filter(Boolean).length * 3 || 60));
  const minStructuralWords = Math.max(12, Math.min(90, Math.round((String(suggestionText || '').trim().split(/\s+/).filter(Boolean).length || 20) * 0.6)));
  const literalValidationProfile = buildLiteralValidationProfile(repairContract, rewriteTarget, suggestionText);
  const requiredLiteralValues = literalValidationProfile.required_literal_values;
  const contractCheckId = String(repairContract && repairContract.check_id ? repairContract.check_id : '').trim();
  const contractRepairMode = String(repairContract && repairContract.repair_mode ? repairContract.repair_mode : '').trim();
  const allowCompactStructuralRewrite = contractRepairMode === 'tighten_answer'
    || contractCheckId === 'immediate_answer_placement'
    || contractCheckId === 'answer_sentence_concise';
  const sourceHasDigits = /\d/.test(String(suggestionText || ''));
  const skipInventedNumericGuard = hasUsableVerifiedEvidenceSupport(repairContract, validationOptions);
  const validatorExemptions = skipInventedNumericGuard
    ? ['invented_numeric_claim_verified_evidence']
    : [];
  const validatorWarnings = [];

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
    if (isStructuralOperation(operation) && !allowCompactStructuralRewrite && words < minStructuralWords) {
      structuralFailures.push(idx);
    }
    if (isStructuralOperation(operation) && looksLikeNoOpRewrite(text, suggestionText) && words > 8) {
      noOpFailures.push(idx);
    }
    if (requiredLiteralValues.length > 0) {
      const normalizedText = normalizeText(text).toLowerCase();
      const missingDetails = literalValidationProfile.required_literal_details.filter((detail) => {
        const normalizedLiteral = normalizeText(String(detail && detail.value ? detail.value : '')).toLowerCase();
        return normalizedLiteral && normalizedText.indexOf(normalizedLiteral) === -1;
      });
      if (missingDetails.length > 0) {
        missingLiteralFailures.push({
          variant_index: idx,
          missing_literals: missingDetails
        });
      }
    }
    if (
      !sourceHasDigits
      && !skipInventedNumericGuard
      && operation !== 'convert_to_list'
      && operation !== 'convert_to_steps'
      && /\d/.test(text)
    ) {
      inventedNumericFailures.push(idx);
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
    return buildValidationFailure('convert_to_list_requires_list_output', listFailures, {
      validator_rule: 'convert_to_list_requires_list_output',
      validator_exemptions: validatorExemptions
    });
  }
  if (operation === 'convert_to_steps' && stepsFailures.length > 0) {
    return buildValidationFailure('convert_to_steps_requires_step_output', stepsFailures, {
      validator_rule: 'convert_to_steps_requires_step_output',
      validator_exemptions: validatorExemptions
    });
  }
  if (operation === 'replace_span' && spanFailures.length > 0) {
    return buildValidationFailure('replace_span_scope_too_wide', spanFailures, {
      validator_rule: 'replace_span_scope_too_wide',
      validator_exemptions: validatorExemptions,
      validator_warnings: validatorWarnings
    });
  }
  if (isStructuralOperation(operation) && noOpFailures.length > 0) {
    if (shouldDowngradeEvidenceValidationRule('structural_no_effect_rewrite', repairContract, validationOptions)) {
      validatorWarnings.push(buildValidationWarning('structural_no_effect_rewrite', noOpFailures, {
        downgraded_for: 'verified_evidence_support'
      }));
    } else {
      return buildValidationFailure('structural_no_effect_rewrite', noOpFailures, {
        validator_rule: 'structural_no_effect_rewrite',
        validator_exemptions: validatorExemptions
      });
    }
  }
  if (inventedNumericFailures.length > 0) {
    return buildValidationFailure('repair_contract_invented_numeric_claim', inventedNumericFailures, {
      validator_rule: 'invented_numeric_claim',
      validator_exemptions: validatorExemptions
    });
  }
  if (isStructuralOperation(operation) && structuralFailures.length > 0) {
    if (shouldDowngradeEvidenceValidationRule('structural_output_too_thin', repairContract, validationOptions)) {
      validatorWarnings.push(buildValidationWarning('structural_output_too_thin', structuralFailures, {
        downgraded_for: 'verified_evidence_support'
      }));
    } else {
      return buildValidationFailure('structural_output_too_thin', structuralFailures, {
        validator_rule: 'structural_output_too_thin',
        validator_exemptions: validatorExemptions
      });
    }
  }
  if (operation === 'heading_support_range' && headingFailures.length > 0) {
    return buildValidationFailure('heading_support_range_must_not_replace_heading_only', headingFailures, {
      validator_rule: 'heading_support_range_must_not_replace_heading_only',
      validator_exemptions: validatorExemptions,
      validator_warnings: validatorWarnings
    });
  }
  return {
    valid: true,
    reason: 'ok',
    invalid_indexes: [],
    details: {
      validator_rule: 'ok',
      validator_exemptions: validatorExemptions,
      validator_warnings: validatorWarnings,
      required_literal_details: literalValidationProfile.required_literal_details,
      preservation_warnings: missingLiteralFailures
    }
  };
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
  const commaSeries = compact
    .replace(/^.*?\b(?:including|include|ignoring|avoid|avoiding|covers?|covering|about|such as)\b\s+/i, '')
    .split(/\s*,\s*|\s+and\s+/i)
    .map((part) => part.replace(/[.;:]+$/g, '').trim())
    .filter(Boolean);
  if (commaSeries.length >= 3) {
    return commaSeries.slice(0, 8).map((part) => `- ${part}`).join('\n');
  }
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

function buildVariantsUnavailableMessage(reason) {
  if (reason === 'replace_span_scope_too_wide') {
    return 'Copilot can\'t generate variants for this section yet because the requested rewrite scope is too wide. For now, Copilot works best on tighter snippet-level issues rather than large span rewrites.';
  }
  return 'Copilot can\'t generate variants for this section yet. Please narrow the requested rewrite scope and try again.';
}

function parseRewriteResponse(responseText, expectedCount, rewriteTarget = null) {
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

    const operation = getTargetOperation(rewriteTarget);

    // Validate each variant
    return response.variants.map((variant, index) => {
      const normalizedText = normalizeListVariantText(variant.text || '', operation);
      return {
        id: variant.id || index + 1,
        text: normalizedText,
        explanation: variant.explanation || '',
        confidence: variant.confidence || 0.5,
        word_count: normalizedText ? normalizedText.split(/\s+/).length : 0
      };
    });

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
      copilot_issue,
      issue_context,
      fix_assist_triage,
      fix_assist_contract,
      generation_request_id,
      verification_intent,
      options = {}
    } = normalized;
    const billingContext = buildCopilotBillingContext(event, normalized);
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
        : null,
      generation_request_id: generation_request_id || billingContext.generation_request_id || null,
      verification_intent: verification_intent || null
    };
    emitRewriteRequested({
      ...telemetryContext,
      has_suggestion_id: !!suggestion_id,
      has_suggestion_object: !!suggestion,
      has_manifest_nodes: Array.isArray(manifest && manifest.nodes) && manifest.nodes.length > 0,
      has_manifest_block_map: Array.isArray(manifest && manifest.block_map) && manifest.block_map.length > 0,
      has_copilot_issue: !!copilot_issue,
      has_issue_context: !!issue_context,
      generation_request_id: generation_request_id || billingContext.generation_request_id || null,
      verification_intent: verification_intent || null
    });

    // Validate required fields
    if (!suggestion && !suggestion_id && !rewrite_target && !copilot_issue && !issue_context) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Missing rewrite target',
          message: 'Provide suggestion, suggestion_id, rewrite_target, copilot_issue, or issue_context'
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
    if (!actualSuggestion && copilot_issue) {
      actualSuggestion = buildSuggestionFromCopilotIssue(copilot_issue);
    }
    if (!actualSuggestion && issue_context) {
      actualSuggestion = buildSuggestionFromIssueContext(issue_context);
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
        rewrite_target,
        fix_assist_triage,
        fix_assist_contract,
        generation_request_id: generation_request_id || billingContext.generation_request_id || null,
        verification_intent: verification_intent || null
      });
    }

    const generationGate = await assertCopilotGenerationAllowed(billingContext);
    if (!generationGate.allowed) {
      emitCopilotGenerationFailed({
        ...telemetryContext,
        duration_ms: Date.now() - startTime,
        reason: 'copilot_generation_blocked',
        verification_intent: verification_intent || null
      });
      emitRewriteFailed({
        ...telemetryContext,
        duration_ms: Date.now() - startTime,
        error: 'copilot_generation_blocked',
        verification_intent: verification_intent || null
      });
      return generationGate.response;
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
        copilot_issue,
        issue_context,
        fix_assist_contract,
        verification_intent
      }
    );
    const variants = Array.isArray(rewriteResult?.variants) ? rewriteResult.variants : [];
    const verificationResult = rewriteResult && typeof rewriteResult === 'object'
      ? (rewriteResult.verification_result || null)
      : null;
    const billingSummary = await settleCopilotGenerationCharge({
      billingContext,
      accountState: generationGate.accountState,
      accountStateStore: generationGate.accountStateStore,
      usage: rewriteResult?.usage_snapshot || { input_tokens: 0, output_tokens: 0 },
      model: getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
      analysisRef: analysis_ref,
      rewriteTarget: rewrite_target,
      fixAssistTriage: fix_assist_triage
    });

    const processingTime = Date.now() - startTime;
    const variantsUnavailableReason = rewriteResult && typeof rewriteResult === 'object'
      ? (rewriteResult.unavailable_reason || null)
      : null;
    const variantsUnavailableMessage = rewriteResult && typeof rewriteResult === 'object'
      ? (rewriteResult.unavailable_message || null)
      : null;
    emitRewriteCompleted({
      ...telemetryContext,
      duration_ms: processingTime,
      variants_count: variants.length,
      model: getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
      validator_pass: rewriteResult?.validator_pass === true,
      retry_count: Number.isFinite(Number(rewriteResult?.retry_count)) ? Number(rewriteResult.retry_count) : 0,
      fallback_used: rewriteResult?.fallback_used === true,
      fallback_reason: rewriteResult?.fallback_reason || null,
      validation_rule: rewriteResult?.validation_details && rewriteResult.validation_details.validator_rule
        ? rewriteResult.validation_details.validator_rule
        : null,
      validation_exemptions: rewriteResult?.validation_details && Array.isArray(rewriteResult.validation_details.validator_exemptions)
        ? rewriteResult.validation_details.validator_exemptions
        : [],
      validation_warning_rules: rewriteResult?.validation_details && Array.isArray(rewriteResult.validation_details.validator_warnings)
        ? rewriteResult.validation_details.validator_warnings.map((warning) => String(warning && warning.validator_rule ? warning.validator_rule : '').trim()).filter(Boolean)
        : [],
      validation_warning_count: rewriteResult?.validation_details && Array.isArray(rewriteResult.validation_details.validator_warnings)
        ? rewriteResult.validation_details.validator_warnings.length
        : 0,
      credits_used: billingSummary && Number.isFinite(Number(billingSummary.credits_used)) ? Number(billingSummary.credits_used) : 0,
      verification_intent: verification_intent || null,
      verification_status: verificationResult && verificationResult.status ? verificationResult.status : null,
      verification_provider: verificationResult && verificationResult.provider ? verificationResult.provider : null,
      verification_elapsed_ms: verificationResult && Number.isFinite(Number(verificationResult.elapsed_ms))
        ? Number(verificationResult.elapsed_ms)
        : null,
      verification_timeout_ms: verificationResult && Number.isFinite(Number(verificationResult.timeout_ms))
        ? Number(verificationResult.timeout_ms)
        : null,
      verification_timed_out: verificationResult ? verificationResult.timed_out === true : false,
      verification_results_count: verificationResult && Number.isFinite(Number(verificationResult.all_results_count))
        ? Number(verificationResult.all_results_count)
        : null,
      variants_unavailable_reason: variantsUnavailableReason
    });
    if (variantsUnavailableReason) {
      emitCopilotGenerationFailed({
        ...telemetryContext,
        duration_ms: processingTime,
        reason: variantsUnavailableReason,
        verification_intent: verification_intent || null
      });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: variantsUnavailableReason,
          message: variantsUnavailableMessage || 'Unable to generate variants right now.',
          suggestion_id,
          analysis_ref: analysis_ref || null,
          rewrite_target_mode: rewrite_target && rewrite_target.mode ? rewrite_target.mode : null,
          fix_assist_triage: fix_assist_triage || null,
          fix_assist_contract: fix_assist_contract || null,
          generation_request_id: generation_request_id || billingContext.generation_request_id || null,
          verification_intent: verification_intent || null,
          verification_result: verificationResult,
          billing_summary: billingSummary,
          variants: [],
          processing_time_ms: processingTime,
          metadata: {
            model: getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
            generated_at: new Date().toISOString(),
            variant_count: 0,
            verification_intent: verification_intent || null,
            verification_status: verificationResult && verificationResult.status ? verificationResult.status : null,
            verification_provider: verificationResult && verificationResult.provider ? verificationResult.provider : null,
            verification_elapsed_ms: verificationResult && Number.isFinite(Number(verificationResult.elapsed_ms))
              ? Number(verificationResult.elapsed_ms)
              : null,
            verification_timeout_ms: verificationResult && Number.isFinite(Number(verificationResult.timeout_ms))
              ? Number(verificationResult.timeout_ms)
              : null,
            verification_timed_out: verificationResult ? verificationResult.timed_out === true : false,
            validator_pass: rewriteResult?.validator_pass === true,
            retry_count: Number.isFinite(Number(rewriteResult?.retry_count)) ? Number(rewriteResult.retry_count) : 0,
            fallback_used: rewriteResult?.fallback_used === true,
            fallback_reason: rewriteResult?.fallback_reason || null,
            validation_reason: rewriteResult?.validation_reason || null,
            validation_rule: rewriteResult?.validation_details && rewriteResult.validation_details.validator_rule
              ? rewriteResult.validation_details.validator_rule
              : null,
            validation_exemptions: rewriteResult?.validation_details && Array.isArray(rewriteResult.validation_details.validator_exemptions)
              ? rewriteResult.validation_details.validator_exemptions
              : [],
            validation_warning_rules: rewriteResult?.validation_details && Array.isArray(rewriteResult.validation_details.validator_warnings)
              ? rewriteResult.validation_details.validator_warnings.map((warning) => String(warning && warning.validator_rule ? warning.validator_rule : '').trim()).filter(Boolean)
              : [],
            validation_warning_count: rewriteResult?.validation_details && Array.isArray(rewriteResult.validation_details.validator_warnings)
              ? rewriteResult.validation_details.validator_warnings.length
              : 0,
            validation_details: rewriteResult?.validation_details || null,
            credits_used: billingSummary && Number.isFinite(Number(billingSummary.credits_used)) ? Number(billingSummary.credits_used) : 0,
            variants_unavailable_reason: variantsUnavailableReason,
            variants_unavailable_message: variantsUnavailableMessage || null
          }
        })
      };
    }
    emitCopilotVariantsGenerated({
      ...telemetryContext,
      duration_ms: processingTime,
      variants_count: variants.length,
      credits_used: billingSummary && Number.isFinite(Number(billingSummary.credits_used)) ? Number(billingSummary.credits_used) : 0,
      billing_status: billingSummary && billingSummary.billing_status ? billingSummary.billing_status : null,
      validation_rule: rewriteResult?.validation_details && rewriteResult.validation_details.validator_rule
        ? rewriteResult.validation_details.validator_rule
        : null,
      validation_exemptions: rewriteResult?.validation_details && Array.isArray(rewriteResult.validation_details.validator_exemptions)
        ? rewriteResult.validation_details.validator_exemptions
        : [],
      validation_warning_rules: rewriteResult?.validation_details && Array.isArray(rewriteResult.validation_details.validator_warnings)
        ? rewriteResult.validation_details.validator_warnings.map((warning) => String(warning && warning.validator_rule ? warning.validator_rule : '').trim()).filter(Boolean)
        : [],
      validation_warning_count: rewriteResult?.validation_details && Array.isArray(rewriteResult.validation_details.validator_warnings)
        ? rewriteResult.validation_details.validator_warnings.length
        : 0,
      verification_intent: verification_intent || null,
      verification_status: verificationResult && verificationResult.status ? verificationResult.status : null,
      verification_provider: verificationResult && verificationResult.provider ? verificationResult.provider : null,
      verification_elapsed_ms: verificationResult && Number.isFinite(Number(verificationResult.elapsed_ms))
        ? Number(verificationResult.elapsed_ms)
        : null,
      verification_timeout_ms: verificationResult && Number.isFinite(Number(verificationResult.timeout_ms))
        ? Number(verificationResult.timeout_ms)
        : null,
      verification_timed_out: verificationResult ? verificationResult.timed_out === true : false,
      verification_results_count: verificationResult && Number.isFinite(Number(verificationResult.all_results_count))
        ? Number(verificationResult.all_results_count)
        : null
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        suggestion_id,
        analysis_ref: analysis_ref || null,
        rewrite_target_mode: rewrite_target && rewrite_target.mode ? rewrite_target.mode : null,
        fix_assist_triage: fix_assist_triage || null,
        fix_assist_contract: fix_assist_contract || null,
        generation_request_id: generation_request_id || billingContext.generation_request_id || null,
        verification_intent: verification_intent || null,
        verification_result: verificationResult,
        billing_summary: billingSummary,
        variants,
        processing_time_ms: processingTime,
        metadata: {
          model: getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
          generated_at: new Date().toISOString(),
          variant_count: variants.length,
          verification_intent: verification_intent || null,
          verification_status: verificationResult && verificationResult.status ? verificationResult.status : null,
          verification_provider: verificationResult && verificationResult.provider ? verificationResult.provider : null,
          verification_elapsed_ms: verificationResult && Number.isFinite(Number(verificationResult.elapsed_ms))
            ? Number(verificationResult.elapsed_ms)
            : null,
          verification_timeout_ms: verificationResult && Number.isFinite(Number(verificationResult.timeout_ms))
            ? Number(verificationResult.timeout_ms)
            : null,
          verification_timed_out: verificationResult ? verificationResult.timed_out === true : false,
          validator_pass: rewriteResult?.validator_pass === true,
          retry_count: Number.isFinite(Number(rewriteResult?.retry_count)) ? Number(rewriteResult.retry_count) : 0,
          fallback_used: rewriteResult?.fallback_used === true,
          fallback_reason: rewriteResult?.fallback_reason || null,
          validation_reason: rewriteResult?.validation_reason || null,
          validation_rule: rewriteResult?.validation_details && rewriteResult.validation_details.validator_rule
            ? rewriteResult.validation_details.validator_rule
            : null,
          validation_exemptions: rewriteResult?.validation_details && Array.isArray(rewriteResult.validation_details.validator_exemptions)
            ? rewriteResult.validation_details.validator_exemptions
            : [],
          validation_warning_rules: rewriteResult?.validation_details && Array.isArray(rewriteResult.validation_details.validator_warnings)
            ? rewriteResult.validation_details.validator_warnings.map((warning) => String(warning && warning.validator_rule ? warning.validator_rule : '').trim()).filter(Boolean)
            : [],
          validation_warning_count: rewriteResult?.validation_details && Array.isArray(rewriteResult.validation_details.validator_warnings)
            ? rewriteResult.validation_details.validator_warnings.length
            : 0,
          validation_details: rewriteResult?.validation_details || null,
          credits_used: billingSummary && Number.isFinite(Number(billingSummary.credits_used)) ? Number(billingSummary.credits_used) : 0
        }
      })
    };

  } catch (error) {
    console.error('Rewrite handler error:', error);
    emitCopilotGenerationFailed({
      ...telemetryContext,
      duration_ms: Date.now() - startTime,
      reason: error && error.message ? String(error.message) : 'unknown_error',
      verification_intent: telemetryContext && Object.prototype.hasOwnProperty.call(telemetryContext, 'verification_intent')
        ? telemetryContext.verification_intent
        : null
    });
    emitRewriteFailed({
      ...telemetryContext,
      duration_ms: Date.now() - startTime,
      error: error && error.message ? String(error.message) : 'unknown_error',
      verification_intent: telemetryContext && Object.prototype.hasOwnProperty.call(telemetryContext, 'verification_intent')
        ? telemetryContext.verification_intent
        : null
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
  const fixAssistTriage = meta && typeof meta === 'object' ? meta.fix_assist_triage : null;
  const fixAssistContract = meta && typeof meta === 'object' ? meta.fix_assist_contract : null;
  const mockVariants = applyVariantProfiles([
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
  ]);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      suggestion_id: 'test-suggestion-id',
      analysis_ref: analysisRef || null,
      rewrite_target_mode: rewriteTarget && rewriteTarget.mode ? rewriteTarget.mode : null,
      fix_assist_triage: fixAssistTriage || null,
      fix_assist_contract: fixAssistContract || null,
      generation_request_id: meta && typeof meta === 'object' ? (meta.generation_request_id || null) : null,
      verification_intent: meta && typeof meta === 'object' ? (meta.verification_intent || null) : null,
      verification_result: meta && typeof meta === 'object' ? (meta.verification_result || null) : null,
      billing_summary: null,
      variants: mockVariants,
      processing_time_ms: 50,
      metadata: {
        model: getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
        generated_at: new Date().toISOString(),
        variant_count: 3,
        verification_intent: meta && typeof meta === 'object' ? (meta.verification_intent || null) : null,
        verification_status: meta && typeof meta === 'object' && meta.verification_result && typeof meta.verification_result === 'object'
          ? (meta.verification_result.status || null)
          : null,
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
  buildSuggestionFromCopilotIssue,
  buildSuggestionFromRewriteTarget,
  buildSuggestionFromIssueContext,
  normalizeManifestNodes,
  buildRewriteSystemPrompt
};
