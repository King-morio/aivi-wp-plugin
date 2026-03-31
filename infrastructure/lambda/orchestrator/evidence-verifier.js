const { parseDocument } = require('htmlparser2');

const DEFAULT_PROVIDER = 'duckduckgo_html';
const SEARCH_TIMEOUT_MS = 12000;
const MAX_RESULTS = 5;
const MAX_SELECTED_RESULTS = 3;

const STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'by', 'for', 'from',
    'has', 'have', 'how', 'if', 'in', 'into', 'is', 'it', 'its', 'may', 'more',
    'of', 'on', 'or', 'that', 'the', 'their', 'there', 'this', 'to', 'was',
    'were', 'what', 'when', 'where', 'which', 'with', 'within', 'without', 'you',
    'your'
]);

const STRONG_AUTHORITY_DOMAINS = [
    'who.int',
    'nih.gov',
    'cdc.gov',
    'nhs.uk',
    'medlineplus.gov',
    'cancer.gov',
    'mayoclinic.org'
];

const normalizeText = (value) => {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
};

const isVerificationTimeoutError = (error) => {
    if (!error) return false;
    const name = String(error.name || '').trim().toLowerCase();
    const message = String(error.message || '').trim().toLowerCase();
    return name === 'aborterror'
        || message.includes('abort')
        || message.includes('timeout');
};

const clampString = (value, maxLen = 0) => {
    const text = normalizeText(String(value || ''));
    if (!Number.isFinite(maxLen) || maxLen <= 0 || text.length <= maxLen) return text;
    return `${text.slice(0, Math.max(0, maxLen - 3)).trim()}...`;
};

const tokenize = (value) => normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));

const uniqueTokens = (tokens, max = 0) => {
    const seen = new Set();
    const output = [];
    (Array.isArray(tokens) ? tokens : []).forEach((token) => {
        const normalized = String(token || '').trim().toLowerCase();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        output.push(normalized);
    });
    return max > 0 ? output.slice(0, max) : output;
};

const buildEvidenceSearchQuery = ({ suggestion, issueContext, manifest } = {}) => {
    const suggestionText = clampString(
        suggestion && typeof suggestion.text === 'string'
            ? suggestion.text
            : (issueContext && typeof issueContext.snippet === 'string' ? issueContext.snippet : ''),
        240
    );
    const title = clampString(manifest && typeof manifest.title === 'string' ? manifest.title : '', 140);
    const headingChain = Array.isArray(issueContext && issueContext.heading_chain)
        ? issueContext.heading_chain.map((item) => clampString(item, 100)).filter(Boolean)
        : [];
    const sectionText = clampString(issueContext && typeof issueContext.section_text === 'string' ? issueContext.section_text : '', 180);

    const tokens = uniqueTokens([
        ...tokenize(suggestionText),
        ...tokenize(headingChain.slice(-2).join(' ')),
        ...tokenize(title),
        ...tokenize(sectionText).slice(0, 8)
    ], 18);

    return tokens.join(' ');
};

const hasClass = (node, className) => {
    if (!node || !node.attribs || typeof node.attribs.class !== 'string') return false;
    return node.attribs.class.split(/\s+/).includes(className);
};

const walk = (node, visit) => {
    if (!node) return;
    visit(node);
    const children = Array.isArray(node.children) ? node.children : [];
    children.forEach((child) => walk(child, visit));
};

const getText = (node) => {
    if (!node) return '';
    if (node.type === 'text') return normalizeText(node.data || '');
    const children = Array.isArray(node.children) ? node.children : [];
    return normalizeText(children.map((child) => getText(child)).join(' '));
};

const findFirstDescendant = (node, predicate) => {
    if (!node) return null;
    const children = Array.isArray(node.children) ? node.children : [];
    for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        if (predicate(child)) return child;
        const nested = findFirstDescendant(child, predicate);
        if (nested) return nested;
    }
    return null;
};

const findClosestResultContainer = (node) => {
    let current = node && node.parent ? node.parent : null;
    while (current) {
        if (hasClass(current, 'result')) return current;
        current = current.parent || null;
    }
    return null;
};

const normalizeResultUrl = (href = '') => {
    const raw = String(href || '').trim();
    if (!raw) return '';
    try {
        const decoded = raw.includes('uddg=')
            ? decodeURIComponent(raw.split('uddg=')[1].split('&')[0] || '')
            : raw;
        const url = new URL(decoded);
        if (!/^https?:$/i.test(url.protocol)) return '';
        url.hash = '';
        return url.toString();
    } catch (error) {
        return '';
    }
};

