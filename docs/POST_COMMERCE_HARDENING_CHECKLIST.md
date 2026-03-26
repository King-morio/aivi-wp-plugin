# Post-Commerce Hardening Checklist

## Step 1 - Cognito/JWT runtime contract
- [x] Lock the runtime config shape the hosted admin console will require for Cognito Hosted UI + PKCE.
- [x] Add staging/production runtime config examples with redirect/logout/scopes metadata.
- [x] Update control-plane docs so bootstrap-token staging is clearly transitional.

## Step 2 - Hosted admin console Cognito flow
- [x] Add Cognito login/logout handling in the hosted admin console.
- [x] Persist and validate session state without relying on the bootstrap token.
- [x] Keep bootstrap-token mode available only as a staging fallback.

## Step 3 - API Gateway JWT authorizer cutover
- [x] Wire the admin API to require JWT authorizer claims for hosted-console access.
- [ ] Keep operator group and MFA checks aligned between API Gateway and Lambda.
- [x] Disable bootstrap-token access once Cognito staging is proven.

## Step 4 - Private plugin updater
- [ ] Publish a private update manifest and signed package URL flow.
- [ ] Make customer sites receive normal WordPress update notices for AiVI.
- [ ] Keep release packaging customer-safe and control-plane-free.

## Step 5 - Rollout closeout
- [ ] Run one final public customer-site validation pass.
- [ ] Run one final hosted admin-console validation pass.
- [ ] Checkpoint docs, package versions, and repo state for the post-commerce baseline.

## Notes
- The JWT authorizer cutover and bootstrap-token retirement are now complete in staging.
- The remaining open auth item is the final MFA-backed validation pass after Cognito MFA and backend `AIVI_ADMIN_REQUIRE_MFA` are restored.
