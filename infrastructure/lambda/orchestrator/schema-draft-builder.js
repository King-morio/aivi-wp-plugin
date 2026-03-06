const SUPPORTED_SCHEMA_ASSIST_CHECKS = new Set([
    'faq_jsonld_presence_and_completeness',
    'howto_jsonld_presence_and_completeness',
    'howto_schema_presence_and_completeness',
    'intro_schema_suggestion',
    'schema_matches_content',
    'semantic_html_usage',
    'valid_jsonld_schema'
]);

const MAX_FAQ_ITEMS = 8;
const MAX_HOWTO_STEPS = 12;
const MAX_MARKUP_EXAMPLES = 4;
const CONTENT_TYPE_EXPECTED_SCHEMA_TYPES = {
    article: ['Article', 'BlogPosting', 'NewsArticle', 'WebPage'],
    post: ['Article', 'BlogPosting', 'NewsArticle', 'WebPage'],
    howto: ['HowTo'],
    'how-to': ['HowTo'],
    product: ['Product'],
    faq: ['FAQPage'],
    organization: ['Organization'],
    person: ['Person']
};

const normalizeText = (value, maxLen = 0) => {
    if (typeof value !== 'string') return '';
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (!Number.isFinite(maxLen) || maxLen <= 0) return normalized;
    return normalized.length <= maxLen ? normalized : `${normalized.slice(0, Math.max(0, maxLen - 3)).trim()}...`;
};

const cleanHtmlToText = (value) => {
    const source = typeof value === 'string' ? value : '';
    if (!source) return '';
    return normalizeText(source.replace(/<[^>]+>/g, ' '));
};

const getBlockText = (block) => {
    if (!block || typeof block !== 'object') return '';
    if (typeof block.text === 'string' && block.text.trim()) return normalizeText(block.text);
    if (typeof block.text_content === 'string' && block.text_content.trim()) return normalizeText(block.text_content);
    return '';
};

const getBlockType = (block) => String(block?.block_type || '').toLowerCase().trim();

const isHeadingBlock = (block) => {
    const blockType = getBlockType(block);
    if (!blockType) return false;
    if (blockType.includes('heading')) return true;
    return /\/h[1-6]$/.test(blockType);
};

const isListBlock = (block) => {
    const blockType = getBlockType(block);
    return blockType.includes('/list') || blockType.endsWith('/ol') || blockType.endsWith('/ul');
};

const countWords = (value) => {
    const text = normalizeText(value);
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
};

const isQuestionHeading = (text) => {
    const value = normalizeText(text, 220);
    if (!value) return false;
    if (value.endsWith('?')) return true;
    return /^(what|why|how|when|where|who|which|is|are|can|does|do|should|will)\b/i.test(value);
};

const isStepHeading = (text) => {
    const value = normalizeText(text, 220);
    if (!value) return false;
    return /^step\s+\d+\b/i.test(value) || /^how to\b/i.test(value);
};

const collectHeadingSections = (blockMap) => {
    const blocks = Array.isArray(blockMap) ? blockMap : [];
    const sections = [];
    let current = null;
    blocks.forEach((block) => {
        if (!block || typeof block !== 'object') return;
        if (isHeadingBlock(block)) {
            if (current) sections.push(current);
            current = {
                heading: normalizeText(getBlockText(block), 240),
                heading_node_ref: String(block.node_ref || '').trim(),
                support_blocks: [],
                support_text: '',
                support_word_count: 0
            };
            return;
        }
        if (!current) return;
        const text = getBlockText(block);
        if (!text) return;
        current.support_blocks.push(block);
        current.support_text = normalizeText(`${current.support_text} ${text}`, 4000);
        current.support_word_count += countWords(text);
    });
    if (current) sections.push(current);
    return sections;
};

const parseListItems = (text) => {
    const value = typeof text === 'string' ? text : '';
    if (!value) return [];
    const lines = value.split(/\n+/).map((line) => normalizeText(line, 280)).filter(Boolean);
    const explicit = lines
        .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, '').trim())
        .filter(Boolean);
    if (explicit.length >= 2) return explicit;

    const sentenceParts = normalizeText(value, 2400)
        .split(/(?<=[.!?])\s+/)
        .map((part) => normalizeText(part, 240))
        .filter(Boolean);
    return sentenceParts.length >= 2 ? sentenceParts : [];
};

