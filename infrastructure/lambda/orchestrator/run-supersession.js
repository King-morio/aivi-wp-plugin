const normalizePostId = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return '';
    }
    return String(Math.floor(numeric));
};

const normalizeSiteId = (value) => {
    return String(value || '').trim();
};

const buildArticleKey = ({ siteId, postId }) => {
    const normalizedSiteId = normalizeSiteId(siteId);
    const normalizedPostId = normalizePostId(postId);
    if (!normalizedSiteId || !normalizedPostId) {
        return '';
    }
    return `${normalizedSiteId}::${normalizedPostId}`;
};

const buildArticlePointerRunId = (articleKey) => {
    const normalizedArticleKey = String(articleKey || '').trim();
    if (!normalizedArticleKey) {
        return '';
    }
    return `article_latest::${normalizedArticleKey}`;
};

const buildArticlePointerItem = ({ articleKey, siteId, postId, runId, status = 'queued', now, ttl }) => {
    const pointerRunId = buildArticlePointerRunId(articleKey);
    if (!pointerRunId || !runId) {
        return null;
    }

    return {
        run_id: pointerRunId,
        item_type: 'article_latest_run_pointer',
        article_key: articleKey,
        site_id: normalizeSiteId(siteId) || null,
        post_id: normalizePostId(postId) || null,
        latest_run_id: String(runId),
        latest_run_status: String(status || 'queued'),
        created_at: now,
        updated_at: now,
        ttl
    };
};

const getRunArticleKey = (run = {}) => {
    const explicit = String(run.article_key || '').trim();
    if (explicit) {
        return explicit;
    }
    return buildArticleKey({
        siteId: run.site_id,
        postId: run.post_id
    });
};

const getSupersedingRunId = (run = {}, pointer = {}) => {
    const currentRunId = String(run.run_id || '').trim();
    const latestRunId = String(pointer.latest_run_id || '').trim();
    if (!currentRunId || !latestRunId || latestRunId === currentRunId) {
        return '';
    }
    return latestRunId;
};

module.exports = {
    normalizePostId,
    buildArticleKey,
    buildArticlePointerRunId,
    buildArticlePointerItem,
    getRunArticleKey,
    getSupersedingRunId
};
