# Cognito JWT Cutover Tracker

## Objective
Replace staging bootstrap-token access for `https://console-staging.dollarchain.store` with Cognito Hosted UI + PKCE, MFA, Cognito groups, and API Gateway JWT authorization.

## Current state
- [x] Step 1 - Cognito user pool created
- [x] Step 2 - SPA app client created with no client secret
- [x] Step 3 - Cognito domain in place
- [x] Step 4 - Callback URL, sign-out URL, auth code grant, and scopes configured
- [ ] Step 5 - Groups created
- [ ] Step 6 - Operator user created and added to group
- [ ] Step 7 - API Gateway JWT authorizer created
- [ ] Step 8 - JWT authorizer attached to admin routes
- [ ] Step 9 - CORS verified for `authorization` header
- [ ] Step 10 - Hosted `runtime-config.js` switched to Cognito mode
- [ ] Step 11 - Hosted console login tested end to end
- [ ] Step 12 - Bootstrap token disabled

## Staging values
- User pool name: `aivi-admin-staging`
- App client name: `aivi-admin-console-staging-web`
- Callback URL: `https://console-staging.dollarchain.store/`
- Sign-out URL: `https://console-staging.dollarchain.store/`

## Next actions
1. Create groups:
   - `aivi-super-admin`
   - `aivi-support`
   - `aivi-finance`
2. Create one staging operator user and add to `aivi-super-admin`
3. Create JWT authorizer on API `dnvo4w1sca`
4. Attach authorizer only to admin routes
5. Publish Cognito-based `runtime-config.js` to the S3 bucket
6. Test hosted login and retire bootstrap auth
