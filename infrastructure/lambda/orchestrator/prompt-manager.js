const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

// Cache for prompts
const promptCache = new Map();
const PROMPT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fallback prompts when S3/DynamoDB are not available
const FALLBACK_PROMPTS = {
  analysis: `You are an expert SEO and content analysis AI assistant. Your task is to analyze the provided web content and provide comprehensive insights about its SEO performance, readability, and overall quality.

## Content Analysis Guidelines

### 1. SEO Analysis
- Evaluate title optimization and keyword usage
- Assess meta description potential
- Check heading structure (H1, H2, H3)
- Analyze internal and external links
- Evaluate content length and depth

### 2. Content Quality
- Assess readability and clarity
- Check for grammatical errors and typos
- Evaluate content structure and flow
- Assess value proposition to readers
- Check for duplicate or thin content

### 3. AEO (Answer Engine Optimization) Checks
- Identify potential FAQ opportunities
- Assess content's ability to answer specific questions
- Evaluate featured snippet potential
- Check for structured data opportunities

### 4. GEO (Generative Engine Optimization) Checks
- Assess content's suitability for AI summarization
- Evaluate factual accuracy and sourcing
- Check for original insights and unique perspectives
- Assess content's authority and expertise

## Content to Analyze
Title: {{title}}
Site ID: {{site_id}}
Date: {{current_date}}

Content:
{{content}}

## Response Format

Please provide your analysis in the following JSON format:

\`\`\`json
{
  "scores": {
    "seo": 0.0,
    "readability": 0.0,
    "contentQuality": 0.0,
    "overall": 0.0
  },
  "checks": {
    "aeo": {
      "hasFAQ": false,
      "hasStructuredData": false,
      "answersQuestions": false,
      "snippetPotential": "low|medium|high"
    },
    "geo": {
      "factualAccuracy": "poor|fair|good|excellent",
      "originalInsights": false,
      "authoritative": false,
      "aiReady": false
    }
  },
  "highlights": [
    {
      "type": "strength|weakness|opportunity",
      "category": "seo|readability|content|aeo|geo",
      "title": "Brief title",
      "description": "Detailed explanation",
      "severity": "low|medium|high",
      "position": {
        "start": 0,
        "end": 0
      }
    }
  ],
  "suggestions": [
    {
      "type": "seo|content|structure",
      "priority": "low|medium|high",
      "title": "Actionable suggestion",
      "description": "What to do and why",
      "example": "Optional example"
    }
  ]
}
\`\`\`

## Scoring Guidelines
- 0-40: Poor - Needs significant improvement
- 41-60: Fair - Has some good elements but needs work
- 61-80: Good - Meets most standards
- 81-100: Excellent - Exceeds expectations

Provide specific, actionable feedback that will help improve the content's performance in search engines and AI-powered answer systems.`,

  analyzer: `You are an expert content analysis AI specializing in optimizing content for LLM-based answer engines and generative retrieval systems. Your task is to analyze HTML content and evaluate it against specific checks that determine how well the content can be extracted and understood by AI systems.

## Analysis Guidelines

1. **Always reference "LLM-based answer engines" or "generative retrieval systems"** - never mention specific products or company names
2. **Provide explanations that help users understand why something affects extractability** - use phrases like "Most LLM-extracted answers behave this way..." or "Content formatted this way increases extractability across search engines..."
3. **Anchoring is mandatory** - every finding must include text_quote_selector and scope, using visible text only (no HTML tags, no paraphrasing, no truncation, no ellipses)
4. **For sentence scope** return the entire sentence in text_quote_selector.exact
5. **For non-sentence scope** return text_quote_selector with exact, prefix, and suffix; if you cannot return a full sentence, prefix and suffix must be at least 32 characters each
6. **Maintain professional, helpful tone** - focus on actionable improvements

## Evaluation Principles

- **Pass**: Content fully meets the criterion
- **Partial**: Content partially meets the criterion and needs improvement
- **Fail**: Content does not meet the criterion

## Confidence Scoring

- 0.9-1.0: High confidence (clear evidence)
- 0.7-0.9: Medium confidence (some ambiguity)
- 0.5-0.7: Low confidence (uncertain)
- Below 0.5: No confidence (do not assert)

## Output Requirements

1. Return ONLY valid JSON with a findings array
2. Every finding must include check_id, verdict, confidence, scope, text_quote_selector, and explanation
3. text_quote_selector must include exact, prefix, and suffix
4. text_position_selector is optional and may be included if known

Output structure:
{
  "findings": [
    {
      "check_id": "check_id",
      "verdict": "pass|partial|fail",
      "confidence": 0.9,
      "scope": "sentence|span|block",
      "text_quote_selector": {
        "exact": "full sentence or exact snippet",
        "prefix": "prefix text",
        "suffix": "suffix text"
      },
      "text_position_selector": {
        "start": 123,
        "end": 456
      },
      "explanation": "Why this is pass, partial, or fail"
    }
  ]
}

## Special Instructions

- For answer extractability, focus on direct answers and clear structure
- Do not treat rhetorical hook questions, self-assessment prompts, CTA-style questions, or broad thematic lead-ins as strict question anchors
- Treat page titles, H1s, and headlines as local intent cues by default, not as strict question anchors
- If no true strict question anchor exists but a page title, heading, or pseudo heading clearly promises a direct answer or structured surface such as a list, table, comparison, or short matrix, use it only as a local section-intent cue, not as a substitute strict anchor
- Bound that heading-intent inspection to the heading or pseudo heading, the first answer paragraph beneath it, and the next support paragraph, visible list, or visible table; stop at the next heading or pseudo heading
- If the heading promise is delayed by setup, throat-clearing, or broad framing, you may fail or partial answer-placement, alignment, or formatting checks accordingly
- If a section behaves more like an explainer or list article than a true Q&A section and no clear heading-intent cue exists, return partial instead of forcing answer-distance math, snippet math, or alignment judgments from the hook question
- For readability, look for walls of text and poor organization
- For schema, identify structured data opportunities
- For entities, ensure clarity and consistency
- For trust signals, verify authorship and citations
- For claims, check for evidence and verifiability

Remember: Your analysis helps content creators optimize for AI-driven search and answer systems. Be thorough, accurate, and constructive in your feedback.`,
  rewrite: `You are a professional content rewriter. Your task is to improve the provided content while maintaining its original meaning and voice.

Content to rewrite:
{{content}}

Focus on:
- Improving clarity and readability
- Enhancing SEO elements
- Fixing grammatical errors
- Optimizing for the target audience

Return the improved content in markdown format.`,
  suggestions: `Based on the following content, suggest 3-5 improvements:

Title: {{title}}
Content: {{content}}

Provide specific, actionable suggestions for:
1. SEO optimization
2. Content structure
3. User engagement

Format as a numbered list with brief explanations.`
};