const dedupeObjects = (list, keyFn) => {
    const seen = new Set();
    const output = [];
    (Array.isArray(list) ? list : []).forEach((item) => {
        const key = String(keyFn(item) || '').toLowerCase().trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        output.push(item);
    });
    return output;
};

const inferCanonicalUrl = (manifest, runMetadata = {}) => {
    const candidates = [
        runMetadata?.canonical_url,
        runMetadata?.post_url,
        manifest?.canonical_url,
        manifest?.url
    ];
    for (const candidate of candidates) {
        const value = normalizeText(String(candidate || ''), 500);
        if (value) return value;
    }
    return '';
};

const inferTitle = (manifest, runMetadata = {}) => {
    const candidates = [manifest?.title, runMetadata?.title, runMetadata?.post_title];
    for (const candidate of candidates) {
        const value = normalizeText(String(candidate || ''), 220);
        if (value) return value;
    }
    return 'Untitled Article';
};

const inferDescription = (manifest, runMetadata = {}) => {
    const candidates = [
        runMetadata?.meta_description,
        manifest?.meta_description,
        runMetadata?.excerpt
    ];
    for (const candidate of candidates) {
        const value = cleanHtmlToText(candidate);
        if (value) return normalizeText(value, 260);
    }
    const plainText = normalizeText(manifest?.plain_text || '', 350);
    return plainText ? normalizeText(plainText, 220) : '';
};

const inferAuthor = (runMetadata = {}) => {
    const candidates = [runMetadata?.author_name, runMetadata?.author, runMetadata?.byline];
    for (const candidate of candidates) {
        const value = normalizeText(String(candidate || ''), 120);
        if (value) return value;
    }
    return '';
};

const inferDateValue = (runMetadata = {}) => {
    const candidates = [
        runMetadata?.post_modified,
        runMetadata?.updated_at,
        runMetadata?.post_date,
        runMetadata?.published_at
    ];
    for (const candidate of candidates) {
        const raw = String(candidate || '').trim();
        if (!raw) continue;
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString();
        }
    }
    return '';
};

const inferContentType = (runMetadata = {}) => {
    return String(runMetadata?.content_type || '').toLowerCase().trim();
};

const deepCloneObject = (value) => {
    if (!value || typeof value !== 'object') return null;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_error) {
        return null;
    }
};

const normalizeJsonldObjectsFromManifest = (manifest) => {
    const entries = Array.isArray(manifest?.jsonld) ? manifest.jsonld : [];
    const output = [];
    entries.forEach((entry) => {
        if (!entry) return;
        if (entry.parsed && typeof entry.parsed === 'object') {
            output.push(entry.parsed);
            return;
        }
        if (entry.json && typeof entry.json === 'object') {
            output.push(entry.json);
            return;
        }
        if (typeof entry.raw === 'string' && entry.raw.trim()) {
            try {
                const parsed = JSON.parse(entry.raw);
                if (parsed && typeof parsed === 'object') output.push(parsed);
            } catch (_error) {
                // Ignore malformed JSON-LD here; repair path handles invalid blocks.
            }
            return;
        }
        if (typeof entry === 'object' && entry['@type']) {
            output.push(entry);
        }
    });
    return output.filter((obj) => obj && typeof obj === 'object');
};

const inferExpectedTypes = ({ checkData, runMetadata }) => {
    const details = checkData?.details && typeof checkData.details === 'object'
        ? checkData.details
        : {};
    const expectedFromDetails = Array.isArray(details.expected_types)
        ? details.expected_types.map((item) => normalizeText(String(item || ''), 64)).filter(Boolean)
        : [];
    if (expectedFromDetails.length > 0) {
        return expectedFromDetails;
    }
    const contentType = normalizeText(
        String(details.content_type || inferContentType(runMetadata) || ''),
        40
    ).toLowerCase();
    const mapped = CONTENT_TYPE_EXPECTED_SCHEMA_TYPES[contentType];
    return Array.isArray(mapped) && mapped.length > 0 ? mapped : ['Article'];
};

