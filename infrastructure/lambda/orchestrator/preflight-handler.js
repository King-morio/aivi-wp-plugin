const { Buffer } = require('buffer');
const fs = require('fs');
const path = require('path');
const { encode } = require('gpt-tokenizer');
const htmlparser = require('htmlparser2');

let cachedDeterministicInstanceMessages = null;

const DEFAULT_INSTANCE_MESSAGE_CATALOG = {
  version: '1.0.0',
  checks: {}
};

const resolveDeterministicMessageCatalogPath = () => {
  const candidates = [
    path.join(__dirname, 'shared', 'schemas', 'deterministic-instance-messages-v1.json'),
    path.join(__dirname, 'schemas', 'deterministic-instance-messages-v1.json'),
    path.join(__dirname, '..', 'shared', 'schemas', 'deterministic-instance-messages-v1.json')
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing || null;
};

const loadDeterministicInstanceMessages = () => {
  if (cachedDeterministicInstanceMessages) {
    return cachedDeterministicInstanceMessages;
  }
  const catalogPath = resolveDeterministicMessageCatalogPath();
  if (!catalogPath) {
    cachedDeterministicInstanceMessages = DEFAULT_INSTANCE_MESSAGE_CATALOG;
    return cachedDeterministicInstanceMessages;
  }
  try {
    const raw = fs.readFileSync(catalogPath, 'utf8');
    cachedDeterministicInstanceMessages = JSON.parse(String(raw).replace(/^\uFEFF/, ''));
  } catch (error) {
    console.log('Failed to load deterministic instance message catalog:', error.message);
    cachedDeterministicInstanceMessages = DEFAULT_INSTANCE_MESSAGE_CATALOG;
  }
  return cachedDeterministicInstanceMessages;
};

const stableHash = (input) => {
  const value = String(input || '');
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const interpolateMessageTemplate = (template, facts = {}) => {
  const source = String(template || '').trim();
  if (!source) return '';
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(facts, key)) {
      return '';
    }
    const value = facts[key];
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }).replace(/\s+/g, ' ').trim();
};

const buildDeterministicInstanceMessage = (checkId, facts = {}, stableKey = '') => {
  const catalog = loadDeterministicInstanceMessages();
  const entry = catalog?.checks && typeof catalog.checks === 'object'
    ? catalog.checks[checkId]
    : null;
  const fallbackLeadByCheck = {
    single_h1: 'This heading is one of multiple H1 headings on the page.',
    accessibility_basics: 'This image reference is missing alt text.',
    content_updated_12_months: 'This date indicates stale content for freshness-sensitive retrieval.',
    no_broken_internal_links: 'This internal link points to a broken destination.',
    orphan_headings: 'This heading has thin supporting content.',
    heading_fragmentation: 'This heading sits in a fragmented section with thin support.',
    appropriate_paragraph_length: 'This paragraph is longer than recommended for answer extraction.',
    logical_heading_hierarchy: 'This heading skips a level in the hierarchy.'
  };
  const leadTemplate = (entry && typeof entry.lead === 'string' && entry.lead.trim())
    ? entry.lead
    : (fallbackLeadByCheck[checkId] || 'This section needs revision for better answer extractability.');
  const lead = interpolateMessageTemplate(leadTemplate, facts);
  const variants = Array.isArray(entry?.variants)
    ? entry.variants.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!variants.length) {
    return lead;
  }
  const selectorKey = `${checkId}|${stableKey}`;
  const variantIdx = stableHash(selectorKey) % variants.length;
  const tail = interpolateMessageTemplate(variants[variantIdx], facts);
  return [lead, tail].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
};

/**
 * Handles preflight analysis - deterministic checks and manifest generation
 */
async function preflightHandler(event) {
  const startTime = Date.now();

  try {
    // Parse request body with enhanced diagnostics
    let body;
    let rawBodyForDiagnostics = '';

    if (typeof event.body === 'string') {
      rawBodyForDiagnostics = event.body;

      // Check if body is base64-encoded (HTTP API v2.0 may do this)
      if (event.isBase64Encoded === true) {
        try {
          rawBodyForDiagnostics = Buffer.from(event.body, 'base64').toString('utf8');
          console.log('Decoded base64-encoded body, length:', rawBodyForDiagnostics.length);
        } catch (decodeError) {
          console.log('Failed to decode base64 body:', decodeError.message);
        }
      }

      try {
        // Try parsing directly first
        body = JSON.parse(rawBodyForDiagnostics);
      } catch (parseError) {
        // Enhanced diagnostics
        const bodyLength = rawBodyForDiagnostics.length;
        const firstChars = rawBodyForDiagnostics.substring(0, 200);
        const firstCharCode = rawBodyForDiagnostics.charCodeAt(0);
        const hasBOM = firstCharCode === 0xFEFF;

        console.log('Direct JSON parse failed - diagnostic info:', {
          error: parseError.message,
          bodyLength,
          firstChars: firstChars.replace(/[\x00-\x1f]/g, '?'),
          firstCharCode,
          hasBOM,
          isBase64Encoded: event.isBase64Encoded
        });

        // Try common fixes
        try {
          let parsedBody = rawBodyForDiagnostics;

          // Remove BOM if present
          if (hasBOM) {
            parsedBody = parsedBody.replace(/^\uFEFF/, '');
            console.log('Removed BOM from body');
          }

          // Fix double-escaped quotes if present
          if (parsedBody.includes('\\"')) {
            parsedBody = parsedBody.replace(/\\"/g, '"');
            console.log('Applied double-escape fix to JSON');
          }

          body = JSON.parse(parsedBody);
          console.log('Successfully parsed after applying fixes');
        } catch (secondError) {
          console.log('Failed to parse request body after fix attempt:', secondError.message);
          return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ok: false,
              error: 'invalid_json',
              message: 'Request body must be valid JSON',
              diagnostics: {
                parseError: secondError.message,
                bodyLength,
                firstChars: firstChars.substring(0, 100).replace(/[\x00-\x1f]/g, '?')
              }
            })
          };
        }
      }
    } else if (typeof event.body === 'object' && event.body !== null) {
      body = event.body;
    } else {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Missing body',
          message: 'Request body is required'
        })
      };
    }

    const { title, content_html, site_id, post_id, content_type, site_url } = body;

    if (!content_html) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Missing content',
          message: 'content_html is required'
        })
      };
    }

    // Create manifest
    const manifest = await createManifest(content_html, title, site_url);

    // Token estimation
    const tokenEstimate = estimateTokens(manifest);

    // Check token limit
    const MAX_TOKENS = 200000;
    if (tokenEstimate > MAX_TOKENS) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'too_long',
          message: `Content exceeds maximum token limit (${tokenEstimate} > ${MAX_TOKENS}). Please split the content into smaller sections.`,
          tokenEstimate,
          cutoff: MAX_TOKENS
        })
      };
    }

    // Perform deterministic checks
    const checks = await performDeterministicChecks(manifest, {}, {
      enableIntroFocusFactuality: process.env.INTRO_FOCUS_FACTUALITY_ENABLED === 'true',
      contentHtml: content_html
    });

    const processingTime = Date.now() - startTime;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        manifest,
        tokenEstimate,
        checks,
        processing_time_ms: processingTime,
        metadata: {
          title,
          site_id,
          post_id,
          content_type: content_type || 'post',
          timestamp: new Date().toISOString()
        }
      })
    };

  } catch (error) {
    console.error('Preflight error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'internal_error',
        message: 'Internal server error during preflight'
      })
    };
  }
}

/**
 * Creates a sanitized manifest from HTML content
 */
async function createManifest(html, title = '', siteUrl = '') {
  const manifest = {
    title,
    nodes: [],
    jsonld: [],
    links: [],
    plain_text: '',
    wordEstimate: 0,
    metadata: {
      h1_count: 0,
      h2_count: 0,
      h3_count: 0,
      img_count: 0,
      link_count: 0,
      has_jsonld: false
    }
  };

  let nodeId = 0;
  let currentOffset = 0;
  let textBuffer = '';
  let jsonLdBuffer = '';
  let inJsonLd = false;
  let jsonLdStart = null;

  const parser = new htmlparser.Parser({
    onopentag(name, attribs) {
      const node = {
        id: `n${nodeId++}`,
        tag: name,
        attributes: attribs,
        start_offset: currentOffset,
        end_offset: null,
        text: '',
        children: []
      };

      // Track metadata
      if (name === 'h1') manifest.metadata.h1_count++;
      if (name === 'h2') manifest.metadata.h2_count++;
      if (name === 'h3') manifest.metadata.h3_count++;
      if (name === 'img') manifest.metadata.img_count++;
      if (name === 'a') manifest.metadata.link_count++;

      // Check for JSON-LD
      if (name === 'script' && attribs.type === 'application/ld+json') {
        inJsonLd = true;
        jsonLdStart = currentOffset;
      }

      manifest.nodes.push(node);
    },

    ontext(text) {
      if (inJsonLd) {
        jsonLdBuffer += text;
      } else {
        const cleanText = text.trim();
        if (cleanText) {
          const currentNode = manifest.nodes[manifest.nodes.length - 1];
          if (currentNode) {
            currentNode.text += cleanText;
          }
          textBuffer += cleanText + ' ';
          currentOffset += cleanText.length + 1;
        }
      }
    },

    onclosetag(name) {
      if (name === 'script' && inJsonLd) {
        // Parse JSON-LD
        try {
          const jsonLd = JSON.parse(jsonLdBuffer.trim());
          manifest.jsonld.push({
            type: jsonLd['@type'] || 'Unknown',
            valid: true,
            content: jsonLd,
            start_offset: jsonLdStart,
            end_offset: currentOffset
          });
          manifest.metadata.has_jsonld = true;
        } catch (e) {
          manifest.jsonld.push({
            type: 'Invalid',
            valid: false,
            error: e.message,
            start_offset: jsonLdStart,
            end_offset: currentOffset
          });
        }
        inJsonLd = false;
        jsonLdBuffer = '';
      }

      const currentNode = manifest.nodes[manifest.nodes.length - 1];
      if (currentNode) {
        currentNode.end_offset = currentOffset;
      }
    }
  }, { decodeEntities: true });

  parser.write(html);
  parser.end();

  // Extract links
  manifest.links = extractLinks(html, siteUrl);

  // Set plain text and word count
  manifest.plain_text = textBuffer.trim();
  manifest.wordEstimate = countWords(manifest.plain_text);

  return manifest;
}

/**
 * Estimates token count for the content
 */
function estimateTokens(manifest) {
  // Use gpt-tokenizer for Claude-compatible estimation
  // Claude uses similar tokenization to GPT-4
  const text = manifest.plain_text;
  const tokens = encode(text);
  return tokens.length;
}

/**
 * Performs deterministic checks on the manifest
 */