/**
 * Simple template rendering - replaces {{variable}} with values
 */
function renderTemplate(template, variables) {
  if (!template || typeof template !== 'string') {
    return '';
  }

  let rendered = template;

  // Replace each variable
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    rendered = rendered.replace(regex, value || '');
  }

  // Clean up any unreplaced variables
  rendered = rendered.replace(/{{\s*[^}]+\s*}}/g, '');

  return rendered;
}

/**
 * Get prompt version from DynamoDB
 */
async function getActivePromptVersion(promptType) {
  // If DynamoDB table doesn't exist, return default
  if (!process.env.PROMPTS_TABLE || process.env.PROMPTS_TABLE === 'aivi-prompts-dev') {
    return {
      version: '1.0.0',
      variants: 1,
      abTestActive: false
    };
  }

  const params = {
    TableName: process.env.PROMPTS_TABLE,
    Key: {
      promptType: { S: promptType }
    }
  };

  try {
    const command = new GetItemCommand(params);
    const response = await dynamo.send(command);

    if (response.Item) {
      return {
        version: response.Item.version.S,
        variants: parseInt(response.Item.variants.N) || 1,
        abTestActive: response.Item.abTestActive?.BOOL || false
      };
    }
  } catch (error) {
    console.warn('Failed to get prompt version from DynamoDB:', error.message);
  }

  // Default fallback
  return {
    version: '1.0.0',
    variants: 1,
    abTestActive: false
  };
}

/**
 * Get prompt template from S3
 */
async function getPromptFromS3(promptType, version, variant = 0) {
  const cacheKey = `${promptType}-${version}-${variant}`;
  const cached = promptCache.get(cacheKey);

  // Return cached prompt if still valid
  if (cached && (Date.now() - cached.timestamp) < PROMPT_CACHE_TTL) {
    return cached.content;
  }

  // If S3 bucket doesn't exist, use fallback
  if (!process.env.PROMPTS_BUCKET || process.env.PROMPTS_BUCKET === 'aivi-prompts-aivi-dev') {
    const fallback = FALLBACK_PROMPTS[promptType];
    if (fallback) {
      promptCache.set(cacheKey, {
        content: fallback,
        timestamp: Date.now()
      });
      return fallback;
    }
    throw new Error(`No fallback prompt available for ${promptType}`);
  }

  // Construct S3 key
  const key = `prompts/${promptType}/v${version}${variant > 0 ? `-variant${variant}` : ''}.txt`;

  const params = {
    Bucket: process.env.PROMPTS_BUCKET,
    Key: key
  };

  try {
    const command = new GetObjectCommand(params);
    const response = await s3.send(command);

    // Convert stream to string
    const content = await response.Body.transformToString();

    // Cache the result
    promptCache.set(cacheKey, {
      content,
      timestamp: Date.now()
    });

    return content;
  } catch (error) {
    console.warn(`Failed to fetch prompt ${key}: ${error.message}`);

    // Try fallback
    const fallback = FALLBACK_PROMPTS[promptType];
    if (fallback) {
      promptCache.set(cacheKey, {
        content: fallback,
        timestamp: Date.now()
      });
      return fallback;
    }

    throw new Error(`Prompt template not found: ${promptType} v${version}`);
  }
}

