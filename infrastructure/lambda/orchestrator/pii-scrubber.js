/**
 * PII Scrubber - Redact sensitive personal information before persistence
 *
 * Detects and redacts:
 * - Email addresses
 * - Social Security Numbers (SSN)
 * - Phone numbers
 * - Credit card numbers
 * - IP addresses
 *
 * Version: 1.0.0
 * Last Updated: 2026-01-29
 */

const PII_PATTERNS = {
    email: {
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        replacement: '[EMAIL_REDACTED]',
        severity: 'medium'
    },
    ssn: {
        pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
        replacement: '[SSN_REDACTED]',
        severity: 'high'
    },
    phone_us: {
        pattern: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        replacement: '[PHONE_REDACTED]',
        severity: 'medium'
    },
    phone_intl: {
        pattern: /\b\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g,
        replacement: '[PHONE_REDACTED]',
        severity: 'medium'
    },
    credit_card: {
        pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
        replacement: '[CC_REDACTED]',
        severity: 'critical'
    },
    ip_address: {
        pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
        replacement: '[IP_REDACTED]',
        severity: 'low'
    }
};

/**
 * Log helper for PII events
 */
const piiLog = (level, message, data = {}) => {
    console.log(JSON.stringify({
        level,
        message,
        service: 'pii-scrubber',
        security: true,
        ...data,
        timestamp: new Date().toISOString()
    }));
};

/**
 * Scrub PII from a string
 * @param {string} text - Text to scrub
 * @returns {Object} - { scrubbed: string, detections: array }
 */
const scrubString = (text) => {
    if (!text || typeof text !== 'string') {
        return { scrubbed: text, detections: [] };
    }

    let scrubbed = text;
    const detections = [];

    Object.entries(PII_PATTERNS).forEach(([type, config]) => {
        const matches = text.match(config.pattern);
        if (matches && matches.length > 0) {
            detections.push({
                type,
                count: matches.length,
                severity: config.severity
            });
            scrubbed = scrubbed.replace(config.pattern, config.replacement);
        }
    });

    return { scrubbed, detections };
};

/**
 * Recursively scrub PII from an object
 * @param {any} obj - Object to scrub
 * @param {string} path - Current path (for logging)
 * @returns {Object} - { scrubbed: any, detections: array }
 */
const scrubObject = (obj, path = '') => {
    const allDetections = [];

    if (obj === null || obj === undefined) {
        return { scrubbed: obj, detections: [] };
    }

    if (typeof obj === 'string') {
        const { scrubbed, detections } = scrubString(obj);
        detections.forEach(d => {
            d.path = path;
            allDetections.push(d);
        });
        return { scrubbed, detections: allDetections };
    }

    if (Array.isArray(obj)) {
        const scrubbedArray = [];
        obj.forEach((item, index) => {
            const { scrubbed, detections } = scrubObject(item, `${path}[${index}]`);
            scrubbedArray.push(scrubbed);
            allDetections.push(...detections);
        });
        return { scrubbed: scrubbedArray, detections: allDetections };
    }

    if (typeof obj === 'object') {
        const scrubbedObj = {};
        Object.entries(obj).forEach(([key, value]) => {
            const currentPath = path ? `${path}.${key}` : key;
            const { scrubbed, detections } = scrubObject(value, currentPath);
            scrubbedObj[key] = scrubbed;
            allDetections.push(...detections);
        });
        return { scrubbed: scrubbedObj, detections: allDetections };
    }

    // Primitives (numbers, booleans) pass through unchanged
    return { scrubbed: obj, detections: [] };
};

/**
 * Scrub PII from full analysis result before persistence
 * Focus on fields that may contain user content:
 * - highlights[].snippet
 * - suggestions[].text
 * - explanation
 *
 * @param {Object} analysisResult - Full analysis result
 * @param {string} runId - Run ID for logging
 * @returns {Object} - { scrubbed: Object, piiDetected: boolean, detections: array }
 */
