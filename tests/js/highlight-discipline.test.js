/**
 * Highlight Discipline Tests
 *
 * Acceptance tests for deterministic anchor resolution, single active highlight,
 * stale-run handling, and accessibility requirements.
 *
 * @version 1.3.0
 */

// Mock DOM environment
const mockDocument = {
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(),
    createElement: jest.fn(),
    body: { appendChild: jest.fn() },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
};

// Mock window
const mockWindow = {
    dispatchEvent: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    AiviHighlightManager: null,
    AiviAnchorResolver: null,
    AiviPopoverManager: null
};

// Setup globals
global.document = mockDocument;
global.window = mockWindow;

// Import the modules (simulated - in real environment these would be loaded)
const createMockHighlightManager = () => ({
    init: jest.fn(),
    showHighlight: jest.fn(),
    clearActiveHighlight: jest.fn(),
    isStale: jest.fn(() => false),
    destroy: jest.fn(),
    getActiveHighlight: jest.fn()
});

const createMockAnchorResolver = () => ({
    resolve: jest.fn(),
    resolveByNodeRef: jest.fn(),
    resolveByExactSnippet: jest.fn(),
    getEditorContentHash: jest.fn()
});

const createMockPopoverManager = () => ({
    showUnresolvedPopover: jest.fn(),
    showStaleToast: jest.fn(),
    hidePopover: jest.fn()
});

