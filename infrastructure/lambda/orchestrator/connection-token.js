const crypto = require('crypto');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const secretsClient = new SecretsManagerClient({});

const sanitizeString = (value) => String(value || '').trim();
const toIso = (value = new Date()) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const getEnv = (key, fallback = '') => process.env[key] || fallback;

let sessionSecretPromise = null;

const extractSecretMaterial = (secretValue) => {
    if (!secretValue || typeof secretValue !== 'string') {
        return '';
    }

    const trimmed = secretValue.trim();
    if (!trimmed) {
        return '';
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
            const preferredKeys = ['SESSION_SECRET', 'session_secret', 'sessionSecret', 'MISTRAL_API_KEY', 'api_key'];
            for (const key of preferredKeys) {
                if (typeof parsed[key] === 'string' && parsed[key].trim()) {
                    return parsed[key].trim();
                }
            }
            const firstString = Object.values(parsed).find((candidate) => typeof candidate === 'string' && candidate.trim());
            if (typeof firstString === 'string') {
                return firstString.trim();
            }
        }
    } catch (error) {
        // Plain string secret is valid.
    }

    return trimmed;
};

const getSessionSecret = async () => {
    const inlineSecret = sanitizeString(getEnv('SESSION_SECRET'));
    if (inlineSecret) {
        return inlineSecret;
    }

    const secretName = sanitizeString(getEnv('SESSION_SECRET_NAME') || getEnv('SECRET_NAME'));
    if (!secretName) {
        return '';
    }

    if (!sessionSecretPromise) {
        sessionSecretPromise = secretsClient.send(new GetSecretValueCommand({ SecretId: secretName }))
            .then((response) => {
                const secretString = typeof response.SecretString === 'string'
                    ? response.SecretString
                    : Buffer.from(response.SecretBinary || '', 'base64').toString('utf8');
                return extractSecretMaterial(secretString);
            })
            .catch(() => '');
    }

    return sessionSecretPromise;
};

const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');
const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');

const signPayload = (payloadString, secret) => crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');

const issueConnectionToken = async ({
    accountId,
    accountLabel = '',
    expiresInDays = 7,
    siteLimit = null
} = {}) => {
    const normalizedAccountId = sanitizeString(accountId);
    if (!normalizedAccountId) {
        const error = new Error('connection_token_requires_account_id');
        error.code = 'connection_token_requires_account_id';
        throw error;
    }

    const sessionSecret = await getSessionSecret();
    if (!sessionSecret) {
        const error = new Error('session_secret_unavailable');
        error.code = 'session_secret_unavailable';
        throw error;
    }

    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + Math.max(1, Math.min(30, Number(expiresInDays) || 7)));

    const payload = {
        v: 1,
        typ: 'aivi_site_connect',
        account_id: normalizedAccountId,
        account_label: sanitizeString(accountLabel),
        max_sites: Number.isFinite(Number(siteLimit)) ? Math.max(1, Math.trunc(Number(siteLimit))) : null,
        exp: expiresAt.toISOString()
    };
    const payloadString = JSON.stringify(payload);
    const encodedPayload = base64UrlEncode(payloadString);
    const signature = signPayload(encodedPayload, sessionSecret);

    return {
        token: `${encodedPayload}.${signature}`,
        expires_at: expiresAt.toISOString(),
        payload
    };
};

const verifyConnectionToken = async (token) => {
    const normalizedToken = sanitizeString(token);
    if (!normalizedToken || !normalizedToken.includes('.')) {
        return { valid: false, error: 'invalid_connection_token' };
    }

    const [encodedPayload, providedSignature] = normalizedToken.split('.', 2);
    const sessionSecret = await getSessionSecret();
    if (!sessionSecret) {
        return { valid: false, error: 'session_secret_unavailable' };
    }

    const expectedSignature = signPayload(encodedPayload, sessionSecret);
    if (providedSignature !== expectedSignature) {
        return { valid: false, error: 'invalid_connection_signature' };
    }

    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        const accountId = sanitizeString(payload.account_id);
        const tokenType = sanitizeString(payload.typ);
        const expiresAt = sanitizeString(payload.exp);
        if (!accountId || tokenType !== 'aivi_site_connect' || !expiresAt) {
            return { valid: false, error: 'invalid_connection_payload' };
        }
        const expiry = Date.parse(expiresAt);
        if (!Number.isFinite(expiry) || expiry <= Date.now()) {
            return { valid: false, error: 'connection_token_expired' };
        }
        return {
            valid: true,
            payload: {
                account_id: accountId,
                account_label: sanitizeString(payload.account_label),
                max_sites: Number.isFinite(Number(payload.max_sites)) ? Math.max(1, Math.trunc(Number(payload.max_sites))) : null,
                exp: toIso(expiresAt)
            }
        };
    } catch (error) {
        return { valid: false, error: 'invalid_connection_payload' };
    }
};

module.exports = {
    issueConnectionToken,
    verifyConnectionToken
};