async function performDeterministicChecks(manifest, runMetadata = {}, options = {}) {
  const checks = {};
  const metadata = manifest && manifest.metadata ? manifest.metadata : {};
  const jsonld = Array.isArray(manifest?.jsonld) ? manifest.jsonld : [];
  const nodes = Array.isArray(manifest?.nodes) ? manifest.nodes : [];
  const blockMap = Array.isArray(manifest?.block_map) ? manifest.block_map : [];
  const contentHtml = typeof manifest?.content_html === 'string' ? manifest.content_html : '';
  const h1Count = Number.isFinite(metadata.h1_count) ? metadata.h1_count : 0;
  const h2Count = Number.isFinite(metadata.h2_count) ? metadata.h2_count : 0;
  const hasJsonld = !!metadata.has_jsonld;
  const multiH1Highlights = h1Count > 1
    ? buildMultipleH1Highlights(blockMap, contentHtml, h1Count)
    : [];

  // H1 count check
  checks.single_h1 = {
    verdict: h1Count === 1 ? 'pass' :
      h1Count === 0 ? 'fail' : 'partial',
    confidence: 1.0,
    explanation: h1Count === 1 ?
      'Content has exactly one H1 tag' :
      h1Count === 0 ?
        'No H1 tag found' :
        `Found ${h1Count} H1 tags, expected exactly one`,
    provenance: 'deterministic',
    highlights: multiH1Highlights,
    details: {
      h1_count: h1Count
    }
  };
  if (checks.single_h1.verdict !== 'pass' && checks.single_h1.highlights.length === 0) {
    markNonInline(checks.single_h1, h1Count === 0 ? 'missing_required_h1' : 'multiple_h1_anchor_unavailable');
  }

  const invalidJsonld = jsonld.filter(ld => ld && ld.valid === false);
  const jsonldHighlights = invalidJsonld.reduce((acc, ld) => {
    const startOffset = typeof ld.start_offset === 'number' ? ld.start_offset : null;
    if (!nodes.length || startOffset === null) {
      return acc;
    }
    const nodeIndex = findNodeAtOffset(nodes, startOffset);
    if (nodeIndex < 0) {
      return acc;
    }
    acc.push({
      id: `jsonld_${startOffset}`,
      node_ref: `n${nodeIndex}`,
      start: startOffset,
      end: typeof ld.end_offset === 'number' ? ld.end_offset : startOffset,
      original_text: ld.error || 'Invalid JSON',
      severity: 'high'
    });
    return acc;
  }, []);

  // JSON-LD syntax validation
  checks.valid_jsonld_schema = {
    verdict: jsonld.length === 0 ? 'pass' :
      invalidJsonld.length > 0 ? 'fail' : 'pass',
    confidence: 1.0,
    explanation: jsonld.length === 0 ?
      'No JSON-LD schema found' :
      invalidJsonld.length === 0 ?
        'All JSON-LD schemas are valid' :
        'Some JSON-LD schemas have syntax errors',
    provenance: 'deterministic',
    highlights: jsonldHighlights,
    details: {
      total_jsonld_blocks: jsonld.length,
      invalid_jsonld_blocks: invalidJsonld.length,
      invalid_jsonld_errors: invalidJsonld
        .slice(0, 6)
        .map((entry) => String(entry?.error || 'Invalid JSON-LD').replace(/\s+/g, ' ').trim())
    }
  };
  if (checks.valid_jsonld_schema.verdict !== 'pass' && checks.valid_jsonld_schema.highlights.length === 0) {
    markNonInline(checks.valid_jsonld_schema, 'jsonld_document_scope');
  }

  const metaDescription = getMetaDescription(contentHtml) || (typeof manifest?.meta_description === 'string' ? manifest.meta_description : '');
  const canonicalUrl = getCanonicalUrl(contentHtml);
  const htmlLang = getHtmlLang(contentHtml);
  const titleTag = getTitleTag(contentHtml);
  const hasTitle = !!manifest.title || !!titleTag;
  const hasMetaDescription = typeof metaDescription === 'string' && metaDescription.trim().length > 0;
  const hasCanonical = typeof canonicalUrl === 'string' && canonicalUrl.trim().length > 0;
  const hasLang = typeof htmlLang === 'string' && htmlLang.trim().length > 0;
  const metadataPresentCount = [hasTitle, hasMetaDescription, hasCanonical, hasLang].filter(Boolean).length;
  const metadataVerdict = metadataPresentCount === 4 ? 'pass' : metadataPresentCount === 0 ? 'fail' : 'partial';
  const metadataMissing = [];
  if (!hasTitle) metadataMissing.push('title');
  if (!hasMetaDescription) metadataMissing.push('meta_description');
  if (!hasCanonical) metadataMissing.push('canonical');
  if (!hasLang) metadataMissing.push('lang');

  checks.metadata_checks = {
    verdict: metadataVerdict,
    confidence: 1.0,
    explanation: metadataVerdict === 'pass' ? 'All metadata elements are present' :
      metadataMissing.length === 4 ? 'No metadata elements detected' :
        `Missing metadata: ${metadataMissing.join(', ')}`,
    provenance: 'deterministic',
    highlights: [],
    details: {
      has_title: hasTitle,
      has_meta_description: hasMetaDescription,
      has_canonical: hasCanonical,
      has_lang: hasLang,
      has_jsonld: hasJsonld,
      h2_count: h2Count
    }
  };
  if (checks.metadata_checks.verdict !== 'pass') {
    markNonInline(checks.metadata_checks, 'metadata_document_scope');
  }

  const accessibilityStats = getImageAltStats(nodes);
  const accessibilityHighlights = accessibilityStats.missing > 0
    ? buildMissingAltHighlights(blockMap, accessibilityStats)
    : [];
  const accessibilityVerdict = accessibilityStats.total === 0 || accessibilityStats.missing === 0 ? 'pass' :
    accessibilityStats.missing < accessibilityStats.total ? 'partial' : 'fail';
  checks.accessibility_basics = {
    verdict: accessibilityVerdict,
    confidence: 1.0,
    explanation: accessibilityStats.total === 0 ? 'No images detected in content' :
      accessibilityStats.missing === 0 ? 'All images include alt text' :
        `${accessibilityStats.missing} of ${accessibilityStats.total} images missing alt text`,
    provenance: 'deterministic',
    highlights: accessibilityHighlights,
    details: accessibilityStats
  };
  if (checks.accessibility_basics.verdict !== 'pass' && checks.accessibility_basics.highlights.length === 0) {
    markNonInline(checks.accessibility_basics, 'missing_alt_anchor_unavailable');
  }

  const authorMatch = findAuthorMatch(blockMap);
  const authorMeta = getMetaAuthor(contentHtml);
  if (authorMatch) {
    checks.author_identified = {
      verdict: 'pass',
      confidence: 1.0,
      explanation: 'Author byline detected in content',
      provenance: 'deterministic',
      highlights: [
        buildHighlight(authorMatch.block, authorMatch.range, 'low')
      ],
      details: {
        detection_method: authorMatch.source
      }
    };
  } else if (authorMeta) {
    checks.author_identified = {
      verdict: 'pass',
      confidence: 1.0,
      explanation: 'Author meta tag detected',
      provenance: 'deterministic',
      highlights: [],
      details: {
        detection_method: 'meta',
        meta_author: authorMeta
      }
    };
  } else {
    checks.author_identified = {
      verdict: 'fail',
      confidence: 1.0,
      explanation: 'No author identification detected',
      provenance: 'deterministic',
      highlights: [],
      details: {
        detection_method: 'none'
      }
    };
    markNonInline(checks.author_identified, 'missing_author_byline');
  }

  const bioMatch = findAuthorBio(blockMap);
  const bioMarker = hasAuthorBioMarker(contentHtml);
  if (bioMatch) {
    checks.author_bio_present = {
      verdict: 'pass',
      confidence: 1.0,
      explanation: 'Author bio section detected',
      provenance: 'deterministic',
      highlights: [
        buildHighlight(bioMatch.block, bioMatch.range, 'low')
      ],
      details: {
        detection_method: bioMatch.source,
        bio_word_count: bioMatch.wordCount
      }
    };
  } else if (bioMarker) {
    checks.author_bio_present = {
      verdict: 'pass',
      confidence: 1.0,
      explanation: 'Author bio marker detected in content HTML',
      provenance: 'deterministic',
      highlights: [],
      details: {
        detection_method: 'marker'
      }
    };
  } else {
    checks.author_bio_present = {
      verdict: 'fail',
      confidence: 1.0,
      explanation: 'No author bio section detected',
      provenance: 'deterministic',
      highlights: [],
      details: {
        detection_method: 'none'
      }
    };
    markNonInline(checks.author_bio_present, 'missing_author_bio');
  }

  const semanticTags = getSemanticTags(nodes);
  const semanticTagCount = semanticTags.length;
  checks.semantic_html_usage = {
    verdict: semanticTagCount >= 2 ? 'pass' : semanticTagCount === 1 ? 'partial' : 'fail',
    confidence: 1.0,
    explanation: semanticTagCount >= 2 ? 'Multiple semantic HTML tags detected' :
      semanticTagCount === 1 ? `One semantic tag detected (${semanticTags[0]})` :
        'No semantic HTML tags detected',
    provenance: 'deterministic',
    highlights: [],
    details: {
      tags_found: semanticTags
    }
  };
  if (checks.semantic_html_usage.verdict !== 'pass') {
    markNonInline(checks.semantic_html_usage, 'semantic_structure_non_inline');
  }

  const schemaTypeValidation = validateSupportedSchemaTypes(jsonld);
  checks.supported_schema_types_validation = {
    verdict: schemaTypeValidation.verdict,
    confidence: 1.0,
    explanation: schemaTypeValidation.explanation,
    provenance: 'deterministic',
    highlights: [],
    details: schemaTypeValidation.details
  };
  if (checks.supported_schema_types_validation.verdict !== 'pass') {
    markNonInline(checks.supported_schema_types_validation, 'schema_validation_non_inline');
  }

  const schemaMatch = evaluateSchemaMatchesContent(jsonld, runMetadata);
  checks.schema_matches_content = {
    verdict: schemaMatch.verdict,
    confidence: 1.0,
    explanation: schemaMatch.explanation,
    provenance: 'deterministic',
    highlights: [],
    details: schemaMatch.details
  };
  if (checks.schema_matches_content.verdict !== 'pass') {
    markNonInline(checks.schema_matches_content, 'schema_content_alignment_non_inline');
  }

  const faqSchemaCheck = evaluateFaqSchemaRequirement(blockMap, nodes, jsonld);
  checks.faq_jsonld_presence_and_completeness = {
    verdict: faqSchemaCheck.verdict,
    confidence: 1.0,
    explanation: faqSchemaCheck.explanation,
    provenance: 'deterministic',
    highlights: [],
    details: faqSchemaCheck.details
  };
  if (checks.faq_jsonld_presence_and_completeness.verdict !== 'pass') {
    markNonInline(checks.faq_jsonld_presence_and_completeness, 'faq_schema_non_inline');
  }

  const howtoSchemaCheck = evaluateHowtoSchemaRequirement(blockMap, nodes, jsonld);
  checks.howto_jsonld_presence_and_completeness = {
    verdict: howtoSchemaCheck.verdict,
    confidence: 1.0,
    explanation: howtoSchemaCheck.explanation,
    provenance: 'deterministic',
    highlights: [],
    details: howtoSchemaCheck.details
  };
  if (checks.howto_jsonld_presence_and_completeness.verdict !== 'pass') {
    markNonInline(checks.howto_jsonld_presence_and_completeness, 'howto_schema_non_inline');
  }

  const updateCheck = evaluateContentFreshness(contentHtml, runMetadata, blockMap);
  const freshnessFacts = {
    age_days: Number.isFinite(updateCheck?.details?.days_since_update) ? updateCheck.details.days_since_update : '',
    max_age_days: 365
  };
  const freshnessMessage = updateCheck.verdict === 'pass'
    ? ''
    : buildDeterministicInstanceMessage(
      'content_updated_12_months',
      freshnessFacts,
      `${updateCheck?.details?.date_found || ''}`
    );
  checks.content_updated_12_months = {
    verdict: updateCheck.verdict,
    confidence: 1.0,
    explanation: updateCheck.explanation,
    provenance: 'deterministic',
    highlights: updateCheck.highlight
      ? [buildHighlight(updateCheck.highlight.block, updateCheck.highlight.range, 'low', { message: freshnessMessage, facts: freshnessFacts })]
      : [],
    details: updateCheck.details
  };
  if (checks.content_updated_12_months.verdict !== 'pass' && checks.content_updated_12_months.highlights.length === 0) {
    markNonInline(checks.content_updated_12_months, updateCheck.non_inline_reason || 'date_anchor_unavailable');
  }

  const linkCheck = evaluateInternalLinks(manifest, options, blockMap, contentHtml);
  checks.no_broken_internal_links = {
    verdict: linkCheck.verdict,
    confidence: 1.0,
    explanation: linkCheck.explanation,
    provenance: 'deterministic',
    highlights: Array.isArray(linkCheck.highlights) ? linkCheck.highlights : [],
    details: linkCheck.details
  };
  if (checks.no_broken_internal_links.verdict !== 'pass' && checks.no_broken_internal_links.highlights.length === 0) {
    markNonInline(checks.no_broken_internal_links, linkCheck.non_inline_reason || 'broken_link_anchor_unavailable');
  }

  const headingSections = collectHeadingSections(blockMap);
  const h2Sections = headingSections.filter(section => section.level === 2);
  const h2TotalWords = h2Sections.reduce((sum, section) => sum + Number(section.wordCount || 0), 0);
  const avgH2Words = h2Sections.length > 0 ? (h2TotalWords / h2Sections.length) : 0;
  const shortH2Sections = h2Sections.filter(section => Number(section.wordCount || 0) < 50);
  const isFragmented = h2Sections.length > 6 && avgH2Words < 50;
  const headingFragmentHighlights = isFragmented
    ? shortH2Sections.map((section) => {
      const headingText = section.headingText;
      if (!headingText) return null;
      const facts = {
        heading_text: headingText,
        word_count: Number(section.wordCount || 0),
        target_words: 50,
        h2_section_count: h2Sections.length
      };
      const message = buildDeterministicInstanceMessage(
        'heading_fragmentation',
        facts,
        `${section.nodeRef || ''}|${headingText}`
      );
      return buildHighlight(section.block, { start: 0, end: headingText.length }, 'medium', { message, facts });
    }).filter(Boolean)
    : [];

  checks.heading_fragmentation = {
    verdict: isFragmented ? 'fail' : 'pass',
    confidence: 1.0,
    explanation: isFragmented
      ? `The content contains ${h2Sections.length} H2 sections with an average word count below 50, failing the threshold for heading fragmentation.`
      : `Heading structure is healthy (${h2Sections.length} H2 sections, average ${Math.round(avgH2Words)} words per section).`,
    provenance: 'deterministic',
    highlights: headingFragmentHighlights,
    details: {
      h2_section_count: h2Sections.length,
      h2_avg_word_count: Number(avgH2Words.toFixed(2)),
      short_h2_sections: shortH2Sections.map((section) => ({
        node_ref: section.nodeRef,
        heading_text: section.headingText,
        word_count: section.wordCount
      }))
    }
  };
  if (checks.heading_fragmentation.verdict !== 'pass' && checks.heading_fragmentation.highlights.length === 0) {
    markNonInline(checks.heading_fragmentation, 'heading_fragmentation_non_inline');
  }

  const longParagraphs = [];
  const longParagraphHighlights = [];
  blockMap.forEach(block => {
    if (!isParagraphBlock(block)) {
      return;
    }
    const text = getBlockText(block);
    if (!text || !text.trim()) {
      return;
    }
    const wordCount = countWords(text);
    if (wordCount > 150) {
      longParagraphs.push({
        node_ref: block.node_ref || null,
        word_count: wordCount
      });
      longParagraphHighlights.push(
        buildHighlight(
          block,
          { start: 0, end: text.length },
          'medium',
          {
            message: buildDeterministicInstanceMessage(
              'appropriate_paragraph_length',
              { word_count: wordCount, max_words: 150 },
              `${block.node_ref || ''}|${wordCount}`
            ),
            facts: { word_count: wordCount, max_words: 150 }
          }
        )
      );
    }
  });
  checks.appropriate_paragraph_length = {
    verdict: longParagraphs.length > 0 ? 'fail' : 'pass',
    confidence: 1.0,
    explanation: longParagraphs.length > 0
      ? `${longParagraphs.length} paragraph(s) exceed 150 words`
      : 'All paragraphs are 150 words or fewer',
    provenance: 'deterministic',
    highlights: longParagraphHighlights,
    long_paragraphs: longParagraphs
  };

  // NOTE: direct_answer_first_120 and answer_sentence_concise are SEMANTIC checks
  // They require AI to understand question-answer relationships and cannot be
  // reliably determined by code alone. Removed from deterministic engine.

  // Logical Heading Hierarchy - Check for skipped heading levels (e.g., H1 -> H3)
  const headingSequence = [];
  for (const block of blockMap) {
    if (isHeadingBlock(block)) {
      const level = getHeadingLevel(block);
      if (level) {
        headingSequence.push({
          level,
          block,
          text: getBlockText(block)
        });
      }
    }
  }

  const skippedLevels = [];
  const hierarchyHighlights = [];
  for (let i = 1; i < headingSequence.length; i++) {
    const prev = headingSequence[i - 1].level;
    const curr = headingSequence[i].level;
    // Skip is only problematic when going deeper (e.g., H2 -> H4 skips H3)
    if (curr > prev && curr - prev > 1) {
      skippedLevels.push({
        from: `H${prev}`,
        to: `H${curr}`,
        heading_text: headingSequence[i].text
      });
      hierarchyHighlights.push(
        buildHighlight(
          headingSequence[i].block,
          { start: 0, end: headingSequence[i].text.length },
          'medium',
          {
            message: buildDeterministicInstanceMessage(
              'logical_heading_hierarchy',
              { from_level: `H${prev}`, to_level: `H${curr}` },
              `${headingSequence[i].block.node_ref || ''}|H${prev}|H${curr}`
            ),
            facts: { from_level: `H${prev}`, to_level: `H${curr}` }
          }
        )
      );
    }
  }

  checks.logical_heading_hierarchy = {
    verdict: skippedLevels.length === 0 ? 'pass' : 'fail',
    confidence: 1.0,
    explanation: skippedLevels.length === 0
      ? 'Heading hierarchy is logical with no skipped levels'
      : `${skippedLevels.length} heading level skip(s) detected`,
    provenance: 'deterministic',
    highlights: hierarchyHighlights,
    skipped_levels: skippedLevels
  };

  if (isIntroFocusFactualityEnabled(options)) {
    const introData = buildIntroPreflight(manifest, {
      contentHtml: options?.contentHtml || contentHtml,
      blockMap,
      plainText: manifest?.plain_text || '',
      runMetadata: options?.runMetadata || {}
    });
    if (introData) {
      manifest.preflight_intro = introData.preflight;
    if (introData.wordcountCheck) {
      checks.intro_wordcount = introData.wordcountCheck;
    }
    if (introData.readabilityCheck) {
      checks.intro_readability = introData.readabilityCheck;
    }
    if (introData.firstSentenceTopicCheck) {
      checks.intro_first_sentence_topic = introData.firstSentenceTopicCheck;
    }
    if (introData.factualEntitiesCheck) {
      checks.intro_factual_entities = introData.factualEntitiesCheck;
    }
    if (introData.schemaSuggestionCheck) {
      checks.intro_schema_suggestion = introData.schemaSuggestionCheck;
    }
    if (introData.compositeCheck) {
      checks['intro_focus_and_factuality.v1'] = introData.compositeCheck;
    }
  }
}

  return checks;
}