const buildMinimalSchemaByType = ({ schemaType, manifest, runMetadata }) => {
    const type = normalizeText(String(schemaType || ''), 64) || 'Article';
    const title = inferTitle(manifest, runMetadata);
    const description = inferDescription(manifest, runMetadata);
    const author = inferAuthor(runMetadata);
    const published = inferDateValue(runMetadata);
    const url = inferCanonicalUrl(manifest, runMetadata);

    const base = {
        '@context': 'https://schema.org',
        '@type': type
    };

    if (type === 'HowTo') {
        base.name = title;
        if (description) base.description = description;
        base.step = [
            {
                '@type': 'HowToStep',
                name: 'Step 1',
                text: 'Describe the first actionable step from the article.'
            },
            {
                '@type': 'HowToStep',
                name: 'Step 2',
                text: 'Describe the next actionable step from the article.'
            }
        ];
    } else if (type === 'FAQPage') {
        base.mainEntity = [
            {
                '@type': 'Question',
                name: 'Replace with a real question from your content.',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Replace with the matching answer from your content.'
                }
            }
        ];
    } else {
        base.headline = title;
        if (description) base.description = description;
        if (author) {
            base.author = { '@type': 'Person', name: author };
        }
        if (published) {
            base.datePublished = published;
            base.dateModified = published;
        }
    }

    if (url) base.url = url;
    return base;
};

const buildFaqPairsFromCheckDetails = (checkData) => {
    const details = checkData?.details;
    if (!details || typeof details !== 'object') return [];
    const candidates = []
        .concat(Array.isArray(details.faq_pairs) ? details.faq_pairs : [])
        .concat(Array.isArray(details.detected_pairs) ? details.detected_pairs : [])
        .concat(Array.isArray(details.question_answer_pairs) ? details.question_answer_pairs : []);

    return dedupeObjects(candidates.map((pair) => ({
        question: normalizeText(pair?.question || pair?.q || '', 180),
        answer: normalizeText(pair?.answer || pair?.a || '', 500)
    })).filter((pair) => pair.question && pair.answer), (pair) => pair.question);
};

const buildFaqPairsFromManifest = (manifest) => {
    const blockMap = Array.isArray(manifest?.block_map) ? manifest.block_map : [];
    const sections = collectHeadingSections(blockMap);
    const pairs = sections
        .filter((section) => isQuestionHeading(section.heading))
        .map((section) => ({
            question: normalizeText(section.heading, 180),
            answer: normalizeText(section.support_text, 500)
        }))
        .filter((pair) => pair.question && countWords(pair.answer) >= 6);
    return dedupeObjects(pairs, (pair) => pair.question);
};

const buildFaqSchemaDraft = ({ checkData, manifest, runMetadata }) => {
    const fromDetails = buildFaqPairsFromCheckDetails(checkData);
    const fromManifest = buildFaqPairsFromManifest(manifest);
    const pairs = dedupeObjects([...fromDetails, ...fromManifest], (pair) => pair.question)
        .slice(0, MAX_FAQ_ITEMS);

    if (pairs.length < 2) {
        return {
            schema_kind: 'faq_jsonld',
            draft_jsonld: null,
            can_copy: false,
            can_insert: false,
            generation_mode: 'insufficient_input',
            generation_notes: [
                'Could not extract at least 2 deterministic FAQ pairs from current content.'
            ]
        };
    }

    const jsonld = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: pairs.map((pair) => ({
            '@type': 'Question',
            name: pair.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: pair.answer
            }
        }))
    };

    const url = inferCanonicalUrl(manifest, runMetadata);
    if (url) jsonld.url = url;

    return {
        schema_kind: 'faq_jsonld',
        draft_jsonld: jsonld,
        can_copy: true,
        can_insert: true,
        generation_mode: 'deterministic_extract',
        generation_notes: [
            `Generated FAQPage draft from ${pairs.length} deterministic Q/A pairs.`
        ]
    };
};

const buildHowToStepsFromDetails = (checkData) => {
    const details = checkData?.details;
    if (!details || typeof details !== 'object') return [];
    const candidates = []
        .concat(Array.isArray(details.steps) ? details.steps : [])
        .concat(Array.isArray(details.detected_steps) ? details.detected_steps : [])
        .concat(Array.isArray(details.howto_steps) ? details.howto_steps : []);
    return dedupeObjects(candidates.map((step) => ({
        text: normalizeText(typeof step === 'string' ? step : (step?.text || step?.name || ''), 260)
    })).filter((step) => step.text), (step) => step.text);
};

