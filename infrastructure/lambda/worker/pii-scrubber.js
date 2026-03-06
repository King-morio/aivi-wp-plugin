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
    credit_card: {
        pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
        replacement: '[CC_REDACTED]',
        severity: 'critical'
    }
};

const scrubString = (text) => {
    if (!text || typeof text !== 'string') {
        return { scrubbed: text, detections: [] };
    }

    let scrubbed = text;
    const detections = [];

    Object.entries(PII_PATTERNS).forEach(([type, config]) => {
        const matches = text.match(config.pattern);
        if (matches && matches.length > 0) {
            detections.push({ type, count: matches.length, severity: config.severity });
            scrubbed = scrubbed.replace(config.pattern, config.replacement);
        }
    });

    return { scrubbed, detections };
};

const scrubAnalysisResult = (analysisResult, runId = 'unknown') => {
    if (!analysisResult || typeof analysisResult !== 'object') {
        return { scrubbed: analysisResult, piiDetected: false, detections: [] };
    }

    const cloned = JSON.parse(JSON.stringify(analysisResult));
    const allDetections = [];
    const scrubQuoteFields = (obj, basePath) => {
        if (!obj || typeof obj !== 'object') return;
        ['exact', 'prefix', 'suffix'].forEach((key) => {
            if (obj[key]) {
                const { scrubbed, detections } = scrubString(obj[key]);
                obj[key] = scrubbed;
                detections.forEach(d => { d.path = `${basePath}.${key}`; allDetections.push(d); });
            }
        });
    };

    if (cloned.checks && typeof cloned.checks === 'object') {
        Object.entries(cloned.checks).forEach(([checkId, checkData]) => {
            if (checkData.explanation) {
                const { scrubbed, detections } = scrubString(checkData.explanation);
                checkData.explanation = scrubbed;
                detections.forEach(d => { d.path = `checks.${checkId}.explanation`; allDetections.push(d); });
            }

            if (Array.isArray(checkData.highlights)) {
                checkData.highlights.forEach((highlight, idx) => {
                    if (highlight.snippet) {
                        const { scrubbed, detections } = scrubString(highlight.snippet);
                        highlight.snippet = scrubbed;
                        detections.forEach(d => { d.path = `checks.${checkId}.highlights[${idx}].snippet`; allDetections.push(d); });
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
                        detections.forEach(d => { d.path = `checks.${checkId}.candidate_highlights[${idx}].snippet`; allDetections.push(d); });
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
                        detections.forEach(d => { d.path = `checks.${checkId}.failed_candidates[${idx}].snippet`; allDetections.push(d); });
                    }
                    if (highlight.quote) {
                        scrubQuoteFields(highlight.quote, `checks.${checkId}.failed_candidates[${idx}].quote`);
                    }
                    if (highlight.exact || highlight.prefix || highlight.suffix) {
                        scrubQuoteFields(highlight, `checks.${checkId}.failed_candidates[${idx}]`);
                    }
                });
            }

            if (Array.isArray(checkData.suggestions)) {
                checkData.suggestions.forEach((suggestion, idx) => {
                    if (suggestion.text) {
                        const { scrubbed, detections } = scrubString(suggestion.text);
                        suggestion.text = scrubbed;
                        detections.forEach(d => { d.path = `checks.${checkId}.suggestions[${idx}].text`; allDetections.push(d); });
                    }
                });
            }
        });
    }

    const piiDetected = allDetections.length > 0;

    if (piiDetected) {
        console.log(JSON.stringify({
            level: 'WARN',
            message: 'PII detected and redacted',
            service: 'pii-scrubber',
            run_id: runId,
            total_detections: allDetections.length,
            types: [...new Set(allDetections.map(d => d.type))],
            timestamp: new Date().toISOString()
        }));

        cloned._pii_scrubbed = {
            scrubbed_at: new Date().toISOString(),
            detection_count: allDetections.length,
            types: [...new Set(allDetections.map(d => d.type))]
        };
    }

    return { scrubbed: cloned, piiDetected, detections: allDetections };
};

module.exports = { scrubString, scrubAnalysisResult, PII_PATTERNS };