function isIntroFocusFactualityEnabled(options) {
  return options?.enableIntroFocusFactuality === true;
}

function buildIntroPreflight(manifest, options = {}) {
  const contentHtml = typeof options.contentHtml === 'string' ? options.contentHtml : '';
  const blockMap = Array.isArray(options.blockMap) ? options.blockMap : [];
  const plainText = typeof options.plainText === 'string' ? options.plainText : '';
  const introBlocks = extractIntroBlocks(blockMap, 3);
  const htmlIntro = introBlocks ? null : extractIntroFromHtml(contentHtml, 3);
  const fallbackIntro = !introBlocks && !htmlIntro ? extractIntroFallback(plainText, 200) : null;
  const introText = introBlocks ? introBlocks.text : (htmlIntro ? htmlIntro.text : (fallbackIntro ? fallbackIntro.text : ''));
  if (!introText || !introText.trim()) {
    return null;
  }
  const introHasLink = detectIntroLinkPresence(contentHtml, 3);
  const firstSentence = extractFirstSentence(introText, 200);
  const wordCount = countWords(introText);
  const bucket = classifyIntroWordcount(wordCount);
  const wordcountScore = scoreWordcountBucket(bucket);
  const wordcountVerdict = scoreToVerdict(wordcountScore);
  const readability = calculateReadability(introText);
  const readabilityVerdict = scoreToVerdict(readability.score);
  const spans = detectFactualSpans(introText);
  const spansWithSupport = spans.map(span => ({
    ...span,
    has_supporting_link: introHasLink
  }));
  const unsupportedCount = introHasLink ? 0 : spansWithSupport.length;
  const hasSchema = !!manifest?.metadata?.has_jsonld;
  const contentType = typeof options?.runMetadata?.content_type === 'string'
    ? options.runMetadata.content_type
    : '';
  const introBounds = {
    start: 0,
    end: introText.length,
    source: introBlocks ? 'block_map' : (htmlIntro ? 'html_paragraphs' : 'plain_text'),
    block_count: introBlocks ? introBlocks.blocks.length : (htmlIntro ? htmlIntro.paragraphs.length : 0),
    fallback_applied: !!fallbackIntro
  };
  const highlights = introBlocks && introBlocks.blocks.length > 0
    ? [buildHighlight(introBlocks.blocks[0], { start: 0, end: getBlockText(introBlocks.blocks[0]).length }, 'low')]
    : [];
  const introTopicTerms = extractTopicTerms(String(manifest?.title || ''), 8);

  const wordcountCheck = {
    verdict: wordcountVerdict,
    confidence: 1.0,
    score: wordcountScore,
    explanation: `Intro contains ${wordCount} words (${bucket.replace(/_/g, ' ')})`,
    provenance: 'deterministic',
    highlights: [],
    word_count: wordCount,
    bucket
  };
  markNonInline(wordcountCheck, 'intro_wordcount_non_inline');

  const readabilityCheck = {
    verdict: readabilityVerdict,
    confidence: 1.0,
    score: readability.score,
    explanation: `Avg sentence length ${readability.avg_sentence_length.toFixed(1)}, passive voice ${readability.passive_voice_pct.toFixed(1)}%, Flesch ${readability.flesch_score.toFixed(1)}`,
    provenance: 'deterministic',
    highlights: [],
    avg_sentence_length: readability.avg_sentence_length,
    passive_voice_pct: readability.passive_voice_pct,
    flesch_score: readability.flesch_score
  };
  markNonInline(readabilityCheck, 'intro_readability_non_inline');

  const firstSentenceTopicCheck = buildIntroFirstSentenceTopicCheck({
    firstSentence,
    introBlocks,
    title: manifest?.title || '',
    introTopicTerms
  });

  const factualEntitiesCheck = buildIntroFactualEntitiesCheck({
    spansWithSupport,
    unsupportedCount,
    introBlocks,
    introHasLink
  });

  const schemaSuggestionCheck = buildIntroSchemaSuggestionCheck({
    hasSchema,
    hasFactualSpans: spansWithSupport.length > 0,
    contentType
  });

  const compositeCheck = buildIntroCompositeCheck({
    wordcountVerdict: wordcountCheck.verdict,
    readabilityVerdict: readabilityCheck.verdict,
    firstSentenceVerdict: firstSentenceTopicCheck.verdict,
    factualEntitiesVerdict: factualEntitiesCheck.verdict,
    schemaVerdict: schemaSuggestionCheck.verdict
  });

  return {
    preflight: {
      intro_bounds: introBounds,
      intro_text: introText,
      first_sentence: firstSentence,
      word_count: wordCount,
      word_bucket: bucket,
      readability: {
        avg_sentence_length: readability.avg_sentence_length,
        passive_voice_pct: readability.passive_voice_pct,
        flesch_score: readability.flesch_score
      },
      factual_spans: spansWithSupport,
      unsupported_factual_count: unsupportedCount,
      has_supporting_link: introHasLink,
      has_schema: hasSchema,
      topic_terms: introTopicTerms
    },
    wordcountCheck,
    readabilityCheck,
    firstSentenceTopicCheck,
    factualEntitiesCheck,
    schemaSuggestionCheck,
    compositeCheck,
    introHighlights: highlights
  };
}