const buildHowToStepsFromManifest = (manifest) => {
    const blockMap = Array.isArray(manifest?.block_map) ? manifest.block_map : [];
    const listSteps = [];
    blockMap.forEach((block) => {
        if (!isListBlock(block)) return;
        parseListItems(getBlockText(block)).forEach((text) => listSteps.push({ text }));
    });

    const headingSteps = collectHeadingSections(blockMap)
        .filter((section) => isStepHeading(section.heading))
        .map((section) => ({ text: normalizeText(section.heading, 200) }));

    return dedupeObjects([...listSteps, ...headingSteps], (step) => step.text);
};

const buildHowToSchemaDraft = ({ checkData, manifest, runMetadata }) => {
    const steps = dedupeObjects(
        [...buildHowToStepsFromDetails(checkData), ...buildHowToStepsFromManifest(manifest)],
        (step) => step.text
    ).slice(0, MAX_HOWTO_STEPS);

    if (steps.length < 2) {
        return {
            schema_kind: 'howto_jsonld',
            draft_jsonld: null,
            can_copy: false,
            can_insert: false,
            generation_mode: 'insufficient_input',
            generation_notes: [
                'Could not extract at least 2 deterministic how-to steps from current content.'
            ]
        };
    }

    const title = inferTitle(manifest, runMetadata);
    const description = inferDescription(manifest, runMetadata);
    const jsonld = {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: title,
        ...(description ? { description } : {}),
        step: steps.map((step, idx) => ({
            '@type': 'HowToStep',
            name: `Step ${idx + 1}`,
            text: step.text
        }))
    };

    const url = inferCanonicalUrl(manifest, runMetadata);
    if (url) jsonld.url = url;

    return {
        schema_kind: 'howto_jsonld',
        draft_jsonld: jsonld,
        can_copy: true,
        can_insert: true,
        generation_mode: 'deterministic_extract',
        generation_notes: [
            `Generated HowTo draft from ${steps.length} deterministic steps.`
        ]
    };
};

const buildHowToSeedDraft = ({ manifest, runMetadata }) => {
    const sections = collectHeadingSections(Array.isArray(manifest?.block_map) ? manifest.block_map : []);
    const derivedSteps = sections
        .filter((section) => section.heading && section.support_word_count >= 8)
        .slice(0, MAX_HOWTO_STEPS)
        .map((section, idx) => ({
            '@type': 'HowToStep',
            name: normalizeText(section.heading, 120) || `Step ${idx + 1}`,
            text: normalizeText(section.support_text, 220) || `Describe how to complete "${normalizeText(section.heading, 80)}".`
        }));

    const hasDeterministicSteps = derivedSteps.length >= 2;
    const fallbackSteps = hasDeterministicSteps
        ? derivedSteps
        : [
            {
                '@type': 'HowToStep',
                name: 'Step 1',
                text: 'Replace with the first concrete action from your article.'
            },
            {
                '@type': 'HowToStep',
                name: 'Step 2',
                text: 'Replace with the next concrete action from your article.'
            }
        ];

    const title = inferTitle(manifest, runMetadata);
    const description = inferDescription(manifest, runMetadata);
    const url = inferCanonicalUrl(manifest, runMetadata);
    const jsonld = {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: title,
        ...(description ? { description } : {}),
        step: fallbackSteps
    };
    if (url) jsonld.url = url;

    return {
        schema_kind: 'howto_jsonld',
        draft_jsonld: jsonld,
        can_copy: true,
        can_insert: hasDeterministicSteps,
        generation_mode: hasDeterministicSteps ? 'semantic_bridge_section_extract' : 'semantic_bridge_template_seed',
        generation_notes: hasDeterministicSteps
            ? ['Generated HowTo draft from heading-supported sections in the article.']
            : ['Generated a HowTo template seed. Replace placeholder step text before inserting.']
    };
};

