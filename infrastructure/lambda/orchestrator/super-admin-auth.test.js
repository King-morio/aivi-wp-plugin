const {
    assertSuperAdminAccess,
    assertPermission,
    isBootstrapTokenAllowed,
    isMfaSatisfied,
    resolveActorPermissions
} = require('./super-admin-auth');

describe('super-admin-auth', () => {
    test('allows bootstrap token only in local-like environments', () => {
        expect(isBootstrapTokenAllowed({ ENVIRONMENT: 'test' })).toBe(true);
        expect(isBootstrapTokenAllowed({ ENVIRONMENT: 'production', AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN: 'false' })).toBe(false);
        expect(isBootstrapTokenAllowed({ ENVIRONMENT: 'production', AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN: 'true' })).toBe(true);
    });

    test('accepts cognito operators only when MFA is satisfied', () => {
        const actor = assertSuperAdminAccess({
            requestContext: {
                authorizer: {
                    jwt: {
                        claims: {
                            sub: 'user-123',
                            email: 'ops@example.com',
                            'cognito:groups': ['aivi-support'],
                            amr: ['pwd', 'mfa']
                        }
                    }
                }
            }
        }, { ENVIRONMENT: 'production', AIVI_ADMIN_REQUIRE_MFA: 'true' });

        expect(actor).toMatchObject({
            actorId: 'user-123',
            actorEmail: 'ops@example.com',
            actorRole: 'support_operator',
            authMode: 'cognito'
        });
        expect(actor.permissions).toEqual(resolveActorPermissions('support_operator'));
    });

    test('rejects cognito operators without MFA when MFA is required', () => {
        expect(() => assertSuperAdminAccess({
            requestContext: {
                authorizer: {
                    jwt: {
                        claims: {
                            sub: 'user-456',
                            email: 'ops@example.com',
                            'cognito:groups': ['aivi-super-admin'],
                            amr: ['pwd']
                        }
                    }
                }
            }
        }, { ENVIRONMENT: 'production', AIVI_ADMIN_REQUIRE_MFA: 'true' })).toThrow(/Multi-factor authentication is required/);
    });

    test('requires operator email for cognito access', () => {
        expect(() => assertSuperAdminAccess({
            requestContext: {
                authorizer: {
                    jwt: {
                        claims: {
                            sub: 'user-789',
                            'cognito:groups': ['aivi-super-admin'],
                            amr: ['pwd', 'mfa']
                        }
                    }
                }
            }
        }, { ENVIRONMENT: 'production' })).toThrow(/operator email is required/);
    });

    test('enforces permission checks on resolved actors', () => {
        const actor = {
            actorRole: 'finance_operator',
            permissions: resolveActorPermissions('finance_operator')
        };

        expect(() => assertPermission(actor, 'credits.adjust')).not.toThrow();
        expect(() => assertPermission(actor, 'sites.write')).toThrow(/required admin permission/);
    });

    test('recognizes multiple MFA claim formats', () => {
        expect(isMfaSatisfied({ amr: ['pwd', 'mfa'] })).toBe(true);
        expect(isMfaSatisfied({ amr: '["pwd","mfa"]' })).toBe(true);
        expect(isMfaSatisfied({ 'cognito:preferred_mfa': 'SMS_MFA' })).toBe(true);
        expect(isMfaSatisfied({ amr: '["pwd","software_token_mfa"]' })).toBe(true);
        expect(isMfaSatisfied({ amr: 'pwd otp' })).toBe(true);
        expect(isMfaSatisfied({ amr: ['pwd'] })).toBe(false);
    });

    test('accepts Cognito operators when MFA is represented by a method-specific amr token', () => {
        const actor = assertSuperAdminAccess({
            requestContext: {
                authorizer: {
                    jwt: {
                        claims: {
                            sub: 'user-otp',
                            email: 'ops@example.com',
                            'cognito:groups': ['aivi-super-admin'],
                            amr: ['pwd', 'software_token_mfa']
                        }
                    }
                }
            }
        }, { ENVIRONMENT: 'production', AIVI_ADMIN_REQUIRE_MFA: 'true' });

        expect(actor).toMatchObject({
            actorRole: 'super_admin',
            authMode: 'cognito'
        });
    });

    test('accepts Cognito hosted-ui id tokens without amr when the trusted session markers are present', () => {
        const actor = assertSuperAdminAccess({
            requestContext: {
                authorizer: {
                    jwt: {
                        claims: {
                            sub: 'user-hosted-ui',
                            email: 'ops@example.com',
                            email_verified: 'true',
                            'cognito:groups': ['aivi-super-admin'],
                            token_use: 'id',
                            iss: 'https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_example',
                            aud: 'client-id-123',
                            auth_time: '1773645217',
                            event_id: 'evt-123'
                        }
                    }
                }
            }
        }, { ENVIRONMENT: 'production', AIVI_ADMIN_REQUIRE_MFA: 'true' });

        expect(actor).toMatchObject({
            actorRole: 'super_admin',
            authMode: 'cognito'
        });
    });

    test('accepts bracketed non-json group claims from gateway contexts', () => {
        const actor = assertSuperAdminAccess({
            requestContext: {
                authorizer: {
                    jwt: {
                        claims: {
                            sub: 'user-123',
                            email: 'ops@example.com',
                            'cognito:groups': '[aivi-super-admin]',
                            amr: ['pwd', 'mfa']
                        }
                    }
                }
            }
        }, { ENVIRONMENT: 'production', AIVI_ADMIN_REQUIRE_MFA: 'true' });

        expect(actor).toMatchObject({
            actorRole: 'super_admin',
            groups: ['aivi-super-admin']
        });
    });
});