const TOPIC_STOP_WORDS = new Set([
  'about', 'after', 'also', 'and', 'are', 'before', 'but', 'can', 'for', 'from',
  'has', 'have', 'how', 'into', 'its', 'more', 'not', 'our', 'that', 'the',
  'their', 'there', 'this', 'what', 'when', 'where', 'which', 'with', 'your'
]);

function extractTopicTerms(text, maxTerms = 8) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  const terms = text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ''))
    .filter((word) => word.length >= 4 && !TOPIC_STOP_WORDS.has(word));
  return Array.from(new Set(terms)).slice(0, maxTerms);
}

function mapIntroOffsetToBlockRange(introBlocks, start, end) {
  if (!introBlocks || !Array.isArray(introBlocks.blocks) || introBlocks.blocks.length === 0) {
    return null;
  }
  let cursor = 0;
  for (let index = 0; index < introBlocks.blocks.length; index += 1) {
    const block = introBlocks.blocks[index];
    const text = getBlockText(block);
    const blockStart = cursor;
    const blockEnd = blockStart + text.length;
    if (start >= blockStart && start < blockEnd) {
      const rangeStart = Math.max(0, start - blockStart);
      const rangeEnd = Math.max(rangeStart + 1, Math.min(text.length, end - blockStart));
      return { block, range: { start: rangeStart, end: rangeEnd } };
    }
    cursor = blockEnd + 1;
  }
  return null;
}

function buildIntroFirstSentenceTopicCheck({ firstSentence, introBlocks, title, introTopicTerms }) {
  const firstSentenceText = typeof firstSentence?.text === 'string' ? firstSentence.text.trim() : '';
  const sentenceWords = firstSentenceText.split(/\s+/).filter(Boolean);
  const sentenceTerms = extractTopicTerms(firstSentenceText, 12);
  const titleTerms = Array.isArray(introTopicTerms) && introTopicTerms.length
    ? introTopicTerms
    : extractTopicTerms(String(title || ''), 8);
  const overlap = sentenceTerms.filter((term) => titleTerms.includes(term));

  let verdict = 'fail';
  if (sentenceWords.length >= 6 && overlap.length >= 2) {
    verdict = 'pass';
  } else if (sentenceWords.length >= 6 && overlap.length >= 1) {
    verdict = 'partial';
  } else if (sentenceWords.length >= 10 && titleTerms.length === 0) {
    verdict = 'partial';
  }

  const highlights = [];
  if (introBlocks && Array.isArray(introBlocks.blocks) && introBlocks.blocks.length > 0 && firstSentenceText) {
    const firstBlock = introBlocks.blocks[0];
    const firstBlockText = getBlockText(firstBlock);
    if (firstBlockText) {
      const safeEnd = Math.min(firstBlockText.length, Math.max(1, Number(firstSentence?.end || firstSentenceText.length)));
      highlights.push(buildHighlight(firstBlock, { start: 0, end: safeEnd }, verdict === 'pass' ? 'low' : 'medium'));
    }
  }

  return {
    verdict,
    confidence: 1.0,
    explanation: overlap.length > 0
      ? `Intro first sentence aligns with title topic terms (${overlap.slice(0, 3).join(', ')})`
      : 'Intro first sentence does not clearly align with the title topic',
    provenance: 'deterministic',
    highlights,
    title_terms: titleTerms,
    sentence_terms: sentenceTerms,
    overlap_terms: overlap
  };
}

function buildIntroFactualEntitiesCheck({ spansWithSupport, unsupportedCount, introBlocks, introHasLink }) {
  const spans = Array.isArray(spansWithSupport) ? spansWithSupport : [];
  const unsupported = Math.max(0, Number(unsupportedCount || 0));
  let verdict = 'pass';
  if (spans.length === 0) {
    verdict = 'partial';
  } else if (unsupported > 0) {
    verdict = 'fail';
  }

  const highlights = [];
  if (spans.length > 0 && introBlocks && Array.isArray(introBlocks.blocks)) {
    spans.slice(0, 6).forEach((span) => {
      if (!span || typeof span.start !== 'number' || typeof span.end !== 'number') return;
      const mapped = mapIntroOffsetToBlockRange(introBlocks, span.start, span.end);
      if (!mapped) return;
      highlights.push(buildHighlight(mapped.block, mapped.range, span.has_supporting_link ? 'low' : 'high'));
    });
  }

  const check = {
    verdict,
    confidence: 1.0,
    explanation: spans.length === 0
      ? 'No factual entities detected in intro; add a concrete fact or source-backed statement.'
      : unsupported > 0
        ? `${unsupported} factual span(s) in intro are unsupported by links/citations.`
        : 'Factual intro entities are present and supported.',
    provenance: 'deterministic',
    highlights,
    factual_span_count: spans.length,
    unsupported_factual_count: unsupported,
    has_supporting_link: !!introHasLink
  };
  if (verdict !== 'pass' && highlights.length === 0) {
    markNonInline(check, 'absence_non_inline');
  }
  return check;
}

function buildIntroSchemaSuggestionCheck({ hasSchema, hasFactualSpans, contentType }) {
  const normalizedType = typeof contentType === 'string'
    ? contentType.toLowerCase().trim()
    : '';
  const recommendedSchemaType = hasSchema
    ? null
    : (normalizedType === 'faq'
      ? 'FAQPage'
      : ((normalizedType === 'howto' || normalizedType === 'how-to')
        ? 'HowTo'
        : (hasFactualSpans ? 'Article' : 'WebPage')));
  const recommendationBasis = hasSchema
    ? 'schema_already_present'
    : (normalizedType ? `content_type:${normalizedType}` : (hasFactualSpans ? 'intro_factual_spans' : 'generic_intro'));
  const check = {
    verdict: hasSchema ? 'pass' : 'partial',
    confidence: 1.0,
    explanation: hasSchema
      ? 'Structured data detected for intro context.'
      : `No structured data detected for intro context; consider adding ${recommendedSchemaType} schema.`,
    provenance: 'deterministic',
    highlights: [],
    has_schema: !!hasSchema,
    has_factual_spans: !!hasFactualSpans,
    details: {
      has_schema: !!hasSchema,
      has_factual_spans: !!hasFactualSpans,
      recommended_schema_type: recommendedSchemaType,
      recommendation_basis: recommendationBasis
    }
  };
  markNonInline(check, 'intro_schema_non_inline');
  return check;
}

function buildIntroCompositeCheck({ wordcountVerdict, readabilityVerdict, firstSentenceVerdict, factualEntitiesVerdict, schemaVerdict }) {
  const verdicts = [wordcountVerdict, readabilityVerdict, firstSentenceVerdict, factualEntitiesVerdict, schemaVerdict];
  const failCount = verdicts.filter((value) => value === 'fail').length;
  const partialCount = verdicts.filter((value) => value === 'partial').length;
  const verdict = failCount > 0 ? 'fail' : (partialCount > 0 ? 'partial' : 'pass');
  const introCompositeExplanation = verdict === 'pass'
    ? 'The intro is focused, supported by concrete facts, and structurally balanced for reliable answer extraction.'
    : (verdict === 'partial'
      ? 'The intro is directionally strong but still needs tighter focus, stronger factual support, or cleaner structure in the opening lines.'
      : 'The intro misses core quality signals for focus and factual grounding; tighten the opening claim and support it with concrete evidence.');
  const check = {
    verdict,
    confidence: 1.0,
    explanation: introCompositeExplanation,
    provenance: 'deterministic',
    highlights: [],
    components: {
      intro_wordcount: wordcountVerdict,
      intro_readability: readabilityVerdict,
      intro_first_sentence_topic: firstSentenceVerdict,
      intro_factual_entities: factualEntitiesVerdict,
      intro_schema_suggestion: schemaVerdict
    }
  };
  markNonInline(check, 'intro_composite_non_inline');
  return check;
}