const buildHowToSemanticBridgeDraft = ({ checkData, manifest, runMetadata, allChecks }) => {
    const sibling = allChecks && typeof allChecks === 'object'
        ? allChecks.howto_jsonld_presence_and_completeness
        : null;
    const primaryDraft = buildHowToSchemaDraft({
        checkData: (sibling && typeof sibling === 'object') ? sibling : checkData,
        manifest,
        runMetadata
    });
    if (primaryDraft && primaryDraft.can_copy === true) {
        return {
            ...primaryDraft,
            generation_mode: sibling ? 'semantic_bridge_deterministic_extract' : primaryDraft.generation_mode,
            generation_notes: sibling
                ? ['Generated HowTo draft via deterministic bridge from HowTo schema completeness signals.']
                : primaryDraft.generation_notes
        };
    }
    return buildHowToSeedDraft({ manifest, runMetadata });
};

const buildSchemaMatchesContentDraft = ({ checkData, manifest, runMetadata }) => {
    const details = checkData?.details && typeof checkData.details === 'object'
        ? checkData.details
        : {};
    const expectedTypes = inferExpectedTypes({ checkData, runMetadata });
    const targetType = expectedTypes[0] || 'Article';
    const detectedTypes = Array.isArray(details.detected_types)
        ? details.detected_types.map((item) => normalizeText(String(item || ''), 64)).filter(Boolean)
        : [];

    const manifestJsonLd = normalizeJsonldObjectsFromManifest(manifest);
    const sourceObject = manifestJsonLd.length > 0 ? deepCloneObject(manifestJsonLd[0]) : null;
    const draft = sourceObject || buildMinimalSchemaByType({
        schemaType: targetType,
        manifest,
        runMetadata
    });
    if (!draft || typeof draft !== 'object') {
        return {
            schema_kind: 'schema_alignment_jsonld',
            draft_jsonld: null,
            can_copy: false,
            can_insert: false,
            generation_mode: 'insufficient_input',
            generation_notes: ['Could not derive a schema alignment draft from current content.']
        };
    }

    draft['@context'] = draft['@context'] || 'https://schema.org';
    draft['@type'] = targetType;
    if (targetType === 'HowTo' && (!Array.isArray(draft.step) || draft.step.length < 1)) {
        draft.step = [
            {
                '@type': 'HowToStep',
                name: 'Step 1',
                text: 'Add a concrete action step from your content.'
            }
        ];
    }
    if (targetType === 'FAQPage' && (!Array.isArray(draft.mainEntity) || draft.mainEntity.length < 1)) {
        draft.mainEntity = [
            {
                '@type': 'Question',
                name: 'Replace with a real question from the article.',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Replace with the matching answer from the article.'
                }
            }
        ];
    }
    if (!draft.headline && !draft.name && targetType !== 'FAQPage' && targetType !== 'HowTo') {
        draft.headline = inferTitle(manifest, runMetadata);
    }
    if (!draft.url) {
        const url = inferCanonicalUrl(manifest, runMetadata);
        if (url) draft.url = url;
    }

    return {
        schema_kind: 'schema_alignment_jsonld',
        draft_jsonld: draft,
        can_copy: true,
        can_insert: true,
        generation_mode: sourceObject ? 'deterministic_alignment_adjustment' : 'deterministic_alignment_seed',
        generation_notes: [
            `Aligned schema @type to ${targetType}.`,
            detectedTypes.length > 0
                ? `Detected schema types: ${detectedTypes.join(', ')}.`
                : 'No detected schema types were available; generated a safe alignment seed.'
        ]
    };
};

