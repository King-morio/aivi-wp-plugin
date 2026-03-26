/**
 * Async Analyze Run Handler - POST /aivi/v1/analyze/run
 *
 * Accepts analysis request, validates quickly, enqueues to SQS, returns 202.
 * This handler does NOT call Sonnet - that's done by the Worker Lambda.
 */

const { Buffer } = require('buffer');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const { buildReservationPreview } = require("./credit-pricing");
const { createReservationEvent, persistLedgerEvent } = require("./credit-ledger");
const { createAccountBillingStateStore, applyLedgerEventToState } = require("./billing-account-state");
const {
    normalizePostId,
    buildArticleKey,
    buildArticlePointerItem
} = require('./run-supersession');

// Initialize AWS clients
const ddbClient = new DynamoDBClient({});
const ddbDoc = DynamoDBDocumentClient.from(ddbClient);
const sqsClient = new SQSClient({});
const s3Client = new S3Client({});

// Environment variables
const getEnv = (key, defaultValue = undefined) => process.env[key] || defaultValue;

const parseBooleanFlag = (value) => {
    return value === true || value === 'true' || value === 1 || value === '1';
};

const normalizeFeatureFlags = (candidate = {}) => {
    const raw = candidate && typeof candidate === 'object' ? candidate : {};
    const resolveFlag = (key, envKey) => {
        if (Object.prototype.hasOwnProperty.call(raw, key)) {
            return parseBooleanFlag(raw[key]);
        }
        return parseBooleanFlag(getEnv(envKey, 'false'));
    };
    return {
        anchor_v2_enabled: resolveFlag('anchor_v2_enabled', 'ANCHOR_V2_ENABLED'),
        defer_details_enabled: resolveFlag('defer_details_enabled', 'DEFER_DETAILS_ENABLED'),
        partial_results_enabled: resolveFlag('partial_results_enabled', 'PARTIAL_RESULTS_ENABLED'),
        compact_prompt_enabled: resolveFlag('compact_prompt_enabled', 'COMPACT_PROMPT_ENABLED')
    };
};

/**
 * Log helper
 */
const log = (level, message, data = {}) => {
    console.log(JSON.stringify({ level, message, ...data, timestamp: new Date().toISOString() }));
};

const normalizeNonNegativeInt = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed);
};

const normalizeNullableInt = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor(parsed);
};

const normalizeIncomingAccountState = (candidate = {}) => {
    const raw = candidate && typeof candidate === 'object' ? candidate : {};
    const credits = raw.credits && typeof raw.credits === 'object' ? raw.credits : {};
    const entitlements = raw.entitlements && typeof raw.entitlements === 'object' ? raw.entitlements : {};
    const site = raw.site && typeof raw.site === 'object' ? raw.site : {};

    return {
        connected: raw.connected === true,
        connection_status: String(raw.connection_status || raw.connectionStatus || '').trim().toLowerCase(),
        account_id: String(raw.account_id || raw.accountId || '').trim(),
        account_label: String(raw.account_label || raw.accountLabel || '').trim(),
        plan_code: String(raw.plan_code || raw.planCode || '').trim(),
        plan_name: String(raw.plan_name || raw.planName || '').trim(),
        subscription_status: String(raw.subscription_status || raw.subscriptionStatus || '').trim(),
        trial_status: String(raw.trial_status || raw.trialStatus || '').trim(),
        site_binding_status: String(raw.site_binding_status || raw.siteBindingStatus || '').trim(),
        credits: {
            included_remaining: normalizeNullableInt(credits.included_remaining ?? credits.includedRemaining),
            topup_remaining: normalizeNullableInt(credits.topup_remaining ?? credits.topupRemaining),
            last_run_debit: normalizeNullableInt(credits.last_run_debit ?? credits.lastRunDebit)
        },
        entitlements: {
            analysis_allowed: entitlements.analysis_allowed === true || entitlements.analysisAllowed === true,
            site_limit_reached: entitlements.site_limit_reached === true || entitlements.siteLimitReached === true
        },
        site: {
            site_id: String(site.site_id || site.siteId || '').trim(),
            connected_domain: String(site.connected_domain || site.connectedDomain || '').trim()
        }
    };
};