function extractIntroBlocks(blockMap, maxParagraphs) {
  const paragraphs = (Array.isArray(blockMap) ? blockMap : []).filter(isParagraphBlock);
  const selected = paragraphs.slice(0, maxParagraphs);
  if (selected.length === 0) {
    return null;
  }
  const text = selected.map(block => getBlockText(block)).filter(Boolean).join(' ').trim();
  if (!text) {
    return null;
  }
  return {
    text,
    blocks: selected
  };
}

function extractIntroFromHtml(html, maxParagraphs) {
  if (!html) {
    return null;
  }
  const paragraphs = [];
  let current = '';
  let inParagraph = false;
  let currentHasLink = false;
  const parser = new htmlparser.Parser({
    onopentag(name) {
      if (name === 'p' && paragraphs.length < maxParagraphs) {
        inParagraph = true;
        current = '';
        currentHasLink = false;
        return;
      }
      if (inParagraph && name === 'a') {
        currentHasLink = true;
      }
    },
    ontext(text) {
      if (inParagraph) {
        current += text;
      }
    },
    onclosetag(name) {
      if (name === 'p' && inParagraph) {
        const cleaned = current.replace(/\s+/g, ' ').trim();
        if (cleaned) {
          paragraphs.push({
            text: cleaned,
            hasLink: currentHasLink
          });
        }
        inParagraph = false;
        current = '';
        currentHasLink = false;
      }
    }
  }, { decodeEntities: true });
  parser.write(html);
  parser.end();
  if (paragraphs.length === 0) {
    return null;
  }
  return {
    text: paragraphs.map(p => p.text).join(' ').trim(),
    paragraphs
  };
}

function extractIntroFallback(text, wordLimit) {
  if (!text) {
    return null;
  }
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }
  const slice = words.slice(0, wordLimit).join(' ');
  return {
    text: slice
  };
}

function detectIntroLinkPresence(html, maxParagraphs) {
  const intro = extractIntroFromHtml(html, maxParagraphs);
  if (!intro || !intro.paragraphs) {
    return false;
  }
  return intro.paragraphs.some(paragraph => paragraph.hasLink);
}

function extractFirstSentence(text, maxChars) {
  if (!text) {
    return { text: '', start: 0, end: 0 };
  }
  const trimmed = text.trim();
  const limit = Math.min(trimmed.length, maxChars);
  let end = limit;
  for (let i = 0; i < limit; i++) {
    const char = trimmed[i];
    if (char === '.' || char === '!' || char === '?' || char === '\n') {
      end = i + 1;
      break;
    }
  }
  return {
    text: trimmed.slice(0, end).trim(),
    start: 0,
    end
  };
}

function classifyIntroWordcount(wordCount) {
  if (wordCount < 10) {
    return 'too_short';
  }
  if (wordCount >= 40 && wordCount <= 60) {
    return 'snippet_optimal';
  }
  if (wordCount > 60 && wordCount <= 120) {
    return 'acceptable';
  }
  if (wordCount > 120) {
    return 'too_long';
  }
  return 'acceptable';
}

function scoreWordcountBucket(bucket) {
  switch (bucket) {
    case 'snippet_optimal':
      return 1;
    case 'acceptable':
      return 0.7;
    case 'too_long':
      return 0.3;
    case 'too_short':
      return 0.2;
    default:
      return 0.7;
  }
}

function calculateReadability(text) {
  const sentences = splitSentences(text);
  const wordList = tokenizeWords(text);
  const totalWords = wordList.length;
  const totalSentences = sentences.length || 1;
  const avgSentenceLength = totalWords / totalSentences;
  const passiveSentences = sentences.filter(sentence => isPassiveSentence(sentence)).length;
  const passiveVoicePct = totalSentences === 0 ? 0 : (passiveSentences / totalSentences) * 100;
  const syllables = wordList.reduce((sum, word) => sum + countSyllables(word), 0);
  const wordsPerSentence = totalWords / totalSentences;
  const syllablesPerWord = totalWords === 0 ? 0 : syllables / totalWords;
  const fleschScore = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  const scoreSentence = avgSentenceLength <= 22 ? 1 : avgSentenceLength <= 28 ? 0.7 : 0.4;
  const scorePassive = passiveVoicePct <= 20 ? 1 : passiveVoicePct <= 30 ? 0.7 : 0.4;
  const scoreFlesch = fleschScore >= 50 ? 1 : fleschScore >= 30 ? 0.7 : 0.4;
  const score = (scoreSentence + scorePassive + scoreFlesch) / 3;
  return {
    avg_sentence_length: Number.isFinite(avgSentenceLength) ? avgSentenceLength : 0,
    passive_voice_pct: Number.isFinite(passiveVoicePct) ? passiveVoicePct : 0,
    flesch_score: Number.isFinite(fleschScore) ? fleschScore : 0,
    score
  };
}

function splitSentences(text) {
  return text
    .split(/[\.\!\?\n\r]+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function tokenizeWords(text) {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.replace(/[^a-z0-9']/g, ''))
    .filter(Boolean);
}

function countSyllables(word) {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned) {
    return 0;
  }
  if (cleaned.length <= 3) {
    return 1;
  }
  const normalized = cleaned.replace(/e$/i, '');
  const matches = normalized.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function isPassiveSentence(sentence) {
  return /\b(am|is|are|was|were|be|been|being)\b\s+\w+ed\b/i.test(sentence);
}

function detectFactualSpans(text) {
  const spans = [];
  const addSpan = (match, type) => {
    if (!match || match.index === undefined) {
      return;
    }
    const start = match.index;
    const end = start + match[0].length;
    if (spans.some(span => !(end <= span.start || start >= span.end))) {
      return;
    }
    spans.push({
      text: match[0],
      start,
      end,
      type
    });
  };
  const patterns = [
    { regex: /\b(19|20)\d{2}\b/g, type: 'year' },
    { regex: /\b\d{1,3}(?:\.\d+)?\s?%\b/g, type: 'percentage' },
    { regex: /\b(?:according to|statistics|statistically|survey|research|study|report|data shows)\b/gi, type: 'stat_phrase' }
  ];
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      addSpan(match, pattern.type);
    }
  });
  const numberRegex = /\b\d{1,3}(?:[,\d]{3})*(?:\.\d+)?\b/g;
  let numberMatch;
  while ((numberMatch = numberRegex.exec(text)) !== null) {
    addSpan(numberMatch, 'number');
  }
  spans.sort((a, b) => a.start - b.start);
  return spans;
}

function scoreToVerdict(score) {
  if (score >= 0.9) {
    return 'pass';
  }
  if (score >= 0.7) {
    return 'partial';
  }
  return 'fail';
}

/**
 * Extracts links from HTML for validation
 */
function extractLinks(html, siteUrl) {
  const links = [];
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>/gi;
  let match;

  // Extract hostname from siteUrl if provided
  let hostname = '';
  if (siteUrl) {
    try {
      const url = new URL(siteUrl);
      hostname = url.hostname;
    } catch (e) {
      // Invalid URL, ignore
    }
  }

  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    links.push({
      url: url,
      internal: url.startsWith('/') || (hostname && url.includes(hostname)),
      start_offset: match.index,
      end_offset: match.index + match[0].length
    });
  }

  return links;
}

/**
 * Counts words in text
 */