const buildSemanticHtmlUsageDraft = ({ checkData, manifest }) => {
    const details = checkData?.details && typeof checkData.details === 'object'
        ? checkData.details
        : {};
    const tagsFound = Array.isArray(details.tags_found)
        ? details.tags_found.map((tag) => normalizeText(String(tag || ''), 40).toLowerCase()).filter(Boolean)
        : [];
    const sections = collectHeadingSections(Array.isArray(manifest?.block_map) ? manifest.block_map : []);
    const sampleSections = sections
        .filter((section) => section.heading)
        .slice(0, MAX_MARKUP_EXAMPLES)
        .map((section) => ({
            heading: normalizeText(section.heading, 120),
            support_word_count: Number(section.support_word_count || 0),
            recommended_wrapper: '<section>'
        }));

    const introBlock = Array.isArray(manifest?.block_map) ? manifest.block_map.find((block) => {
        const type = getBlockType(block);
        return type.includes('paragraph') || type.includes('heading');
    }) : null;
    const introText = normalizeText(getBlockText(introBlock), 240);
    const firstSentence = introText.split(/(?<=[.!?])\s+/)[0] || introText;

    const markupPlan = {
        plan_type: 'semantic_markup_upgrade',
        tags_found: tagsFound,
        recommended_structure: [
            '<article>',
            '<section>',
            '<h2>Section heading</h2>',
            '<p>Supporting paragraph with one core claim.</p>',
            '</section>',
            '</article>'
        ],
        heading_section_samples: sampleSections,
        list_conversion_example: {
            from: firstSentence || 'First, optimize images. Second, minify CSS/JS. Third, enable caching.',
            to: '<ul><li>Optimize images</li><li>Minify CSS/JS</li><li>Enable browser caching</li></ul>'
        },
        usage_note: 'Use semantic tags to express structure and meaning, not visual styling only.'
    };

    return {
        schema_kind: 'semantic_markup_plan',
        draft_jsonld: markupPlan,
        can_copy: true,
        can_insert: false,
        generation_mode: 'deterministic_semantic_markup_plan',
        generation_notes: [
            tagsFound.length > 0
                ? `Detected semantic tags: ${tagsFound.join(', ')}. Expand semantic coverage for clearer structure.`
                : 'No semantic tags detected. Start with article/section/heading/list semantics.',
            'Copy this plan and apply changes in your theme/editor markup.'
        ]
    };
};

const inferIntroSchemaType = ({ manifest, runMetadata, checkData }) => {
    const explicitType = normalizeText(checkData?.details?.recommended_schema_type || '', 60);
    if (explicitType) return explicitType;
    const contentType = inferContentType(runMetadata);
    if (contentType === 'howto' || contentType === 'how-to') return 'HowTo';
    if (contentType === 'faq') return 'FAQPage';
    return 'Article';
};

const buildIntroSchemaSuggestionDraft = ({ checkData, manifest, runMetadata }) => {
    const schemaType = inferIntroSchemaType({ manifest, runMetadata, checkData });
    const title = inferTitle(manifest, runMetadata);
    const description = inferDescription(manifest, runMetadata);
    const author = inferAuthor(runMetadata);
    const published = inferDateValue(runMetadata);
    const url = inferCanonicalUrl(manifest, runMetadata);

    const base = {
        '@context': 'https://schema.org',
        '@type': schemaType
    };

    if (schemaType === 'HowTo') {
        base.name = title;
        if (description) base.description = description;
        base.step = [
            {
                '@type': 'HowToStep',
                name: 'Step 1',
                text: 'Add a concrete first step from the article body.'
            },
            {
                '@type': 'HowToStep',
                name: 'Step 2',
                text: 'Add the next step from the article body.'
            }
        ];
    } else if (schemaType === 'FAQPage') {
        base.mainEntity = [
            {
                '@type': 'Question',
                name: 'Replace with a real question from your intro/body.',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Replace with the matching answer from your content.'
                }
            }
        ];
    } else {
        base.headline = title;
        if (description) base.description = description;
        if (author) {
            base.author = { '@type': 'Person', name: author };
        }
        if (published) {
            base.datePublished = published;
            base.dateModified = published;
        }
    }

    if (url) base.url = url;

    return {
        schema_kind: 'intro_schema_jsonld',
        draft_jsonld: base,
        can_copy: true,
        can_insert: true,
        generation_mode: 'template_seed',
        generation_notes: [
            `Generated ${schemaType} draft from intro deterministic signals.`,
            'Review placeholders before publishing.'
        ]
    };
};

const inferFallbackSchemaType = (runMetadata = {}) => {
    const contentType = inferContentType(runMetadata);
    if (contentType === 'howto' || contentType === 'how-to') return 'HowTo';
    if (contentType === 'faq') return 'FAQPage';
    return 'Article';
};