const getHostname = (url = '') => {
    try {
        const parsed = new URL(url);
        return String(parsed.hostname || '').replace(/^www\./i, '').toLowerCase();
    } catch (error) {
        return '';
    }
};

const scoreEvidenceResult = (result, keywords = []) => {
    const haystackTokens = uniqueTokens([
        ...tokenize(result && result.title),
        ...tokenize(result && result.snippet),
        ...tokenize(result && result.domain)
    ]);
    if (!keywords.length || !haystackTokens.length) return 0;

    const haystackSet = new Set(haystackTokens);
    const overlap = keywords.filter((token) => haystackSet.has(token));
    const overlapRatio = overlap.length / Math.min(Math.max(keywords.length, 1), 10);
    const titleOverlap = keywords.filter((token) => tokenize(result && result.title).includes(token)).length;
    const snippetOverlap = keywords.filter((token) => tokenize(result && result.snippet).includes(token)).length;
    const domain = String(result && result.domain || '').toLowerCase();

    let authorityBonus = 0;
    if (domain.endsWith('.gov') || domain.endsWith('.edu')) {
        authorityBonus = 0.22;
    } else if (STRONG_AUTHORITY_DOMAINS.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`))) {
        authorityBonus = 0.18;
    } else if (domain.endsWith('.org')) {
        authorityBonus = 0.08;
    }

    const titleBonus = titleOverlap > 0 ? Math.min(0.2, titleOverlap * 0.05) : 0;
    const snippetBonus = snippetOverlap > 0 ? Math.min(0.18, snippetOverlap * 0.04) : 0;

    return Math.max(0, Math.min(1, (overlapRatio * 0.65) + authorityBonus + titleBonus + snippetBonus));
};

const classifyEvidenceResults = (results = [], keywords = []) => {
    const scored = (Array.isArray(results) ? results : [])
        .map((result) => ({
            ...result,
            score: scoreEvidenceResult(result, keywords)
        }))
        .sort((a, b) => b.score - a.score);

    const selected = scored
        .filter((result) => result.score >= 0.24)
        .slice(0, MAX_SELECTED_RESULTS);

    if (!selected.length) {
        return {
            status: 'no_verifiable_support',
            selected_results: [],
            all_results: scored
        };
    }

    const topScore = selected[0].score;
    if (topScore >= 0.56) {
        return {
            status: 'support_found',
            selected_results: selected,
            all_results: scored
        };
    }

    return {
        status: 'weak_support',
        selected_results: selected,
        all_results: scored
    };
};

const parseDuckDuckGoResults = (html = '') => {
    const doc = parseDocument(String(html || ''));
    const anchorNodes = [];
    walk(doc, (node) => {
        if (node && node.type === 'tag' && node.name === 'a' && hasClass(node, 'result__a')) {
            anchorNodes.push(node);
        }
    });

    const seenUrls = new Set();
    const results = [];

    anchorNodes.forEach((anchor) => {
        const url = normalizeResultUrl(anchor.attribs && anchor.attribs.href);
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);
        const container = findClosestResultContainer(anchor);
        const snippetNode = findFirstDescendant(container || anchor, (node) => hasClass(node, 'result__snippet'));
        const title = clampString(getText(anchor), 180);
        const snippet = clampString(getText(snippetNode), 280);
        const domain = getHostname(url);
        if (!title || !domain) return;
        results.push({
            title,
            url,
            domain,
            snippet
        });
    });

    return results.slice(0, MAX_RESULTS);
};

const buildVerificationMessage = (status, selectedResults = [], options = {}) => {
    const timedOut = options && options.timed_out === true;
    if (status === 'support_found') {
        return `AiVI found ${selectedResults.length} closely related source${selectedResults.length === 1 ? '' : 's'} for this issue and can use them carefully when framing variants.`;
    }
    if (status === 'weak_support') {
        return 'AiVI found some related support for this issue, but not enough to treat it as proof. Any variants should keep the wording measured and avoid claiming more than the support allows.';
    }
    if (status === 'verification_unavailable') {
        return timedOut
            ? 'AiVI could not finish a quick web verification pass in time, so it fell back to safer local-only variants for now.'
            : 'AiVI could not finish web verification just now, so it fell back to safer local-only variants for now.';
    }
    return 'AiVI could not find verifiable data closely related to this claim. Any variants should keep the wording measured, and you may want to narrow the claim or add a trustworthy source.';
};

const finalizeVerificationResult = (baseResult = {}, startedAt = Date.now()) => {
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    return {
        requested: baseResult.requested === true,
        provider: baseResult.provider || DEFAULT_PROVIDER,
        verification_intent: baseResult.verification_intent || null,
        status: baseResult.status || 'verification_unavailable',
        query: typeof baseResult.query === 'string' ? baseResult.query : '',
        selected_results: Array.isArray(baseResult.selected_results) ? baseResult.selected_results : [],
        all_results_count: Number.isFinite(Number(baseResult.all_results_count))
            ? Number(baseResult.all_results_count)
            : (Array.isArray(baseResult.selected_results) ? baseResult.selected_results.length : 0),
        message: normalizeText(baseResult.message || ''),
        timeout_ms: SEARCH_TIMEOUT_MS,
        elapsed_ms: elapsedMs,
        timed_out: baseResult.timed_out === true,
        error: baseResult.error ? String(baseResult.error) : null,
        error_reason: baseResult.error_reason ? String(baseResult.error_reason) : null
    };
};

const fetchDuckDuckGoResults = async (query, fetchImpl) => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
        ? setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
        : null;
    try {
        const params = new URLSearchParams({
            q: query,
            kl: 'us-en'
        });
        const response = await fetchImpl(`https://html.duckduckgo.com/html/?${params.toString()}`, {
            method: 'GET',
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'User-Agent': 'AiVI Evidence Verifier/1.0'
            },
            signal: controller ? controller.signal : undefined
        });
        if (!response || !response.ok) {
            throw new Error(`search_http_${response ? response.status : 'failed'}`);
        }
        const html = await response.text();
        return parseDuckDuckGoResults(html);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const performEvidenceVerification = async (context = {}, fetchImpl = fetch) => {
    const startedAt = Date.now();
    const verificationIntent = String(context.verification_intent || '').trim().toLowerCase();
    const copilotMode = String(context.fixAssistContract && context.fixAssistContract.copilot_mode || '').trim().toLowerCase();

    if (verificationIntent !== 'verify_first') {
        return null;
    }

    if (copilotMode !== 'web_backed_evidence_assist') {
        return finalizeVerificationResult({
            requested: true,
            provider: DEFAULT_PROVIDER,
            verification_intent: verificationIntent,
            status: 'verification_skipped',
            query: '',
            selected_results: [],
            all_results_count: 0,
            message: 'AiVI kept this request local because the selected issue is using the local assist path.'
        }, startedAt);
    }

    const query = buildEvidenceSearchQuery(context);
    if (!query) {
        return finalizeVerificationResult({
            requested: true,
            provider: DEFAULT_PROVIDER,
            verification_intent: verificationIntent,
            status: 'verification_unavailable',
            query: '',
            selected_results: [],
            all_results_count: 0,
            message: 'AiVI could not build a reliable search query for this issue, so a local-only pass is safer for now.'
        }, startedAt);
    }

    const keywords = uniqueTokens(tokenize(query), 12);

    try {
        const results = await fetchDuckDuckGoResults(query, fetchImpl);
        const classified = classifyEvidenceResults(results, keywords);
        return finalizeVerificationResult({
            requested: true,
            provider: DEFAULT_PROVIDER,
            verification_intent: verificationIntent,
            status: classified.status,
            query,
            selected_results: classified.selected_results.map((result) => ({
                title: clampString(result.title, 180),
                url: result.url,
                domain: result.domain,
                snippet: clampString(result.snippet, 240),
                score: Number(result.score.toFixed(3))
            })),
            all_results_count: classified.all_results.length,
            message: buildVerificationMessage(classified.status, classified.selected_results)
        }, startedAt);
    } catch (error) {
        const timedOut = isVerificationTimeoutError(error);
        return finalizeVerificationResult({
            requested: true,
            provider: DEFAULT_PROVIDER,
            verification_intent: verificationIntent,
            status: 'verification_unavailable',
            query,
            selected_results: [],
            all_results_count: 0,
            message: buildVerificationMessage('verification_unavailable', [], { timed_out: timedOut }),
            timed_out: timedOut,
            error: error && error.message ? String(error.message) : 'verification_failed',
            error_reason: timedOut ? 'timeout' : 'search_failed'
        }, startedAt);
    }
};

module.exports = {
    performEvidenceVerification,
    __testHooks: {
        buildEvidenceSearchQuery,
        parseDuckDuckGoResults,
        scoreEvidenceResult,
        classifyEvidenceResults,
        normalizeResultUrl,
        getHostname,
        tokenize,
        uniqueTokens,
        buildVerificationMessage
    }
};