const getAvailableCredits = (accountState) => {
    const included = normalizeNullableInt(accountState?.credits?.included_remaining);
    const topup = normalizeNullableInt(accountState?.credits?.topup_remaining);
    if (included === null && topup === null) return null;
    return (included || 0) + (topup || 0);
};

const buildBlockedReservationResponse = (statusCode, errorCode, message, extra = {}) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        ok: false,
        error: errorCode,
        message,
        ...extra
    })
});

const attemptSilentReservation = async ({ runId, runMetadata, manifest, tokenEstimate }) => {
    const incomingAccountState = normalizeIncomingAccountState(runMetadata.account_state || {});
    let accountState = incomingAccountState;
    const isConnected = accountState.connected && accountState.connection_status === 'connected';
    const allowUnboundAnalysis = parseBooleanFlag(getEnv('ALLOW_UNBOUND_ANALYSIS', 'false'));

    if (!isConnected || !accountState.account_id) {
        if (allowUnboundAnalysis) {
            return { mode: 'skipped', reason: 'local_or_unbound_site', metadata: null };
        }

        return {
            mode: 'blocked',
            response: buildBlockedReservationResponse(
                403,
                'account_connection_required',
                'Connect this site to an AiVI account and start a trial or plan before running analysis.'
            )
        };
    }

    try {
        const remoteState = await createAccountBillingStateStore().getAccountState(accountState.account_id);
        if (remoteState) {
            accountState = normalizeIncomingAccountState(remoteState);
        }
    } catch (error) {
        log('WARN', 'Failed to resolve authoritative billing state during admission; falling back to incoming state', {
            account_id: accountState.account_id,
            error: error.message
        });
    }

    if (accountState.entitlements.analysis_allowed !== true) {
        const siteLimitReached = accountState.entitlements.site_limit_reached || accountState.site_binding_status === 'limit_reached';
        const message = siteLimitReached
            ? 'This site has reached the plan site limit. Remove another connected site or upgrade the plan before analyzing again.'
            : 'Analysis is not available for this connected account right now. Add credits or update the plan in your AiVI account.';
        return {
            mode: 'blocked',
            response: buildBlockedReservationResponse(402, 'analysis_not_allowed', message, {
                account_state: {
                    plan_name: accountState.plan_name,
                    subscription_status: accountState.subscription_status,
                    trial_status: accountState.trial_status
                }
            })
        };
    }

    const preview = buildReservationPreview({
        model: getEnv('MISTRAL_MODEL', 'mistral-large-latest'),
        tokenEstimate,
        manifest
    });
    const reservedCredits = preview.usage_snapshot.credits_used;
    const availableCredits = getAvailableCredits(accountState);

    if (availableCredits !== null && reservedCredits > availableCredits) {
        return {
            mode: 'blocked',
            response: buildBlockedReservationResponse(402, 'insufficient_credits', 'You do not have enough AiVI credits to analyze this content. Add credits or upgrade the plan, then try again.', {
                billing: {
                    required_credits: reservedCredits,
                    available_credits: availableCredits
                }
            })
        };
    }

    const ledgerEvent = await persistLedgerEvent(createReservationEvent({
        account_id: accountState.account_id,
        site_id: runMetadata.site_id || accountState.site.site_id || 'unknown',
        run_id: runId,
        reason_code: 'analysis_admission',
        pricing_snapshot: preview.pricing_snapshot,
        amounts: {
            reserved_credits: reservedCredits,
            balance_before: availableCredits,
            balance_after: availableCredits === null ? null : Math.max(availableCredits - reservedCredits, 0)
        }
    }));

    try {
        const accountStateStore = createAccountBillingStateStore();
        const existingState = await accountStateStore.getAccountState(accountState.account_id);
        const nextState = applyLedgerEventToState(existingState || accountState, ledgerEvent);
        await accountStateStore.putAccountState(nextState);
    } catch (error) {
        log('WARN', 'Failed to apply reservation to authoritative billing state', {
            account_id: accountState.account_id,
            run_id: runId,
            error: error.message
        });
    }

    return {
        mode: 'reserved',
        metadata: {
            reservation_status: 'reserved',
            event_id: ledgerEvent.event_id,
            idempotency_key: ledgerEvent.idempotency_key,
            account_id: accountState.account_id,
            reserved_credits: reservedCredits,
            balance_before: ledgerEvent.amounts.balance_before,
            balance_after: ledgerEvent.amounts.balance_after,
            token_estimate: normalizeNonNegativeInt(tokenEstimate),
            pricing_snapshot: ledgerEvent.pricing_snapshot,
            created_at: ledgerEvent.created_at
        }
    };
};