function countWords(text) {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

function getBlockText(block) {
  if (!block || typeof block !== 'object') {
    return '';
  }
  if (typeof block.text === 'string') {
    return block.text;
  }
  if (typeof block.text_content === 'string') {
    return block.text_content;
  }
  if (typeof block.snippet === 'string') {
    return block.snippet;
  }
  return '';
}

function isHeadingBlock(block) {
  const blockType = typeof block?.block_type === 'string' ? block.block_type : '';
  if (!blockType) {
    return false;
  }
  if (blockType.includes('heading')) {
    return true;
  }
  return /\/h[1-6]$/i.test(blockType);
}

function isParagraphBlock(block) {
  const blockType = typeof block?.block_type === 'string' ? block.block_type : '';
  if (!blockType) {
    return false;
  }
  if (blockType.includes('paragraph')) {
    return true;
  }
  return /\/p$/i.test(blockType);
}

function getHeadingLevel(block) {
  const blockType = typeof block?.block_type === 'string' ? block.block_type : '';
  const metaLevel = Number(block?.meta?.heading_level);
  if (Number.isFinite(metaLevel) && metaLevel >= 1 && metaLevel <= 6) {
    return metaLevel;
  }
  const match = blockType.match(/\/h([1-6])$/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  if (blockType.includes('heading')) {
    return 2;
  }
  return null;
}

function collectHeadingSections(blockMap) {
  const blocks = Array.isArray(blockMap) ? blockMap : [];
  const sections = [];
  let current = null;
  for (const block of blocks) {
    if (!block) {
      continue;
    }
    if (isHeadingBlock(block)) {
      if (current) {
        sections.push(current);
      }
      const headingText = getBlockText(block);
      current = {
        block,
        nodeRef: block.node_ref || null,
        headingText,
        wordCount: 0,
        supportText: '',
        level: getHeadingLevel(block)
      };
      continue;
    }
    if (!current) {
      continue;
    }
    const text = getBlockText(block);
    if (text && text.trim()) {
      current.wordCount += countWords(text);
      current.supportText = `${current.supportText} ${text}`.replace(/\s+/g, ' ').trim();
    }
  }
  if (current) {
    sections.push(current);
  }
  return sections;
}

// NOTE: isQuestionText, resolveAnswerBlock, getFirstSentenceRange, getWordRange
// were removed as they were only used by semantic checks (direct_answer_first_120,
// answer_sentence_concise) that are now handled by AI instead of deterministic engine.

function buildHighlight(block, range, severity, options = {}) {
  const text = getBlockText(block);
  const safeStart = Math.max(0, Math.min(range.start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(range.end, text.length));
  const highlight = {
    node_ref: block.node_ref || null,
    signature: block.signature || null,
    start: safeStart,
    end: safeEnd,
    text: text.slice(safeStart, safeEnd),
    snippet: text.slice(safeStart, safeEnd), // Add snippet for overlay compatibility
    type: 'issue',
    severity
  };
  const message = typeof options?.message === 'string' ? options.message.trim() : '';
  if (message) {
    highlight.message = message;
  }
  if (options?.facts && typeof options.facts === 'object' && Object.keys(options.facts).length > 0) {
    highlight.facts = options.facts;
  }
  return highlight;
}

function markNonInline(check, reason) {
  if (!check || typeof check !== 'object') {
    return;
  }
  check.non_inline = true;
  if (reason) {
    check.non_inline_reason = reason;
  }
}

function extractTagTextContent(html, tagName) {
  if (!html || !tagName) {
    return [];
  }
  const results = [];
  const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'gi');
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = String(match[1] || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) {
      results.push(text);
    }
  }
  return results;
}

function buildMultipleH1Highlights(blockMap, contentHtml, h1Count) {
  const highlights = [];
  const headingBlocks = (Array.isArray(blockMap) ? blockMap : []).filter(isHeadingBlock);
  if (!headingBlocks.length) {
    return highlights;
  }

  const h1Texts = extractTagTextContent(contentHtml, 'h1');
  const usedNodeRefs = new Set();

  h1Texts.forEach((headingText) => {
    const match = findBlockByNeedles(headingBlocks, [headingText], { preferHeadingOnly: true });
    if (!match || usedNodeRefs.has(match.block.node_ref)) {
      return;
    }
    usedNodeRefs.add(match.block.node_ref);
    const facts = {
      heading_text: headingText,
      max_h1: 1
    };
    const message = buildDeterministicInstanceMessage(
      'single_h1',
      facts,
      `${match.block.node_ref || ''}|${headingText}`
    );
    highlights.push(buildHighlight(match.block, match.range, 'high', { message, facts }));
  });

  if (highlights.length > 0) {
    return highlights;
  }

  // Fallback when parsed H1 text cannot be mapped: flag top heading blocks up to detected H1 count.
  const fallbackBlocks = headingBlocks.slice(0, Math.max(0, Math.min(h1Count, headingBlocks.length)));
  fallbackBlocks.forEach((block) => {
    const text = getBlockText(block);
    if (!text) {
      return;
    }
    const facts = {
      heading_text: text,
      max_h1: 1
    };
    const message = buildDeterministicInstanceMessage(
      'single_h1',
      facts,
      `${block.node_ref || ''}|${text}`
    );
    highlights.push(buildHighlight(block, { start: 0, end: text.length }, 'high', { message, facts }));
  });
  return highlights;
}

function buildMissingAltHighlights(blockMap, accessibilityStats) {
  const highlights = [];
  const missingSources = Array.isArray(accessibilityStats?.missing_sources)
    ? accessibilityStats.missing_sources
    : [];
  const blocks = Array.isArray(blockMap) ? blockMap : [];
  const seen = new Set();

  missingSources.forEach((src) => {
    const srcValue = typeof src === 'string' ? src : '';
    if (!srcValue) {
      return;
    }
    const needles = buildUrlNeedles(srcValue);
    const match = findBlockByNeedles(blocks, needles);
    if (!match || seen.has(match.block.node_ref)) {
      return;
    }
    seen.add(match.block.node_ref);
    const facts = { image_src: srcValue };
    const message = buildDeterministicInstanceMessage(
      'accessibility_basics',
      facts,
      `${match.block.node_ref || ''}|${srcValue}`
    );
    highlights.push(buildHighlight(match.block, match.range, 'medium', { message, facts }));
  });

  return highlights;
}

function buildUrlNeedles(urlValue) {
  if (!urlValue || typeof urlValue !== 'string') {
    return [];
  }
  const needles = [urlValue];
  const cleaned = urlValue.replace(/[?#].*$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length) {
    needles.push(parts[parts.length - 1]);
  }
  const basename = parts.length ? parts[parts.length - 1] : '';
  const stem = basename.replace(/\.[a-z0-9]+$/i, '');
  if (stem && stem.length >= 3) {
    needles.push(stem.replace(/[-_]+/g, ' '));
    needles.push(stem);
  }
  return Array.from(new Set(needles.filter((item) => typeof item === 'string' && item.trim().length >= 3)));
}

function findTextRange(blockText, needle) {
  if (!blockText || !needle) {
    return null;
  }
  const lowerText = blockText.toLowerCase();
  const lowerNeedle = needle.toLowerCase().trim();
  if (!lowerNeedle) {
    return null;
  }
  let index = lowerText.indexOf(lowerNeedle);
  if (index >= 0) {
    return { start: index, end: index + lowerNeedle.length };
  }

  const words = lowerNeedle.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0];
    const last = words[words.length - 1];
    const firstIndex = lowerText.indexOf(first);
    if (firstIndex >= 0) {
      const lastIndex = lowerText.indexOf(last, firstIndex + first.length);
      if (lastIndex > firstIndex) {
        return { start: firstIndex, end: lastIndex + last.length };
      }
    }
  }
  return null;
}

function findBlockByNeedles(blocks, needles, options = {}) {
  const blockList = Array.isArray(blocks) ? blocks : [];
  const valueList = Array.isArray(needles) ? needles : [];
  const filteredNeedles = valueList
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length >= 3)
    .sort((a, b) => b.length - a.length);
  if (!filteredNeedles.length) {
    return null;
  }

  for (const needle of filteredNeedles) {
    for (const block of blockList) {
      if (!block) {
        continue;
      }
      if (options.preferHeadingOnly && !isHeadingBlock(block)) {
        continue;
      }
      const text = getBlockText(block);
      if (!text) {
        continue;
      }
      const range = findTextRange(text, needle);
      if (range) {
        return { block, range, needle };
      }
    }
  }
  return null;
}

function extractAnchorCandidatesFromHtml(html) {
  if (!html || typeof html !== 'string') {
    return [];
  }
  const anchors = [];
  const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRegex.exec(html)) !== null) {
    const href = String(match[1] || '').trim();
    const text = String(match[2] || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    anchors.push({
      href,
      text,
      path: normalizeLinkPath(href)
    });
  }
  return anchors;
}

function normalizeLinkPath(urlValue) {
  if (!urlValue || typeof urlValue !== 'string') {
    return '';
  }
  try {
    const parsed = new URL(urlValue, 'https://aivi.local');
    return parsed.pathname.replace(/\/+$/, '').toLowerCase();
  } catch (error) {
    return '';
  }
}

function getTitleTag(html) {
  if (!html) {
    return '';
  }
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : '';
}

function getMetaDescription(html) {
  if (!html) {
    return '';
  }
  const match = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  return match ? match[1].trim() : '';
}

function getCanonicalUrl(html) {
  if (!html) {
    return '';
  }
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  return match ? match[1].trim() : '';
}

function getHtmlLang(html) {
  if (!html) {
    return '';
  }
  const match = html.match(/<html[^>]+lang=["']([^"']+)["'][^>]*>/i);
  return match ? match[1].trim() : '';
}