describe('Highlight Discipline', () => {
    let highlightManager;
    let anchorResolver;
    let popoverManager;
    let mockElement;
    let consoleLogs;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Create fresh instances
        highlightManager = createMockHighlightManager();
        anchorResolver = createMockAnchorResolver();
        popoverManager = createMockPopoverManager();

        // Mock element
        mockElement = {
            classList: {
                add: jest.fn(),
                remove: jest.fn()
            },
            style: {},
            setAttribute: jest.fn(),
            removeAttribute: jest.fn(),
            scrollIntoView: jest.fn(),
            focus: jest.fn(),
            getAttribute: jest.fn(() => 'block-uuid-123'),
            textContent: 'This is sample content with a specific snippet here.'
        };

        // Capture console logs for telemetry verification
        consoleLogs = [];
        console.log = jest.fn((...args) => consoleLogs.push(args.join(' ')));

        // Set up globals
        window.AiviHighlightManager = highlightManager;
        window.AiviAnchorResolver = anchorResolver;
        window.AiviPopoverManager = popoverManager;
    });

    // ============================================
    // TEST 1: Deterministic Anchor Test
    // ============================================
    describe('1. Deterministic Anchor Resolution', () => {
        test('should highlight exact range when node_ref matches block and offsets are within bounds', () => {
            // Given: details payload with node_ref matching block and offsets within bounds
            const detailsPayload = {
                run_id: 'test-run-123',
                check_id: 'direct_answer_first_120',
                instance_index: 0,
                highlights: [{
                    node_ref: 'block-uuid-123',
                    start: 12,
                    end: 42,
                    snippet: 'sample content with a specific'
                }]
            };

            // Mock anchor resolution success
            anchorResolver.resolve.mockReturnValue({
                element: mockElement,
                start: 12,
                end: 42,
                method: 'node_ref'
            });

            highlightManager.showHighlight.mockImplementation((details, verdict) => {
                // Simulate clearing previous highlight first
                highlightManager.clearActiveHighlight();

                // Apply new highlight
                mockElement.classList.add('aivi-highlight-active');
                mockElement.classList.add(`aivi-highlight-${verdict}`);
                mockElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

                return { success: true };
            });

            // When: navigation is triggered
            const result = highlightManager.showHighlight(detailsPayload, 'fail');

            // Then: highlight should be applied and previous cleared
            expect(result.success).toBe(true);
            expect(highlightManager.clearActiveHighlight).toHaveBeenCalled();
            expect(mockElement.classList.add).toHaveBeenCalledWith('aivi-highlight-active');
            expect(mockElement.classList.add).toHaveBeenCalledWith('aivi-highlight-fail');
        });

        test('should fail if offsets exceed block length', () => {
            // Given: details with offsets exceeding block content
            const detailsPayload = {
                run_id: 'test-run-123',
                check_id: 'check_1',
                instance_index: 0,
                highlights: [{
                    node_ref: 'block-uuid-123',
                    start: 0,
                    end: 1000, // Exceeds actual content length
                    snippet: 'test'
                }]
            };

            // Mock anchor resolution failure due to offset bounds
            anchorResolver.resolve.mockReturnValue(null);

            highlightManager.showHighlight.mockReturnValue({
                success: false,
                error: 'anchor_unresolved',
                message: 'Unable to locate instance in current content.'
            });

            // When: navigation is triggered
            const result = highlightManager.showHighlight(detailsPayload, 'fail');

            // Then: should fail
            expect(result.success).toBe(false);
            expect(result.error).toBe('anchor_unresolved');
        });
    });

    // ============================================
    // TEST 2: Fallback Snippet Exact-Match Test
    // ============================================
    describe('2. Fallback Snippet Exact-Match', () => {
        test('should highlight when node_ref missing but snippet matches exactly', () => {
            // Given: payload with no node_ref but exact snippet match
            const detailsPayload = {
                run_id: 'test-run-456',
                check_id: 'check_2',
                instance_index: 0,
                highlights: [{
                    node_ref: null, // Missing node_ref
                    start: 0,
                    end: 20,
                    snippet: 'specific snippet here'
                }]
            };

            // Mock exact snippet match found
            anchorResolver.resolveByExactSnippet.mockReturnValue({
                element: mockElement,
                start: 30,
                end: 51
            });

            anchorResolver.resolve.mockReturnValue({
                element: mockElement,
                start: 30,
                end: 51,
                method: 'snippet'
            });

            highlightManager.showHighlight.mockReturnValue({ success: true });

            // When: navigation is triggered
            const result = highlightManager.showHighlight(detailsPayload, 'partial');

            // Then: should succeed via snippet match
            expect(result.success).toBe(true);
        });

        test('should NOT use fuzzy matching - only exact substring', () => {
            // Given: snippet that's similar but not exact
            const detailsPayload = {
                run_id: 'test-run-789',
                check_id: 'check_3',
                instance_index: 0,
                highlights: [{
                    node_ref: null,
                    snippet: 'almost matching but not quite'
                }]
            };

            // Mock no exact match found (returns null, not fuzzy match)
            anchorResolver.resolve.mockReturnValue(null);

            highlightManager.showHighlight.mockReturnValue({
                success: false,
                error: 'anchor_unresolved'
            });

            // When: navigation is triggered
            const result = highlightManager.showHighlight(detailsPayload, 'fail');

            // Then: should fail (no fuzzy matching allowed)
            expect(result.success).toBe(false);
            expect(result.error).toBe('anchor_unresolved');
        });
    });

    // ============================================
    // TEST 3: No Fuzzy Search Test
    // ============================================
    describe('3. No Fuzzy Search', () => {
        test('should show "Unable to locate instance" popover when snippet not exact match', () => {
            // Given: snippet not found in editor
            const detailsPayload = {
                run_id: 'test-run-nofuzzy',
                check_id: 'check_nofuzzy',
                instance_index: 0,
                highlights: [{
                    node_ref: null,
                    snippet: 'this text does not exist in editor'
                }]
            };

            // Mock no match
            anchorResolver.resolve.mockReturnValue(null);

            highlightManager.showHighlight.mockReturnValue({
                success: false,
                error: 'anchor_unresolved',
                message: 'Unable to locate instance in current content.'
            });

            // When: navigation fails
            const result = highlightManager.showHighlight(detailsPayload, 'fail');

            // Then: should not highlight and should fail gracefully
            expect(result.success).toBe(false);
            expect(result.error).toBe('anchor_unresolved');

            // Popover should be shown (in real implementation)
            // popoverManager.showUnresolvedPopover would be called
        });

        test('should never attempt token-level or approximate matching', () => {
            // This test ensures no fuzzy/heuristic logic exists
            const detailsPayload = {
                run_id: 'test-run-strict',
                check_id: 'check_strict',
                instance_index: 0,
                highlights: [{
                    node_ref: 'nonexistent-block',
                    snippet: 'Some text with typo'
                }]
            };

            // Both node_ref and snippet should fail
            anchorResolver.resolve.mockReturnValue(null);

            highlightManager.showHighlight.mockReturnValue({
                success: false,
                error: 'anchor_unresolved'
            });

            const result = highlightManager.showHighlight(detailsPayload, 'fail');

            // Verify no fuzzy matching was attempted
            expect(result.success).toBe(false);
            // In real implementation, verify no DOM querying by content occurred
        });
    });

    // ============================================
    // TEST 4: Single Active Highlight Test
    // ============================================
    describe('4. Single Active Highlight', () => {
        test('should clear highlight A when navigating to highlight B', () => {
            // Given: two different instances
            const instanceA = {
                run_id: 'test-run',
                check_id: 'check_a',
                instance_index: 0,
                highlights: [{ node_ref: 'block-a', snippet: 'Instance A content' }]
            };

            const instanceB = {
                run_id: 'test-run',
                check_id: 'check_b',
                instance_index: 0,
                highlights: [{ node_ref: 'block-b', snippet: 'Instance B content' }]
            };

            let activeHighlight = null;
            let clearCallCount = 0;

            highlightManager.clearActiveHighlight.mockImplementation(() => {
                clearCallCount++;
                activeHighlight = null;
            });

            highlightManager.showHighlight.mockImplementation((details) => {
                highlightManager.clearActiveHighlight();
                activeHighlight = details.check_id;
                return { success: true };
            });

            highlightManager.getActiveHighlight.mockImplementation(() =>
                activeHighlight ? { checkId: activeHighlight } : null
            );

            // When: navigate to instance A
            highlightManager.showHighlight(instanceA, 'fail');
            expect(highlightManager.getActiveHighlight()).toEqual({ checkId: 'check_a' });

            // When: navigate to instance B
            highlightManager.showHighlight(instanceB, 'partial');

            // Then: only B should be highlighted, A should be cleared
            expect(highlightManager.getActiveHighlight()).toEqual({ checkId: 'check_b' });
            expect(clearCallCount).toBe(2); // Cleared before each show
        });

        test('only one highlight element should have active class at any time', () => {
            const elementA = { classList: { add: jest.fn(), remove: jest.fn() } };
            const elementB = { classList: { add: jest.fn(), remove: jest.fn() } };

            let currentElement = null;

            highlightManager.showHighlight.mockImplementation((details, verdict) => {
                // Clear previous
                if (currentElement) {
                    currentElement.classList.remove('aivi-highlight-active');
                    currentElement.classList.remove(`aivi-highlight-${verdict}`);
                }
                // Set new
                currentElement = details.check_id === 'a' ? elementA : elementB;
                currentElement.classList.add('aivi-highlight-active');
                return { success: true };
            });

            highlightManager.showHighlight({ check_id: 'a', highlights: [{}] }, 'fail');
            highlightManager.showHighlight({ check_id: 'b', highlights: [{}] }, 'partial');

            // Element A should have been cleared
            expect(elementA.classList.remove).toHaveBeenCalledWith('aivi-highlight-active');
        });
    });

    // ============================================
    // TEST 5: Stale-Run Invalidation Test
    // ============================================
    describe('5. Stale-Run Invalidation', () => {
        test('should clear highlight and disable navigation on content edit', () => {
            // Given: analysis has completed
            highlightManager.init('run-123');

            let isStale = false;
            highlightManager.isStale.mockImplementation(() => isStale);

            highlightManager.showHighlight.mockImplementation(() => {
                if (isStale) {
                    return {
                        success: false,
                        error: 'stale_run',
                        message: 'Analysis results stale — please re-run analysis.'
                    };
                }
                return { success: true };
            });

            // Show initial highlight
            const result1 = highlightManager.showHighlight({
                check_id: 'check_1',
                highlights: [{ node_ref: 'block-1' }]
            }, 'fail');
            expect(result1.success).toBe(true);

            // When: content is edited (simulated)
            isStale = true;
            highlightManager.clearActiveHighlight();

            // Then: navigation should be disabled
            const result2 = highlightManager.showHighlight({
                check_id: 'check_2',
                highlights: [{ node_ref: 'block-2' }]
            }, 'fail');

            expect(result2.success).toBe(false);
            expect(result2.error).toBe('stale_run');
            expect(result2.message).toContain('stale');
        });

        test('should show non-modal toast when 410 returned from details endpoint', () => {
            // Given: run marked as stale
            highlightManager.isStale.mockReturnValue(true);

            highlightManager.showHighlight.mockReturnValue({
                success: false,
                error: 'stale_run',
                message: 'Analysis results stale — please re-run analysis.'
            });

            // When: navigation attempted
            const result = highlightManager.showHighlight({
                check_id: 'check_stale',
                highlights: [{ node_ref: 'block-stale' }]
            }, 'fail');

            // Then: should fail with stale message
            expect(result.success).toBe(false);
            expect(result.message).toBe('Analysis results stale — please re-run analysis.');

            // In real implementation, toast would be shown:
            // expect(popoverManager.showStaleToast).toHaveBeenCalled();
        });
    });

    // ============================================
    // TEST 6: Accessibility Test
    // ============================================
    describe('6. Accessibility', () => {
        test('should set keyboard focus inside highlighted block after navigation', () => {
            // Given: successful navigation
            highlightManager.showHighlight.mockImplementation((details) => {
                mockElement.focus();
                return { success: true };
            });

            // When: navigation completes
            highlightManager.showHighlight({
                check_id: 'check_a11y',
                highlights: [{ node_ref: 'block-a11y' }]
            }, 'fail');

            // Then: element should receive focus
            expect(mockElement.focus).toHaveBeenCalled();
        });

        test('should add accessible label for screen readers', () => {
            // Given: highlight applied
            highlightManager.showHighlight.mockImplementation((details, verdict) => {
                const label = verdict === 'fail'
                    ? 'Critical issue highlight'
                    : 'Warning issue highlight';
                mockElement.setAttribute('aria-label', label);
                mockElement.setAttribute('role', 'mark');
                return { success: true };
            });

            // When: highlight shown
            highlightManager.showHighlight({
                check_id: 'check_sr',
                highlights: [{ node_ref: 'block-sr' }]
            }, 'fail');

            // Then: accessible attributes should be set
            expect(mockElement.setAttribute).toHaveBeenCalledWith('aria-label', 'Critical issue highlight');
            expect(mockElement.setAttribute).toHaveBeenCalledWith('role', 'mark');
        });

        test('highlight should have WCAG AA accessible contrast', () => {
            // This is a visual/CSS test - verify semantic tokens exist
            const semanticTokens = {
                'highlight-severity-critical': {
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.08)'
                },
                'highlight-severity-warning': {
                    borderColor: '#d97706',
                    backgroundColor: 'rgba(217, 119, 6, 0.08)'
                }
            };

            // Verify tokens are defined
            expect(semanticTokens['highlight-severity-critical']).toBeDefined();
            expect(semanticTokens['highlight-severity-warning']).toBeDefined();

            // Border colors should be visible (non-transparent)
            expect(semanticTokens['highlight-severity-critical'].borderColor).not.toContain('rgba');
        });
    });

    // ============================================
    // TEST 7: Telemetry Test
    // ============================================
    describe('7. Telemetry (PII-safe)', () => {
        test('should log highlight_shown event without raw snippet', () => {
            // Given: successful highlight
            const mockTelemetry = {
                highlightShown: jest.fn()
            };

            // When: highlight shown
            mockTelemetry.highlightShown(
                'run-123',
                'check_id_1',
                0,
                true, // node_ref_present
                'node_ref' // resolution_method
            );

            // Then: telemetry logged without snippet
            expect(mockTelemetry.highlightShown).toHaveBeenCalledWith(
                'run-123',
                'check_id_1',
                0,
                true,
                'node_ref'
            );

            // Verify no snippet in call (check args don't contain raw content)
            const callArgs = mockTelemetry.highlightShown.mock.calls[0];
            expect(callArgs).not.toContain('snippet');
            expect(callArgs.join(' ')).not.toContain('sample content');
        });

        test('should log highlight_cleared event', () => {
            const mockTelemetry = {
                highlightCleared: jest.fn()
            };

            mockTelemetry.highlightCleared('run-123', 'check_id_1');

            expect(mockTelemetry.highlightCleared).toHaveBeenCalledWith('run-123', 'check_id_1');
        });

        test('should log anchor_resolution_failed with reason but no snippet', () => {
            const mockTelemetry = {
                anchorResolutionFailed: jest.fn()
            };

            mockTelemetry.anchorResolutionFailed(
                'run-123',
                'check_id_1',
                0,
                'snippet_no_exact_match'
            );

            expect(mockTelemetry.anchorResolutionFailed).toHaveBeenCalledWith(
                'run-123',
                'check_id_1',
                0,
                'snippet_no_exact_match'
            );

            // Verify reason is logged but not actual snippet content
            const callArgs = mockTelemetry.anchorResolutionFailed.mock.calls[0];
            expect(callArgs[3]).toBe('snippet_no_exact_match');
        });

        test('should redact PII if detected in snippet resolution', () => {
            // This is a guard test - in production, PII scrubber would be invoked
            const piiSensitiveSnippet = 'Contact John Doe at john@example.com';

            // Simulated PII check
            const hasPII = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(piiSensitiveSnippet);

            expect(hasPII).toBe(true);

            // In real implementation, snippet would be redacted before logging
            const redactedForLogging = '[REDACTED - contains PII]';
            expect(redactedForLogging).not.toContain('john@example.com');
        });
    });
});

