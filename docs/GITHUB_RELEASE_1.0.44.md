# GitHub Release 1.0.44

## Title

`AiVI 1.0.44`

## Suggested Tag

`v1.0.44`

## Summary

AiVI `1.0.44` makes Copilot easier to trust when sections are flagged for extractability and safer when a requested rewrite scope is too large to generate clean snippet-level variants.

## Release Notes

### Highlights

- preserved clearer analyzer-led extractability explanations so flagged sections are easier to understand and act on
- stopped Copilot from returning unusable fallback variants when a requested rewrite scope is too wide, and now explains when the section needs a tighter snippet-level repair
- refined Copilot guidance so optional web-verification prompts appear only on issues that actually need source-aware help

### Install

1. Download `ai-visibility-inspector-1.0.44.zip`
2. In WordPress admin, go to `Plugins > Add New > Upload Plugin`
3. Upload the ZIP and activate AiVI

### Notes

- AiVI supports both Gutenberg and Classic Editor workflows
- the current overlay flow remains manual copy/paste into the matching WordPress block before you click `Update` or `Publish`
- this release keeps public notes focused on customer-visible behavior only

## Primary Asset

- `ai-visibility-inspector-1.0.44.zip`
