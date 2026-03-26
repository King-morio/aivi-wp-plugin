# Account Onboarding And Gating Checklist

## Goal
Make AiVI commercially coherent:
- no analysis without a connected AiVI account
- no analysis without active entitlement
- no dead-end billing UI for disconnected customers
- clean path from install -> connect/start trial -> analyze -> buy credits/upgrade

## Milestone A - Enforce Disconnected-Site Blocking
- [x] Add a hidden runtime override for dev/staging-only unbound analysis.
- [x] Block disconnected sites in backend run admission by default.
- [x] Block disconnected sites in the sidebar by default.
- [x] Keep connected-but-not-entitled blocking intact.
- [ ] Deploy and verify that disconnected public installs cannot analyze.

## Milestone B - Fix Customer Settings States
- [x] Replace dead disabled billing buttons with onboarding CTAs for disconnected sites.
- [x] Make the connection tab the primary next step when no account is linked.
- [x] Tighten copy so users understand: connect account -> start trial/plan -> analyze.

## Milestone C - Add Self-Serve Customer Onboarding
- [x] Add backend route to create/bootstrap a customer account.
- [x] Add backend route to start a free trial and bind the current site.
- [x] Add WP proxy wiring for the onboarding flow.
- [x] Add settings-page CTA flow for self-serve connect/start-trial.
- [x] Sync local account/dashboard state immediately after onboarding succeeds.

## Milestone D - End-To-End Validation
- [ ] Fresh install on a public site shows disconnected/onboarding state.
- [ ] Disconnected site cannot analyze.
- [ ] Starting a free trial connects the site automatically.
- [ ] Analysis unlocks only after connected active entitlement.
- [ ] Credits and billing actions work after onboarding.