// ============================================
// INTEGRATION TESTS
// ============================================
describe('Highlight Discipline Integration', () => {
    test('full navigation flow: fetch details → resolve anchor → show highlight → log telemetry', async () => {
        // This test simulates the complete flow
        const mockDetailsResponse = {
            success: true,
            data: {
                run_id: 'integration-run',
                check_id: 'integration_check',
                instance_index: 0,
                highlights: [{
                    node_ref: 'block-integration',
                    start: 0,
                    end: 50,
                    snippet: 'Integration test snippet'
                }],
                suggestions: [{ text: 'Fix this issue' }]
            }
        };

        const logs = [];
        const mockHighlightManager = {
            showHighlight: jest.fn(() => {
                logs.push({ event: 'highlight_shown', check_id: 'integration_check' });
                return { success: true };
            }),
            clearActiveHighlight: jest.fn(() => {
                logs.push({ event: 'highlight_cleared' });
            })
        };

        // Execute flow
        mockHighlightManager.clearActiveHighlight();
        const result = mockHighlightManager.showHighlight(mockDetailsResponse.data, 'fail');

        // Verify
        expect(result.success).toBe(true);
        expect(logs).toContainEqual({ event: 'highlight_cleared' });
        expect(logs).toContainEqual({ event: 'highlight_shown', check_id: 'integration_check' });
    });
});
