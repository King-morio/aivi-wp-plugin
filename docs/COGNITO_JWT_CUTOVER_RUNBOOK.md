# Cognito JWT Cutover Runbook

## Goal
Move the hosted admin console from staging bootstrap-token access to Cognito Hosted UI + PKCE with JWT-authorized admin APIs.

## Preconditions
- Admin console is live at `https://console-staging.dollarchain.store`
- Admin API is live at `https://dnvo4w1sca.execute-api.eu-north-1.amazonaws.com`
- `super-admin-auth.js` already accepts Cognito JWT claims and enforces MFA/group checks
- Staging bootstrap token remains enabled only as a temporary fallback

## AWS resources to create in `eu-north-1`
1. Cognito User Pool
2. User Pool domain
3. App client for Hosted UI + PKCE (no client secret)
4. User groups:
   - `aivi-super-admin`
   - `aivi-support`
   - `aivi-finance`
5. API Gateway JWT authorizer bound to the admin routes on `dnvo4w1sca`

## Cognito settings
- Hosted UI callback URL:
  - `https://console-staging.dollarchain.store/`
- Hosted UI sign-out URL:
  - `https://console-staging.dollarchain.store/`
- Allowed OAuth flow:
  - Authorization code grant
- Allowed OAuth scopes:
  - `openid`
  - `email`
  - `profile`
- MFA:
  - required

## Token claims expected by Lambda
- `email`
- `sub`
- `cognito:groups`
- MFA satisfied through `cognito:preferred_mfa` or `amr`

## API Gateway cutover
Apply the JWT authorizer to:
- `GET /aivi/v1/admin/accounts`
- `GET /aivi/v1/admin/accounts/{account_id}`
- `POST /aivi/v1/admin/accounts/{account_id}/actions`
- `GET /aivi/v1/admin/accounts/{account_id}/diagnostics`
- `POST /aivi/v1/admin/accounts/{account_id}/diagnostics/recovery`

Keep:
- CORS origin: `https://console-staging.dollarchain.store`
- Allowed headers: `authorization`, `content-type`

## Runtime config switch
Replace the hosted file:
- `runtime-config.js`

With the staging Cognito variant containing:
- `mode: 'cognito_hosted_ui_pkce'`
- `cognitoDomain`
- `userPoolClientId`
- `redirectUri`
- `postLogoutRedirectUri`
- `logoutUrl`
- `scopes`
- `audience` if authorizer requires it

## Staging validation
1. Open `https://console-staging.dollarchain.store`
2. Click `Sign in with Cognito`
3. Authenticate with an operator in the right group
4. Confirm account list loads with no bootstrap token
5. Confirm write and diagnostics actions still honor role permissions
6. Confirm MFA-required users pass and non-MFA users are rejected

## Bootstrap retirement
After Cognito staging passes:
- set `AIVI_ADMIN_ALLOW_BOOTSTRAP_TOKEN=false`
- remove `AIVI_ADMIN_BOOTSTRAP_TOKEN`
- publish a fresh `runtime-config.js` with Cognito mode only