/**
 * Creates initial run record in DynamoDB with status: queued
 */
const createQueuedRun = async (runId, metadata, manifestS3Key, options = {}) => {
    const now = new Date().toISOString();
    const featureFlags = normalizeFeatureFlags(options.featureFlags);
    const enableWebLookups = parseBooleanFlag(options.enableWebLookups);
    const normalizedPostId = normalizePostId(metadata.post_id);
    const articleKey = buildArticleKey({
        siteId: metadata.site_id,
        postId: normalizedPostId
    });

    const item = {
        run_id: runId,
        status: 'queued',
        site_id: metadata.site_id || 'unknown',
        post_id: normalizedPostId || null,
        article_key: articleKey || null,
        user_id: metadata.user_id || 'unknown',
        content_type: metadata.content_type || 'article',
        source: metadata.source || 'editor-sidebar',
        manifest_s3_key: manifestS3Key,
        prompt_version: metadata.prompt_version || 'v1',
        enable_web_lookups: enableWebLookups,
        feature_flags: featureFlags,
        credit_reservation: options.creditReservation || null,
        created_at: now,
        updated_at: now,
        ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days TTL
    };

    await ddbDoc.send(new PutCommand({
        TableName: getEnv('RUNS_TABLE', 'aivi-runs-dev'),
        Item: item,
        ConditionExpression: 'attribute_not_exists(run_id)' // Prevent overwrites
    }));

    const pointerItem = buildArticlePointerItem({
        articleKey,
        siteId: metadata.site_id,
        postId: normalizedPostId,
        runId,
        status: 'queued',
        now,
        ttl: item.ttl
    });
    if (pointerItem) {
        await ddbDoc.send(new PutCommand({
            TableName: getEnv('RUNS_TABLE', 'aivi-runs-dev'),
            Item: pointerItem
        }));
    }

    log('INFO', 'Created queued run record', {
        run_id: runId,
        status: 'queued',
        post_id: normalizedPostId || null,
        article_key: articleKey || null,
        enable_web_lookups: enableWebLookups,
        feature_flags: featureFlags
    });
    return item;
};

/**
 * Stores manifest to S3
 */
const storeManifest = async (runId, manifest) => {
    const bucket = getEnv('ARTIFACTS_BUCKET', 'aivi-artifacts-aivi-dev');
    const key = `manifests/${runId}/manifest.json`;

    await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(manifest),
        ContentType: 'application/json'
    }));

    log('INFO', 'Stored manifest to S3', { bucket, key });
    return `s3://${bucket}/${key}`;
};

/**
 * Enqueues analysis job to SQS
 */
