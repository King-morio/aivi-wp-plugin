# Cognito JWT Project Track

## Goal
Replace staging bootstrap-token auth for:
- `https://console-staging.dollarchain.store`

with:
- Cognito Hosted UI
- PKCE
- MFA
- group-based operator access
- API Gateway JWT authorization

Region:
- `eu-north-1`

## Current identifiers
- User pool: `aivi-admin-staging`
- Cognito domain: `https://eu-north-1nq3a1xryo.auth.eu-north-1.amazoncognito.com`
- App client: `aivi-admin-console-staging-web`
- App client ID: `20arop6n6r56gkpmpee37nc954`
- Hosted console: `https://console-staging.dollarchain.store`
- Admin API: `https://dnvo4w1sca.execute-api.eu-north-1.amazonaws.com`

## Step status
- [x] 1. Create Cognito user pool
- [x] 2. Create public SPA app client with no secret
- [x] 3. Create/select Cognito hosted domain
- [x] 4. Configure callback URL, sign-out URL, code grant, and scopes
- [x] 5. Create groups
- [x] 6. Create at least one operator user and assign group
- [x] 7. Create API Gateway JWT authorizer
- [x] 8. Attach JWT authorizer to admin routes only
- [x] 9. Verify/adjust admin API CORS for Authorization header
- [x] 10. Switch hosted admin `runtime-config.js` to Cognito mode
- [x] 11. Test hosted console sign-in, token exchange, and admin API access
- [x] 12. Retire bootstrap-token auth in staging

## Completed evidence
- Cognito service domain exists and is active.
- Cognito managed login branding now exists for the staging app client.
- App client has:
  - no client secret
  - callback URL `https://console-staging.dollarchain.store/`
  - sign-out URL `https://console-staging.dollarchain.store/`
  - authorization code grant
  - scopes `openid`, `email`, `profile`
- Admin JWT authorizer exists on API `dnvo4w1sca`.
- The five admin routes now require JWT auth.
- API `dnvo4w1sca` CORS allows `authorization` from `https://console-staging.dollarchain.store`.
- Hosted admin console Cognito-mode bundle has been rebuilt, uploaded to S3, and invalidated through CloudFront.
- Hosted staging sign-in now reaches the live admin dashboard and loads operator data with Cognito/JWT auth.
- Staging bootstrap-token auth has now been retired:
  - `AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN=false`
  - the bootstrap token secret is no longer present in the staging Lambda environment

## Remaining execution order
1. Re-enable true Cognito MFA in staging:
   - [x] enable TOTP MFA on the user pool
   - [x] enroll the staging operator user
   - [ ] restore Cognito MFA on the staging user pool after the current verification window
   - [ ] restore backend `AIVI_ADMIN_REQUIRE_MFA=true` after the current verification window
   - [ ] re-test hosted sign-in end to end with MFA claims present using the enrolled authenticator device
2. Confirm Cognito/JWT-only access still works after MFA restoration and that bootstrap-token auth remains retired.
3. Update runbooks/checklists once staging MFA validation passes.

## Current live staging state
- Hosted console auth path is Cognito Hosted UI + PKCE.
- Group-based operator access is working.
- API Gateway JWT route protection is working.
- Backend bootstrap-token access is disabled with:
  - `AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN=false`
- Backend MFA enforcement is **temporarily disabled for verification only** with:
  - `AIVI_ADMIN_REQUIRE_MFA=false`
- Cognito user pool MFA is **temporarily disabled for verification only**:
  - user pool: `aivi-admin-staging`
  - user pool ID: `eu-north-1_nq3A1XRyo`
  - expected restore target after verification: `MfaConfiguration=ON` with software token MFA enabled
- Staging bootstrap token secret has been removed from Lambda environment variables.

## Pending tasks
- Restore staging auth gates immediately after the current verification window:
  - set Cognito user-pool MFA back to `ON`
  - set backend `AIVI_ADMIN_REQUIRE_MFA` back to `true`
  - do **not** treat staging as releasable until both are restored
- Restore access to the enrolled MFA device and complete one fresh Hosted UI sign-in.
- Re-run admin API validation after a fresh MFA-backed session is established.
- Confirm bootstrap-token auth remains disabled after the fresh MFA-backed sign-in.
- Update operator runbooks with the current MFA enrollment and recovery procedure.

## Notes
- Temporary verification exception on `2026-03-16`:
  - backend `AIVI_ADMIN_REQUIRE_MFA` was intentionally flipped to `false`
  - Cognito user-pool MFA was intentionally turned `OFF`
  - this exception exists only to verify recent super-admin fixes without the enrolled device
  - both gates must be restored before any staging sign-off or production-adjacent rollout
- Do not treat staging as complete until a fresh post-enrollment MFA-backed sign-in is validated end to end.
- Current blocker for final staging sign-off: the enrolled MFA device is presently unavailable, so re-validation is deferred rather than failed.
- Do not attach JWT auth to customer/plugin routes.
- For API Gateway JWT issuer, use:
  - `https://cognito-idp.eu-north-1.amazonaws.com/<USER_POOL_ID>`
- For the hosted Cognito runtime, leave `audience` empty unless you are using a real resource URI. The Cognito app client ID is not a valid `resource` value.