const buildValidJsonLdRepairDraft = ({ manifest, runMetadata }) => {
    const invalidCount = Array.isArray(manifest?.jsonld)
        ? manifest.jsonld.filter((entry) => entry && entry.valid === false).length
        : 0;
    const fallbackType = inferFallbackSchemaType(runMetadata);
    const title = inferTitle(manifest, runMetadata);
    const description = inferDescription(manifest, runMetadata);
    const author = inferAuthor(runMetadata);
    const published = inferDateValue(runMetadata);
    const url = inferCanonicalUrl(manifest, runMetadata);

    const jsonld = {
        '@context': 'https://schema.org',
        '@type': fallbackType,
        ...(fallbackType === 'HowTo'
            ? {
                name: title,
                ...(description ? { description } : {}),
                step: [
                    {
                        '@type': 'HowToStep',
                        name: 'Step 1',
                        text: 'Replace with a real step from content.'
                    }
                ]
            }
            : {
                headline: title,
                ...(description ? { description } : {})
            })
    };

    if (fallbackType !== 'HowTo' && author) {
        jsonld.author = { '@type': 'Person', name: author };
    }
    if (published && fallbackType !== 'HowTo') {
        jsonld.datePublished = published;
        jsonld.dateModified = published;
    }
    if (url) jsonld.url = url;

    return {
        schema_kind: 'jsonld_repair',
        draft_jsonld: jsonld,
        can_copy: true,
        can_insert: false,
        generation_mode: 'repair_fallback',
        generation_notes: [
            `Detected ${invalidCount} invalid JSON-LD block(s).`,
            'Generated a safe replacement draft. Review before applying.'
        ]
    };
};

const buildSchemaAssistDraft = ({
    checkId,
    checkData = {},
    manifest = {},
    runMetadata = {},
    allChecks = {}
}) => {
    const normalizedCheckId = String(checkId || '').trim();
    if (!SUPPORTED_SCHEMA_ASSIST_CHECKS.has(normalizedCheckId)) return null;

    const verdict = String(checkData?.verdict || '').toLowerCase().trim();
    if (verdict === 'pass') return null;

    let payload = null;
    if (normalizedCheckId === 'faq_jsonld_presence_and_completeness') {
        payload = buildFaqSchemaDraft({ checkData, manifest, runMetadata });
    } else if (normalizedCheckId === 'howto_jsonld_presence_and_completeness') {
        payload = buildHowToSchemaDraft({ checkData, manifest, runMetadata });
    } else if (normalizedCheckId === 'howto_schema_presence_and_completeness') {
        payload = buildHowToSemanticBridgeDraft({ checkData, manifest, runMetadata, allChecks });
    } else if (normalizedCheckId === 'intro_schema_suggestion') {
        payload = buildIntroSchemaSuggestionDraft({ checkData, manifest, runMetadata });
    } else if (normalizedCheckId === 'schema_matches_content') {
        payload = buildSchemaMatchesContentDraft({ checkData, manifest, runMetadata });
    } else if (normalizedCheckId === 'semantic_html_usage') {
        payload = buildSemanticHtmlUsageDraft({ checkData, manifest });
    } else if (normalizedCheckId === 'valid_jsonld_schema') {
        payload = buildValidJsonLdRepairDraft({ checkData, manifest, runMetadata });
    }

    if (!payload || typeof payload !== 'object') return null;
    return {
        check_id: normalizedCheckId,
        generator: 'deterministic_schema_builder_v1',
        schema_kind: String(payload.schema_kind || '').trim(),
        draft_jsonld: payload.draft_jsonld || null,
        can_copy: payload.can_copy === true,
        can_insert: payload.can_insert === true,
        generation_mode: String(payload.generation_mode || 'unknown'),
        generation_notes: Array.isArray(payload.generation_notes)
            ? payload.generation_notes.map((note) => normalizeText(String(note || ''), 260)).filter(Boolean)
            : []
    };
};

module.exports = {
    SUPPORTED_SCHEMA_ASSIST_CHECKS,
    buildSchemaAssistDraft,
    __testHooks: {
        normalizeText,
        cleanHtmlToText,
        collectHeadingSections,
        buildFaqPairsFromManifest,
        buildHowToStepsFromManifest,
        buildFaqSchemaDraft,
        buildHowToSchemaDraft,
        buildHowToSeedDraft,
        buildHowToSemanticBridgeDraft,
        buildSchemaMatchesContentDraft,
        buildSemanticHtmlUsageDraft,
        buildIntroSchemaSuggestionDraft,
        buildValidJsonLdRepairDraft
    }
};