const enqueueJob = async (runId, manifestS3Key, metadata, options = {}) => {
    const queueUrl = getEnv('TASKS_QUEUE_URL', 'https://sqs.eu-north-1.amazonaws.com/173471018175/aivi-tasks-queue-dev');
    const featureFlags = normalizeFeatureFlags(options.featureFlags);
    const enableWebLookups = parseBooleanFlag(options.enableWebLookups);

    const message = {
        run_id: runId,
        manifest_s3_key: manifestS3Key,
        site_id: metadata.site_id || 'unknown',
        user_id: metadata.user_id || 'unknown',
        prompt_version: metadata.prompt_version || 'v1',
        content_type: metadata.content_type || 'article',
        post_id: normalizePostId(metadata.post_id) || null,
        article_key: buildArticleKey({
            siteId: metadata.site_id,
            postId: metadata.post_id
        }) || null,
        enable_web_lookups: enableWebLookups,
        feature_flags: featureFlags,
        credit_reservation: options.creditReservation || null,
        enqueued_at: new Date().toISOString()
    };

    const sendParams = {
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message)
    };

    // Only add FIFO fields if queue is FIFO (env flag)
    if (getEnv('TASKS_QUEUE_IS_FIFO') === 'true') {
        sendParams.MessageGroupId = metadata.site_id || 'default';
        sendParams.MessageDeduplicationId = runId;
    }

    await sqsClient.send(new SendMessageCommand(sendParams));

    log('INFO', 'Enqueued job to SQS', {
        run_id: runId,
        queue_url: queueUrl,
        enable_web_lookups: enableWebLookups,
        feature_flags: featureFlags
    });
};

/**
 * Main handler for POST /aivi/v1/analyze/run
 * Returns 202 Accepted immediately after enqueuing job
 */
