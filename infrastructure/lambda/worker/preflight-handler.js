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
    heading_topic_fulfillment: 'This heading does not fulfill its topical promise clearly.',
    heading_fragmentation: 'This heading hands off to another heading before the section is framed.',
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
function hasUsablePreflightStructure(manifest) {
  const structure = manifest?.preflight_structure;
  if (!structure || typeof structure !== 'object') {
    return false;
  }
  return Array.isArray(structure.visible_itemlist_sections)
    && Array.isArray(structure.pseudo_list_sections)
    && Array.isArray(structure.question_sections)
    && Array.isArray(structure.faq_candidate_sections)
    && Array.isArray(structure.procedural_sections)
    && Array.isArray(structure.heading_like_sections)
    && structure.faq_signals
    && typeof structure.faq_signals === 'object'
    && structure.howto_summary
    && typeof structure.howto_summary === 'object';
}

function ensureManifestPreflightStructure(manifest, runMetadata = {}, options = {}) {
  if (!manifest || typeof manifest !== 'object') {
    return null;
  }
  if (hasUsablePreflightStructure(manifest)) {
    return manifest.preflight_structure;
  }
  const nodes = Array.isArray(manifest?.nodes) ? manifest.nodes : [];
  const blockMap = Array.isArray(manifest?.block_map) ? manifest.block_map : [];
  const contentHtml = typeof options?.contentHtml === 'string'
    ? options.contentHtml
    : (typeof manifest?.content_html === 'string' ? manifest.content_html : '');
  const structureInventory = buildStructuralSectionInventory(
    blockMap,
    nodes,
    runMetadata,
    manifest?.title || '',
    contentHtml
  );
  manifest.preflight_structure = structureInventory;
  return structureInventory;
}