/**
 * Get prompt template from DynamoDB (optional fallback)
 */
async function getPromptFromDynamo(promptType) {
  if (!process.env.PROMPTS_TABLE || process.env.PROMPTS_TABLE === 'aivi-prompts-dev') {
    throw new Error('PROMPTS_TABLE not configured for prompt content');
  }
  const params = {
    TableName: process.env.PROMPTS_TABLE,
    Key: {
      promptType: { S: promptType }
    }
  };
  const response = await dynamo.send(new GetItemCommand(params));
  if (!response.Item) {
    throw new Error(`Prompt item not found for ${promptType}`);
  }
  const contentField = response.Item.prompt?.S || response.Item.template?.S || response.Item.content?.S;
  if (!contentField) {
    throw new Error(`Prompt content missing for ${promptType}`);
  }
  return contentField;
}

/**
 * Get rendered prompt with variables and provenance metadata
 */
async function getPrompt(promptType, variables = {}, runId = null, options = {}) {
  const activeVersionInfo = await getActivePromptVersion(promptType);
  const versionInfo = {
    ...activeVersionInfo,
    version: options.versionOverride || activeVersionInfo.version
  };
  let variant = 0;
  if (versionInfo.abTestActive && versionInfo.variants > 1 && runId) {
    variant = parseInt(runId.slice(-2), 16) % versionInfo.variants;
  }
  let template;
  let source = 's3';
  let key = `prompts/${promptType}/v${versionInfo.version}${variant > 0 ? `-variant${variant}` : ''}.txt`;
  try {
    template = await getPromptFromS3(promptType, versionInfo.version, variant);
    if (!process.env.PROMPTS_BUCKET || process.env.PROMPTS_BUCKET === 'aivi-prompts-aivi-dev') {
      source = 'fallback';
      key = `fallback-${promptType}`;
    }
  } catch (err) {
    console.error(`Prompt load failure from S3 for ${promptType}: ${err.message}`);
    try {
      template = await getPromptFromDynamo(promptType);
      source = 'dynamo';
      key = `${promptType}:${versionInfo.version}`;
    } catch (dynamoError) {
      console.error(`Prompt load failure from DynamoDB for ${promptType}: ${dynamoError.message}`);
      source = 'fallback';
      key = `fallback-${promptType}`;
      template = FALLBACK_PROMPTS[promptType] || '';
    }
  }
  const rendered = renderTemplate(template, variables);
  const length = rendered.length;
  console.log(JSON.stringify({
    event: 'prompt_provenance',
    promptType,
    source,
    key,
    version: versionInfo.version,
    variant,
    length,
    runId
  }));
  return {
    content: rendered,
    source,
    key,
    version: versionInfo.version,
    variant,
    length
  };
}

// Optional cold-start smoke check (non-blocking)
(() => {
  const bucket = process.env.PROMPTS_BUCKET;
  if (bucket && bucket !== 'aivi-prompts-aivi-dev') {
    const version = '1.0.0';
    const key = `prompts/analyzer/v${version}.txt`;
    const params = { Bucket: bucket, Key: key };
    s3.send(new GetObjectCommand(params))
      .then(() => {
        console.log(JSON.stringify({ event: 'prompt_smoke_check', ok: true, bucket, key }));
      })
      .catch(err => {
        console.log(JSON.stringify({ event: 'prompt_smoke_check', ok: false, bucket, key, error: err.message }));
      });
  } else {
    console.log(JSON.stringify({ event: 'prompt_smoke_check', ok: false, bucket: bucket || '[unset]', fallback: true }));
  }
})();

/**
 * List available prompt types and versions
 */
async function listPrompts() {
  // This would scan S3 to find all prompt versions
  // For now, return known types
  return {
    analysis: {
      available: ['1.0.0'],
      active: '1.0.0'
    },
    rewrite: {
      available: ['1.0.0'],
      active: '1.0.0'
    },
    suggestions: {
      available: ['1.0.0'],
      active: '1.0.0'
    }
  };
}