async function analyzeRunAsyncHandler(event) {
    const startTime = Date.now();
    let runId; // Will be set after body parsing

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
                    log('INFO', 'Decoded base64-encoded body', { length: rawBodyForDiagnostics.length });
                } catch (decodeError) {
                    log('ERROR', 'Failed to decode base64 body', { error: decodeError.message });
                }
            }

            try {
                // Try parsing directly first
                body = JSON.parse(rawBodyForDiagnostics);
            } catch (parseError) {
                // Enhanced diagnostics for debugging
                const bodyLength = rawBodyForDiagnostics.length;
                const firstChars = rawBodyForDiagnostics.substring(0, 200);
                const lastChars = rawBodyForDiagnostics.substring(Math.max(0, bodyLength - 200));
                const firstCharCode = rawBodyForDiagnostics.charCodeAt(0);
                const hasBOM = firstCharCode === 0xFEFF || (rawBodyForDiagnostics.charCodeAt(0) === 0xEF && rawBodyForDiagnostics.charCodeAt(1) === 0xBB);

                log('ERROR', 'Direct JSON parse failed - diagnostic info', {
                    error: parseError.message,
                    bodyLength,
                    firstChars: firstChars.replace(/[\x00-\x1f]/g, '?'), // Replace control chars for logging
                    lastChars: lastChars.replace(/[\x00-\x1f]/g, '?'),
                    firstCharCode,
                    hasBOM,
                    isBase64Encoded: event.isBase64Encoded,
                    contentType: event.headers?.['content-type'] || event.headers?.['Content-Type']
                });

                // Try common fixes
                try {
                    let parsedBody = rawBodyForDiagnostics;

                    // Remove BOM if present
                    if (hasBOM) {
                        parsedBody = parsedBody.replace(/^\uFEFF/, '').replace(/^\xEF\xBB\xBF/, '');
                        log('INFO', 'Removed BOM from body');
                    }

                    // Fix double-escaped quotes if present
                    if (parsedBody.includes('\\"')) {
                        parsedBody = parsedBody.replace(/\\"/g, '"');
                        log('INFO', 'Applied double-escape fix to JSON');
                    }

                    // Remove null bytes
                    if (parsedBody.includes('\x00')) {
                        parsedBody = parsedBody.replace(/\x00/g, '');
                        log('WARN', 'Removed null bytes from body');
                    }

                    body = JSON.parse(parsedBody);
                    log('INFO', 'Successfully parsed after applying fixes');
                } catch (secondError) {
                    log('ERROR', 'Failed to parse request body after all fix attempts', {
                        error: secondError.message,
                        position: secondError.message.match(/position (\d+)/)?.[1]
                    });

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
                                firstChars: firstChars.substring(0, 100).replace(/[\x00-\x1f]/g, '?'),
                                lastChars: lastChars.substring(lastChars.length - 100).replace(/[\x00-\x1f]/g, '?'),
                                isBase64Encoded: event.isBase64Encoded || false,
                                hasBOM
                            }
                        })
                    };
                }
            }
        } else if (typeof event.body === 'object' && event.body !== null) {
            body = event.body;
            log('INFO', 'Body already parsed as object');
        } else {
            log('WARN', 'Missing or invalid body', { bodyType: typeof event.body });
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ok: false,
                    error: 'missing_body',
                    message: 'Request body is required'
                })
            };
        }

        // Extract fields - support both flat and nested formats
        const manifest = body.manifest || body;
        const runMetadata = body.run_metadata || {
            site_id: body.site_id,
            user_id: body.user_id,
            post_id: body.post_id,
            content_type: body.content_type,
            source: body.source || 'editor-sidebar',
            prompt_version: body.prompt_version || 'v1'
        };
        const featureFlags = normalizeFeatureFlags(runMetadata.feature_flags || body.feature_flags || {});
        const enableWebLookups = parseBooleanFlag(body.enable_web_lookups);
        const tokenEstimate = normalizeNonNegativeInt(body.token_estimate || body.tokenEstimate || manifest.tokenEstimate);

        // Use client-provided run_id if available (Fire-and-Forget pattern), otherwise generate
        runId = body.run_id || uuidv4();

        // Validate required fields
        if (!manifest || (!manifest.title && !manifest.content_html)) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ok: false,
                    error: 'missing_manifest',
                    message: 'manifest with title or content_html is required'
                })
            };
        }

        if (!runMetadata.site_id) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ok: false,
                    error: 'missing_site_id',
                    message: 'site_id is required'
                })
            };
        }

        log('INFO', 'Processing async analyze request', {
            run_id: runId,
            site_id: runMetadata.site_id,
            content_type: runMetadata.content_type,
            token_estimate: tokenEstimate,
            enable_web_lookups: enableWebLookups,
            feature_flags: featureFlags
        });

        const reservation = await attemptSilentReservation({
            runId,
            runMetadata,
            manifest,
            tokenEstimate
        });

        if (reservation.mode === 'blocked') {
            log('WARN', 'Blocked analysis admission due to credit reservation check', {
                run_id: runId,
                site_id: runMetadata.site_id,
                token_estimate: tokenEstimate
            });
            return reservation.response;
        }

        // Step 1: Store manifest to S3
        const manifestS3Key = await storeManifest(runId, manifest);

        // Step 2: Create queued run record in DynamoDB
        await createQueuedRun(runId, runMetadata, manifestS3Key, {
            enableWebLookups,
            featureFlags,
            creditReservation: reservation.metadata
        });

        // Step 3: Enqueue job to SQS
        await enqueueJob(runId, manifestS3Key, runMetadata, {
            enableWebLookups,
            featureFlags,
            creditReservation: reservation.metadata
        });

        const processingTime = Date.now() - startTime;
        log('INFO', 'Successfully enqueued analysis job', {
            run_id: runId,
            processing_time_ms: processingTime
        });

        // Return 202 Accepted
        return {
            statusCode: 202,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ok: true,
                run_id: runId,
                status: 'queued',
                poll_url: `/aivi/v1/analyze/run/${runId}`,
                message: 'Analysis job queued successfully'
            })
        };

    } catch (error) {
        log('ERROR', 'Failed to enqueue analysis job', {
            run_id: runId,
            error: error.message,
            stack: error.stack
        });

        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ok: false,
                run_id: runId,
                error: 'enqueue_failed',
                message: 'Failed to queue analysis job'
            })
        };
    }
}

module.exports = { analyzeRunAsyncHandler };
