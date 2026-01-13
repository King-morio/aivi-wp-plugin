# Papa Fuego Plan

## Overview

The Papa Fuego plan outlines the phased development approach for the AiVI WordPress plugin, ensuring deterministic, secure, and performant AI-powered content analysis.

## Development Philosophy

1. **Deterministic First**: All analysis must be deterministic and reproducible
2. **Security by Default**: No external API calls without explicit configuration
3. **Performance Conscious**: Efficient token usage and async operations
4. **WordPress Native**: Leverage core WordPress APIs and patterns

## Core Principles

### Frontend (WordPress Plugin)
- **Responsibilities**:
  - Content extraction and preflight
  - UI rendering (consistent across Classic/Gutenberg)
  - API communication with orchestrator
  - Result display and user interactions

### Preflight API Contract
The deterministic preflight layer provides:

1. **HTML Sanitization**
   - Aggressive sanitization with secret redaction
   - Preserves semantic structure for analysis
   
2. **Document Manifest**
   - Structured extraction of nodes, links, and metadata
   - JSON-LD parsing and validation
   - Word/token estimation
   
3. **Link Checking Queue**
   - Asynchronous validation of internal links
   - Configurable sampling limits
   - HEAD requests with timeout controls

4. **Token Estimation**
   - Formula: `tokens = ceil(word_count * 1.6 * markup_factor)`
   - Enforces Sonnet cutoff (200,000 tokens default)
   - Returns manifest snippet for oversized content

### Backend (AI Orchestrator)
- **Responsibilities**:
  - All semantic analysis and scoring
  - AEO/GEO check execution
  - Schema generation
  - Confidence scoring

## Development Phases

### Phase 0: Foundation ✅
- Plugin scaffolding and basic structure
- REST API framework
- UI components for both editors
- Configuration management

### Phase 1: Canonical Checks ✅
- Implement canonical check definitions
- Scoring matrix and confidence mapping
- Content type applicability rules
- Schema definitions for responses

### Phase 2: Deterministic Preflight ✅
- HTML sanitizer and DOM serializer
- Document manifest generation
- Token estimation with cutoff enforcement
- Link-check queue implementation
- REST endpoint `POST /aivi/v1/analyze/preflight`

### Phase 3: Plugin Hardening 🚧
- Admin settings page for backend configuration
- Nonce and capability enforcement
- Backend proxy implementation
- Graceful failure handling
- Security hardening

### Phase 4: Backend Integration (Future)
- Full semantic analysis integration
- Real-time scoring
- Schema suggestions
- Performance optimization

## Technical Architecture

### Security Model
1. **No secrets in WordPress options** - Backend handles API keys
2. **All external calls proxied** - Client never calls external APIs
3. **Nonce validation** - All REST endpoints require valid nonces
4. **Capability checks** - Role-based access control
5. **Input sanitization** - All data sanitized server-side

### Performance Considerations
1. **Async operations** - Link checking and analysis run asynchronously
2. **Token limits** - Enforced at preflight stage
3. **Caching strategy** - Results cached with TTL
4. **Sampling** - Large datasets sampled for analysis

### Error Handling
1. **Graceful degradation** - Plugin works without backend
2. **Clear messaging** - Users understand why operations fail
3. **Logging** - Structured logs without sensitive data
4. **Recovery** - Automatic retry with backoff

## Configuration

### Constants
```php
// Token limits
define( 'AIVI_SONNET_TOKEN_CUTOFF', 200000 );

// Link checking
define( 'AIVI_LINK_CHECK_SAMPLE_CAP', 50 );
define( 'AIVI_LINK_CHECK_TIMEOUT', 3 );
define( 'AIVI_LINK_CHECK_CONCURRENCY', 10 );
define( 'AIVI_LINK_CHECK_RETRIES', 1 );

// Storage
define( 'AIVI_ENABLE_ENCRYPTED_STORAGE', false );
```

### Admin Settings
- Backend URL configuration
- Web lookup toggle
- Token cutoff override
- Plugin enable/disable switch

## Quality Standards

### Code Quality
- PSR-4 autoloading
- PHP 7.4+ compatibility
- WordPress coding standards
- Comprehensive unit tests

### Security
- No stored secrets
- All inputs sanitized
- Nonces on all actions
- Capability checks
- SSL verification

### Performance
- < 2s preflight response
- < 30s analysis timeout
- Efficient token usage
- Async operations

## API Contracts

### Preflight Endpoint
```
POST /wp-json/aivi/v1/analyze/preflight
Input: { title, content_html, post_id?, author_id? }
Output: { ok, tokenEstimate, cutoff, manifest?, reason?, linksSummary }
```

### Backend Proxy
```
GET /wp-json/aivi/v1/backend/proxy_ping
Output: { ok, aiAvailable, message }

POST /wp-json/aivi/v1/backend/proxy_analyze
Input: { title, content_html, post_id?, content_type? }
Output: { ok, scores, checks, highlights, schema_suggestions }
```

## Success Metrics

1. **Reliability**: 99.9% uptime for preflight
2. **Performance**: < 2s preflight, < 30s analysis
3. **Security**: Zero stored secrets
4. **Usability**: Works without backend
5. **Coverage**: 90%+ test coverage

## Implementation Notes

### Preflight Implementation
- Uses WordPress `wp_kses` for sanitization
- DOMDocument for HTML parsing
- Regex-based secret redaction
- WordPress cron for async operations

### Backend Integration
- All external calls server-side
- Timeout and retry logic
- Error normalization
- Response caching

### UI Consistency
- Same components in Classic/Gutenberg
- Responsive design
- Accessibility compliant
- Progressive enhancement
