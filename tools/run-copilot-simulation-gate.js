#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const {
  generateRewrites,
  extractContext,
  buildRewritePrompt,
  buildSuggestionFromCopilotIssue
} = require('../infrastructure/lambda/orchestrator/rewrite-handler');
const { buildFixAssistTriage } = require('../infrastructure/lambda/orchestrator/fix-assist-triage');
const { buildFixAssistContract } = require('../infrastructure/lambda/orchestrator/fix-assist-contract-builder');
const { evaluateGeneratedVariants } = require('./copilot-simulation-gate-lib');

const lambdaClient = new LambdaClient({});

function resolveFixturePath() {
  const fixtureArgIndex = process.argv.indexOf('--fixture');
  if (fixtureArgIndex >= 0 && process.argv[fixtureArgIndex + 1]) {
    return path.resolve(process.cwd(), process.argv[fixtureArgIndex + 1]);
  }
  return path.resolve(
    __dirname,
    '../fixtures/copilot/immediate-answer-placement-buried-prose.fixture.json'
  );
}

const fixturePath = resolveFixturePath();
const outputDir = path.resolve(__dirname, '../fixtures/copilot/gate-reports');

function readFixture() {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function buildGateResult(fixture, prompt, generated) {
  const evaluation = evaluateGeneratedVariants(fixture, generated);
  return {
    fixture_id: fixture.fixture_id,
    check_id: fixture.check_id,
    generated_at: new Date().toISOString(),
    pass: evaluation.pass,
    acceptance: fixture.acceptance,
    scorer_id: evaluation.scorer_id,
    transport_used: generated && generated.transport_used ? generated.transport_used : 'unknown',
    prompt,
    raw_result: generated,
    evaluations: evaluation.evaluations
  };
}

function buildRewritePayload(fixture, fixAssistContract) {
  return {
    manifest: fixture.manifest,
    rewrite_target: fixture.rewrite_target,
    repair_intent: fixture.repair_intent,
    copilot_issue: fixture.copilot_issue,
    issue_context: fixture.copilot_issue,
    fix_assist_contract: fixAssistContract,
    verification_intent: String(fixture && fixture.verification_intent ? fixture.verification_intent : 'local_only').trim() || 'local_only'
  };
}

function slugify(value, fallback = 'copilot-gate') {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function isSecretAccessError(error) {
  const message = String(error && error.message ? error.message : error || '').toLowerCase();
  return message.includes('could not load credentials')
    || message.includes('not authorized to perform: secretsmanager:getsecretvalue')
    || message.includes('mistral_api_key not found in secret');
}

async function invokeLambdaRoute(routePath, requestBody, headers = {}) {
  const functionName = process.env.COPILOT_GATE_FUNCTION_NAME || 'aivi-orchestrator-run-dev';
  const event = {
    httpMethod: 'POST',
    path: routePath,
    headers: Object.assign(
      {
        'content-type': 'application/json'
      },
      headers
    ),
    body: JSON.stringify(requestBody),
    isBase64Encoded: false
  };

  const response = await lambdaClient.send(new InvokeCommand({
    FunctionName: functionName,
    Payload: Buffer.from(JSON.stringify(event))
  }));

  const payloadText = response && response.Payload
    ? Buffer.from(response.Payload).toString('utf8')
    : '';
  const invokeResult = payloadText ? JSON.parse(payloadText) : {};
  const statusCode = Number(invokeResult && invokeResult.statusCode) || 0;
  const parsedBody = invokeResult && typeof invokeResult.body === 'string'
    ? JSON.parse(invokeResult.body)
    : (invokeResult && invokeResult.body ? invokeResult.body : invokeResult);

  if (response && response.FunctionError) {
    throw new Error(`Lambda route invoke failed: ${response.FunctionError}`);
  }
  if (statusCode >= 400) {
    throw new Error(`Lambda route invoke returned ${statusCode}: ${parsedBody && parsedBody.message ? parsedBody.message : 'unknown_error'}`);
  }

  return parsedBody;
}

async function ensureLambdaTrialAccount(fixture) {
  const accountId = String(process.env.COPILOT_GATE_ACCOUNT_ID || '').trim();
  const siteId = String(process.env.COPILOT_GATE_SITE_ID || '').trim();
  if (accountId && siteId) {
    return { account_id: accountId, site_id: siteId };
  }

  const siteSlug = slugify(fixture && fixture.fixture_id ? fixture.fixture_id : fixture && fixture.check_id ? fixture.check_id : 'copilot-gate');
  const site = {
    site_id: siteId || `copilot-gate-${siteSlug}`.slice(0, 120),
    blog_id: 1,
    home_url: `https://${siteSlug}.example.com/`,
    plugin_version: 'gate-sim'
  };

  const onboarding = await invokeLambdaRoute('/aivi/v1/account/start-trial', { site });
  const onboardedAccountId = onboarding && onboarding.account_state && onboarding.account_state.account_id
    ? String(onboarding.account_state.account_id).trim()
    : '';
  const onboardedSiteId = onboarding && onboarding.account_state && onboarding.account_state.site && onboarding.account_state.site.site_id
    ? String(onboarding.account_state.site.site_id).trim()
    : site.site_id;

  if (!onboardedAccountId || !onboardedSiteId) {
    throw new Error('Lambda onboarding did not return a usable account/site context for the Copilot gate');
  }

  return {
    account_id: onboardedAccountId,
    site_id: onboardedSiteId
  };
}

async function invokeRewritesViaLambda(payload, fixture) {
  const accountContext = await ensureLambdaTrialAccount(fixture);
  const generationRequestId = `${slugify(fixture && fixture.fixture_id ? fixture.fixture_id : 'copilot-gate')}-${Date.now()}`;
  const result = await invokeLambdaRoute('/aivi/v1/rewrite', payload, {
    'X-AIVI-Account-Id': accountContext.account_id,
    'X-AIVI-Site-Id': accountContext.site_id,
    'X-AIVI-Generation-Request-Id': generationRequestId
  });

  return {
    ...result,
    transport_used: 'lambda_invoke',
    gate_account_context: accountContext
  };
}

async function runGeneration(fixture, fixAssistContract, prompt) {
  const payload = buildRewritePayload(fixture, fixAssistContract);
  const requestedTransport = String(process.env.COPILOT_GATE_TRANSPORT || 'auto').trim().toLowerCase();

  if (requestedTransport === 'lambda') {
    return invokeRewritesViaLambda(payload, fixture);
  }

  try {
    const result = await generateRewrites(
      buildSuggestionFromCopilotIssue(fixture.copilot_issue),
      fixture.manifest,
      payload
    );
    return {
      ...result,
      transport_used: 'local_direct'
    };
  } catch (error) {
    if (requestedTransport === 'local' || !isSecretAccessError(error)) {
      throw error;
    }
    return invokeRewritesViaLambda(payload, fixture);
  }
}

async function main() {
  if (!process.env.AWS_REGION) {
    process.env.AWS_REGION = 'eu-north-1';
  }

  const fixture = readFixture();
  const fixtureBaseName = path.basename(fixturePath, path.extname(fixturePath));
  const outputPath = path.join(outputDir, `${fixtureBaseName}.latest.json`);
  const suggestion = buildSuggestionFromCopilotIssue(fixture.copilot_issue);
  if (!suggestion || !suggestion.text) {
    throw new Error('Fixture could not synthesize a suggestion from copilot_issue');
  }

  const fixAssistTriage = buildFixAssistTriage({
    checkId: fixture.check_id,
    checkName: fixture.check_name,
    snippet: fixture.copilot_issue && fixture.copilot_issue.snippet ? fixture.copilot_issue.snippet : suggestion.text,
    message: fixture.copilot_issue && fixture.copilot_issue.analyzer_note ? fixture.copilot_issue.analyzer_note : '',
    rewriteTarget: fixture.rewrite_target,
    repairIntent: fixture.repair_intent
  });

  const fixAssistContract = buildFixAssistContract({
    suggestion,
    manifest: fixture.manifest,
    analysisRef: {
      run_id: 'm5-simulation-gate',
      check_id: fixture.check_id,
      instance_index: 0
    },
    rewriteTarget: fixture.rewrite_target,
    repairIntent: fixture.repair_intent,
    issueContext: fixture.copilot_issue,
    fixAssistTriage
  });

  const context = extractContext(suggestion, fixture.manifest, {
    rewriteTarget: fixture.rewrite_target,
    repairIntent: fixture.repair_intent,
    issueContext: fixture.copilot_issue
  });

  const prompt = buildRewritePrompt(suggestion, context, 'neutral', 3, {
    rewriteTarget: fixture.rewrite_target,
    repairIntent: fixture.repair_intent,
    copilotIssue: fixture.copilot_issue,
    issueContext: fixture.copilot_issue,
    fixAssistContract,
    verificationResult: null,
    retryHint: null
  });

  const generated = await runGeneration(fixture, fixAssistContract, prompt);

  const report = buildGateResult(fixture, prompt, generated);
  ensureDir(outputDir);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    fixture_id: fixture.fixture_id,
    check_id: fixture.check_id,
    pass: report.pass,
    output_path: outputPath,
    scorer_id: report.scorer_id,
    transport_used: report.transport_used,
    evaluations: report.evaluations.map((entry) => ({
      index: entry.index,
      label: entry.label,
      pass: entry.evaluation.pass,
      failures: entry.evaluation.failures
    }))
  }, null, 2));

  if (!report.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    fixture_id: path.basename(fixturePath, path.extname(fixturePath)),
    pass: false,
    error: error && error.message ? error.message : String(error || 'unknown_error')
  }, null, 2));
  process.exit(1);
});
