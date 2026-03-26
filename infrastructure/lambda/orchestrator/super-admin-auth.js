const sanitizeString = (value) => String(value || '').trim();
const unwrapListToken = (value) => sanitizeString(value).replace(/^[\s"'[\]]+|[\s"'[\]]+$/g, '');
const normalizeClaimToken = (value) => sanitizeString(value).toLowerCase().replace(/[\s-]+/g, '_');

const ALLOWED_GROUPS = ['aivi-super-admin', 'aivi-support', 'aivi-finance'];
const ROLE_PERMISSIONS = Object.freeze({
    super_admin: [
        'accounts.read',
        'accounts.write',
        'sites.read',
        'sites.write',
        'credits.read',
        'credits.adjust',
        'billing.read',
        'billing.reconcile',
        'webhooks.read',
        'webhooks.replay',
        'audit.read'
    ],
    support_operator: [
        'accounts.read',
        'sites.read',
        'credits.read',
        'billing.read',
        'billing.reconcile',
        'webhooks.read',
        'webhooks.replay',
        'audit.read'
    ],
    finance_operator: [
        'accounts.read',
        'credits.read',
        'credits.adjust',
        'billing.read',
        'billing.reconcile',
        'webhooks.read',
        'audit.read'
    ]
});

const createHttpError = (statusCode, code, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

const logAuthDiagnostic = (message, data = {}) => {
    console.log(JSON.stringify({
        level: 'WARN',
        message,
        ...data,
        timestamp: new Date().toISOString()
    }));
};

const parseGroupList = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => unwrapListToken(item)).filter(Boolean);
    }
    const raw = sanitizeString(value);
    if (!raw) return [];
    if (raw.startsWith('[') && raw.endsWith(']')) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => unwrapListToken(item)).filter(Boolean);
            }
        } catch (error) {
            return raw.slice(1, -1).split(',').map((item) => unwrapListToken(item)).filter(Boolean);
        }
    }
    return raw.split(',').map((item) => unwrapListToken(item)).filter(Boolean);
};

const parseClaimTokenList = (value) => parseGroupList(value).flatMap((item) => {
    const normalized = sanitizeString(item);
    if (!normalized) return [];
    return normalized.split(/\s+/).map((part) => unwrapListToken(part)).filter(Boolean);
});

const getAuthorizerClaims = (event = {}) => {
    return event?.requestContext?.authorizer?.jwt?.claims
        || event?.requestContext?.authorizer?.claims
        || {};
};

const buildClaimSnapshot = (claims = {}) => ({
    claim_keys: Object.keys(claims || {}).sort(),
    token_use: sanitizeString(claims.token_use),
    email: sanitizeString(claims.email),
    email_verified: sanitizeString(claims.email_verified),
    groups: parseGroupList(claims['cognito:groups'] || claims.groups),
    preferred_mfa: parseClaimTokenList(claims['cognito:preferred_mfa'] || claims.preferred_mfa),
    amr: parseClaimTokenList(claims.amr),
    auth_time: sanitizeString(claims.auth_time),
    iss: sanitizeString(claims.iss),
    client_id: sanitizeString(claims.client_id),
    aud: sanitizeString(claims.aud),
    username: sanitizeString(claims['cognito:username'] || claims.username),
    sub: sanitizeString(claims.sub)
});

const resolveActorRole = (groups = []) => {
    if (groups.includes('aivi-super-admin')) return 'super_admin';
    if (groups.includes('aivi-finance')) return 'finance_operator';
    if (groups.includes('aivi-support')) return 'support_operator';
    return '';
};

const resolveActorPermissions = (actorRole) => ROLE_PERMISSIONS[sanitizeString(actorRole)] || [];

const isBootstrapTokenAllowed = (env = process.env) => {
    const flag = sanitizeString(env.AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN).toLowerCase();
    if (flag === 'true') return true;
    const environment = sanitizeString(env.ENVIRONMENT || env.NODE_ENV).toLowerCase();
    return ['local', 'dev', 'development', 'test'].includes(environment);
};

const isExplicitMfaMethod = (value) => {
    const normalized = normalizeClaimToken(value);
    if (!normalized) return false;
    if (normalized === 'mfa') return true;
    if (normalized.includes('multi_factor')) return true;
    if (normalized.endsWith('_mfa')) return true;
    return [
        'otp',
        'totp',
        'sms_otp',
        'email_otp',
        'webauthn',
        'passkey',
        'security_key'
    ].includes(normalized);
};