async function performDeterministicChecks(manifest, runMetadata = {}, options = {}) {
  const checks = {};
  const metadata = manifest && manifest.metadata ? manifest.metadata : {};
  const jsonld = Array.isArray(manifest?.jsonld) ? manifest.jsonld : [];
  const nodes = Array.isArray(manifest?.nodes) ? manifest.nodes : [];
  const blockMap = Array.isArray(manifest?.block_map) ? manifest.block_map : [];
  const contentHtml = typeof manifest?.content_html === 'string' ? manifest.content_html : '';
  const bodyH1Count = Number.isFinite(metadata.h1_count) ? metadata.h1_count : 0;
  const hasVisibleTitleSurface = typeof manifest?.title === 'string' && manifest.title.trim().length > 0;
  const effectiveH1Count = bodyH1Count > 0 ? bodyH1Count : (hasVisibleTitleSurface ? 1 : 0);
  const h2Count = Number.isFinite(metadata.h2_count) ? metadata.h2_count : 0;
  const hasJsonld = !!metadata.has_jsonld;
  const multiH1Highlights = bodyH1Count > 1
    ? buildMultipleH1Highlights(blockMap, contentHtml, bodyH1Count)
    : [];
  const structureInventory = ensureManifestPreflightStructure(manifest, runMetadata, {
    contentHtml
  });

  // H1 count check
  checks.single_h1 = {
    verdict: effectiveH1Count === 1 ? 'pass' :
      effectiveH1Count === 0 ? 'fail' : 'partial',
    confidence: 1.0,
    explanation: bodyH1Count === 1 ?
      'Content has exactly one H1 tag' :
      bodyH1Count === 0 && hasVisibleTitleSurface ?
        'Visible article title provides the single H1 surface for this page' :
        effectiveH1Count === 0 ?
          'No H1 tag or visible article title found' :
          `Found ${bodyH1Count} H1 tags, expected exactly one`,
    provenance: 'deterministic',
    highlights: multiH1Highlights,
    details: {
      h1_count: bodyH1Count,
      effective_h1_count: effectiveH1Count,
      title_surface_used: bodyH1Count === 0 && hasVisibleTitleSurface
    }
  };
  if (checks.single_h1.verdict !== 'pass' && checks.single_h1.highlights.length === 0) {
    markNonInline(checks.single_h1, effectiveH1Count === 0 ? 'missing_required_h1' : 'multiple_h1_anchor_unavailable');
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
  if (jsonld.length === 0) {
    markScoreNeutral(checks.valid_jsonld_schema, 'jsonld_absent');
  }
  if (checks.valid_jsonld_schema.verdict !== 'pass' && checks.valid_jsonld_schema.highlights.length === 0) {
    markNonInline(checks.valid_jsonld_schema, 'jsonld_document_scope');
  }

  const metaDescription = getMetaDescription(contentHtml) || (typeof manifest?.meta_description === 'string' ? manifest.meta_description : '');
  const canonicalUrl = getCanonicalUrl(contentHtml) || (typeof manifest?.canonical_url === 'string' ? manifest.canonical_url : '');
  const htmlLang = getHtmlLang(contentHtml) || (typeof manifest?.lang === 'string' ? manifest.lang : '');
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

  const canonicalCheck = evaluateCanonicalClarity(canonicalUrl, runMetadata, manifest);
  checks.canonical_clarity = {
    verdict: canonicalCheck.verdict,
    confidence: 1.0,
    explanation: canonicalCheck.explanation,
    provenance: 'deterministic',
    highlights: [],
    details: canonicalCheck.details
  };
  if (checks.canonical_clarity.verdict !== 'pass') {
    markNonInline(checks.canonical_clarity, 'canonical_document_scope');
  }

  const crawlerCheck = evaluateAiCrawlerAccessibility(contentHtml);
  checks.ai_crawler_accessibility = {
    verdict: crawlerCheck.verdict,
    confidence: 1.0,
    explanation: crawlerCheck.explanation,
    provenance: 'deterministic',
    highlights: [],
    details: crawlerCheck.details
  };
  if (checks.ai_crawler_accessibility.verdict !== 'pass') {
    markNonInline(checks.ai_crawler_accessibility, 'crawler_accessibility_non_inline');
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
  if (accessibilityStats.total === 0) {
    markScoreNeutral(checks.accessibility_basics, 'no_images_detected');
  }
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

  const headingMarkupCheck = evaluateHeadingLikeTextUsesHeadingMarkup(structureInventory, blockMap);
  checks.heading_like_text_uses_heading_markup = {
    verdict: headingMarkupCheck.verdict,
    confidence: 1.0,
    explanation: headingMarkupCheck.explanation,
    provenance: 'deterministic',
    highlights: Array.isArray(headingMarkupCheck.highlights) ? headingMarkupCheck.highlights : [],
    details: headingMarkupCheck.details
  };
  if (checks.heading_like_text_uses_heading_markup.verdict !== 'pass'
    && checks.heading_like_text_uses_heading_markup.highlights.length === 0) {
    markNonInline(checks.heading_like_text_uses_heading_markup, 'heading_like_markup_non_inline');
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
  if (schemaTypeValidation.details?.score_neutral === true) {
    markScoreNeutral(
      checks.supported_schema_types_validation,
      schemaTypeValidation.details?.score_neutral_reason || 'schema_scope_not_triggered'
    );
  }
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
  if (schemaMatch.details?.score_neutral === true) {
    markScoreNeutral(
      checks.schema_matches_content,
      schemaMatch.details?.score_neutral_reason || 'schema_match_scope_not_triggered'
    );
  }
  if (checks.schema_matches_content.verdict !== 'pass') {
    markNonInline(checks.schema_matches_content, 'schema_content_alignment_non_inline');
  }

  const itemListSchemaCheck = evaluateItemListSchemaRequirement(blockMap, jsonld, runMetadata, manifest?.title || '', structureInventory);
  checks.itemlist_jsonld_presence_and_completeness = {
    verdict: itemListSchemaCheck.verdict,
    confidence: 1.0,
    explanation: itemListSchemaCheck.explanation,
    provenance: 'deterministic',
    highlights: [],
    details: itemListSchemaCheck.details
  };
  if (itemListSchemaCheck.details?.score_neutral === true) {
    markScoreNeutral(
      checks.itemlist_jsonld_presence_and_completeness,
      itemListSchemaCheck.details?.score_neutral_reason || 'itemlist_intent_not_detected'
    );
  }
  if (checks.itemlist_jsonld_presence_and_completeness.verdict !== 'pass') {
    markNonInline(checks.itemlist_jsonld_presence_and_completeness, 'itemlist_schema_non_inline');
  }

  const articleSchemaCheck = evaluateArticleSchemaPresenceAndCompleteness(jsonld, runMetadata, canonicalUrl, blockMap);
  checks.article_jsonld_presence_and_completeness = {
    verdict: articleSchemaCheck.verdict,
    confidence: 1.0,
    explanation: articleSchemaCheck.explanation,
    provenance: 'deterministic',
    highlights: [],
    details: articleSchemaCheck.details
  };
  if (articleSchemaCheck.details?.score_neutral === true) {
    markScoreNeutral(
      checks.article_jsonld_presence_and_completeness,
      articleSchemaCheck.details?.score_neutral_reason || 'article_schema_not_applicable'
    );
  }
  if (checks.article_jsonld_presence_and_completeness.verdict !== 'pass') {
    markNonInline(checks.article_jsonld_presence_and_completeness, 'article_schema_non_inline');
  }

  const faqSchemaCheck = evaluateFaqSchemaRequirement(blockMap, nodes, jsonld, runMetadata, manifest?.title || '', structureInventory);
  checks.faq_jsonld_presence_and_completeness = {
    verdict: faqSchemaCheck.verdict,
    confidence: 1.0,
    explanation: faqSchemaCheck.explanation,
    provenance: 'deterministic',
    highlights: [],
    details: cloneCheckDetails(faqSchemaCheck.details),
    diagnostic_only: true
  };
  markScoreNeutral(checks.faq_jsonld_presence_and_completeness, 'schema_bridge_internal');
  markNonInline(checks.faq_jsonld_presence_and_completeness, 'faq_schema_non_inline');

  checks.faq_jsonld_generation_suggestion = buildFaqJsonldGenerationSuggestionCheck(faqSchemaCheck);
  if (faqSchemaCheck.details?.score_neutral === true) {
    markScoreNeutral(
      checks.faq_jsonld_generation_suggestion,
      faqSchemaCheck.details?.score_neutral_reason || 'faq_scope_not_triggered'
    );
  }
  if (checks.faq_jsonld_generation_suggestion.verdict !== 'pass') {
    markNonInline(checks.faq_jsonld_generation_suggestion, 'faq_jsonld_generation_non_inline');
  }

  const howtoSchemaCheck = evaluateHowtoSchemaRequirement(blockMap, nodes, jsonld, runMetadata, manifest?.title || '', contentHtml, structureInventory);
  checks.howto_jsonld_presence_and_completeness = {
    verdict: howtoSchemaCheck.verdict,
    confidence: 1.0,
    explanation: howtoSchemaCheck.explanation,
    provenance: 'deterministic',
    highlights: [],
    details: cloneCheckDetails(howtoSchemaCheck.details),
    diagnostic_only: true
  };
  markScoreNeutral(checks.howto_jsonld_presence_and_completeness, 'schema_bridge_internal');
  markNonInline(checks.howto_jsonld_presence_and_completeness, 'howto_schema_non_inline');

  checks.howto_schema_presence_and_completeness = buildHowtoSchemaPresenceBridgeCheck(howtoSchemaCheck);
  if (howtoSchemaCheck.details?.score_neutral === true) {
    markScoreNeutral(
      checks.howto_schema_presence_and_completeness,
      howtoSchemaCheck.details?.score_neutral_reason || 'howto_scope_not_triggered'
    );
  }
  if (checks.howto_schema_presence_and_completeness.verdict !== 'pass') {
    markNonInline(checks.howto_schema_presence_and_completeness, 'howto_schema_non_inline');
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
  if (updateCheck.details?.score_neutral === true) {
    markScoreNeutral(
      checks.content_updated_12_months,
      updateCheck.details?.score_neutral_reason || 'freshness_scope_not_triggered'
    );
  }
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
  if (linkCheck.details?.score_neutral === true) {
    markScoreNeutral(
      checks.no_broken_internal_links,
      linkCheck.details?.score_neutral_reason || 'internal_links_scope_not_triggered'
    );
  }
  if (checks.no_broken_internal_links.verdict !== 'pass' && checks.no_broken_internal_links.highlights.length === 0) {
    markNonInline(checks.no_broken_internal_links, linkCheck.non_inline_reason || 'broken_link_anchor_unavailable');
  }

  const h2Sections = collectTopLevelHeadingSections(blockMap, 2);
  const topLevelSplitSections = h2Sections.filter((section) => Number(section.introSupportBlockCount || 0) === 0);
  const nestedH2Sections = h2Sections.filter((section) => Number(section.descendantHeadingCount || 0) > 0);
  const topLevelSplitRatio = h2Sections.length > 0 ? (topLevelSplitSections.length / h2Sections.length) : 0;
  const isFragmented = h2Sections.length > 6 && topLevelSplitSections.length >= Math.max(3, Math.ceil(h2Sections.length * 0.4));
  const headingFragmentHighlights = isFragmented
    ? topLevelSplitSections.map((section) => {
      const headingText = section.headingText;
      if (!headingText) return null;
      const facts = {
        heading_text: headingText,
        h2_section_count: h2Sections.length,
        intro_support_blocks: Number(section.introSupportBlockCount || 0),
        descendant_heading_count: Number(section.descendantHeadingCount || 0)
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
      ? `The outline splits into ${h2Sections.length} top-level H2 sections, and ${topLevelSplitSections.length} of them hand off immediately without framing content before the next heading.`
      : `Heading structure avoids a flat over-split outline (${h2Sections.length} H2 sections, ${nestedH2Sections.length} with nested subheadings and framing content).`,
    provenance: 'deterministic',
    highlights: headingFragmentHighlights,
    details: {
      h2_section_count: h2Sections.length,
      top_level_split_section_count: topLevelSplitSections.length,
      nested_h2_section_count: nestedH2Sections.length,
      top_level_split_ratio: Number(topLevelSplitRatio.toFixed(4)),
      top_level_split_sections: topLevelSplitSections.map((section) => ({
        node_ref: section.nodeRef,
        heading_text: section.headingText,
        intro_support_block_count: section.introSupportBlockCount || 0,
        content_block_count: section.contentBlockCount || 0,
        descendant_heading_count: section.descendantHeadingCount || 0
      })),
      hierarchy_aware: true
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

  // NOTE: immediate_answer_placement and answer_sentence_concise are SEMANTIC checks
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
    if (introData.schemaSuggestionCheck) {
      checks.intro_schema_suggestion = introData.schemaSuggestionCheck;
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
  const introBlocks = extractIntroBlocks(blockMap);
  const htmlIntro = extractIntroFromHtml(contentHtml);
  const useBlockIntro = !!(introBlocks && (introBlocks.boundary_found || introBlocks.text || introBlocks.blocks.length > 0));
  const useHtmlIntro = !useBlockIntro && !!(htmlIntro && (htmlIntro.boundary_found || htmlIntro.text));
  const fallbackIntro = !useBlockIntro && !useHtmlIntro ? extractIntroFallback(plainText, 200) : null;
  const introText = useBlockIntro
    ? introBlocks.text
    : (useHtmlIntro
      ? htmlIntro.text
      : (fallbackIntro ? fallbackIntro.text : ''));
  if ((!introText || !introText.trim()) && !(useBlockIntro && introBlocks.boundary_found) && !(useHtmlIntro && htmlIntro.boundary_found)) {
    return null;
  }
  const introHasLink = useHtmlIntro
    ? !!htmlIntro.has_link
    : !!(htmlIntro && htmlIntro.has_link);
  const firstSentence = extractFirstSentence(introText, 200);
  const wordCount = countWords(introText);
  const bucket = classifyIntroWordcount(wordCount);
  const wordcountScore = scoreWordcountBucket(bucket);
  const wordcountVerdict = scoreToVerdict(wordcountScore);
  const readability = calculateReadability(introText);
  const readabilityVerdict = scoreToVerdict(readability.score);
  const spans = detectFactualSpans(introText);
  const spansWithSupport = applyIntroLinkLocality(spans, htmlIntro);
  const unsupportedCount = spansWithSupport.filter((span) => !span.has_supporting_link).length;
  const supportedCount = spansWithSupport.length - unsupportedCount;
  const hasSchema = !!manifest?.metadata?.has_jsonld;
  const contentType = typeof options?.runMetadata?.content_type === 'string'
    ? options.runMetadata.content_type
    : '';
  const introBounds = {
    start: 0,
    end: introText.length,
    source: useBlockIntro ? 'block_boundary' : (useHtmlIntro ? 'html_boundary' : 'plain_text'),
    block_count: useBlockIntro ? introBlocks.blocks.length : 0,
    boundary_found: useBlockIntro
      ? !!introBlocks.boundary_found
      : !!(useHtmlIntro && htmlIntro.boundary_found),
    boundary_heading_level: useBlockIntro
      ? introBlocks.boundary_heading_level
      : (useHtmlIntro ? htmlIntro.boundary_heading_level : null),
    fallback_applied: !!fallbackIntro
  };
  const highlights = useBlockIntro && introBlocks.blocks.length > 0
    ? [buildHighlight(introBlocks.blocks[0], { start: 0, end: getBlockText(introBlocks.blocks[0]).length }, 'low')]
    : [];
  const introTopicTerms = extractTopicTerms(String(manifest?.title || ''), 8);

  const wordcountExplanation = bucket === 'snippet_optimal'
    ? 'The opening gives the topic enough room to become clear without dragging into unnecessary setup.'
    : bucket === 'acceptable'
      ? (wordCount < 40
        ? 'The opening is a little thin for a full intro. Add one more concrete sentence so the topic and its stakes are clear before the first section begins.'
        : 'The opening is still workable, but it is starting to overstay its role. Trim setup or repetition so the main point lands sooner.')
      : bucket === 'too_short'
        ? 'The opening is too thin to establish the topic with confidence. Add one more concrete sentence so the intro carries both the main idea and a supporting detail.'
        : 'The opening runs too long before it settles on the main point. Trim setup and repetition so the intro reaches the topic faster.';

  const wordcountCheck = {
    verdict: wordcountVerdict,
    confidence: 1.0,
    score: wordcountScore,
    explanation: wordcountExplanation,
    provenance: 'deterministic',
    highlights: [],
    word_count: wordCount,
    bucket
  };
  markNonInline(wordcountCheck, 'intro_wordcount_non_inline');

  const readabilityExplanation = readabilityVerdict === 'pass'
    ? 'The opening reads cleanly and should be easy for both readers and retrieval systems to parse.'
    : 'The opening is harder to scan than it needs to be. Shorter sentences and a cleaner sentence structure would make the main point easier to grasp quickly.';

  const readabilityCheck = {
    verdict: readabilityVerdict,
    confidence: 1.0,
    score: readability.score,
    explanation: readabilityExplanation,
    provenance: 'deterministic',
    highlights: [],
    avg_sentence_length: readability.avg_sentence_length,
    passive_voice_pct: readability.passive_voice_pct,
    flesch_score: readability.flesch_score
  };
  markNonInline(readabilityCheck, 'intro_readability_non_inline');

  const schemaSuggestionCheck = buildIntroSchemaSuggestionCheck({
    hasSchema,
    hasFactualSpans: spansWithSupport.length > 0,
    contentType
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
      supported_factual_count: supportedCount,
      has_supporting_link: introHasLink,
      support_strategy: 'paragraph_link_locality',
      has_schema: hasSchema,
      topic_terms: introTopicTerms
    },
    wordcountCheck,
    readabilityCheck,
    schemaSuggestionCheck,
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

function applyIntroLinkLocality(spans, htmlIntro) {
  const introSpans = Array.isArray(spans) ? spans : [];
  const paragraphs = Array.isArray(htmlIntro?.paragraphs) ? htmlIntro.paragraphs : [];
  return introSpans.map((span) => {
    const paragraph = paragraphs.find((entry) => (
      typeof entry?.start === 'number'
      && typeof entry?.end === 'number'
      && span.start >= entry.start
      && span.start < entry.end
    ));
    return {
      ...span,
      has_supporting_link: !!paragraph?.has_link
    };
  });
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
      ? 'Structured data is already present for the intro intent.'
      : `No structured data is present for the intro. Consider adding ${recommendedSchemaType} only if it matches the visible opening content exactly.`,
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

function extractIntroBlocks(blockMap) {
  const blocks = Array.isArray(blockMap) ? blockMap : [];
  if (blocks.length === 0) {
    return null;
  }
  const selected = [];
  let boundaryHeadingLevel = null;
  for (const block of blocks) {
    if (!block) {
      continue;
    }
    if (isHeadingBlock(block)) {
      const level = getHeadingLevel(block);
      if (Number.isFinite(level) && level >= 2) {
        boundaryHeadingLevel = level;
        break;
      }
    }
    selected.push(block);
  }
  const text = selected.map(block => getBlockText(block)).filter(Boolean).join(' ').trim();
  return {
    text,
    blocks: selected,
    boundary_found: boundaryHeadingLevel !== null,
    boundary_heading_level: boundaryHeadingLevel
  };
}

function extractIntroFromHtml(html) {
  if (!html) {
    return null;
  }
  let text = '';
  let hasLink = false;
  let boundaryHeadingLevel = null;
  let boundaryFound = false;
  let currentParagraph = null;
  const paragraphs = [];
  const parser = new htmlparser.Parser({
    onopentag(name) {
      const normalized = String(name || '').toLowerCase();
      const headingMatch = normalized.match(/^h([2-6])$/);
      if (headingMatch && !boundaryFound) {
        boundaryHeadingLevel = parseInt(headingMatch[1], 10);
        boundaryFound = true;
        return;
      }
      if (!boundaryFound && normalized === 'a') {
        hasLink = true;
        if (currentParagraph) {
          currentParagraph.has_link = true;
        }
      }
      if (!boundaryFound && normalized === 'p') {
        currentParagraph = {
          start: text.length,
          end: text.length,
          has_link: false
        };
      }
    },
    ontext(chunk) {
      if (!boundaryFound) {
        const normalized = String(chunk || '').replace(/\s+/g, ' ').trim();
        if (!normalized) {
          return;
        }
        if (text) {
          text += ' ';
        }
        const start = text.length;
        text += normalized;
        if (currentParagraph) {
          if (currentParagraph.start > start) {
            currentParagraph.start = start;
          }
          currentParagraph.end = text.length;
        }
      }
    },
    onclosetag(name) {
      const normalized = String(name || '').toLowerCase();
      if (!boundaryFound && normalized === 'p' && currentParagraph) {
        if (currentParagraph.end > currentParagraph.start) {
          paragraphs.push(currentParagraph);
        }
        currentParagraph = null;
      }
    }
  }, { decodeEntities: true });
  parser.write(html);
  parser.end();
  const cleaned = text.trim();
  if (!cleaned && !boundaryFound) {
    return null;
  }
  return {
    text: cleaned,
    has_link: hasLink,
    paragraphs,
    boundary_found: boundaryFound,
    boundary_heading_level: boundaryHeadingLevel
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
  if (wordCount < 20) {
    return 'too_short';
  }
  if (wordCount >= 40 && wordCount <= 150) {
    return 'snippet_optimal';
  }
  if ((wordCount >= 20 && wordCount < 40) || (wordCount > 150 && wordCount <= 200)) {
    return 'acceptable';
  }
  if (wordCount > 200) {
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
  if (typeof block?.meta?.image_label === 'string') {
    return block.meta.image_label;
  }
  if (typeof block?.meta?.image_caption === 'string' && block.meta.image_caption.trim()) {
    return block.meta.image_caption;
  }
  if (typeof block?.meta?.image_alt === 'string' && block.meta.image_alt.trim()) {
    return block.meta.image_alt;
  }
  if (typeof block?.meta?.image_src === 'string') {
    return block.meta.image_src;
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

function isListBlock(block) {
  const blockType = typeof block?.block_type === 'string' ? block.block_type.toLowerCase() : '';
  if (!blockType) {
    return false;
  }
  return blockType.includes('/list') || /\/(ol|ul)$/i.test(blockType);
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

function resolveFirstContentNodeRef(blockMap) {
  const blocks = Array.isArray(blockMap) ? blockMap : [];
  for (const block of blocks) {
    if (typeof block?.node_ref === 'string' && block.node_ref.trim()) {
      return block.node_ref.trim();
    }
  }
  return null;
}

function collectVisibleSections(blockMap, fallbackHeading = '') {
  const blocks = Array.isArray(blockMap) ? blockMap : [];
  const sections = [];
  let current = null;

  const flushCurrent = () => {
    if (!current) {
      return;
    }
    const hasSupport = Array.isArray(current.supportBlocks) && current.supportBlocks.length > 0;
    const keepSection = current.isPseudoHeading === true
      ? hasSupport
      : (hasSupport || current.headingText);
    if (keepSection) {
      sections.push(current);
    }
    current = null;
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block) {
      continue;
    }
    const nextBlock = blocks[index + 1] || null;
    if (isHeadingBlock(block)) {
      flushCurrent();
      current = {
        block,
        nodeRef: block.node_ref || null,
        headingText: getBlockText(block),
        supportBlocks: [],
        supportText: '',
        level: getHeadingLevel(block)
      };
      continue;
    }
    if (isHeadingLikeParagraphBlock(block, nextBlock)) {
      flushCurrent();
      current = {
        block,
        nodeRef: block.node_ref || null,
        headingText: getBlockText(block),
        supportBlocks: [],
        supportText: '',
        level: null,
        isPseudoHeading: true
      };
      continue;
    }
    if (!current) {
      current = {
        block: null,
        nodeRef: block.node_ref || null,
        headingText: fallbackHeading || '',
        supportBlocks: [],
        supportText: '',
        level: null
      };
    }
    current.supportBlocks.push(block);
    const text = getBlockText(block);
    if (text && text.trim()) {
      current.supportText = `${current.supportText} ${text}`.replace(/\s+/g, ' ').trim();
    }
  }

  flushCurrent();
  return sections;
}

function collectTopLevelHeadingSections(blockMap, targetLevel = 2) {
  const blocks = Array.isArray(blockMap) ? blockMap : [];
  const sections = [];
  let current = null;

  const flushCurrent = () => {
    if (!current) {
      return;
    }
    sections.push(current);
    current = null;
  };

  for (const block of blocks) {
    if (!block) {
      continue;
    }
    if (isHeadingBlock(block)) {
      const level = getHeadingLevel(block);
      const headingText = getBlockText(block);
      if (level === targetLevel) {
        flushCurrent();
        current = {
          block,
          nodeRef: block.node_ref || null,
          headingText,
          wordCount: 0,
          supportText: '',
          level,
          descendantHeadingCount: 0,
          introSupportBlockCount: 0,
          contentBlockCount: 0,
          seenDescendantHeading: false
        };
        continue;
      }
      if (!current) {
        continue;
      }
      if (Number.isFinite(level) && level < targetLevel) {
        flushCurrent();
        continue;
      }
      if (Number.isFinite(level) && level > targetLevel) {
        if (headingText) {
          current.descendantHeadingCount += 1;
        }
        current.seenDescendantHeading = true;
        continue;
      }
      continue;
    }
    if (!current) {
      continue;
    }
    const text = getBlockText(block);
    if (text && text.trim()) {
      current.wordCount += countWords(text);
      current.supportText = `${current.supportText} ${text}`.replace(/\s+/g, ' ').trim();
      current.contentBlockCount += 1;
      if (!current.seenDescendantHeading) {
        current.introSupportBlockCount += 1;
      }
    }
  }

  flushCurrent();
  return sections;
}

// NOTE: isQuestionText, resolveAnswerBlock, getFirstSentenceRange, getWordRange
// were removed as they were only used by semantic checks (immediate_answer_placement,
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

function markScoreNeutral(check, reason) {
  if (!check || typeof check !== 'object') {
    return;
  }
  check.score_neutral = true;
  if (reason) {
    check.score_neutral_reason = reason;
  }
  if (!check.details || typeof check.details !== 'object') {
    check.details = {};
  }
  check.details.score_neutral = true;
  check.details.scope_triggered = false;
  if (reason && !check.details.score_neutral_reason) {
    check.details.score_neutral_reason = reason;
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
    const match = findImageBlockBySource(blocks, srcValue) || findBlockByNeedles(blocks, needles);
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

function normalizeImageSourceCandidate(value) {
  return String(value || '')
    .trim()
    .replace(/[?#].*$/, '')
    .toLowerCase();
}

function findImageBlockBySource(blocks, srcValue) {
  const targetNormalized = normalizeImageSourceCandidate(srcValue);
  const targetNeedles = buildUrlNeedles(srcValue).map((value) => value.toLowerCase());
  if (!targetNormalized && !targetNeedles.length) {
    return null;
  }

  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block !== 'object') {
      continue;
    }
    const meta = block.meta && typeof block.meta === 'object' ? block.meta : {};
    const sourceCandidates = [];
    if (typeof meta.image_src === 'string' && meta.image_src.trim()) {
      sourceCandidates.push(meta.image_src);
    }
    if (Array.isArray(meta.image_sources)) {
      meta.image_sources.forEach((candidate) => {
        if (typeof candidate === 'string' && candidate.trim()) {
          sourceCandidates.push(candidate);
        }
      });
    }
    if (!sourceCandidates.length) {
      continue;
    }

    const matched = sourceCandidates.some((candidate) => {
      const candidateNormalized = normalizeImageSourceCandidate(candidate);
      if (candidateNormalized && targetNormalized && candidateNormalized === targetNormalized) {
        return true;
      }
      const candidateNeedles = buildUrlNeedles(candidate).map((value) => value.toLowerCase());
      return targetNeedles.some((needle) => candidateNeedles.includes(needle));
    });
    if (!matched) {
      continue;
    }

    const text = getBlockText(block) || 'Image';
    return {
      block,
      range: {
        start: 0,
        end: Math.max(1, text.length)
      }
    };
  }

  return null;
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

function normalizeHostCandidate(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }
  const candidate = value.trim();
  try {
    return new URL(candidate).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (error) {
    try {
      return new URL(`https://${candidate}`).hostname.replace(/^www\./i, '').toLowerCase();
    } catch (secondaryError) {
      return '';
    }
  }
}

function getRobotsDirectives(html) {
  if (!html) {
    return [];
  }
  const directives = [];
  const metaMatches = html.match(/<meta[^>]+(?:name|property)=["'](?:robots|googlebot|bingbot)["'][^>]*content=["']([^"']+)["'][^>]*>/gi) || [];
  metaMatches.forEach((match) => {
    const contentMatch = match.match(/content=["']([^"']+)["']/i);
    if (!contentMatch || !contentMatch[1]) {
      return;
    }
    String(contentMatch[1]).split(',').forEach((directive) => {
      const normalized = directive.trim().toLowerCase();
      if (normalized) {
        directives.push(normalized);
      }
    });
  });
  return Array.from(new Set(directives));
}

function hasDataNoSnippet(html) {
  return typeof html === 'string' && /data-nosnippet\b/i.test(html);
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
        supported_types_found: 0,
        score_neutral: true,
        score_neutral_reason: 'supported_schema_types_absent',
        scope_triggered: false
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
  const companionTypes = new Set(['FAQPage', 'HowTo', 'BreadcrumbList', 'ItemList', 'VideoObject', 'ImageObject']);
  const expected = expectedByContentType[contentType] || null;
  const jsonldObjects = normalizeJsonldObjects(jsonldEntries);
  const types = jsonldObjects.flatMap(obj => extractSchemaTypes(obj));
  const uniqueTypes = Array.from(new Set(types));
  if (!expected || expected.length === 0) {
    return {
      verdict: 'partial',
      explanation: 'Content type not available for schema match evaluation',
      details: {
        content_type: contentType || null,
        score_neutral: true,
        score_neutral_reason: 'content_type_unavailable',
        scope_triggered: false
      }
    };
  }
  if (uniqueTypes.length === 0) {
    return {
      verdict: 'partial',
      explanation: 'No schema types available for comparison',
      details: {
        content_type: contentType,
        score_neutral: true,
        score_neutral_reason: 'schema_types_absent',
        scope_triggered: false
      }
    };
  }
  const matches = uniqueTypes.filter(type => expected.includes(type));
  const hasOnlyCompanionTypes = matches.length === 0
    && uniqueTypes.length > 0
    && uniqueTypes.every((type) => companionTypes.has(type));
  if (hasOnlyCompanionTypes) {
    return {
      verdict: 'partial',
      explanation: 'Only companion schema types were found; add a primary schema that matches the content.',
      details: {
        content_type: contentType,
        expected_types: expected,
        detected_types: uniqueTypes,
        score_neutral: true,
        score_neutral_reason: 'schema_companion_only',
        scope_triggered: true
      }
    };
  }
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

const FAQ_EXCLUDED_CONTENT_TYPES = new Set([
  'news',
  'newsarticle',
  'editorial',
  'opinion',
  'essay',
  'story',
  'profile',
  'review',
  'commentary'
]);

const FAQ_TITLE_PATTERNS = [
  /\bfaq\b/i,
  /\bfrequently asked questions\b/i,
  /\bcommon questions\b/i,
  /\bquestions answered\b/i
];

const HOWTO_TITLE_PATTERNS = [
  /^how to\b/i,
  /\bstep-by-step\b/i,
  /\btutorial\b/i,
  /\bwalkthrough\b/i
];

const ITEMLIST_HEADING_PATTERNS = [
  /\b(top|best|examples?|tools?|resources?|reasons?|benefits?|mistakes?|alternatives?|types?|ways|ideas|signals|factors|patterns|metrics|options|checklists?)\b/i
];

const PSEUDO_HEADING_EXCLUDED_PATTERNS = [
  /^meta\s+(title|description)\b/i,
  /^(author|byline|published|updated)\b\s*:/i,
  /^(slug|excerpt|focus keyword)\b/i
];

const TITLE_CASE_HEADING_CONNECTORS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'vs',
  '&'
]);

const ARTICLE_LIKE_CONTENT_TYPES = new Set([
  'article',
  'post',
  'news',
  'newsarticle',
  'blog',
  'blogposting'
]);

const PRIMARY_ARTICLE_SCHEMA_TYPES = new Set(['Article', 'BlogPosting', 'NewsArticle']);

const PROCEDURAL_SUPPORT_PATTERNS = [
  /\bfollow these steps\b/i,
  /\bstep-by-step\b/i,
  /(?:^|[.!?]\s+)first\b[\s,:-]/i,
  /(?:^|[.!?]\s+)next\b[\s,:-]/i,
  /(?:^|[.!?]\s+)then\b[\s,:-]/i,
  /(?:^|[.!?]\s+)finally\b[\s,:-]/i
];

const BULLET_GLYPH_PATTERN_SOURCE = '\\u00B7\\u2022\\u2023\\u25E6\\u2043\\u2219';
const BULLET_GLYPH_ENTRY_REGEX = new RegExp(`^[${BULLET_GLYPH_PATTERN_SOURCE}]\\s+`);

function normalizeIntentContentType(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function titleMatchesAnyPattern(title, patterns) {
  const normalized = typeof title === 'string' ? title.trim() : '';
  return Boolean(normalized) && patterns.some((pattern) => pattern.test(normalized));
}

function countProceduralSupportBlocks(blockMap) {
  const blocks = Array.isArray(blockMap) ? blockMap : [];
  return blocks.reduce((count, block) => {
    const text = getBlockText(block);
    if (!text || !isParagraphBlock(block)) {
      return count;
    }
    return PROCEDURAL_SUPPORT_PATTERNS.some((pattern) => pattern.test(text)) ? count + 1 : count;
  }, 0);
}

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

function isShortTitleCaseHeadingLabel(text) {
  const normalized = normalizeQuestionHeadingText(text).replace(/[:?]+$/, '').trim();
  if (!normalized) {
    return false;
  }
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 7) {
    return false;
  }

  let significantCount = 0;
  let titleCaseCount = 0;
  words.forEach((word) => {
    const cleaned = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (!cleaned) {
      return;
    }
    const lower = cleaned.toLowerCase();
    if (TITLE_CASE_HEADING_CONNECTORS.has(lower)) {
      return;
    }
    significantCount += 1;
    if (/^[A-Z0-9]/.test(cleaned)) {
      titleCaseCount += 1;
    }
  });

  if (significantCount < 2) {
    return false;
  }
  return titleCaseCount >= Math.max(2, significantCount - 1);
}

function isHeadingLikeParagraphBlock(block, nextBlock = null) {
  if (!isParagraphBlock(block)) {
    return false;
  }
  if (!nextBlock || isHeadingBlock(nextBlock)) {
    return false;
  }

  const text = normalizeQuestionHeadingText(getBlockText(block));
  if (!text || text.length > 120) {
    return false;
  }
  if (PSEUDO_HEADING_EXCLUDED_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }
  if (parseBulletGlyphEntry(text) || extractInlineBulletEntries(text).length >= 2) {
    return false;
  }

  const wordCount = countWords(text);
  if (wordCount < 2 || wordCount > 14) {
    return false;
  }
  if (/[.!]$/.test(text) && !text.endsWith('?') && !text.endsWith(':')) {
    return false;
  }

  const labelText = text.replace(/[:?]+$/, '').trim();
  if (!labelText) {
    return false;
  }

  return isQuestionHeading(text)
    || isQuestionHeading(labelText)
    || isStepHeading(labelText)
    || titleMatchesAnyPattern(labelText, FAQ_TITLE_PATTERNS)
    || titleMatchesAnyPattern(labelText, HOWTO_TITLE_PATTERNS)
    || isMeaningfulItemListHeading(labelText)
    || isShortTitleCaseHeadingLabel(labelText);
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

function hasFaqSectionSignal(blockMap, nodes) {
  const blocks = Array.isArray(blockMap) ? blockMap : [];
  const blockSignal = blocks.some((block, index) => {
    const nextBlock = blocks[index + 1] || null;
    return (isHeadingBlock(block) || isHeadingLikeParagraphBlock(block, nextBlock))
      && titleMatchesAnyPattern(getBlockText(block), FAQ_TITLE_PATTERNS);
  });
  if (blockSignal) {
    return true;
  }
  const list = Array.isArray(nodes) ? nodes : [];
  return list.some((node) => {
    const tag = typeof node?.tag === 'string' ? node.tag.toLowerCase() : '';
    if (!['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      return false;
    }
    return titleMatchesAnyPattern(node.text, FAQ_TITLE_PATTERNS);
  });
}

function normalizeHowtoListItemText(text) {
  return typeof text === 'string'
    ? text
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    : '';
}

function isExplicitStepListItem(text) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) {
    return false;
  }
  return /^(\d+[.)]\s+|step\s*\d+\b)/i.test(normalized);
}

function extractOrderedListItemsFromHtml(contentHtml) {
  if (typeof contentHtml !== 'string' || !contentHtml.trim()) {
    return [];
  }
  const items = [];
  const seen = new Set();
  const orderedListRegex = /<ol\b[^>]*>([\s\S]*?)<\/ol>/gi;
  let orderedListMatch;
  while ((orderedListMatch = orderedListRegex.exec(contentHtml)) !== null) {
    const listHtml = String(orderedListMatch[1] || '');
    const listItemRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let listItemMatch;
    while ((listItemMatch = listItemRegex.exec(listHtml)) !== null) {
      const cleaned = normalizeHowtoListItemText(listItemMatch[1]);
      if (!cleaned || countWords(cleaned) < 2) {
        continue;
      }
      const key = cleaned.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      items.push(cleaned);
    }
  }
  return items;
}

function resolveHowtoContextNodeRefFromText(blockMap, text) {
  const normalizedNeedle = normalizeHowtoListItemText(text).toLowerCase();
  if (!normalizedNeedle) {
    return null;
  }
  const blocks = Array.isArray(blockMap) ? blockMap : [];
  let fallbackNodeRef = null;
  for (const block of blocks) {
    const nodeRef = typeof block?.node_ref === 'string' ? block.node_ref.trim() : '';
    if (!nodeRef) {
      continue;
    }
    const blockText = normalizeHowtoListItemText(getBlockText(block)).toLowerCase();
    if (!blockText || !blockText.includes(normalizedNeedle)) {
      continue;
    }
    const blockType = typeof block?.block_type === 'string' ? block.block_type.toLowerCase() : '';
    if (!fallbackNodeRef) {
      fallbackNodeRef = nodeRef;
    }
    if (blockType.includes('list') || blockType.endsWith('/ol') || blockType.endsWith('/ul')) {
      return nodeRef;
    }
  }
  return fallbackNodeRef;
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
      if (!isExplicitStepListItem(candidate)) {
        return;
      }
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

function normalizeItemListLabel(text) {
  return typeof text === 'string'
    ? text
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/^([-*â€¢]|\d+[.)])\s+/, '')
      .replace(/\s+/g, ' ')
      .trim()
    : '';
}

function normalizeItemListCompareText(text) {
  return normalizeItemListLabel(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseVisibleListEntries(block) {
  if (!isListBlock(block)) {
    return [];
  }
  const rawText = getBlockText(block);
  if (!rawText || !rawText.trim()) {
    return [];
  }
  const entries = rawText
    .split(/\n+/)
    .map((line) => {
      const raw = String(line || '').trim();
      const text = normalizeItemListLabel(raw);
      return {
        raw,
        text,
        explicit_step: isExplicitStepListItem(raw),
        word_count: text ? countWords(text) : 0
      };
    })
    .filter((entry) => entry.text && entry.word_count >= 2);
  return entries;
}

function isBulletGlyphEntryText(text) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  return BULLET_GLYPH_ENTRY_REGEX.test(normalized);
}

function parseBulletGlyphEntry(text) {
  const normalized = typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim()
    : '';
  if (!isBulletGlyphEntryText(normalized)) {
    return null;
  }
  const entryText = normalizeItemListLabel(normalized);
  const wordCount = entryText ? countWords(entryText) : 0;
  if (!entryText || wordCount < 2) {
    return null;
  }
  return {
    raw: normalized,
    text: entryText,
    explicit_step: false,
    word_count: wordCount
  };
}

function extractInlineBulletEntries(text) {
  const normalized = typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim()
    : '';
  if (!normalized) {
    return [];
  }
  const segments = normalized
    .split(new RegExp(`(?=[${BULLET_GLYPH_PATTERN_SOURCE}]\\s+)`, 'g'))
    .map((segment) => segment.trim())
    .filter(Boolean);
  const entries = segments
    .map((segment) => parseBulletGlyphEntry(segment))
    .filter(Boolean);
  return entries.length >= 2 ? entries : [];
}

function extractColonLabelEntries(text) {
  const normalized = typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim()
    : '';
  if (!normalized) {
    return [];
  }
  const entries = [];
  const seen = new Set();
  const labelRegex = /([A-Z][^:.!?]{1,80}?):\s+/g;
  let match;
  while ((match = labelRegex.exec(normalized)) !== null) {
    const label = normalizeQuestionHeadingText(match[1] || '');
    const wordCount = countWords(label);
    if (!label || wordCount < 2 || wordCount > 6) {
      continue;
    }
    if (isQuestionHeading(label) || isStepHeading(label)) {
      continue;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push({
      raw: label,
      text: label,
      explicit_step: false,
      word_count: wordCount
    });
  }
  return entries;
}

function buildStructuralCandidateKey(nodeRef, heading, entries) {
  return `${String(nodeRef || heading || '').toLowerCase()}::${(Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeItemListCompareText(entry?.text || ''))
    .filter(Boolean)
    .join('|')}`;
}

function buildStructuralListSectionSummary(section, entries, sourceKind, nodeRef, sourceBlockType, ordered, title = '') {
  const heading = normalizeQuestionHeadingText(section?.headingText || title || '');
  return {
    heading: heading || normalizeQuestionHeadingText(title || ''),
    item_count: entries.length,
    items: entries.map((entry, index) => ({
      text: entry.text,
      position: index + 1
    })),
    ordered,
    heading_signal: isMeaningfulItemListHeading(heading),
    node_ref: nodeRef,
    heading_node_ref: typeof section?.nodeRef === 'string' && section.nodeRef.trim() ? section.nodeRef.trim() : null,
    source_kind: sourceKind,
    source_block_type: sourceBlockType || '',
    support_word_count: countWords(section?.supportText || '')
  };
}

function appendVisibleItemListCandidate(candidates, seen, section, entries, options = {}) {
  const listEntries = Array.isArray(entries) ? entries : [];
  const sourceKind = typeof options.sourceKind === 'string' && options.sourceKind.trim()
    ? options.sourceKind.trim()
    : 'visible_list';
  const heading = normalizeQuestionHeadingText(section?.headingText || options.title || '');
  const ordered = options.ordered === true || listEntries.some((entry) => entry.explicit_step === true);
  const headingSignal = isMeaningfulItemListHeading(heading);
  const questionHeadingSignal = heading ? isQuestionHeading(heading) : false;
  const strongSectionContext = headingSignal || questionHeadingSignal;
  const minimumEntries = sourceKind === 'list_block'
    ? (strongSectionContext ? 2 : 3)
    : 3;
  if (listEntries.length < minimumEntries) {
    return;
  }
  const averageWords = listEntries.reduce((sum, entry) => sum + Number(entry.word_count || 0), 0) / listEntries.length;
  const strongEnough = sourceKind === 'list_block'
    ? (strongSectionContext || ordered || listEntries.length >= 3)
    : (headingSignal || ordered || listEntries.length >= 4);

  if (!strongEnough || averageWords < 2) {
    return;
  }
  if (heading && titleMatchesAnyPattern(heading, FAQ_TITLE_PATTERNS)) {
    return;
  }
  if (isProceduralListContext(section, listEntries, options.title || '', options.runMetadata || {})) {
    return;
  }

  const nodeRef = typeof options.nodeRef === 'string' && options.nodeRef.trim()
    ? options.nodeRef.trim()
    : (typeof section?.nodeRef === 'string' && section.nodeRef.trim() ? section.nodeRef.trim() : null);
  const key = buildStructuralCandidateKey(nodeRef, heading, listEntries);
  if (!key || seen.has(key)) {
    return;
  }
  seen.add(key);

  candidates.push(buildStructuralListSectionSummary(
    section,
    listEntries,
    sourceKind,
    nodeRef,
    options.sourceBlockType || '',
    ordered,
    options.title || ''
  ));
}

function isMeaningfulItemListHeading(text) {
  const heading = normalizeQuestionHeadingText(text);
  if (!heading) {
    return false;
  }
  if (isStepHeading(heading)) {
    return false;
  }
  if (titleMatchesAnyPattern(heading, FAQ_TITLE_PATTERNS) || titleMatchesAnyPattern(heading, HOWTO_TITLE_PATTERNS)) {
    return false;
  }
  return ITEMLIST_HEADING_PATTERNS.some((pattern) => pattern.test(heading));
}

function isProceduralListContext(section, entries, title = '', runMetadata = {}) {
  const contentType = normalizeIntentContentType(runMetadata?.content_type);
  const heading = normalizeQuestionHeadingText(section?.headingText || '');
  const supportText = typeof section?.supportText === 'string' ? section.supportText : '';
  const explicitStepCount = entries.filter((entry) => entry.explicit_step === true).length;
  if (contentType === 'howto' || contentType === 'how-to') {
    return true;
  }
  if (titleMatchesAnyPattern(title, HOWTO_TITLE_PATTERNS)) {
    return true;
  }
  if (heading && (isStepHeading(heading) || titleMatchesAnyPattern(heading, HOWTO_TITLE_PATTERNS))) {
    return true;
  }
  if (PROCEDURAL_SUPPORT_PATTERNS.some((pattern) => pattern.test(supportText))) {
    return true;
  }
  return explicitStepCount >= Math.ceil(entries.length * 0.6);
}

function buildStructuralSectionInventory(blockMap, nodes, runMetadata = {}, title = '', contentHtml = '') {
  const sections = collectVisibleSections(blockMap, title);
  const visibleItemListSections = [];
  const pseudoListSections = [];
  const seenVisible = new Set();
  const seenPseudo = new Set();
  const headingLikeSections = sections
    .filter((section) => section?.isPseudoHeading === true)
    .map((section) => {
      const headingText = normalizeQuestionHeadingText(section?.headingText || '');
      const labelText = headingText.replace(/[:?]+$/, '').trim();
      const supportBlocks = Array.isArray(section?.supportBlocks) ? section.supportBlocks : [];
      const supportNodeRefs = supportBlocks
        .map((block) => (typeof block?.node_ref === 'string' && block.node_ref.trim() ? block.node_ref.trim() : null))
        .filter(Boolean);
      return {
        text: headingText,
        node_ref: typeof section?.nodeRef === 'string' && section.nodeRef.trim() ? section.nodeRef.trim() : null,
        source_block_type: typeof section?.block?.block_type === 'string' ? section.block.block_type.toLowerCase() : '',
        question_like: isQuestionHeading(headingText),
        step_like: isStepHeading(labelText),
        faq_like: titleMatchesAnyPattern(labelText, FAQ_TITLE_PATTERNS),
        howto_like: titleMatchesAnyPattern(labelText, HOWTO_TITLE_PATTERNS),
        itemlist_like: isMeaningfulItemListHeading(labelText),
        title_case_like: isShortTitleCaseHeadingLabel(labelText),
        support_block_count: supportBlocks.length,
        support_word_count: countWords(section?.supportText || ''),
        support_node_refs: supportNodeRefs.slice(0, 8),
        followed_by_list: supportBlocks.some((block) => isListBlock(block)),
        affects_structural_detection: true
      };
    });

  sections.forEach((section) => {
    const supportBlocks = Array.isArray(section?.supportBlocks) ? section.supportBlocks : [];
    supportBlocks.forEach((block) => {
      const blockType = typeof block?.block_type === 'string' ? block.block_type.toLowerCase() : '';
      const blockText = getBlockText(block);
      if (isListBlock(block)) {
        appendVisibleItemListCandidate(visibleItemListSections, seenVisible, section, parseVisibleListEntries(block), {
          title,
          runMetadata,
          nodeRef: typeof block?.node_ref === 'string' ? block.node_ref : null,
          sourceKind: 'list_block',
          sourceBlockType: blockType,
          ordered: /\/ol$/i.test(blockType)
        });
      }

      const inlineBulletEntries = extractInlineBulletEntries(blockText);
      if (inlineBulletEntries.length >= 3) {
        appendVisibleItemListCandidate(visibleItemListSections, seenVisible, section, inlineBulletEntries, {
          title,
          runMetadata,
          nodeRef: typeof block?.node_ref === 'string' ? block.node_ref : null,
          sourceKind: 'inline_bullet_paragraph',
          sourceBlockType: blockType,
          ordered: false
        });
      }

      const colonEntries = extractColonLabelEntries(blockText);
      if (colonEntries.length >= 3) {
        const nodeRef = typeof block?.node_ref === 'string' && block.node_ref.trim()
          ? block.node_ref.trim()
          : (typeof section?.nodeRef === 'string' && section.nodeRef.trim() ? section.nodeRef.trim() : null);
        const key = buildStructuralCandidateKey(nodeRef, section?.headingText || title || '', colonEntries);
        if (key && !seenPseudo.has(key)) {
          seenPseudo.add(key);
          pseudoListSections.push(buildStructuralListSectionSummary(
            section,
            colonEntries,
            'colon_labeled_paragraph',
            nodeRef,
            blockType,
            false,
            title
          ));
        }
      }
    });

    const bulletBlockEntries = supportBlocks
      .map((block) => ({
        block,
        entry: parseBulletGlyphEntry(getBlockText(block))
      }))
      .filter((entry) => entry.entry);
    if (bulletBlockEntries.length >= 3) {
      appendVisibleItemListCandidate(
        visibleItemListSections,
        seenVisible,
        section,
        bulletBlockEntries.map((entry) => entry.entry),
        {
          title,
          runMetadata,
          nodeRef: typeof bulletBlockEntries[0]?.block?.node_ref === 'string' ? bulletBlockEntries[0].block.node_ref : null,
          sourceKind: 'bullet_block_sequence',
          sourceBlockType: typeof bulletBlockEntries[0]?.block?.block_type === 'string' ? bulletBlockEntries[0].block.block_type.toLowerCase() : '',
          ordered: false
        }
      );
    }
  });

  const questionSections = sections.reduce((acc, section) => {
    const question = normalizeQuestionHeadingText(section?.headingText || '');
    if (!isQuestionHeading(question)) {
      return acc;
    }
    const answer = typeof section?.supportText === 'string'
      ? section.supportText.replace(/\s+/g, ' ').trim()
      : '';
    const answerWordCount = answer ? countWords(answer) : 0;
    if (answerWordCount < 6) {
      return acc;
    }
    const supportNodeRefs = (Array.isArray(section?.supportBlocks) ? section.supportBlocks : [])
      .map((block) => (typeof block?.node_ref === 'string' && block.node_ref.trim() ? block.node_ref.trim() : null))
      .filter(Boolean);
    const hasVisibleList = visibleItemListSections.some((candidate) =>
      (candidate?.heading_node_ref && candidate.heading_node_ref === section?.nodeRef)
      || (candidate?.node_ref && supportNodeRefs.includes(candidate.node_ref))
    );
    const hasPseudoList = pseudoListSections.some((candidate) =>
      (candidate?.heading_node_ref && candidate.heading_node_ref === section?.nodeRef)
      || (candidate?.node_ref && supportNodeRefs.includes(candidate.node_ref))
    );
    acc.push({
      question,
      heading_node_ref: typeof section?.nodeRef === 'string' && section.nodeRef.trim() ? section.nodeRef.trim() : null,
      answer_word_count: answerWordCount,
      compact_answer: answerWordCount >= 8 && answerWordCount <= 120,
      visible_list_present: hasVisibleList,
      pseudo_list_present: hasPseudoList,
      answer_preview: answer.slice(0, 180),
      support_node_refs: supportNodeRefs.slice(0, 6)
    });
    return acc;
  }, []);

  const contentType = normalizeIntentContentType(runMetadata?.content_type);
  const faqTitleSignal = titleMatchesAnyPattern(title, FAQ_TITLE_PATTERNS);
  const faqSectionSignal = hasFaqSectionSignal(blockMap, nodes);
  const faqExplicitSignal = faqTitleSignal || faqSectionSignal || contentType === 'faq';
  const faqBlockedByType = FAQ_EXCLUDED_CONTENT_TYPES.has(contentType);
  const reusableQuestionSections = questionSections.filter((section) =>
    section.compact_answer === true
    && section.visible_list_present !== true
    && section.pseudo_list_present !== true
  );
  const faqCandidateSections = reusableQuestionSections.length >= 2
    ? reusableQuestionSections.slice(0, 8).map((section) => ({
      question: section.question,
      answer: section.answer_preview,
      heading_node_ref: section.heading_node_ref || null,
      source: 'question_section'
    }))
    : [];

  const detectedSteps = extractHowtoStepsFromBlocks(blockMap, contentHtml, 12);
  const proceduralSections = sections.reduce((acc, section) => {
    const heading = normalizeQuestionHeadingText(section?.headingText || '');
    const supportText = typeof section?.supportText === 'string' ? section.supportText : '';
    const supportBlocks = Array.isArray(section?.supportBlocks) ? section.supportBlocks : [];
    const supportNodeRefs = supportBlocks
      .map((block) => (typeof block?.node_ref === 'string' && block.node_ref.trim() ? block.node_ref.trim() : null))
      .filter(Boolean);
    const detectedStepCount = detectedSteps.filter((step) =>
      (typeof step?.node_ref === 'string' && supportNodeRefs.includes(step.node_ref))
      || (typeof step?.heading_node_ref === 'string' && (
        step.heading_node_ref === section?.nodeRef
        || supportNodeRefs.includes(step.heading_node_ref)
      ))
    ).length;
    const hasProceduralSupport = PROCEDURAL_SUPPORT_PATTERNS.some((pattern) => pattern.test(supportText));
    const hasOrderedSupport = supportBlocks.some((block) => parseVisibleListEntries(block).some((entry) => entry.explicit_step === true));
    const hasStepHeading = isStepHeading(heading);
    if (!hasStepHeading && !hasProceduralSupport && !hasOrderedSupport && detectedStepCount === 0) {
      return acc;
    }
    acc.push({
      heading,
      node_ref: typeof section?.nodeRef === 'string' && section.nodeRef.trim() ? section.nodeRef.trim() : (supportNodeRefs[0] || null),
      support_word_count: countWords(supportText || ''),
      detected_step_count: detectedStepCount,
      has_step_heading: hasStepHeading,
      has_procedural_support: hasProceduralSupport,
      has_ordered_support: hasOrderedSupport
    });
    return acc;
  }, []);

  const htmlOrderedListCount = extractOrderedListItemsFromHtml(contentHtml).length;
  const blockListCount = countOrderedListItemsFromBlocks(blockMap);
  const orderedListCount = Math.max(blockListCount, htmlOrderedListCount);
  const proceduralSupportCount = countProceduralSupportBlocks(blockMap);
  const howtoTitleSignal = titleMatchesAnyPattern(title, HOWTO_TITLE_PATTERNS);
  const howtoBlockedByType = FAQ_EXCLUDED_CONTENT_TYPES.has(contentType) && !howtoTitleSignal;

  return {
    inventory_version: 2,
    visible_itemlist_sections: visibleItemListSections,
    pseudo_list_sections: pseudoListSections,
    heading_like_sections: headingLikeSections,
    question_sections: questionSections,
    faq_candidate_sections: faqCandidateSections,
    faq_signals: {
      title_signal: faqTitleSignal,
      section_signal: faqSectionSignal,
      explicit_signal: faqExplicitSignal,
      blocked_by_type: faqBlockedByType,
      content_type: contentType || ''
    },
    procedural_sections: proceduralSections,
    howto_summary: {
      step_heading_count: sections.filter((section) => isStepHeading(section.headingText)).length,
      list_item_count: orderedListCount,
      procedural_support_count: proceduralSupportCount,
      title_signal: howtoTitleSignal,
      blocked_by_type: howtoBlockedByType,
      content_type: contentType || '',
      detected_steps: detectedSteps
    },
    semantic_candidate_hints: {
      lists_tables_presence: {
        visible_list_section_node_refs: visibleItemListSections
          .map((section) => section?.node_ref || section?.heading_node_ref || null)
          .filter(Boolean),
        pseudo_list_section_node_refs: pseudoListSections
          .map((section) => section?.node_ref || section?.heading_node_ref || null)
          .filter(Boolean)
      },
      faq_structure_opportunity: {
        question_section_node_refs: questionSections
          .map((section) => section?.heading_node_ref || null)
          .filter(Boolean),
        faq_candidate_section_node_refs: faqCandidateSections
          .map((section) => section?.heading_node_ref || null)
          .filter(Boolean)
      },
      howto_semantic_validity: {
        procedural_section_node_refs: proceduralSections
          .map((section) => section?.node_ref || null)
          .filter(Boolean)
      }
    }
  };
}

function detectVisibleItemListCandidates(blockMap, runMetadata = {}, title = '', structureInventory = null) {
  const inventory = structureInventory && typeof structureInventory === 'object'
    ? structureInventory
    : buildStructuralSectionInventory(blockMap, [], runMetadata, title, '');
  return Array.isArray(inventory?.visible_itemlist_sections) ? inventory.visible_itemlist_sections : [];
}

function evaluateHeadingLikeTextUsesHeadingMarkup(structureInventory, blockMap) {
  const detectedSections = Array.isArray(structureInventory?.heading_like_sections)
    ? structureInventory.heading_like_sections.filter((section) => typeof section?.node_ref === 'string' && section.node_ref.trim())
    : [];
  const contextNodeRef = detectedSections[0]?.node_ref || null;

  if (detectedSections.length === 0) {
    return {
      verdict: 'pass',
      explanation: 'No heading-like paragraph labels detected',
      highlights: [],
      details: {
        heading_like_count: 0,
        structurally_impactful_count: 0,
        context_node_ref: null,
        detected_sections: []
      }
    };
  }

  const impactfulSections = detectedSections.filter((section) =>
    section?.followed_by_list === true
    || section?.step_like === true
    || section?.faq_like === true
    || section?.howto_like === true
    || section?.itemlist_like === true
  );
  const verdict = detectedSections.length > 1 || impactfulSections.length > 0 ? 'fail' : 'partial';
  const message = 'This section label looks like a heading but is still paragraph text';
  const highlights = detectedSections.slice(0, 8).reduce((acc, section) => {
    const nodeRef = typeof section?.node_ref === 'string' ? section.node_ref.trim() : '';
    if (!nodeRef) {
      return acc;
    }
    const block = (Array.isArray(blockMap) ? blockMap : []).find((candidate) =>
      typeof candidate?.node_ref === 'string' && candidate.node_ref.trim() === nodeRef
    );
    const text = getBlockText(block);
    if (!block || !text.trim()) {
      return acc;
    }
    acc.push(buildHighlight(
      block,
      { start: 0, end: text.length },
      verdict === 'fail' ? 'high' : 'medium',
      {
        message,
        facts: {
          support_block_count: Number(section?.support_block_count || 0),
          followed_by_list: section?.followed_by_list === true
        }
      }
    ));
    return acc;
  }, []);

  return {
    verdict,
    explanation: verdict === 'partial'
      ? 'One heading-like paragraph should use real heading markup'
      : `${detectedSections.length} heading-like paragraph labels should use real heading markup`,
    highlights,
    details: {
      heading_like_count: detectedSections.length,
      structurally_impactful_count: impactfulSections.length,
      context_node_ref: contextNodeRef,
      detected_sections: detectedSections.slice(0, 8)
    }
  };
}

function extractItemListElements(schema) {
  const raw = schema?.itemListElement || schema?.itemListElements || [];
  const entries = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return entries.map((entry, index) => {
    if (typeof entry === 'string') {
      return {
        text: normalizeItemListLabel(entry),
        position: index + 1
      };
    }
    const itemValue = entry?.item;
    const text = normalizeItemListLabel(
      entry?.name
      || entry?.headline
      || entry?.text
      || (typeof itemValue === 'string' ? itemValue : '')
      || itemValue?.name
      || itemValue?.headline
      || itemValue?.text
    );
    const position = Number.isFinite(Number(entry?.position)) ? Number(entry.position) : null;
    return {
      text,
      position
    };
  }).filter((entry) => entry.text);
}

function itemListLabelsAlign(candidateItems, schemaItems) {
  const visible = (Array.isArray(candidateItems) ? candidateItems : [])
    .map((entry) => normalizeItemListCompareText(entry?.text || ''))
    .filter(Boolean);
  const schema = (Array.isArray(schemaItems) ? schemaItems : [])
    .map((entry) => normalizeItemListCompareText(entry?.text || ''))
    .filter(Boolean);
  if (visible.length === 0 || schema.length === 0) {
    return 0;
  }
  let matched = 0;
  visible.forEach((visibleLabel) => {
    const hasMatch = schema.some((schemaLabel) =>
      schemaLabel === visibleLabel
      || schemaLabel.includes(visibleLabel)
      || visibleLabel.includes(schemaLabel)
    );
    if (hasMatch) {
      matched += 1;
    }
  });
  return matched;
}

function evaluateItemListSchemaCandidate(candidate, schemas) {
  const listCandidate = candidate && typeof candidate === 'object' ? candidate : null;
  const schemaList = Array.isArray(schemas) ? schemas : [];
  let best = {
    aligned: false,
    complete: false,
    matched_count: 0,
    schema_item_count: 0,
    schema_index: -1,
    missing_positions: false
  };

  schemaList.forEach((schema, index) => {
    const schemaItems = extractItemListElements(schema);
    const matchedCount = itemListLabelsAlign(listCandidate?.items, schemaItems);
    const requiredCount = Number(listCandidate?.item_count || 0);
    const hasPositionalCoverage = listCandidate?.ordered !== true
      || schemaItems.length === 0
      ? true
      : schemaItems.every((entry, entryIndex) => Number(entry.position) === entryIndex + 1);
    const aligned = matchedCount >= Math.min(requiredCount, 2);
    const complete = aligned && schemaItems.length >= requiredCount && hasPositionalCoverage;
    const candidateScore = (complete ? 1000 : 0) + matchedCount * 10 + schemaItems.length;
    const bestScore = (best.complete ? 1000 : 0) + best.matched_count * 10 + best.schema_item_count;
    if (candidateScore > bestScore) {
      best = {
        aligned,
        complete,
        matched_count: matchedCount,
        schema_item_count: schemaItems.length,
        schema_index: index,
        missing_positions: listCandidate?.ordered === true && !hasPositionalCoverage
      };
    }
  });

  return best;
}

function evaluateItemListSchemaRequirement(blockMap, jsonldEntries, runMetadata = {}, title = '', structureInventory = null) {
  const candidates = detectVisibleItemListCandidates(blockMap, runMetadata, title, structureInventory);
  if (candidates.length === 0) {
    return {
      verdict: 'pass',
      explanation: 'No strong visible list candidate detected; ItemList schema requirement not triggered',
      details: {
        candidate_count: 0,
        detected_candidates: [],
        score_neutral: true,
        score_neutral_reason: 'itemlist_intent_not_detected',
        scope_triggered: false
      }
    };
  }

  const itemListSchemas = extractSchemaObjectsByType(jsonldEntries, 'ItemList');
  if (itemListSchemas.length === 0) {
    return {
      verdict: 'fail',
      explanation: 'Strong visible list sections are present, but ItemList schema is missing',
      details: {
        candidate_count: candidates.length,
        detected_candidates: candidates,
        itemlist_schema_found: 0,
        context_node_ref: candidates[0]?.node_ref || candidates[0]?.heading_node_ref || null,
        scope_triggered: true
      }
    };
  }

  const evaluations = candidates.map((candidate) => ({
    candidate,
    result: evaluateItemListSchemaCandidate(candidate, itemListSchemas)
  }));
  const completeCount = evaluations.filter((entry) => entry.result.complete === true).length;
  const alignedCount = evaluations.filter((entry) => entry.result.aligned === true).length;
  const bestMismatch = evaluations.find((entry) => entry.result.complete !== true) || evaluations[0];
  const verdict = completeCount === candidates.length ? 'pass' : 'partial';

  return {
    verdict,
    explanation: verdict === 'pass'
      ? 'Strong visible list sections are supported by aligned ItemList schema'
      : 'ItemList schema is present but incomplete or misaligned with the visible list',
    details: {
      candidate_count: candidates.length,
      detected_candidates: candidates,
      itemlist_schema_found: itemListSchemas.length,
      itemlist_schema_complete: completeCount,
      itemlist_schema_aligned: alignedCount,
      context_node_ref: bestMismatch?.candidate?.node_ref || bestMismatch?.candidate?.heading_node_ref || null,
      missing_positions: bestMismatch?.result?.missing_positions === true,
      scope_triggered: true
    }
  };
}

function hasPrimaryArticlePageReference(schema, canonicalUrl = '') {
  if (!schema || typeof schema !== 'object') {
    return false;
  }
  if (hasField(schema, 'mainEntityOfPage') || hasField(schema, 'url') || hasField(schema, '@id')) {
    return true;
  }
  return !canonicalUrl;
}

function resolvePrimaryArticleSchemaType(contentType = '') {
  const normalizedType = normalizeIntentContentType(contentType);
  if (normalizedType === 'news' || normalizedType === 'newsarticle') {
    return 'NewsArticle';
  }
  if (normalizedType === 'post' || normalizedType === 'blog' || normalizedType === 'blogposting') {
    return 'BlogPosting';
  }
  return 'Article';
}

function evaluateArticleSchemaPresenceAndCompleteness(jsonldEntries, runMetadata = {}, canonicalUrl = '', blockMap = []) {
  const contentType = normalizeIntentContentType(runMetadata?.content_type);
  if (!ARTICLE_LIKE_CONTENT_TYPES.has(contentType)) {
    return {
      verdict: 'pass',
      explanation: 'Primary article schema is not required for this content type',
      details: {
        content_type: contentType || '',
        preferred_article_type: resolvePrimaryArticleSchemaType(contentType),
        score_neutral: true,
        score_neutral_reason: 'article_schema_not_applicable',
        scope_triggered: false
      }
    };
  }

  const jsonldObjects = normalizeJsonldObjects(jsonldEntries);
  const articleSchemas = jsonldObjects.filter((obj) => extractSchemaTypes(obj).some((type) => PRIMARY_ARTICLE_SCHEMA_TYPES.has(type)));
  const detectedTypes = Array.from(new Set(jsonldObjects.flatMap((obj) => extractSchemaTypes(obj))));
  const companionTypes = detectedTypes.filter((type) => !PRIMARY_ARTICLE_SCHEMA_TYPES.has(type));

  if (articleSchemas.length === 0) {
    const companionOnly = companionTypes.length > 0;
    return {
      verdict: companionOnly ? 'partial' : 'fail',
      explanation: companionOnly
        ? 'Only companion or supporting schemas were found; primary article schema is missing'
        : 'Article-like content detected but no primary article schema was found',
      details: {
        content_type: contentType,
        preferred_article_type: resolvePrimaryArticleSchemaType(contentType),
        article_schema_found: 0,
        detected_types: detectedTypes,
        companion_types: companionTypes,
        companion_only: companionOnly,
        context_node_ref: resolveFirstContentNodeRef(blockMap),
        scope_triggered: true
      }
    };
  }

  const evaluations = articleSchemas.map((schema) => {
    const types = extractSchemaTypes(schema);
    const resolvedType = types.find((type) => PRIMARY_ARTICLE_SCHEMA_TYPES.has(type)) || types[0] || 'Article';
    const missing = [];
    if (!hasField(schema, '@context')) missing.push('@context');
    if (!hasField(schema, '@type')) missing.push('@type');
    if (!(hasField(schema, 'headline') || hasField(schema, 'name'))) missing.push('headline_or_name');
    if (!hasField(schema, 'author')) missing.push('author');
    if (!(hasField(schema, 'datePublished') || hasField(schema, 'dateModified'))) missing.push('datePublished_or_dateModified');
    if (!hasPrimaryArticlePageReference(schema, canonicalUrl)) missing.push('mainEntityOfPage_or_page_reference');
    return {
      type: resolvedType,
      missing
    };
  });

  const completeCount = evaluations.filter((entry) => entry.missing.length === 0).length;
  return {
    verdict: completeCount > 0 ? 'pass' : 'partial',
    explanation: completeCount > 0
      ? 'Primary article schema is present with required core fields'
      : 'Primary article schema is present but missing required core fields',
    details: {
      content_type: contentType,
      preferred_article_type: resolvePrimaryArticleSchemaType(contentType),
      article_schema_found: articleSchemas.length,
      article_schema_complete: completeCount,
      article_schema_evaluations: evaluations,
      detected_types: detectedTypes,
      companion_types: companionTypes,
      context_node_ref: resolveFirstContentNodeRef(blockMap),
      scope_triggered: true
    }
  };
}

function extractFaqPairsFromSections(blockMap, maxPairs = 8, nodes = [], runMetadata = {}, title = '') {
  const inventory = buildStructuralSectionInventory(blockMap, nodes, runMetadata, title, '');
  const pairs = Array.isArray(inventory?.faq_candidate_sections) ? inventory.faq_candidate_sections : [];
  return pairs.slice(0, maxPairs);
}

function extractHowtoStepsFromBlocks(blockMap, contentHtml = '', maxSteps = 12) {
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
      heading_node_ref: section?.nodeRef || null,
      node_ref: section?.nodeRef || null
    });
  });

  const orderedListItems = extractOrderedListItemsFromHtml(contentHtml);
  const fallbackListItems = orderedListItems.length > 0 ? [] : extractOrderedListItemsFromBlocks(blockMap);

  orderedListItems.concat(fallbackListItems).forEach((item) => {
    const text = item.replace(/\s+/g, ' ').trim();
    if (!text) {
      return;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const nodeRef = resolveHowtoContextNodeRefFromText(blockMap, text);
    steps.push({
      text: text.slice(0, 320),
      source: 'ordered_list',
      heading_node_ref: null,
      node_ref: nodeRef || null
    });
  });

  return steps.slice(0, maxSteps);
}

function resolveHowtoContextNodeRef(detectedSteps) {
  const steps = Array.isArray(detectedSteps) ? detectedSteps : [];
  for (const step of steps) {
    const nodeRef = typeof step?.node_ref === 'string' ? step.node_ref.trim() : '';
    if (nodeRef) {
      return nodeRef;
    }
    const headingNodeRef = typeof step?.heading_node_ref === 'string' ? step.heading_node_ref.trim() : '';
    if (headingNodeRef) {
      return headingNodeRef;
    }
  }
  return null;
}

function detectFaqNeed(blockMap, nodes, runMetadata = {}, title = '', structureInventory = null) {
  const inventory = structureInventory && typeof structureInventory === 'object'
    ? structureInventory
    : buildStructuralSectionInventory(blockMap, nodes, runMetadata, title, '');
  const detectedPairs = Array.isArray(inventory?.faq_candidate_sections) ? inventory.faq_candidate_sections : [];
  const questionSections = Array.isArray(inventory?.question_sections) ? inventory.question_sections : [];
  const faqSignals = inventory?.faq_signals && typeof inventory.faq_signals === 'object'
    ? inventory.faq_signals
    : {};
  const count = detectedPairs.length;
  const source = detectedPairs.length > 0
    ? 'pairs'
    : questionSections.length > 0
      ? 'question_sections'
      : 'none';
  return {
    needed: !faqSignals.blocked_by_type && (
      (detectedPairs.length >= 2 && faqSignals.explicit_signal === true)
      || detectedPairs.length >= 3
    ),
    count,
    question_section_count: questionSections.length,
    source,
    content_type: faqSignals.content_type || '',
    blocked_by_type: faqSignals.blocked_by_type === true,
    title_signal: faqSignals.title_signal === true,
    section_signal: faqSignals.section_signal === true,
    explicit_signal: faqSignals.explicit_signal === true,
    detected_pairs: detectedPairs,
    compact_pairs: detectedPairs
  };
}

function detectHowtoNeed(blockMap, nodes, runMetadata = {}, title = '', contentHtml = '', structureInventory = null) {
  const inventory = structureInventory && typeof structureInventory === 'object'
    ? structureInventory
    : buildStructuralSectionInventory(blockMap, nodes, runMetadata, title, contentHtml);
  const howtoSummary = inventory?.howto_summary && typeof inventory.howto_summary === 'object'
    ? inventory.howto_summary
    : {};
  const stepHeadingCount = Number(howtoSummary.step_heading_count || 0);
  const listCount = Number(howtoSummary.list_item_count || 0);
  const detectedSteps = Array.isArray(howtoSummary.detected_steps) ? howtoSummary.detected_steps : [];
  const titleSignal = howtoSummary.title_signal === true;
  const proceduralSupportCount = Number(howtoSummary.procedural_support_count || 0);
  const contentType = typeof howtoSummary.content_type === 'string'
    ? howtoSummary.content_type
    : normalizeIntentContentType(runMetadata?.content_type);
  const blockedByType = howtoSummary.blocked_by_type === true;
  return {
    needed: !blockedByType && (
      titleSignal
        ? (detectedSteps.length >= 2 || stepHeadingCount >= 1 || listCount >= 3)
        : (stepHeadingCount >= 2 || (detectedSteps.length >= 3 && (listCount >= 3 || proceduralSupportCount >= 1)))
    ),
    step_heading_count: stepHeadingCount,
    list_item_count: listCount,
    procedural_support_count: proceduralSupportCount,
    title_signal: titleSignal,
    content_type: contentType || '',
    blocked_by_type: blockedByType,
    detected_steps: detectedSteps
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

function evaluateFaqSchemaRequirement(blockMap, nodes, jsonldEntries, runMetadata = {}, title = '', structureInventory = null) {
  const detection = detectFaqNeed(blockMap, nodes, runMetadata, title, structureInventory);
  const detectedPairs = detection.detected_pairs || extractFaqPairsFromSections(blockMap, 8, nodes, runMetadata, title);
  if (!detection.needed) {
    return {
      verdict: 'pass',
      explanation: 'No FAQ-style content detected; FAQ schema requirement not triggered',
      details: {
        question_sections_detected: detection.question_section_count || 0,
        faq_pairs_detected: detection.count,
        faq_pairs_compact: Array.isArray(detection.compact_pairs) ? detection.compact_pairs.length : 0,
        detection_source: detection.source,
        faq_candidate_blocked_by_type: detection.blocked_by_type === true,
        faq_title_signal: detection.title_signal === true,
        faq_section_signal: detection.section_signal === true,
        content_type: detection.content_type || '',
        detected_pairs: detectedPairs,
        score_neutral: true,
        score_neutral_reason: 'faq_intent_not_detected',
        scope_triggered: false
      }
    };
  }
  const faqSchemas = extractSchemaObjectsByType(jsonldEntries, 'FAQPage');
  if (faqSchemas.length === 0) {
    return {
      verdict: 'fail',
      explanation: 'FAQ-style content detected but no FAQPage schema found',
      details: {
        question_sections_detected: detection.question_section_count || 0,
        faq_pairs_detected: detection.count,
        faq_pairs_compact: Array.isArray(detection.compact_pairs) ? detection.compact_pairs.length : 0,
        faq_schema_found: 0,
        detection_source: detection.source,
        faq_title_signal: detection.title_signal === true,
        faq_section_signal: detection.section_signal === true,
        content_type: detection.content_type || '',
        detected_pairs: detectedPairs,
        scope_triggered: true
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
      question_sections_detected: detection.question_section_count || 0,
      faq_pairs_detected: detection.count,
      faq_pairs_compact: Array.isArray(detection.compact_pairs) ? detection.compact_pairs.length : 0,
      faq_schema_found: faqSchemas.length,
      faq_schema_complete: completeCount,
      faq_questions_detected: questionCount,
      detection_source: detection.source,
      faq_title_signal: detection.title_signal === true,
      faq_section_signal: detection.section_signal === true,
      content_type: detection.content_type || '',
      detected_pairs: detectedPairs,
      scope_triggered: true
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

function evaluateHowtoSchemaRequirement(blockMap, nodes, jsonldEntries, runMetadata = {}, title = '', contentHtml = '', structureInventory = null) {
  const detection = detectHowtoNeed(blockMap, nodes, runMetadata, title, contentHtml, structureInventory);
  const detectedSteps = detection.detected_steps || extractHowtoStepsFromBlocks(blockMap, contentHtml, 12);
  const contextNodeRef = resolveHowtoContextNodeRef(detectedSteps);
  if (!detection.needed) {
    return {
      verdict: 'pass',
      explanation: 'No HowTo-style content detected; HowTo schema requirement not triggered',
      details: {
        step_heading_count: detection.step_heading_count,
        list_item_count: detection.list_item_count,
        procedural_support_count: detection.procedural_support_count,
        title_signal: detection.title_signal === true,
        content_type: detection.content_type || '',
        howto_candidate_blocked_by_type: detection.blocked_by_type === true,
        detected_steps: detectedSteps,
        context_node_ref: contextNodeRef,
        score_neutral: true,
        score_neutral_reason: 'howto_intent_not_detected',
        scope_triggered: false
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
        procedural_support_count: detection.procedural_support_count,
        title_signal: detection.title_signal === true,
        content_type: detection.content_type || '',
        howto_schema_found: 0,
        detected_steps: detectedSteps,
        context_node_ref: contextNodeRef,
        scope_triggered: true
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
      procedural_support_count: detection.procedural_support_count,
      title_signal: detection.title_signal === true,
      content_type: detection.content_type || '',
      howto_schema_found: howtoSchemas.length,
      howto_schema_complete: completeCount,
      howto_steps_detected: stepCount,
      detected_steps: detectedSteps,
      context_node_ref: contextNodeRef,
      scope_triggered: true
    }
  };
}

function cloneCheckDetails(details) {
  if (!details || typeof details !== 'object') {
    return {};
  }
  return JSON.parse(JSON.stringify(details));
}

function resolveSchemaBridgeScopeTriggered(sourceCheck) {
  const details = sourceCheck?.details && typeof sourceCheck.details === 'object'
    ? sourceCheck.details
    : {};
  if (typeof details.scope_triggered === 'boolean') {
    return details.scope_triggered;
  }
  if (details.score_neutral === true || sourceCheck?.score_neutral === true) {
    return false;
  }
  const verdict = String(sourceCheck?.verdict || '').trim().toLowerCase();
  return verdict === 'pass' || verdict === 'partial' || verdict === 'fail';
}

function buildFaqJsonldGenerationSuggestionCheck(sourceCheck) {
  const details = cloneCheckDetails(sourceCheck?.details);
  const scopeTriggered = resolveSchemaBridgeScopeTriggered(sourceCheck);
  const sourceVerdict = String(sourceCheck?.verdict || 'pass').trim().toLowerCase() || 'pass';
  const verdict = scopeTriggered ? sourceVerdict : 'pass';
  const explanation = !scopeTriggered
    ? 'FAQ JSON-LD is not needed because this article is not a strong FAQ candidate.'
    : (sourceVerdict === 'pass'
      ? 'FAQ-ready question-answer pairs are supported by complete FAQ schema.'
      : sourceVerdict === 'partial'
        ? 'FAQ-ready question-answer pairs are present, but the existing FAQ schema is incomplete.'
        : 'FAQ-ready question-answer pairs are present, but FAQ schema is missing.');
  return {
    verdict,
    confidence: 1.0,
    explanation,
    provenance: 'deterministic',
    highlights: [],
    details: {
      ...details,
      scope_triggered: scopeTriggered,
      bridge_source_check_id: 'faq_jsonld_presence_and_completeness'
    }
  };
}

function buildHowtoSchemaPresenceBridgeCheck(sourceCheck) {
  const details = cloneCheckDetails(sourceCheck?.details);
  const scopeTriggered = resolveSchemaBridgeScopeTriggered(sourceCheck);
  const sourceVerdict = String(sourceCheck?.verdict || 'pass').trim().toLowerCase() || 'pass';
  const verdict = scopeTriggered ? sourceVerdict : 'pass';
  const explanation = !scopeTriggered
    ? 'HowTo schema is not needed because this article is not a clear step-by-step candidate.'
    : (sourceVerdict === 'pass'
      ? 'Visible step-by-step content is supported by complete HowTo schema.'
      : sourceVerdict === 'partial'
        ? 'Visible step-by-step content is present, but the existing HowTo schema is incomplete.'
        : 'Visible step-by-step content is present, but HowTo schema is missing.');
  return {
    verdict,
    confidence: 1.0,
    explanation,
    provenance: 'deterministic',
    highlights: [],
    details: {
      ...details,
      scope_triggered: scopeTriggered,
      bridge_source_check_id: 'howto_jsonld_presence_and_completeness'
    }
  };
}

function evaluateCanonicalClarity(canonicalUrl, runMetadata = {}, manifest = {}) {
  const rawCanonical = typeof canonicalUrl === 'string' ? canonicalUrl.trim() : '';
  if (!rawCanonical) {
    return {
      verdict: 'partial',
      explanation: 'No canonical URL was detected for this page.',
      details: {
        canonical_url: '',
        canonical_present: false
      }
    };
  }

  let parsedCanonical = null;
  try {
    parsedCanonical = new URL(rawCanonical);
  } catch (error) {
    return {
      verdict: rawCanonical.startsWith('/') ? 'partial' : 'fail',
      explanation: rawCanonical.startsWith('/')
        ? 'Canonical URL is present but not absolute.'
        : 'Canonical URL is malformed and cannot be trusted.',
      details: {
        canonical_url: rawCanonical,
        canonical_present: true,
        canonical_absolute: false
      }
    };
  }

  const expectedHost = normalizeHostCandidate(runMetadata?.site_url)
    || normalizeHostCandidate(manifest?.site_url)
    || normalizeHostCandidate(runMetadata?.site_id);
  const canonicalHost = parsedCanonical.hostname.replace(/^www\./i, '').toLowerCase();
  if (expectedHost && canonicalHost && canonicalHost !== expectedHost) {
    return {
      verdict: 'partial',
      explanation: 'Canonical URL points to a different host than the analyzed page.',
      details: {
        canonical_url: rawCanonical,
        canonical_present: true,
        canonical_absolute: true,
        expected_host: expectedHost,
        canonical_host: canonicalHost
      }
    };
  }

  return {
    verdict: 'pass',
    explanation: 'Canonical URL clearly points to the preferred page.',
    details: {
      canonical_url: rawCanonical,
      canonical_present: true,
      canonical_absolute: true,
      expected_host: expectedHost || null,
      canonical_host: canonicalHost || null
    }
  };
}

function evaluateAiCrawlerAccessibility(contentHtml) {
  const directives = getRobotsDirectives(contentHtml);
  const restrictive = directives.filter((directive) => (
    directive === 'noindex'
    || directive === 'none'
    || directive === 'nosnippet'
    || /^max-snippet\s*:\s*0$/i.test(directive)
  ));
  const permissive = directives.filter((directive) => (
    directive === 'index'
    || directive === 'all'
    || /^max-snippet\s*:\s*[1-9]\d*$/i.test(directive)
  ));
  if (hasDataNoSnippet(contentHtml)) {
    restrictive.push('data-nosnippet');
  }
  if (restrictive.length === 0) {
    return {
      verdict: 'pass',
      explanation: 'No crawler directives block indexing or snippet reuse.',
      details: {
        directives,
        restrictive_directives: [],
        permissive_directives: permissive,
        data_nosnippet: false
      }
    };
  }
  const uniqueRestrictive = Array.from(new Set(restrictive));
  const hasMixedSignals = permissive.length > 0;
  return {
    verdict: hasMixedSignals ? 'partial' : 'fail',
    explanation: hasMixedSignals
      ? 'Crawler directives include both permissive and restrictive instructions.'
      : 'Crawler directives restrict indexing or snippet extraction needed for answer-engine reuse.',
    details: {
      directives,
      restrictive_directives: uniqueRestrictive,
      permissive_directives: Array.from(new Set(permissive)),
      data_nosnippet: uniqueRestrictive.includes('data-nosnippet')
    }
  };
}

const FRESHNESS_SENSITIVE_CONTENT_TYPES = new Set(['news', 'newsarticle']);
const FRESHNESS_EXPLICIT_RECENCY_PATTERNS = [
  /\b(?:today|latest|recent|recently|currently|as of|this year|this month|forecast|market update|breaking)\b/i,
  /\b(?:updated|newly updated|last updated)\b/i
];

function isFreshnessSensitiveContent(contentHtml, runMetadata = {}, blockMap = []) {
  const contentType = typeof runMetadata?.content_type === 'string' ? runMetadata.content_type.trim().toLowerCase() : '';
  if (FRESHNESS_SENSITIVE_CONTENT_TYPES.has(contentType)) {
    return true;
  }
  const sampledText = [
    typeof runMetadata?.title === 'string' ? runMetadata.title : '',
    Array.isArray(blockMap) ? blockMap.slice(0, 6).map((block) => getBlockText(block)).join(' ') : '',
    typeof contentHtml === 'string' ? contentHtml.replace(/<[^>]+>/g, ' ') : ''
  ].join(' ');
  return FRESHNESS_EXPLICIT_RECENCY_PATTERNS.some((pattern) => pattern.test(sampledText));
}

function evaluateContentFreshness(contentHtml, runMetadata, blockMap = []) {
  const freshnessSensitive = isFreshnessSensitiveContent(contentHtml, runMetadata, blockMap);
  if (!freshnessSensitive) {
    return {
      verdict: 'pass',
      explanation: 'Freshness is not a material signal for this content.',
      details: {
        date_found: null,
        score_neutral: true,
        score_neutral_reason: 'freshness_not_material',
        scope_triggered: false,
        freshness_sensitive: false
      }
    };
  }
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
      verdict: 'partial',
      explanation: 'No visible update date was found for freshness-sensitive content.',
      details: {
        date_found: null,
        score_neutral: false,
        score_neutral_reason: null,
        scope_triggered: true,
        freshness_sensitive: true
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
      date_source: latestDate.source || null,
      freshness_sensitive: true
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
        broken_links: [],
        score_neutral: true,
        score_neutral_reason: 'internal_links_absent',
        scope_triggered: false
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
  performDeterministicChecks,
  ensureManifestPreflightStructure
};
