# AiVI Admin Console

This is the separate internal control-plane boundary for AiVI super-admin operations.

It is intentionally outside WordPress.

## Purpose

The admin console will be used by internal operators to:
- inspect accounts, plans, credits, and connected sites
- review billing and webhook state
- perform audited operator actions such as manual credit adjustments

## Boundary

- customer-facing WordPress plugin: `wp-content/plugins/AiVI-WP-Plugin`
- internal control plane: `control-plane/admin-console`

The control plane must never be bundled into the customer WordPress release package.

## Recommended AWS deployment

- hosting: `S3 + CloudFront` or `AWS Amplify Hosting`
- auth: `AWS Cognito User Pool`
- API: `API Gateway` + backend admin handlers
- access URL examples:
  - staging: `https://console-staging.dollarchain.store`
  - production: `https://console.dollarchain.store`

## Current scaffold status

Milestone 5 Step 6 provides:
- static app shell
- read, write, diagnostics, and recovery views
- runtime config boundary via `runtime-config.js`
- explicit Cognito + MFA auth direction
- admin API/client scaffold for hosted deployment

Live Cognito redirect/login is still a rollout task, but the console is now structured for AWS deployment.

## Local preview

Open `control-plane/admin-console/index.html` in a browser to inspect the scaffold.

## Runtime config

- local preview config:
  - `control-plane/admin-console/runtime-config.js`
- deployment template:
  - `control-plane/admin-console/runtime-config.example.js`
 - staging deployment template:
   - `control-plane/admin-console/runtime-config.staging.example.js`
 - production deployment template:
   - `control-plane/admin-console/runtime-config.production.example.js`

For production/staging, publish an environment-specific `runtime-config.js` with:
- `allowPreview: false`
- `apiBaseUrl`
- Cognito Hosted UI settings

## Static bundle packaging

To prepare a static bundle for staging/hosting:

- local runtime config bundle:
  - `powershell -ExecutionPolicy Bypass -File .\control-plane\admin-console\package-admin-console.ps1`
- staging template bundle:
  - `powershell -ExecutionPolicy Bypass -File .\control-plane\admin-console\package-admin-console.ps1 -UseStagingExample`

This produces a zip under:

- `control-plane/admin-console/dist/admin-console-bundle.zip`

## Region note

Current AiVI backend infrastructure is pinned to:

- `eu-north-1`

But if you use CloudFront for the admin-console custom hostname, the ACM certificate for:

- `console-staging.dollarchain.store`
- `console.dollarchain.store`

must be created in:

- `us-east-1`