const scrubAnalysisResult = (analysisResult, runId = 'unknown') => {
    if (!analysisResult || typeof analysisResult !== 'object') {
        return {
            scrubbed: analysisResult,
            piiDetected: false,
            detections: []
        };
    }

    // Deep clone to avoid mutating original
    const cloned = JSON.parse(JSON.stringify(analysisResult));
    const allDetections = [];
    const scrubQuoteFields = (obj, basePath) => {
        if (!obj || typeof obj !== 'object') return;
        ['exact', 'prefix', 'suffix'].forEach((key) => {
            if (obj[key]) {
                const { scrubbed, detections } = scrubString(obj[key]);
                obj[key] = scrubbed;
                detections.forEach(d => {
                    d.path = `${basePath}.${key}`;
                    allDetections.push(d);
                });
            }
        });
    };

    // Scrub checks
    if (cloned.checks && typeof cloned.checks === 'object') {
        Object.entries(cloned.checks).forEach(([checkId, checkData]) => {
            // Scrub explanation
            if (checkData.explanation) {
                const { scrubbed, detections } = scrubString(checkData.explanation);
                checkData.explanation = scrubbed;
                detections.forEach(d => {
                    d.path = `checks.${checkId}.explanation`;
                    allDetections.push(d);
                });
            }

            // Scrub highlights
            if (Array.isArray(checkData.highlights)) {
                checkData.highlights.forEach((highlight, idx) => {
                    if (highlight.snippet) {
                        const { scrubbed, detections } = scrubString(highlight.snippet);
                        highlight.snippet = scrubbed;
                        detections.forEach(d => {
                            d.path = `checks.${checkId}.highlights[${idx}].snippet`;
                            allDetections.push(d);
                        });
                    }
                    if (highlight.quote) {
                        scrubQuoteFields(highlight.quote, `checks.${checkId}.highlights[${idx}].quote`);
                    }
                    if (highlight.exact || highlight.prefix || highlight.suffix) {
                        scrubQuoteFields(highlight, `checks.${checkId}.highlights[${idx}]`);
                    }
                });
            }

            if (Array.isArray(checkData.candidate_highlights)) {
                checkData.candidate_highlights.forEach((highlight, idx) => {
                    if (highlight.snippet) {
                        const { scrubbed, detections } = scrubString(highlight.snippet);
                        highlight.snippet = scrubbed;
                        detections.forEach(d => {
                            d.path = `checks.${checkId}.candidate_highlights[${idx}].snippet`;
                            allDetections.push(d);
                        });
                    }
                    if (highlight.quote) {
                        scrubQuoteFields(highlight.quote, `checks.${checkId}.candidate_highlights[${idx}].quote`);
                    }
                    if (highlight.exact || highlight.prefix || highlight.suffix) {
                        scrubQuoteFields(highlight, `checks.${checkId}.candidate_highlights[${idx}]`);
                    }
                });
            }

            if (Array.isArray(checkData.failed_candidates)) {
                checkData.failed_candidates.forEach((highlight, idx) => {
                    if (highlight.snippet) {
                        const { scrubbed, detections } = scrubString(highlight.snippet);
                        highlight.snippet = scrubbed;
                        detections.forEach(d => {
                            d.path = `checks.${checkId}.failed_candidates[${idx}].snippet`;
                            allDetections.push(d);
                        });
                    }
                    if (highlight.quote) {
                        scrubQuoteFields(highlight.quote, `checks.${checkId}.failed_candidates[${idx}].quote`);
                    }
                    if (highlight.exact || highlight.prefix || highlight.suffix) {
                        scrubQuoteFields(highlight, `checks.${checkId}.failed_candidates[${idx}]`);
                    }
                });
            }

            // Scrub suggestions
            if (Array.isArray(checkData.suggestions)) {
                checkData.suggestions.forEach((suggestion, idx) => {
                    if (suggestion.text) {
                        const { scrubbed, detections } = scrubString(suggestion.text);
                        suggestion.text = scrubbed;
                        detections.forEach(d => {
                            d.path = `checks.${checkId}.suggestions[${idx}].text`;
                            allDetections.push(d);
                        });
                    }
                });
            }
        });
    }

    // Scrub top-level highlights array if present
    if (Array.isArray(cloned.highlights)) {
        cloned.highlights.forEach((highlight, idx) => {
            if (highlight.snippet) {
                const { scrubbed, detections } = scrubString(highlight.snippet);
                highlight.snippet = scrubbed;
                detections.forEach(d => {
                    d.path = `highlights[${idx}].snippet`;
                    allDetections.push(d);
                });
            }
            if (highlight.quote) {
                scrubQuoteFields(highlight.quote, `highlights[${idx}].quote`);
            }
            if (highlight.exact || highlight.prefix || highlight.suffix) {
                scrubQuoteFields(highlight, `highlights[${idx}]`);
            }
        });
    }

    // Scrub top-level suggestions array if present
    if (Array.isArray(cloned.suggestions)) {
        cloned.suggestions.forEach((suggestion, idx) => {
            if (suggestion.text) {
                const { scrubbed, detections } = scrubString(suggestion.text);
                suggestion.text = scrubbed;
                detections.forEach(d => {
                    d.path = `suggestions[${idx}].text`;
                    allDetections.push(d);
                });
            }
        });
    }

    const piiDetected = allDetections.length > 0;

    if (piiDetected) {
        // Log PII incident
        const highSeverity = allDetections.filter(d => d.severity === 'high' || d.severity === 'critical');

        piiLog('WARN', 'PII detected and redacted from analysis result', {
            run_id: runId,
            total_detections: allDetections.length,
            high_severity_count: highSeverity.length,
            types_detected: [...new Set(allDetections.map(d => d.type))]
        });

        // Add PII metadata to result
        cloned._pii_scrubbed = {
            scrubbed_at: new Date().toISOString(),
            detection_count: allDetections.length,
            types: [...new Set(allDetections.map(d => d.type))]
        };
    }

    return {
        scrubbed: cloned,
        piiDetected,
        detections: allDetections
    };
};

/**
 * Check if content contains PII without scrubbing
 * Useful for pre-check before processing
 *
 * @param {string} text - Text to check
 * @returns {Object} - { hasPII: boolean, types: array }
 */
const detectPII = (text) => {
    if (!text || typeof text !== 'string') {
        return { hasPII: false, types: [] };
    }

    const typesFound = [];

    Object.entries(PII_PATTERNS).forEach(([type, config]) => {
        if (config.pattern.test(text)) {
            typesFound.push(type);
        }
        // Reset regex lastIndex for global patterns
        config.pattern.lastIndex = 0;
    });

    return {
        hasPII: typesFound.length > 0,
        types: typesFound
    };
};

module.exports = {
    scrubString,
    scrubObject,
    scrubAnalysisResult,
    detectPII,
    PII_PATTERNS
};