const isTrustedHostedUiSession = (claims = {}) => {
    const tokenUse = normalizeClaimToken(claims.token_use);
    const issuer = sanitizeString(claims.iss).toLowerCase();
    const audience = sanitizeString(claims.aud || claims.client_id);
    const emailVerified = normalizeClaimToken(claims.email_verified);
    const authTime = sanitizeString(claims.auth_time);
    const eventId = sanitizeString(claims.event_id);

    return tokenUse === 'id'
        && issuer.includes('cognito-idp.')
        && !!audience
        && emailVerified === 'true'
        && !!authTime
        && !!eventId;
};

const isMfaSatisfied = (claims = {}) => {
    const preferred = parseClaimTokenList(claims['cognito:preferred_mfa'] || claims.preferred_mfa)
        .map((item) => normalizeClaimToken(item))
        .filter(Boolean);
    if (preferred.some((item) => !['nomfa', 'none', 'off'].includes(item))) return true;

    const amr = parseClaimTokenList(claims.amr);
    if (amr.some((item) => isExplicitMfaMethod(item))) return true;

    return isTrustedHostedUiSession(claims);
};

const assertPermission = (actor = {}, permission) => {
    const permissions = Array.isArray(actor.permissions) ? actor.permissions : resolveActorPermissions(actor.actorRole);
    if (permissions.includes(sanitizeString(permission))) {
        return;
    }
    throw createHttpError(403, 'admin_permission_forbidden', 'The authenticated operator does not have the required admin permission.');
};

const assertSuperAdminAccess = (event = {}, env = process.env) => {
    const bootstrapToken = sanitizeString(env.AIVI_ADMIN_BOOTSTRAP_TOKEN);
    const headers = event.headers || {};
    const headerToken = sanitizeString(headers['x-aivi-admin-token'] || headers['X-AIVI-Admin-Token']);

    if (bootstrapToken && headerToken && headerToken === bootstrapToken) {
        if (!isBootstrapTokenAllowed(env)) {
            throw createHttpError(403, 'bootstrap_admin_token_disabled', 'Bootstrap admin token access is disabled for this environment.');
        }
        return {
            actorId: 'bootstrap-admin',
            actorEmail: '',
            actorRole: 'super_admin',
            groups: ['aivi-super-admin'],
            permissions: resolveActorPermissions('super_admin'),
            authMode: 'bootstrap_token'
        };
    }

    const claims = getAuthorizerClaims(event);
    const groups = parseGroupList(claims['cognito:groups'] || claims.groups);
    const permittedGroups = groups.filter((group) => ALLOWED_GROUPS.includes(group));
    if (permittedGroups.length === 0) {
        if (groups.length === 0) {
            throw createHttpError(401, 'admin_auth_required', 'Super-admin authentication is required.');
        }
        throw createHttpError(403, 'admin_forbidden', 'The authenticated operator does not have AiVI admin access.');
    }
    const actorEmail = sanitizeString(claims.email);
    if (!actorEmail) {
        throw createHttpError(401, 'admin_email_required', 'An authenticated operator email is required.');
    }
    if (sanitizeString(env.AIVI_ADMIN_REQUIRE_MFA).toLowerCase() !== 'false' && !isMfaSatisfied(claims)) {
        logAuthDiagnostic('Super-admin auth rejected: MFA claim not satisfied', {
            error_code: 'admin_mfa_required',
            request_id: sanitizeString(event?.requestContext?.requestId),
            route: sanitizeString(event?.rawPath || event?.path || event?.requestContext?.http?.path),
            auth_mode: 'cognito',
            claim_snapshot: buildClaimSnapshot(claims)
        });
        throw createHttpError(403, 'admin_mfa_required', 'Multi-factor authentication is required for AiVI admin access.');
    }
    const actorRole = resolveActorRole(permittedGroups);

    return {
        actorId: sanitizeString(claims.sub || claims.username || claims.email || 'unknown-operator'),
        actorEmail,
        actorRole,
        groups: permittedGroups,
        permissions: resolveActorPermissions(actorRole),
        authMode: 'cognito'
    };
};

module.exports = {
    ALLOWED_GROUPS,
    ROLE_PERMISSIONS,
    resolveActorPermissions,
    isBootstrapTokenAllowed,
    isMfaSatisfied,
    assertPermission,
    assertSuperAdminAccess
};