function normalizeCheckSelection(checksList) {
  if (!checksList) return null;
  if (Array.isArray(checksList)) return new Set(checksList);
  if (Array.isArray(checksList.checks)) return new Set(checksList.checks);
  if (Array.isArray(checksList.include)) return new Set(checksList.include);
  return null;
}

async function getCheckPromptFromS3(checkId, version, variant = 0) {
  const cacheKey = `check:${checkId}-${version}-${variant}`;
  const cached = promptCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < PROMPT_CACHE_TTL) {
    return cached.content;
  }
  if (!process.env.PROMPTS_BUCKET || process.env.PROMPTS_BUCKET === 'aivi-prompts-aivi-dev') {
    return null;
  }
  const key = `prompts/checks/${checkId}/v${version}${variant > 0 ? `-variant${variant}` : ''}.txt`;
  const params = {
    Bucket: process.env.PROMPTS_BUCKET,
    Key: key
  };
  try {
    const command = new GetObjectCommand(params);
    const response = await s3.send(command);
    const content = await response.Body.transformToString();
    promptCache.set(cacheKey, {
      content,
      timestamp: Date.now()
    });
    return content;
  } catch (error) {
    promptCache.set(cacheKey, {
      content: null,
      timestamp: Date.now()
    });
    return null;
  }
}

async function getCheckPromptFromDynamo(checkId) {
  if (!process.env.PROMPTS_TABLE || process.env.PROMPTS_TABLE === 'aivi-prompts-dev') {
    return null;
  }
  const params = {
    TableName: process.env.PROMPTS_TABLE,
    Key: {
      promptType: { S: `check:${checkId}` }
    }
  };
  try {
    const response = await dynamo.send(new GetItemCommand(params));
    if (!response.Item) {
      return null;
    }
    const contentField = response.Item.prompt?.S || response.Item.template?.S || response.Item.content?.S;
    return contentField || null;
  } catch (error) {
    return null;
  }
}

async function getCheckPrompt(checkId, options = {}) {
  const version = options.versionOverride || '1.0.0';
  const variant = 0;
  let content = await getCheckPromptFromS3(checkId, version, variant);
  let source = null;
  let key = null;
  if (content) {
    source = 's3';
    key = `prompts/checks/${checkId}/v${version}${variant > 0 ? `-variant${variant}` : ''}.txt`;
  } else {
    content = await getCheckPromptFromDynamo(checkId);
    if (content) {
      source = 'dynamo';
      key = `check:${checkId}`;
    }
  }
  if (!content) {
    return null;
  }
  const rendered = renderTemplate(content, options.variables || {});
  return {
    content: rendered,
    source,
    key,
    version,
    variant,
    length: rendered.length
  };
}

async function buildCheckPromptRegistry(checkDefinitions, checksList = null, options = {}) {
  const selected = normalizeCheckSelection(checksList);
  const deterministicIds = options.deterministicIds instanceof Set ? options.deterministicIds : new Set();
  const categories = checkDefinitions?.categories || {};
  const registry = [];
  const entries = [];
  Object.entries(categories).forEach(([categoryId, categoryDef]) => {
    const checks = categoryDef?.checks || {};
    Object.entries(checks).forEach(([checkId, checkDef]) => {
      entries.push([categoryId, checkId, checkDef]);
    });
  });
  for (const [categoryId, checkId, checkDef] of entries) {
    if (selected && !selected.has(checkId)) {
      continue;
    }
    const type = typeof checkDef?.type === 'string' ? checkDef.type.toLowerCase() : '';
    if (type === 'deterministic' || deterministicIds.has(checkId)) {
      continue;
    }
    const checkPrompt = await getCheckPrompt(checkId, {
      versionOverride: options.promptVersion,
      variables: options.variables
    });
    registry.push({
      check_id: checkId,
      category: categoryId,
      name: checkDef?.name || checkId,
      description: checkDef?.description || '',
      evaluation: checkDef?.evaluation || '',
      thresholds: checkDef?.thresholds || '',
      expected_output: checkDef?.output || { verdict: 'pass|partial|fail' },
      prompt: checkPrompt ? checkPrompt.content : undefined,
      abstain_rule: 'If evidence cannot be anchored to manifest.block_map, return verdict fail, confidence 0, explanation that evidence cannot be anchored, and no candidate_highlights.'
    });
  }
  return {
    registry,
    count: registry.length
  };
}

module.exports = {
  getPrompt,
  listPrompts,
  renderTemplate,
  FALLBACK_PROMPTS,
  buildCheckPromptRegistry
};
