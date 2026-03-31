const { performEvidenceVerification, __testHooks } = require('./evidence-verifier');

describe('evidence-verifier', () => {
    test('buildEvidenceSearchQuery composes a bounded query from issue context', () => {
        const query = __testHooks.buildEvidenceSearchQuery({
            suggestion: {
                text: 'Epilepsy can cause irregular electrical activity in the brain.'
            },
            manifest: {
                title: 'Understanding Seizures'
            },
            issueContext: {
                heading_chain: ['What causes seizures?'],
                section_text: 'Epilepsy can cause irregular electrical activity in the brain and may lead to recurring seizures.'
            }
        });

        expect(query).toContain('epilepsy');
        expect(query).toContain('brain');
        expect(query).toContain('seizures');
        expect(query.split(/\s+/).length).toBeLessThanOrEqual(18);
    });

    test('performEvidenceVerification returns support_found for strong related authority results', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => `
                <html><body>
                    <div class="result">
                        <a class="result__a" href="https://www.cdc.gov/epilepsy/index.html">Epilepsy basics - CDC</a>
                        <div class="result__snippet">Epilepsy is a disorder of the brain that causes recurring seizures.</div>
                    </div>
                    <div class="result">
                        <a class="result__a" href="https://www.nhs.uk/conditions/epilepsy/">Epilepsy - NHS</a>
                        <div class="result__snippet">Find out about epilepsy, seizures, and treatment information.</div>
                    </div>
                </body></html>
            `
        });

        const result = await performEvidenceVerification({
            verification_intent: 'verify_first',
            suggestion: {
                text: 'Epilepsy can cause irregular electrical activity in the brain.'
            },
            manifest: {
                title: 'Understanding Seizures'
            },
            issueContext: {
                heading_chain: ['What causes seizures?'],
                section_text: 'Epilepsy can cause irregular electrical activity in the brain and may lead to recurring seizures.'
            },
            fixAssistContract: {
                copilot_mode: 'web_backed_evidence_assist'
            }
        }, fetchImpl);

        expect(result).toBeTruthy();
        expect(result.status).toBe('support_found');
        expect(result.provider).toBe('duckduckgo_html');
        expect(Array.isArray(result.selected_results)).toBe(true);
        expect(result.selected_results.length).toBeGreaterThan(0);
        expect(result.selected_results[0].domain).toBe('cdc.gov');
    });

    test('performEvidenceVerification stays idle for local-only evidence assist requests', async () => {
        const fetchImpl = jest.fn();

        const result = await performEvidenceVerification({
            verification_intent: 'local_only',
            suggestion: {
                text: 'Epilepsy can cause irregular electrical activity in the brain.'
            },
            issueContext: {
                section_text: 'Epilepsy can cause irregular electrical activity in the brain and may lead to recurring seizures.'
            },
            fixAssistContract: {
                copilot_mode: 'web_backed_evidence_assist'
            }
        }, fetchImpl);

        expect(result).toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('performEvidenceVerification returns no_verifiable_support for weak unrelated results', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => `
                <html><body>
                    <div class="result">
                        <a class="result__a" href="https://example.com/marketing-guide">Marketing guide</a>
                        <div class="result__snippet">General marketing information for small businesses.</div>
                    </div>
                </body></html>
            `
        });

        const result = await performEvidenceVerification({
            verification_intent: 'verify_first',
            suggestion: {
                text: 'Epilepsy can cause irregular electrical activity in the brain.'
            },
            issueContext: {
                section_text: 'Epilepsy can cause irregular electrical activity in the brain and may lead to recurring seizures.'
            },
            fixAssistContract: {
                copilot_mode: 'web_backed_evidence_assist'
            }
        }, fetchImpl);

        expect(result).toBeTruthy();
        expect(result.status).toBe('no_verifiable_support');
        expect(result.message).toContain('could not find verifiable data');
    });

    test('performEvidenceVerification reports a bounded timeout and calm fallback message', async () => {
        const timeoutError = new Error('The operation was aborted.');
        timeoutError.name = 'AbortError';
        const fetchImpl = jest.fn().mockRejectedValue(timeoutError);

        const result = await performEvidenceVerification({
            verification_intent: 'verify_first',
            suggestion: {
                text: 'Epilepsy can cause irregular electrical activity in the brain.'
            },
            issueContext: {
                section_text: 'Epilepsy can cause irregular electrical activity in the brain and may lead to recurring seizures.'
            },
            fixAssistContract: {
                copilot_mode: 'web_backed_evidence_assist'
            }
        }, fetchImpl);

        expect(result).toBeTruthy();
        expect(result.status).toBe('verification_unavailable');
        expect(result.timed_out).toBe(true);
        expect(result.error_reason).toBe('timeout');
        expect(result.timeout_ms).toBe(12000);
        expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
        expect(result.message).toContain('fell back to safer local-only variants');
    });
});
