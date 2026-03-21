# AiVI Operations Guide

This guide covers the public-safe operational workflow for the **AiVI - AI Visibility Inspector** WordPress plugin.

It focuses on:

- packaging the plugin
- validating releases
- maintaining release notes
- syncing the public plugin repository safely

It does **not** document private backend deployment, control-plane operations, or internal operator runbooks.

## Operations Scope

For the public plugin surface, operations work usually means:

- preparing a release ZIP
- sanity-checking the plugin on a specimen site or local WordPress install
- updating public release notes
- exporting and syncing a clean public snapshot when needed

If a task requires private infrastructure or managed backend deployment, that belongs to a separate internal operations lane and should not be added to this public guide.

## Core Release Artifacts

The main public-safe release artifacts are:

- plugin ZIP:
  - `dist/AiVI-WP-Plugin.zip`
- public snapshot folder:
  - `dist/public-repo/_stage/AiVI-WP-Plugin-public`
- public snapshot ZIP:
  - `dist/public-repo/AiVI-WP-Plugin-public.zip`

The plugin ZIP is the installable WordPress artifact.

The public snapshot is the cleaned repository export used for the public GitHub repo.

## Packaging the Plugin

The release ZIP is built with:

- `tools/package-plugin-release.ps1`

Run it from the plugin root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\package-plugin-release.ps1
```

This packaging flow intentionally includes only the runtime files WordPress needs:

- `ai-visibility-inspector.php`
- `LICENSE`
- `readme.md`
- `assets/`
- `includes/`

That keeps release packages clean and prevents local debug files, internal docs, or private infrastructure code from shipping inside the plugin ZIP.

## Public Snapshot Export

The public snapshot is built with:

- `tools/export-public-repo-snapshot.ps1`

It uses:

- `tools/public-repo-allowlist.json`

Run it from the plugin root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\export-public-repo-snapshot.ps1
```

The allowlist controls what is safe to publish publicly.

That workflow exists to prevent private or internal-only repository history from leaking into the public plugin repo.

## Release Verification

Before treating a plugin build as ready, verify the areas most likely to regress:

- plugin installs and activates correctly
- editor analysis UI loads
- settings tabs render correctly
- analysis progress and result rendering behave normally
- the latest targeted fixes actually appear in the specimen workflow

## Suggested Verification Checklist

### Install and activate

- update the plugin from the packaged ZIP
- confirm WordPress activates it cleanly
- confirm the AiVI menu/settings surface still loads

### Editor verification

Check at least one real article in Gutenberg and, when relevant, one Classic Editor screen:

- analysis can start
- progress card renders correctly
- results appear without stale leftovers
- jump-to-block and detail flows still behave
- overlay/editor behavior still feels intact

### Settings verification

Check the current public-facing tabs:

- `Overview`
- `Plans`
- `Credits`
- `Connection`
- `Support`
- `Documentation`

Confirm layout, copy, and buttons still behave as expected.

### Specimen verification

When a release includes behavior fixes, verify them on a known specimen article or specimen site.

Examples of good specimen checks:

- answer-family partial/pass behavior
- heading-fragmentation behavior
- stale-result invalidation
- intro extraction behavior
- settings-shell or sidebar visual changes

Use the real target flow, not only mocks or static screenshots.

## Release Notes Discipline

AiVI uses:

- `CHANGELOG.md`

for public release notes.

Keep changelog entries:

- public-facing
- version-aware
- free of internal-only plan names
- free of private infrastructure references
- focused on user-visible behavior, contributor workflow, packaging, and public-safe technical changes

Avoid release note language that depends on internal context a public contributor would not understand.

## Current Versioning Guidance

The current plugin version is defined in:

- `ai-visibility-inspector.php`

When preparing a formal release:

1. update the plugin version in the bootstrap file if needed
2. make sure package metadata and docs stay aligned
3. summarize the release in `CHANGELOG.md`
4. rebuild the plugin ZIP

## Public Repo Sync Workflow

The public plugin repo should **not** be pushed directly from a private/internal source tree with full history.

Instead, use the public snapshot workflow:

1. update the plugin-safe files in the source repo
2. regenerate the public snapshot with `tools/export-public-repo-snapshot.ps1`
3. copy or sync the snapshot into the clean public repo working directory
4. review the diff in the public repo
5. commit and push from the public repo itself

This keeps:

- private history out of the public repo
- internal paths out of public commits
- contributor-facing code focused on the plugin surface

## What Should Never Ship Publicly

Do not include these lanes in the public repo or release ZIP:

- control-plane/admin-console code
- private managed backend implementation
- internal deploy scripts tied to private infrastructure
- private billing, Cognito, PayPal, or super-admin internals
- environment inventories
- temporary logs, replay dumps, scratch files, and local debug artifacts

If you are unsure whether something belongs in the public lane, default to excluding it until it is clearly justified.

## Post-Release Hygiene

After a release or public sync:

- confirm the public docs still describe the current plugin correctly
- confirm contributor docs still match the current workflow
- keep the changelog current instead of letting release notes accumulate in track docs only
- remove or quarantine temporary validation artifacts instead of letting them build up in the plugin root

## Operational Principle

The cleanest AiVI release workflow is simple:

- package only what WordPress needs
- verify fixes in the real interface
- document the release clearly
- publish only the plugin-safe surface

That keeps public distribution safer, easier to understand, and easier to maintain.