function getMetaAuthor(html) {
  if (!html) {
    return '';
  }
  const match = html.match(/<meta[^>]+name=["']author["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  return match ? match[1].trim() : '';
}

function getImageAltStats(nodes) {
  const imageNodes = Array.isArray(nodes) ? nodes.filter(node => node && node.tag === 'img') : [];
  let missing = 0;
  let empty = 0; // Intentionally empty alt (decorative images)
  let hasAlt = 0;
  let missingDimensions = 0; // Missing width/height (CLS issue)
  const missingSources = [];
  const missingDimensionsSources = [];

  imageNodes.forEach(node => {
    const attrs = node.attributes || {};
    const alt = attrs.alt;
    const hasWidth = typeof attrs.width === 'string' || typeof attrs.width === 'number';
    const hasHeight = typeof attrs.height === 'string' || typeof attrs.height === 'number';

    // Check alt attribute
    if (alt === undefined || alt === null) {
      // Alt attribute completely missing
      missing += 1;
      if (attrs.src) {
        missingSources.push(attrs.src);
      }
    } else if (typeof alt === 'string' && alt.trim() === '') {
      // Empty alt - decorative image (valid but noted)
      empty += 1;
    } else {
      hasAlt += 1;
    }

    // Check dimensions (helps prevent CLS)
    if (!hasWidth || !hasHeight) {
      missingDimensions += 1;
      if (attrs.src && missingDimensionsSources.length < 5) {
        missingDimensionsSources.push(attrs.src);
      }
    }
  });

  return {
    total: imageNodes.length,
    missing,
    empty_alt: empty,
    has_alt: hasAlt,
    missing_dimensions: missingDimensions,
    missing_sources: missingSources.slice(0, 10),
    missing_dimensions_sources: missingDimensionsSources
  };
}

function findAuthorMatch(blockMap) {
  const regexes = [
    /^\s*by\s+[A-Z][\w\s.'-]{2,}/i,
    /\bwritten by\s+[A-Z][\w\s.'-]{2,}/i,
    /\bauthor:\s*[A-Z][\w\s.'-]{2,}/i,
    /\bposted by\s+[A-Z][\w\s.'-]{2,}/i,
    /\bpublished by\s+[A-Z][\w\s.'-]{2,}/i,
    /\bcontributed by\s+[A-Z][\w\s.'-]{2,}/i,
    /\bcreated by\s+[A-Z][\w\s.'-]{2,}/i,
    /\breported by\s+[A-Z][\w\s.'-]{2,}/i,
    /\breviewed by\s+[A-Z][\w\s.'-]{2,}/i,
    /\bedited by\s+[A-Z][\w\s.'-]{2,}/i
  ];
  return findBlockMatch(blockMap, regexes, 'byline');
}

function findAuthorBio(blockMap) {
  const regexes = [
    /\bauthor bio\b/i,
    /\babout the author\b/i,
    /\bbiography\b/i,
    /\bbiographical\b/i
  ];
  const match = findBlockMatch(blockMap, regexes, 'bio');
  if (!match) {
    return null;
  }
  const wordCount = countWords(getBlockText(match.block));
  if (wordCount < 50) {
    return null;
  }
  return {
    ...match,
    wordCount
  };
}

function hasAuthorBioMarker(html) {
  if (!html) {
    return false;
  }
  return /\bauthor-bio\b|\bbio\b|\bbiography\b/i.test(html);
}

function findBlockMatch(blockMap, regexes, source) {
  const blocks = Array.isArray(blockMap) ? blockMap : [];
  for (let i = 0; i < blocks.length; i++) {
    const text = getBlockText(blocks[i]);
    if (!text) {
      continue;
    }
    for (let j = 0; j < regexes.length; j++) {
      const range = findTextMatchRange(text, regexes[j]);
      if (range) {
        return {
          block: blocks[i],
          range,
          source
        };
      }
    }
  }
  return null;
}

function findTextMatchRange(text, regex) {
  if (!text) {
    return null;
  }
  const match = text.match(regex);
  if (!match || match.index === undefined) {
    return null;
  }
  const start = match.index;
  const end = start + match[0].length;
  if (end <= start) {
    return null;
  }
  return {
    start,
    end,
    text: text.slice(start, end)
  };
}

function getSemanticTags(nodes) {
  const tags = new Set();
  // HTML5 semantic elements that improve document structure and accessibility
  const semanticElements = [
    'article', 'section', 'nav', 'main', 'header', 'footer',
    'aside', 'figure', 'figcaption', 'details', 'summary',
    'mark', 'time', 'address'
  ];
  (Array.isArray(nodes) ? nodes : []).forEach(node => {
    if (!node || !node.tag) {
      return;
    }
    const tag = node.tag.toLowerCase();
    if (semanticElements.includes(tag)) {
      tags.add(tag);
    }
  });
  return Array.from(tags);
}

function normalizeJsonldObjects(jsonldEntries) {
  const entries = Array.isArray(jsonldEntries) ? jsonldEntries : [];
  const items = [];
  entries.forEach(entry => {
    const content = entry?.content;
    if (!content) {
      return;
    }
    if (Array.isArray(content)) {
      content.forEach(obj => {
        if (obj && typeof obj === 'object') items.push(obj);
      });
      return;
    }
    if (content['@graph'] && Array.isArray(content['@graph'])) {
      content['@graph'].forEach(obj => {
        if (obj && typeof obj === 'object') items.push(obj);
      });
      return;
    }
    if (typeof content === 'object') {
      items.push(content);
    }
  });
  return items;
}

function extractSchemaTypes(obj) {
  if (!obj) {
    return [];
  }
  const type = obj['@type'];
  if (!type) {
    return [];
  }
  if (Array.isArray(type)) {
    return type.filter(value => typeof value === 'string');
  }
  if (typeof type === 'string') {
    return [type];
  }
  return [];
}

function hasField(obj, field) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  if (field.includes('.')) {
    const parts = field.split('.');
    let cursor = obj;
    for (let i = 0; i < parts.length; i++) {
      if (!cursor || typeof cursor !== 'object') {
        return false;
      }
      const value = cursor[parts[i]];
      if (Array.isArray(value)) {
        cursor = value[0];
      } else {
        cursor = value;
      }
    }
    return cursor !== undefined && cursor !== null;
  }
  return obj[field] !== undefined && obj[field] !== null;
}

function validateSupportedSchemaTypes(jsonldEntries) {
  const supportedRequirements = {
    Article: ['headline', 'author', 'datePublished'],
    BlogPosting: ['headline', 'author', 'datePublished'],
    NewsArticle: ['headline', 'author', 'datePublished'],
    WebPage: ['name', 'description'],
    FAQPage: ['mainEntity'],
    HowTo: ['step'],
    Product: ['name', 'offers'],
    Organization: ['name', 'url'],
    Person: ['name']
  };
  const jsonldObjects = normalizeJsonldObjects(jsonldEntries);
  const results = [];
  jsonldObjects.forEach(obj => {
    const types = extractSchemaTypes(obj);
    types.forEach(type => {
      if (!supportedRequirements[type]) {
        return;
      }
      const required = supportedRequirements[type];
      const missing = required.filter(field => !hasField(obj, field));
      results.push({
        type,
        required,
        missing
      });
    });
  });
  if (results.length === 0) {
    return {
      verdict: 'pass',
      explanation: 'No supported schema types detected; completeness check passed by scope',
      details: {
        supported_types_found: 0
      }
    };
  }
  const total = results.length;
  const complete = results.filter(item => item.missing.length === 0).length;
  const verdict = complete === total ? 'pass' : complete > 0 ? 'partial' : 'fail';
  return {
    verdict,
    explanation: verdict === 'pass' ? 'All required fields present for supported schema types' :
      verdict === 'partial' ? 'Some supported schema types are missing required fields' :
        'Required fields missing for supported schema types',
    details: {
      supported_types_found: total,
      supported_types_complete: complete,
      missing_fields: results.filter(item => item.missing.length > 0)
    }
  };
}

function evaluateSchemaMatchesContent(jsonldEntries, runMetadata) {
  const contentType = typeof runMetadata?.content_type === 'string' ? runMetadata.content_type.toLowerCase() : '';
  const expectedByContentType = {
    article: ['Article', 'BlogPosting', 'NewsArticle', 'WebPage'],
    post: ['Article', 'BlogPosting', 'NewsArticle', 'WebPage'],
    howto: ['HowTo'],
    'how-to': ['HowTo'],
    product: ['Product'],
    faq: ['FAQPage'],
    organization: ['Organization'],
    person: ['Person']
  };
  const expected = expectedByContentType[contentType] || null;
  const jsonldObjects = normalizeJsonldObjects(jsonldEntries);
  const types = jsonldObjects.flatMap(obj => extractSchemaTypes(obj));
  const uniqueTypes = Array.from(new Set(types));
  if (!expected || expected.length === 0) {
    return {
      verdict: 'partial',
      explanation: 'Content type not available for schema match evaluation',
      details: {
        content_type: contentType || null
      }
    };
  }
  if (uniqueTypes.length === 0) {
    return {
      verdict: 'partial',
      explanation: 'No schema types available for comparison',
      details: {
        content_type: contentType
      }
    };
  }
  const matches = uniqueTypes.filter(type => expected.includes(type));
  return {
    verdict: matches.length > 0 ? 'pass' : 'fail',
    explanation: matches.length > 0 ? 'Schema type matches content type' : 'Schema type does not match content type',
    details: {
      content_type: contentType,
      expected_types: expected,
      detected_types: uniqueTypes
    }
  };
}

const STRICT_QUESTION_PREFIX_PATTERNS = [
  /^(what|why|when|where|who|which)\s+(is|are|was|were|does|do|did|can|could|should|would|will|has|have|had)\b/i,
  /^how\s+(is|are|does|do|can|could|should|would|will)\b/i,
  /^(is|are|was|were|does|do|did|can|could|should|would|will|has|have|had)\b/i
];

const NON_QUESTION_TOPIC_PATTERNS = [
  /^how to\b/i,
  /^step\s+\d+\b/i,
  /^overview\b/i,
  /^introduction\b/i
];

function normalizeQuestionHeadingText(text) {
  return typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim()
    : '';
}

function isQuestionHeading(text) {
  const normalized = normalizeQuestionHeadingText(text);
  if (!normalized || normalized.length < 5) {
    return false;
  }
  if (NON_QUESTION_TOPIC_PATTERNS.some(pattern => pattern.test(normalized))) {
    return false;
  }
  if (normalized.endsWith('?')) {
    return true;
  }
  return STRICT_QUESTION_PREFIX_PATTERNS.some(pattern => pattern.test(normalized));
}

function isStepHeading(text) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) {
    return false;
  }
  return /^step\s*\d+/i.test(normalized) || /^how to\b/i.test(normalized);
}

function countQuestionHeadingsFromNodes(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  return list.filter(node => {
    const tag = typeof node?.tag === 'string' ? node.tag.toLowerCase() : '';
    if (!['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      return false;
    }
    return isQuestionHeading(node.text);
  }).length;
}

function countListItemsFromNodes(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  return list.filter(node => {
    const tag = typeof node?.tag === 'string' ? node.tag.toLowerCase() : '';
    return tag === 'li' && typeof node.text === 'string' && node.text.trim().length > 0;
  }).length;
}

function extractOrderedListItemsFromBlocks(blockMap) {
  const blocks = Array.isArray(blockMap) ? blockMap : [];
  const items = [];
  const seen = new Set();
  blocks.forEach(block => {
    const blockType = typeof block?.block_type === 'string' ? block.block_type.toLowerCase() : '';
    if (!blockType.includes('list') && !blockType.endsWith('/ol') && !blockType.endsWith('/ul')) {
      return;
    }
    const text = getBlockText(block);
    if (!text) {
      return;
    }
    const candidates = text.split(/\n+/).map(item => item.trim()).filter(Boolean);
    candidates.forEach((candidate) => {
      const cleaned = candidate.replace(/^([-*•]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim();
      if (!cleaned || countWords(cleaned) < 2) {
        return;
      }
      const key = cleaned.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      items.push(cleaned);
    });
  });
  return items;
}

function countOrderedListItemsFromBlocks(blockMap) {
  return extractOrderedListItemsFromBlocks(blockMap).length;
}

function extractFaqPairsFromSections(blockMap, maxPairs = 8) {
  const sections = collectHeadingSections(blockMap);
  const pairs = [];
  const seen = new Set();
  for (const section of sections) {
    const question = normalizeQuestionHeadingText(section?.headingText || '');
    if (!isQuestionHeading(question)) {
      continue;
    }
    const answer = typeof section?.supportText === 'string'
      ? section.supportText.replace(/\s+/g, ' ').trim()
      : '';
    if (!answer || countWords(answer) < 6) {
      continue;
    }
    const key = question.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    pairs.push({
      question,
      answer: answer.slice(0, 800),
      heading_node_ref: section?.nodeRef || null,
      source: 'heading_section'
    });
    if (pairs.length >= maxPairs) {
      break;
    }
  }
  return pairs;
}

function extractHowtoStepsFromBlocks(blockMap, maxSteps = 12) {
  const sections = collectHeadingSections(blockMap);
  const steps = [];
  const seen = new Set();

  sections.forEach((section) => {
    const heading = normalizeQuestionHeadingText(section?.headingText || '');
    if (!isStepHeading(heading)) {
      return;
    }
    const support = typeof section?.supportText === 'string'
      ? section.supportText.replace(/\s+/g, ' ').trim()
      : '';
    const firstSentence = support.split(/(?<=[.!?])\s+/).map(item => item.trim()).filter(Boolean)[0] || '';
    const fallback = heading.replace(/^step\s*\d+[:.)-]?\s*/i, '').trim();
    const text = (firstSentence || fallback || heading).replace(/\s+/g, ' ').trim();
    if (!text || countWords(text) < 2) {
      return;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    steps.push({
      text: text.slice(0, 320),
      source: 'step_heading',
      heading_node_ref: section?.nodeRef || null
    });
  });

  extractOrderedListItemsFromBlocks(blockMap).forEach((item) => {
    const text = item.replace(/\s+/g, ' ').trim();
    if (!text) {
      return;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    steps.push({
      text: text.slice(0, 320),
      source: 'ordered_list',
      heading_node_ref: null
    });
  });

  return steps.slice(0, maxSteps);
}

function detectFaqNeed(blockMap, nodes) {
  const sections = collectHeadingSections(blockMap);
  const sectionCount = sections.filter(section => isQuestionHeading(section.headingText) && section.wordCount >= 10).length;
  const nodeCount = countQuestionHeadingsFromNodes(nodes);
  const count = Math.max(sectionCount, nodeCount);
  const source = sectionCount >= nodeCount ? 'headings' : 'html';
  return {
    needed: count >= 2,
    count,
    source
  };
}

function detectHowtoNeed(blockMap, nodes) {
  const sections = collectHeadingSections(blockMap);
  const stepHeadingCount = sections.filter(section => isStepHeading(section.headingText)).length;
  const blockListCount = countOrderedListItemsFromBlocks(blockMap);
  const nodeListCount = countListItemsFromNodes(nodes);
  const listCount = Math.max(blockListCount, nodeListCount);
  return {
    needed: stepHeadingCount >= 2 || listCount >= 2,
    step_heading_count: stepHeadingCount,
    list_item_count: listCount
  };
}

function extractSchemaObjectsByType(jsonldEntries, typeName) {
  const jsonldObjects = normalizeJsonldObjects(jsonldEntries);
  return jsonldObjects.filter(obj => extractSchemaTypes(obj).includes(typeName));
}

function getFaqQuestionCount(mainEntity) {
  if (!mainEntity) {
    return 0;
  }
  const entities = Array.isArray(mainEntity) ? mainEntity : [mainEntity];
  return entities.filter(item => {
    const types = extractSchemaTypes(item);
    const isQuestion = types.includes('Question') || (!types.length && hasField(item, 'acceptedAnswer'));
    return isQuestion && hasField(item, 'acceptedAnswer');
  }).length;
}

function evaluateFaqSchemaRequirement(blockMap, nodes, jsonldEntries) {
  const detection = detectFaqNeed(blockMap, nodes);
  const detectedPairs = extractFaqPairsFromSections(blockMap, 8);
  if (!detection.needed) {
    return {
      verdict: 'pass',
      explanation: 'No FAQ-style content detected; FAQ schema requirement not triggered',
      details: {
        faq_pairs_detected: detection.count,
        detection_source: detection.source,
        detected_pairs: detectedPairs
      }
    };
  }
  const faqSchemas = extractSchemaObjectsByType(jsonldEntries, 'FAQPage');
  if (faqSchemas.length === 0) {
    return {
      verdict: 'fail',
      explanation: 'FAQ-style content detected but no FAQPage schema found',
      details: {
        faq_pairs_detected: detection.count,
        faq_schema_found: 0,
        detection_source: detection.source,
        detected_pairs: detectedPairs
      }
    };
  }
  let completeCount = 0;
  let questionCount = 0;
  faqSchemas.forEach(schema => {
    const count = getFaqQuestionCount(schema.mainEntity);
    questionCount += count;
    if (count >= 2) {
      completeCount += 1;
    }
  });
  const verdict = completeCount === faqSchemas.length ? 'pass' : completeCount > 0 ? 'partial' : 'fail';
  return {
    verdict,
    explanation: verdict === 'pass' ? 'FAQPage schema contains required question-answer pairs' :
      verdict === 'partial' ? 'Some FAQPage schemas are missing required question-answer pairs' :
        'FAQPage schema is missing required question-answer pairs',
    details: {
      faq_pairs_detected: detection.count,
      faq_schema_found: faqSchemas.length,
      faq_schema_complete: completeCount,
      faq_questions_detected: questionCount,
      detection_source: detection.source,
      detected_pairs: detectedPairs
    }
  };
}

function getHowToStepCount(schema) {
  const steps = schema?.step || schema?.steps;
  if (Array.isArray(steps)) {
    return steps.length;
  }
  if (typeof steps === 'string' && steps.trim().length > 0) {
    return 1;
  }
  if (steps && typeof steps === 'object') {
    return 1;
  }
  return 0;
}

function evaluateHowtoSchemaRequirement(blockMap, nodes, jsonldEntries) {
  const detection = detectHowtoNeed(blockMap, nodes);
  const detectedSteps = extractHowtoStepsFromBlocks(blockMap, 12);
  if (!detection.needed) {
    return {
      verdict: 'pass',
      explanation: 'No HowTo-style content detected; HowTo schema requirement not triggered',
      details: {
        step_heading_count: detection.step_heading_count,
        list_item_count: detection.list_item_count,
        detected_steps: detectedSteps
      }
    };
  }
  const howtoSchemas = extractSchemaObjectsByType(jsonldEntries, 'HowTo');
  if (howtoSchemas.length === 0) {
    return {
      verdict: 'fail',
      explanation: 'HowTo-style content detected but no HowTo schema found',
      details: {
        step_heading_count: detection.step_heading_count,
        list_item_count: detection.list_item_count,
        howto_schema_found: 0,
        detected_steps: detectedSteps
      }
    };
  }
  let completeCount = 0;
  let stepCount = 0;
  howtoSchemas.forEach(schema => {
    const hasName = hasField(schema, 'name');
    const steps = getHowToStepCount(schema);
    stepCount += steps;
    if (hasName && steps >= 2) {
      completeCount += 1;
    }
  });
  const verdict = completeCount === howtoSchemas.length ? 'pass' : completeCount > 0 ? 'partial' : 'fail';
  return {
    verdict,
    explanation: verdict === 'pass' ? 'HowTo schema includes name and step details' :
      verdict === 'partial' ? 'Some HowTo schemas are missing name or step details' :
        'HowTo schema is missing name or step details',
    details: {
      step_heading_count: detection.step_heading_count,
      list_item_count: detection.list_item_count,
      howto_schema_found: howtoSchemas.length,
      howto_schema_complete: completeCount,
      howto_steps_detected: stepCount,
      detected_steps: detectedSteps
    }
  };
}

function evaluateContentFreshness(contentHtml, runMetadata, blockMap = []) {
  const candidateDates = [];
  const metadataDate = runMetadata?.post_modified || runMetadata?.post_date || runMetadata?.published_at || runMetadata?.updated_at;
  if (metadataDate) {
    const parsed = new Date(metadataDate);
    if (!isNaN(parsed.getTime())) {
      candidateDates.push({
        date: parsed,
        source: 'metadata',
        raw: String(metadataDate)
      });
    }
  }
  const htmlDates = extractDatesFromHtml(contentHtml);
  htmlDates.forEach(date => candidateDates.push(date));
  if (candidateDates.length === 0) {
    return {
      verdict: 'pass',
      explanation: 'No publish date detected; freshness check not applicable',
      details: {
        date_found: null
      }
    };
  }
  candidateDates.sort((a, b) => b.date.getTime() - a.date.getTime());
  const latestDate = candidateDates[0];
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - latestDate.date.getTime()) / (1000 * 60 * 60 * 24));
  const verdict = diffDays <= 365 ? 'pass' : 'fail';
  const dateAnchor = findDateAnchorInBlocks(blockMap, latestDate);
  return {
    verdict,
    explanation: verdict === 'pass' ? `Content updated ${diffDays} days ago` : `Content last updated ${diffDays} days ago`,
    highlight: dateAnchor ? { block: dateAnchor.block, range: dateAnchor.range } : null,
    non_inline_reason: verdict !== 'pass' && !dateAnchor ? 'date_anchor_unavailable' : undefined,
    details: {
      date_found: latestDate.date.toISOString(),
      days_since_update: diffDays,
      date_source: latestDate.source || null
    }
  };
}

function extractDatesFromHtml(html) {
  const dates = [];
  if (!html) {
    return dates;
  }
  const timeMatches = html.match(/<time[^>]*datetime=["']([^"']+)["'][^>]*>/gi) || [];
  timeMatches.forEach(match => {
    const datetimeMatch = match.match(/datetime=["']([^"']+)["']/i);
    if (datetimeMatch && datetimeMatch[1]) {
      const parsed = new Date(datetimeMatch[1]);
      if (!isNaN(parsed.getTime())) {
        dates.push({
          date: parsed,
          source: 'html_time',
          raw: datetimeMatch[1]
        });
      }
    }
  });
  const isoMatches = html.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  isoMatches.forEach(match => {
    const parsed = new Date(match);
    if (!isNaN(parsed.getTime())) {
      dates.push({
        date: parsed,
        source: 'html_iso',
        raw: match
      });
    }
  });
  const monthMatches = html.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/gi) || [];
  monthMatches.forEach(match => {
    const parsed = new Date(match);
    if (!isNaN(parsed.getTime())) {
      dates.push({
        date: parsed,
        source: 'html_text',
        raw: match
      });
    }
  });
  return dates;
}

function findDateAnchorInBlocks(blockMap, dateCandidate) {
  if (!dateCandidate || !(dateCandidate.date instanceof Date)) {
    return null;
  }
  const date = dateCandidate.date;
  const raw = typeof dateCandidate.raw === 'string' ? dateCandidate.raw.trim() : '';
  const iso = date.toISOString().slice(0, 10);
  const longDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const shortDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const year = String(date.getUTCFullYear());
  const needles = [raw, raw.split('T')[0], iso, longDate, shortDate, year];
  return findBlockByNeedles(blockMap, needles);
}

function evaluateInternalLinks(manifest, options, blockMap = [], contentHtml = '') {
  const links = Array.isArray(manifest?.links) ? manifest.links : [];
  const internalLinks = links.filter(link => link && link.internal === true);
  if (internalLinks.length === 0) {
    return {
      verdict: 'pass',
      explanation: 'No internal links detected',
      details: {
        internal_link_count: 0,
        broken_links: []
      }
    };
  }
  const linksWithStatus = internalLinks.filter(link => typeof link.status === 'number' || typeof link.status_code === 'number');
  if (linksWithStatus.length === 0 || options?.enableWebLookups === false) {
    return {
      verdict: 'partial',
      explanation: 'Internal link status not available for deterministic verification',
      non_inline_reason: 'link_status_unavailable',
      highlights: [],
      details: {
        internal_link_count: internalLinks.length,
        broken_links: []
      }
    };
  }
  const brokenLinks = linksWithStatus.filter(link => {
    const status = typeof link.status === 'number' ? link.status : link.status_code;
    return status >= 400;
  });
  const anchorCandidates = extractAnchorCandidatesFromHtml(contentHtml);
  const brokenHighlights = [];
  const seenNodeRefs = new Set();
  brokenLinks.forEach((link) => {
    const linkUrl = typeof link?.url === 'string' ? link.url : '';
    const linkStatus = typeof link?.status === 'number' ? link.status : link?.status_code;
    const linkPath = normalizeLinkPath(linkUrl);
    const anchorCandidate = anchorCandidates.find((candidate) => {
      if (!candidate) return false;
      if (candidate.href === linkUrl) return true;
      if (candidate.path && linkPath) return candidate.path === linkPath;
      return false;
    });
    const needles = [];
    if (anchorCandidate?.text) needles.push(anchorCandidate.text);
    needles.push(...buildUrlNeedles(linkUrl));
    const match = findBlockByNeedles(blockMap, needles);
    if (!match || seenNodeRefs.has(match.block.node_ref)) {
      return;
    }
    seenNodeRefs.add(match.block.node_ref);
    const facts = {
      url: linkUrl,
      status_code: Number.isFinite(linkStatus) ? linkStatus : ''
    };
    const message = buildDeterministicInstanceMessage(
      'no_broken_internal_links',
      facts,
      `${match.block.node_ref || ''}|${linkUrl}|${facts.status_code}`
    );
    brokenHighlights.push(buildHighlight(match.block, match.range, 'medium', { message, facts }));
  });
  const verdict = brokenLinks.length === 0 ? 'pass' : brokenLinks.length === linksWithStatus.length ? 'fail' : 'partial';
  return {
    verdict,
    explanation: brokenLinks.length === 0 ? 'No broken internal links detected' :
      `${brokenLinks.length} broken internal link(s) detected`,
    highlights: brokenHighlights,
    non_inline_reason: brokenLinks.length > 0 && brokenHighlights.length === 0
      ? 'broken_link_anchor_unavailable'
      : undefined,
    details: {
      internal_link_count: internalLinks.length,
      broken_links: brokenLinks.map(link => link.url).slice(0, 10)
    }
  };
}

/**
 * Finds the node at a specific offset
 */
function findNodeAtOffset(nodes, offset) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.start_offset <= offset && node.end_offset >= offset) {
      return parseInt(node.id.substring(1));
    }
  }
  return -1;
}

module.exports = {
  preflightHandler,
  createManifest,
  estimateTokens,
  performDeterministicChecks
};
