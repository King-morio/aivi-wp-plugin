# AiVI — AI Visibility Inspector

An AI-gated content analysis product that measures AEO/GEO visibility for WordPress content.

## Papa Fuego Plan Summary

AiVI follows the Papa Fuego development philosophy: AI-gated analysis with deterministic preflight, abort-on-failure behavior, and no silent fallbacks. The plugin serves as a UI shell that delegates all semantic checks to an AI orchestrator backend.

### Core Principles
- **AI-Gated**: All semantic analysis performed by AI backend
- **Abort on Failure**: Clear banner shown if AI unavailable
- **Minimal Deterministic Layer**: Only preflight (token estimate) and manifest extraction
- **No Silent Fallbacks**: Never show partial or speculative results

## Description

AiVI is a WordPress plugin that provides AI-powered content analysis with a focus on Answer Engine Optimization (AEO) and Generative Engine Optimization (GEO). The plugin follows a strict "AI-gated or abort" philosophy - if AI analysis is unavailable, the analysis is aborted with a clear banner rather than showing partial or deterministic results.

## Public Repository Scope

This public repository contains the WordPress plugin surface only: the plugin runtime, contributor-safe tests, and packaging/build helpers needed to install, understand, and package AiVI.

Internal operator systems and private infrastructure are intentionally excluded, including:

- super-admin and control-plane applications
- backend infrastructure and deployment code
- billing, PayPal, Cognito, and operator-only integration paths
- internal runbooks, environment inventories, and debug artifacts

## Features

- **Deterministic Preflight**: Token estimation and basic content extraction
- **AI-Gated Analysis**: All semantic checks performed by AI backend
- **Graceful Failure**: Clear abort banner when AI is unavailable
- **Editor Integration**: Works with both Gutenberg and Classic editors
- **REST API**: Modular endpoints for preflight, analysis, and rewrite
- **FAQ JSON-LD**: AI-generated schema suggestions (manual insertion)

## Architecture

### Core Philosophy

1. **Minimal Deterministic Layer**: Only preflight (token estimate) and manifest extraction
2. **AI-Only Semantic Checks**: All analysis performed by AI orchestrator
3. **No Silent Fallbacks**: If AI fails, show clear abort banner
4. **Manual Application**: AI suggestions require manual user action

### Plugin Structure

```
ai-visibility-inspector/
├── ai-visibility-inspector.php   # Bootstrap file
├── includes/
│   ├── class-plugin.php          # Core plugin class
│   ├── class-admin-menu.php      # Admin menu management
│   ├── class-editor-sidebar.php  # Editor sidebar integration
│   ├── class-assets.php          # Asset management
│   ├── class-rest-preflight.php  # Preflight endpoint
│   ├── class-rest-analyze.php    # Analysis endpoint
│   ├── class-rest-rewrite.php    # Rewrite endpoint
│   ├── class-rest-ping.php       # Backend status check
│   └── helpers/
│       └── functions.php         # Helper functions
├── assets/
│   ├── js/
│   │   └── aivi-sidebar.js       # Frontend JavaScript
│   └── css/                      # Styles (inline for now)
├── tests/                        # Test suite (placeholder)
├── .github/
│   └── workflows/                # CI/CD workflows
├── LICENSE                       # GPLv2 license
├── CONTRIBUTING.md               # Developer onboarding
└── readme.md                     # This file
```

## Installation

1. Download the plugin as a ZIP file
2. Upload to `wp-content/plugins/`
3. Activate the plugin in WordPress admin
4. Access "AiVI Inspector" from the admin menu

## Usage

1. Edit any post or page
2. Open the AiVI sidebar in the editor
3. Click "Analyze Content"
4. Review results (if AI backend is configured)

## REST API Endpoints

### Preflight
- **POST** `/wp-json/aivi/v1/preflight`
- Estimates tokens and validates content length
- Returns manifest data and token count

### Analyze
- **POST** `/wp-json/aivi/v1/analyze`
- Performs AI analysis (requires backend configuration)
- Returns scores, checks, and suggestions

### Rewrite
- **POST** `/wp-json/aivi/v1/rewrite`
- Provides content rewrite suggestions
- Not implemented in skeleton

### Ping
- **GET** `/wp-json/aivi/v1/ping`
- Checks backend availability
- Returns AI availability status

## Configuration

### Admin Settings

1. Navigate to **Settings → AiVI** in your WordPress admin
2. Configure the following settings:

#### Backend Configuration
- **AiVI Backend Base URL**: The root URL of your AiVI backend API (e.g., `https://api.aivi.example.com`)
- **Enable Web Lookups**: Allow semantic checks to perform external web requests
- **Token Cutoff Override**: Maximum tokens per analysis (default: 200,000)
- **Enable AiVI**: Master switch to disable all features if needed

#### Testing
- Use the **Test Connection** button to verify your backend is accessible
- Check for success/failure messages after testing

### Troubleshooting

1. **Backend Not Available**
   - Verify the backend URL is correct and accessible
   - Check network connectivity and firewall settings
   - Ensure SSL certificate is valid

2. **Analysis Fails**
   - Check that backend is configured and responding
   - Verify content is within token limits
   - Check error logs for detailed messages

3. **Plugin Disabled**
   - Go to Settings → AiVI
   - Ensure "Enable AiVI" checkbox is checked
   - Save settings

### Security Notes

- No API keys or secrets are stored in WordPress
- All external API calls are proxied through the plugin
- All REST endpoints require proper capabilities and nonces
- Content is sanitized before processing

## Development

### Requirements

- WordPress 5.0+
- PHP 7.4+
- Node.js (for development)

### Onboarding

See [CONTRIBUTING.md](CONTRIBUTING.md) for developer setup and guidelines.

### Adding Features

1. Follow the existing class structure
2. Maintain the AI-gated philosophy
3. Add defensive coding practices
4. Update documentation
5. Ensure UI consistency between Classic and Gutenberg editors

### Security

- All endpoints require `edit_posts` capability
- Nonce-protected REST API
- Sanitized and escaped outputs
- No fatal errors on failures

## Phase 1 Priorities

Next development phase focuses on:
1. Analyzer JSON schema definition
2. Sonnet prompt engineering
3. Backend orchestrator integration
4. Enhanced error handling
5. Performance optimization

## License

GPLv2 or later - see [LICENSE](LICENSE) file for details

## Changelog

### 0.9.1
- Initial modular release
- Extracted from single-file prototype
- Maintained all original functionality
- Added proper class structure
- Implemented UI consistency between Classic and Gutenberg editors
