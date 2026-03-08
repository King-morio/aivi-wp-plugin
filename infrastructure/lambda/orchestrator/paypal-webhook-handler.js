const { randomUUID } = require('crypto');
const { getPayPalConfig } = require('./paypal-config');
const { verifyWebhookSignature } = require('./paypal-client');
const { createBillingStore } = require('./billing-store');
const { processVerifiedPayPalWebhook } = require('./paypal-webhook-processing');
const { createAccountBillingStateStore } = require('./billing-account-state');

const sanitizeString = (value) => String(value || '').trim();

const jsonResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
});

const log = (level, message, data = {}) => {
    console.log(JSON.stringify({ level, message, ...data, timestamp: new Date().toISOString() }));
};

const isVerifiedWebhookStatus = (value) => ['verified', 'success'].includes(sanitizeString(value).toLowerCase());

const parseWebhookBody = (event = {}) => {
    if (typeof event.body !== 'string' || event.body.trim() === '') {
        return {};
    }
    return JSON.parse(event.body);
};

const buildWebhookRecord = ({ webhookEvent, verificationStatus }) => ({
    event_id: sanitizeString(webhookEvent?.id) || randomUUID(),
    provider: 'paypal',
    provider_event_id: sanitizeString(webhookEvent?.id),
    event_type: sanitizeString(webhookEvent?.event_type),
    verification_status: sanitizeString(verificationStatus).toLowerCase() || 'error',
    resource_type: sanitizeString(webhookEvent?.resource_type || ''),
    processed: false,
    processed_at: null,
    raw_event: webhookEvent,
    reconciliation_summary: null,
    error_summary: null,
    created_at: sanitizeString(webhookEvent?.create_time) || new Date().toISOString()
});

const finalizeProcessedWebhook = async ({ store, webhookRecord, processing, duplicate = false }) => {
    let markerSyncFailed = false;
    try {
        await store.markWebhookProcessed(webhookRecord.event_id, {
            processed_at: new Date().toISOString(),
            verification_status: 'verified',
            reconciliation_summary: processing.reconciliationSummary || null
        });
    } catch (error) {
        markerSyncFailed = true;
        log('WARN', 'Failed to mark PayPal webhook as processed', {
            event_id: webhookRecord.event_id || null,
            provider_event_id: webhookRecord.provider_event_id || null,
            error: sanitizeString(error?.message || error)
        });
    }

    log('INFO', duplicate ? 'Reconciled duplicate PayPal webhook' : 'Processed PayPal webhook', {
        provider_event_id: webhookRecord.provider_event_id || null,
        event_type: webhookRecord.event_type || null,
        resource_type: processing.resourceType || null,
        marker_sync_failed: markerSyncFailed
    });

    return jsonResponse(200, {
        ok: true,
        duplicate,
        processed: true,
        marker_sync_failed: markerSyncFailed,
        resource_type: processing.resourceType || 'other'
    });
};

const paypalWebhookHandler = async (event = {}) => {
    let webhookRecord = null;
    let store = null;
    let reconciliationApplied = false;
    try {
        const requestId = sanitizeString(event.requestContext?.requestId || randomUUID());
        const webhookEvent = parseWebhookBody(event);
        const config = getPayPalConfig(process.env);
        store = createBillingStore();
        const accountStateStore = createAccountBillingStateStore();

        const verification = await verifyWebhookSignature({
            config,
            headers: event.headers || {},
            webhookEvent,
            requestId
        });

        webhookRecord = buildWebhookRecord({
            webhookEvent,
            verificationStatus: verification.verificationStatus
        });

        const stored = await store.putWebhookEvent(webhookRecord);
        if (stored.duplicate) {
            const existingRecord = await store.getWebhookEvent(webhookRecord.event_id);
            if (existingRecord && existingRecord.processed !== true && isVerifiedWebhookStatus(existingRecord.verification_status || verification.verificationStatus)) {
                const processing = await processVerifiedPayPalWebhook({
                    webhookEvent: existingRecord.raw_event || webhookEvent,
                    store,
                    accountStateStore,
                    config
                });
                reconciliationApplied = true;
                return finalizeProcessedWebhook({
                    store,
                    webhookRecord: {
                        ...webhookRecord,
                        ...existingRecord,
                        event_id: sanitizeString(existingRecord.event_id || webhookRecord.event_id),
                        provider_event_id: sanitizeString(existingRecord.provider_event_id || webhookRecord.provider_event_id),
                        event_type: sanitizeString(existingRecord.event_type || webhookRecord.event_type)
                    },
                    processing,
                    duplicate: true
                });
            }
            log('INFO', 'Duplicate PayPal webhook ignored', {
                provider_event_id: webhookRecord.provider_event_id || null,
                event_type: webhookRecord.event_type || null
            });
            return jsonResponse(200, {
                ok: true,
                duplicate: true,
                processed: existingRecord?.processed === true
            });
        }

        if (verification.verificationStatus !== 'SUCCESS') {
            await store.markWebhookFailed(webhookRecord.event_id, {
                processed_at: new Date().toISOString(),
                verification_status: verification.verificationStatus || 'failed',
                error_summary: {
                    code: 'paypal_webhook_invalid',
                    message: 'PayPal webhook signature verification failed.'
                }
            });
            log('WARN', 'PayPal webhook verification failed', {
                provider_event_id: webhookRecord.provider_event_id || null,
                event_type: webhookRecord.event_type || null,
                verification_status: verification.verificationStatus || null
            });
            return jsonResponse(400, {
                ok: false,
                error: 'paypal_webhook_invalid',
                message: 'PayPal webhook signature verification failed.'
            });
        }

        const processing = await processVerifiedPayPalWebhook({
            webhookEvent,
            store,
            accountStateStore,
            config
        });
        reconciliationApplied = true;

        return finalizeProcessedWebhook({
            store,
            webhookRecord,
            processing
        });
    } catch (error) {
        const statusCode = Number.isFinite(error?.statusCode) ? error.statusCode : 500;
        const code = sanitizeString(error?.code || 'paypal_webhook_failed');
        const message = sanitizeString(error?.message || 'PayPal webhook processing failed.');

        if (store && webhookRecord?.event_id && !reconciliationApplied) {
            try {
                await store.markWebhookFailed(webhookRecord.event_id, {
                    processed_at: new Date().toISOString(),
                    verification_status: webhookRecord.verification_status || 'error',
                    error_summary: {
                        code,
                        message
                    }
                });
            } catch (markError) {
                log('WARN', 'Failed to mark PayPal webhook as failed', {
                    event_id: webhookRecord.event_id,
                    error: markError.message
                });
            }
        }

        log(statusCode >= 500 ? 'ERROR' : 'WARN', 'PayPal webhook handler failed', {
            error_code: code,
            status_code: statusCode,
            message
        });

        return jsonResponse(statusCode, {
            ok: false,
            error: code,
            message
        });
    }
};

module.exports = { paypalWebhookHandler };
