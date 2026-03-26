jest.mock('./paypal-client', () => ({
    createHttpError: (statusCode, code, message) => {
        const error = new Error(message);
        error.statusCode = statusCode;
        error.code = code;
        return error;
    },
    captureTopupOrder: jest.fn(),
    createSubscriptionCheckoutSession: jest.fn(),
    createSubscriptionRevisionSession: jest.fn(),
    createTopupCheckoutSession: jest.fn(),
    getSubscriptionDetails: jest.fn(),
    getManageBillingRedirect: jest.fn()
}));

const mockPutCheckoutIntent = jest.fn();
const mockGetCheckoutIntent = jest.fn();
const mockUpdateCheckoutIntent = jest.fn();
const mockUpsertTopupOrderRecord = jest.fn();
const mockGetAccountState = jest.fn();
const mockPutAccountState = jest.fn();
jest.mock('./billing-store', () => ({
    createBillingStore: jest.fn(() => ({
        putCheckoutIntent: mockPutCheckoutIntent,
        getCheckoutIntent: mockGetCheckoutIntent,
        updateCheckoutIntent: mockUpdateCheckoutIntent,
        upsertTopupOrderRecord: mockUpsertTopupOrderRecord
    }))
}));

jest.mock('./billing-account-state', () => ({
    createAccountBillingStateStore: jest.fn(() => ({
        getAccountState: mockGetAccountState,
        putAccountState: mockPutAccountState
    }))
}));

const { billingCheckoutHandler } = require('./billing-checkout-handler');
const {
    captureTopupOrder,
    createSubscriptionCheckoutSession,
    createSubscriptionRevisionSession,
    createTopupCheckoutSession,
    getSubscriptionDetails,
    getManageBillingRedirect
} = require('./paypal-client');

describe('billing-checkout-handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        console.log = jest.fn();
        mockPutCheckoutIntent.mockResolvedValue(undefined);
        mockGetCheckoutIntent.mockResolvedValue(null);
        mockUpdateCheckoutIntent.mockResolvedValue(undefined);
        mockUpsertTopupOrderRecord.mockResolvedValue(undefined);
        mockGetAccountState.mockResolvedValue(null);
        mockPutAccountState.mockResolvedValue(undefined);
        getSubscriptionDetails.mockResolvedValue({
            providerSubscriptionId: 'I-SUB123',
            status: 'APPROVAL_PENDING',
            statusUpdateTime: '2026-03-08T10:00:00.000Z'
        });
        process.env.PAYPAL_RETURN_URL = 'https://example.com/return';
        process.env.PAYPAL_CANCEL_URL = 'https://example.com/cancel';
        process.env.PAYPAL_PLAN_ID_GROWTH_INTRO = 'P-GROWTH-INTRO';
    });

    test('returns a safe hosted subscription checkout payload', async () => {
        createSubscriptionCheckoutSession.mockResolvedValue({
            requestId: 'req_sub_123',
            intentType: 'subscription',
            provider: 'paypal',
            planCode: 'starter',
            approvalUrl: 'https://www.paypal.com/checkoutnow?token=SUB123',
            returnUrl: 'https://example.com/return',
            cancelUrl: 'https://example.com/cancel',
            providerSubscriptionId: 'I-SUB123'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_sub_123' },
            body: JSON.stringify({
                plan_code: 'starter',
                account: { account_id: 'acct_123' },
                site: {
                    site_id: 'site_123',
                    home_url: 'https://kyngen.online/'
                }
            })
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toEqual({
            ok: true,
            provider: 'paypal',
            request_id: 'req_sub_123',
            checkout: {
                intent_type: 'subscription',
                approval_url: 'https://www.paypal.com/checkoutnow?token=SUB123',
                return_url: 'https://example.com/return',
                cancel_url: 'https://example.com/cancel',
                plan_code: 'starter'
            }
        });
        expect(JSON.stringify(body)).not.toContain('providerSubscriptionId');
        expect(createSubscriptionCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
            config: expect.objectContaining({
                returnUrl: 'https://kyngen.online/wp-json/aivi/v1/backend/billing_return',
                cancelUrl: 'https://kyngen.online/wp-json/aivi/v1/backend/billing_return'
            })
        }));
        expect(mockPutCheckoutIntent).toHaveBeenCalledTimes(1);
    });

    test('returns a safe hosted top-up checkout payload', async () => {
        createTopupCheckoutSession.mockResolvedValue({
            requestId: 'req_topup_123',
            intentType: 'topup',
            provider: 'paypal',
            packCode: 'topup_100k',
            approvalUrl: 'https://www.paypal.com/checkoutnow?token=ORDER123',
            returnUrl: 'https://example.com/return',
            cancelUrl: 'https://example.com/cancel',
            credits: 100000,
            priceUsd: 25,
            providerOrderId: 'ORDER123'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/topup',
            requestContext: { requestId: 'req_topup_123' },
            body: JSON.stringify({
                topup_pack_code: 'topup_100k',
                account: { account_id: 'acct_123' },
                site: {
                    site_id: 'site_123',
                    home_url: 'https://kyngen.online/blog/'
                }
            })
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.checkout).toMatchObject({
            intent_type: 'topup',
            topup_pack_code: 'topup_100k',
            credits: 100000,
            price_usd: 25
        });
        expect(JSON.stringify(body)).not.toContain('providerOrderId');
        expect(createTopupCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
            config: expect.objectContaining({
                returnUrl: 'https://kyngen.online/wp-json/aivi/v1/backend/billing_return',
                cancelUrl: 'https://kyngen.online/wp-json/aivi/v1/backend/billing_return'
            })
        }));
        expect(mockPutCheckoutIntent).toHaveBeenCalledTimes(1);
        expect(mockPutCheckoutIntent).toHaveBeenCalledWith(expect.objectContaining({
            lookup_key: 'topup#ORDER123',
            credits: 100000,
            price_usd: 25,
            topup_pack_code: 'topup_100k'
        }));
    });

    test('blocks hosted billing when the site is not using https', async () => {
        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_http_site' },
            body: JSON.stringify({
                plan_code: 'starter',
                account: { account_id: 'acct_123' },
                site: {
                    site_id: 'site_123',
                    home_url: 'http://kyngen.online/'
                }
            })
        });

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'billing_https_required'
        });
        expect(createSubscriptionCheckoutSession).not.toHaveBeenCalled();
    });

    test('blocks billing actions without a connected account binding', async () => {
        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_missing_account' },
            body: JSON.stringify({
                plan_code: 'starter',
                account: { account_id: '' },
                site: { site_id: 'site_123' }
            })
        });

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'account_not_connected'
        });
    });

    test('rejects invalid subscription plan codes', async () => {
        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_invalid_plan' },
            body: JSON.stringify({
                plan_code: 'enterprise',
                account: { account_id: 'acct_123' },
                site: { site_id: 'site_123' }
            })
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'invalid_plan_code'
        });
    });

    test('creates a PayPal revise session for active paid upgrades', async () => {
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            plan_code: 'starter',
            subscription_status: 'active',
            subscription: {
                provider_subscription_id: 'I-STARTER1'
            }
        });
        createSubscriptionRevisionSession.mockResolvedValue({
            requestId: 'req_upgrade_block',
            intentType: 'subscription',
            intentVariant: 'revise',
            provider: 'paypal',
            planCode: 'growth',
            approvalUrl: 'https://www.paypal.com/checkoutnow?token=SUB-UPGRADE',
            returnUrl: 'https://kyngen.online/wp-json/aivi/v1/backend/billing_return',
            cancelUrl: 'https://kyngen.online/wp-json/aivi/v1/backend/billing_return',
            providerSubscriptionId: 'I-STARTER1'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_upgrade_block' },
            body: JSON.stringify({
                plan_code: 'growth',
                account: { account_id: 'acct_123' },
                site: {
                    site_id: 'site_123',
                    home_url: 'https://kyngen.online/'
                }
            })
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: true,
            checkout: {
                approval_url: 'https://www.paypal.com/checkoutnow?token=SUB-UPGRADE',
                plan_code: 'growth'
            }
        });
        expect(createSubscriptionRevisionSession).toHaveBeenCalledWith(expect.objectContaining({
            providerSubscriptionId: 'I-STARTER1',
            planCode: 'growth'
        }));
        expect(createSubscriptionCheckoutSession).not.toHaveBeenCalled();
        expect(mockPutCheckoutIntent).toHaveBeenCalledWith(expect.objectContaining({
            lookup_key: 'subscription#I-STARTER1',
            intent_variant: 'revise',
            source_plan_code: 'starter',
            plan_transition: 'upgrade',
            plan_code: 'growth',
            status: 'plan_change_pending'
        }));
    });

    test('uses the dedicated Growth intro plan for an initial paid subscription from free trial state', async () => {
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            plan_code: 'free_trial',
            subscription_status: 'trial',
            trial_status: 'active'
        });
        createSubscriptionCheckoutSession.mockResolvedValue({
            requestId: 'req_growth_intro_123',
            intentType: 'subscription',
            intentVariant: 'intro_offer',
            provider: 'paypal',
            planCode: 'growth',
            providerPlanId: 'P-GROWTH-INTRO',
            approvalUrl: 'https://www.paypal.com/checkoutnow?token=SUB-GROWTH-INTRO',
            returnUrl: 'https://kyngen.online/wp-json/aivi/v1/backend/billing_return',
            cancelUrl: 'https://kyngen.online/wp-json/aivi/v1/backend/billing_return',
            providerSubscriptionId: 'I-GROWTH-INTRO',
            priceUsd: 11
        });

        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_growth_intro_123' },
            body: JSON.stringify({
                plan_code: 'growth',
                account: { account_id: 'acct_123' },
                site: {
                    site_id: 'site_123',
                    home_url: 'https://kyngen.online/'
                }
            })
        });

        expect(response.statusCode).toBe(200);
        expect(createSubscriptionCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
            planCode: 'growth',
            providerPlanId: 'P-GROWTH-INTRO',
            intentVariant: 'intro_offer',
            introOfferApplied: true
        }));
        expect(mockPutCheckoutIntent).toHaveBeenCalledWith(expect.objectContaining({
            lookup_key: 'subscription#I-GROWTH-INTRO',
            plan_code: 'growth',
            intent_variant: 'intro_offer',
            provider_plan_id: 'P-GROWTH-INTRO',
            price_usd: 11
        }));
        expect(JSON.parse(response.body)).toMatchObject({
            ok: true,
            checkout: {
                intent_type: 'subscription',
                intent_variant: 'intro_offer',
                plan_code: 'growth',
                price_usd: 11
            }
        });
    });

    test('blocks initial Growth checkout when the intro plan is not configured', async () => {
        delete process.env.PAYPAL_PLAN_ID_GROWTH_INTRO;
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            plan_code: 'free_trial',
            subscription_status: 'trial',
            trial_status: 'active'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_growth_intro_missing' },
            body: JSON.stringify({
                plan_code: 'growth',
                account: { account_id: 'acct_123' },
                site: {
                    site_id: 'site_123',
                    home_url: 'https://kyngen.online/'
                }
            })
        });

        expect(response.statusCode).toBe(503);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'paypal_intro_plan_not_configured'
        });
        expect(createSubscriptionCheckoutSession).not.toHaveBeenCalled();
    });

    test('blocks paid upgrades when the provider subscription id is missing', async () => {
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            plan_code: 'starter',
            subscription_status: 'active',
            subscription: {
                provider_subscription_id: ''
            }
        });

        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_upgrade_missing_ref' },
            body: JSON.stringify({
                plan_code: 'growth',
                account: { account_id: 'acct_123' },
                site: {
                    site_id: 'site_123',
                    home_url: 'https://kyngen.online/'
                }
            })
        });

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'missing_provider_subscription_id'
        });
        expect(createSubscriptionRevisionSession).not.toHaveBeenCalled();
    });

    test('blocks paid-plan downgrades until renewal scheduling is implemented', async () => {
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            plan_code: 'pro',
            subscription_status: 'active'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_downgrade_block' },
            body: JSON.stringify({
                plan_code: 'growth',
                account: { account_id: 'acct_123' },
                site: { site_id: 'site_123' }
            })
        });

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'downgrade_at_renewal'
        });
        expect(createSubscriptionCheckoutSession).not.toHaveBeenCalled();
    });

    test('blocks plan changes while any subscription is still pending activation', async () => {
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            plan_code: 'free_trial',
            subscription_status: 'created',
            subscription: {
                provider_subscription_id: 'I-PENDING-123'
            }
        });

        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/subscription',
            requestContext: { requestId: 'req_pending_change' },
            body: JSON.stringify({
                plan_code: 'pro',
                account: { account_id: 'acct_123' },
                site: { site_id: 'site_123' }
            })
        });

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'subscription_pending_activation'
        });
        expect(createSubscriptionCheckoutSession).not.toHaveBeenCalled();
    });

    test('rejects invalid top-up pack codes', async () => {
        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/topup',
            requestContext: { requestId: 'req_invalid_topup' },
            body: JSON.stringify({
                topup_pack_code: 'topup_999k',
                account: { account_id: 'acct_123' },
                site: { site_id: 'site_123' }
            })
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'invalid_topup_pack_code'
        });
    });

    test('returns unsupported manage billing response until provider management is wired', async () => {
        const error = new Error('Hosted billing management will be enabled after subscription reconciliation is in place.');
        error.statusCode = 501;
        error.code = 'billing_management_unsupported';
        getManageBillingRedirect.mockRejectedValue(error);

        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/manage',
            requestContext: { requestId: 'req_manage_123' },
            body: JSON.stringify({
                account: { account_id: 'acct_123' },
                site: { site_id: 'site_123' }
            })
        });

        expect(response.statusCode).toBe(501);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'billing_management_unsupported'
        });
    });

    test('captures approved top-up orders from the PayPal return route and redirects back to billing status', async () => {
        mockGetCheckoutIntent.mockResolvedValue({
            lookup_key: 'topup#ORDER123',
            intent_id: 'req_topup_123',
            account_id: 'acct_123',
            site_id: 'site_123',
            topup_pack_code: 'topup_100k',
            credits: 100000,
            created_at: '2026-03-08T10:00:00.000Z'
        });
        captureTopupOrder.mockResolvedValue({
            orderId: 'ORDER123',
            captureId: 'CAPTURE123',
            status: 'COMPLETED'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'GET /aivi/v1/billing/return/paypal',
            requestContext: { requestId: 'req_return_123' },
            queryStringParameters: {
                token: 'ORDER123',
                PayerID: 'PAYER123'
            }
        });

        expect(response.statusCode).toBe(302);
        expect(captureTopupOrder).toHaveBeenCalledWith(expect.objectContaining({
            orderId: 'ORDER123',
            requestId: 'req_return_123'
        }));
        expect(mockUpdateCheckoutIntent).toHaveBeenCalledWith('topup#ORDER123', expect.objectContaining({
            status: 'captured_pending_webhook',
            provider_capture_id: 'CAPTURE123',
            reconciliation_state: 'pending_webhook',
            grant_pending: true
        }));
        expect(mockUpsertTopupOrderRecord).toHaveBeenCalledWith(expect.objectContaining({
            order_id: 'req_topup_123',
            provider_order_id: 'ORDER123',
            pack_code: 'topup_100k',
            credits: 100000,
            status: 'captured_pending_webhook',
            capture_id: 'CAPTURE123',
            grant_pending: true
        }));
        expect(response.headers.Location).toContain('aivi_billing_return=topup_capture_pending_credit');
        expect(response.headers.Location).toContain('provider_order_id=ORDER123');
    });

    test('reuses captured top-up returns without attempting a second capture', async () => {
        mockGetCheckoutIntent.mockResolvedValue({
            lookup_key: 'topup#ORDER123',
            status: 'captured_pending_webhook',
            return_url: 'https://kyngen.online/wp-json/aivi/v1/backend/billing_return'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'GET /aivi/v1/billing/return/paypal',
            requestContext: { requestId: 'req_return_repeat' },
            queryStringParameters: {
                token: 'ORDER123'
            }
        });

        expect(captureTopupOrder).not.toHaveBeenCalled();
        expect(mockUpdateCheckoutIntent).not.toHaveBeenCalled();
        expect(response.statusCode).toBe(302);
        expect(response.headers.Location).toContain('https://kyngen.online/wp-json/aivi/v1/backend/billing_return');
        expect(response.headers.Location).toContain('aivi_billing_return=topup_capture_pending_credit');
    });

    test('redirects subscription returns without attempting top-up capture', async () => {
        mockGetCheckoutIntent.mockResolvedValue({
            lookup_key: 'subscription#I-SUB123',
            return_url: 'https://kyngen.online/wp-json/aivi/v1/backend/billing_return'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'GET /aivi/v1/billing/return/paypal',
            requestContext: { requestId: 'req_sub_return' },
            queryStringParameters: {
                subscription_id: 'I-SUB123'
            }
        });

        expect(captureTopupOrder).not.toHaveBeenCalled();
        expect(response.statusCode).toBe(302);
        expect(response.headers.Location).toContain('https://kyngen.online/wp-json/aivi/v1/backend/billing_return');
        expect(response.headers.Location).toContain('aivi_billing_return=subscription_pending');
        expect(response.headers.Location).toContain('subscription_ref=I-SUB123');
    });

    test('returns failed trial subscription attempts to a retry-ready state from the PayPal return route', async () => {
        mockGetCheckoutIntent.mockResolvedValue({
            lookup_key: 'subscription#I-SUB123',
            account_id: 'acct_123',
            site_id: 'site_123',
            plan_code: 'starter',
            intent_variant: '',
            return_url: 'https://kyngen.online/wp-json/aivi/v1/backend/billing_return',
            created_at: '2026-03-08T10:00:00.000Z',
            provider_reference_id: 'I-SUB123'
        });
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            plan_code: 'free_trial',
            plan_name: 'Free Trial',
            subscription_status: 'created',
            trial_status: 'active',
            entitlements: {
                analysis_allowed: true,
                max_sites: 1
            },
            credits: {
                included_remaining: 4200,
                topup_remaining: 0,
                total_remaining: 4200
            },
            subscription: {
                provider_subscription_id: 'I-SUB123',
                current_period_start: null,
                current_period_end: null,
                cancel_at_period_end: false,
                credit_cycle_key: '',
                last_event_type: 'BILLING.SUBSCRIPTION.CREATED'
            }
        });
        getSubscriptionDetails.mockResolvedValue({
            providerSubscriptionId: 'I-SUB123',
            status: 'CANCELLED',
            statusUpdateTime: '2026-03-08T10:05:00.000Z'
        });

        const response = await billingCheckoutHandler({
            routeKey: 'GET /aivi/v1/billing/return/paypal',
            requestContext: { requestId: 'req_sub_retry_ready' },
            queryStringParameters: {
                subscription_id: 'I-SUB123'
            }
        });

        expect(response.statusCode).toBe(302);
        expect(getSubscriptionDetails).toHaveBeenCalledWith(expect.objectContaining({
            providerSubscriptionId: 'I-SUB123',
            requestId: 'req_sub_retry_ready'
        }));
        expect(mockUpdateCheckoutIntent).toHaveBeenCalledWith('subscription#I-SUB123', expect.objectContaining({
            status: 'cancelled',
            reconciliation_state: 'retry_ready'
        }));
        expect(mockPutAccountState).toHaveBeenCalledWith(expect.objectContaining({
            plan_code: 'free_trial',
            subscription_status: 'trial',
            trial_status: 'active',
            subscription: expect.objectContaining({
                provider_subscription_id: '',
                current_period_start: null,
                current_period_end: null,
                credit_cycle_key: '',
                cancel_at_period_end: false,
                last_event_type: 'PAYPAL.RETURN.CANCELLED'
            })
        }));
        expect(response.headers.Location).toContain('aivi_billing_return=subscription_retry_ready');
        expect(response.headers.Location).toContain('subscription_ref=I-SUB123');
    });

    test('returns missing PayPal trial subscription lookups to a retry-ready state from the PayPal return route', async () => {
        mockGetCheckoutIntent.mockResolvedValue({
            lookup_key: 'subscription#I-SUB404',
            account_id: 'acct_123',
            site_id: 'site_123',
            plan_code: 'starter',
            intent_variant: '',
            return_url: 'https://kyngen.online/wp-json/aivi/v1/backend/billing_return',
            created_at: '2026-03-08T10:00:00.000Z',
            provider_reference_id: 'I-SUB404'
        });
        mockGetAccountState.mockResolvedValue({
            account_id: 'acct_123',
            plan_code: 'free_trial',
            plan_name: 'Free Trial',
            subscription_status: 'created',
            trial_status: 'active',
            entitlements: {
                analysis_allowed: true,
                max_sites: 1
            },
            credits: {
                included_remaining: 4200,
                topup_remaining: 0,
                total_remaining: 4200
            },
            subscription: {
                provider_subscription_id: 'I-SUB404',
                current_period_start: null,
                current_period_end: null,
                cancel_at_period_end: false,
                credit_cycle_key: '',
                last_event_type: 'BILLING.SUBSCRIPTION.CREATED'
            }
        });
        const lookupError = new Error('PayPal could not find the referenced subscription.');
        lookupError.code = 'paypal_subscription_not_found';
        lookupError.details = { status: 404, provider_state: 'not_found' };
        getSubscriptionDetails.mockRejectedValue(lookupError);

        const response = await billingCheckoutHandler({
            routeKey: 'GET /aivi/v1/billing/return/paypal',
            requestContext: { requestId: 'req_sub_retry_lookup_404' },
            queryStringParameters: {
                subscription_id: 'I-SUB404'
            }
        });

        expect(response.statusCode).toBe(302);
        expect(mockUpdateCheckoutIntent).toHaveBeenCalledWith('subscription#I-SUB404', expect.objectContaining({
            status: 'cancelled',
            reconciliation_state: 'retry_ready_lookup_failure',
            lookup_failure: 'not_found'
        }));
        expect(mockPutAccountState).toHaveBeenCalledWith(expect.objectContaining({
            plan_code: 'free_trial',
            subscription_status: 'trial',
            trial_status: 'active',
            subscription: expect.objectContaining({
                provider_subscription_id: '',
                last_event_type: 'PAYPAL.RETURN.CANCELLED'
            })
        }));
        expect(response.headers.Location).toContain('aivi_billing_return=subscription_retry_ready');
        expect(response.headers.Location).toContain('subscription_ref=I-SUB404');
    });

    test('blocks hosted top-up checkout when site home URL is not https', async () => {
        const response = await billingCheckoutHandler({
            routeKey: 'POST /aivi/v1/billing/checkout/topup',
            requestContext: { requestId: 'req_topup_invalid_home' },
            body: JSON.stringify({
                topup_pack_code: 'topup_25k',
                account: { account_id: 'acct_123' },
                site: {
                    site_id: 'site_123',
                    home_url: 'http://localhost:8080'
                }
            })
        });

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body)).toMatchObject({
            ok: false,
            error: 'billing_https_required'
        });
        expect(createTopupCheckoutSession).not.toHaveBeenCalled();
    });
});
