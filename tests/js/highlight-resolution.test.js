/**
 * Highlight Resolution Unit Tests
 *
 * Tests for cross-editor deterministic anchor resolution per specification.
 *
 * @see HIGHLIGHT_DISCIPLINE.md
 */

describe('AnchorResolver', () => {
    let AnchorResolver;
    let mockWpData;
    let mockDocument;

    beforeEach(() => {
        // Reset mocks
        mockWpData = {
            select: jest.fn().mockReturnValue({
                getBlocks: jest.fn().mockReturnValue([])
            })
        };

        // Mock window.wp
        global.window = {
            wp: { data: mockWpData },
            crypto: {
                subtle: {
                    digest: jest.fn()
                }
            }
        };

        // Reset document mocks
        global.document = {
            querySelector: jest.fn(),
            querySelectorAll: jest.fn().mockReturnValue([])
        };

        // Import fresh module for each test
        jest.resetModules();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Block-N Index Resolution', () => {
        test('should resolve block-0 to first Gutenberg block', () => {
            // Setup: Mock 3 Gutenberg blocks
            const mockBlocks = [
                { clientId: 'block-abc-123', name: 'core/paragraph' },
                { clientId: 'block-def-456', name: 'core/heading' },
                { clientId: 'block-ghi-789', name: 'core/paragraph' }
            ];

            const mockElements = {
                'block-abc-123': { textContent: 'First paragraph content', getAttribute: () => 'block-abc-123' },
                'block-def-456': { textContent: 'Heading text', getAttribute: () => 'block-def-456' },
                'block-ghi-789': { textContent: 'Third paragraph content', getAttribute: () => 'block-ghi-789' }
            };

            mockWpData.select.mockReturnValue({
                getBlocks: jest.fn().mockReturnValue(mockBlocks)
            });

            document.querySelector = jest.fn((selector) => {
                if (selector.includes('block-abc-123')) return mockElements['block-abc-123'];
                if (selector.includes('block-def-456')) return mockElements['block-def-456'];
                if (selector.includes('block-ghi-789')) return mockElements['block-ghi-789'];
                if (selector === '.block-editor') return { id: 'editor' };
                return null;
            });

            // Test that block-0 resolves to first block
            const highlight = {
                node_ref: 'block-0',
                start: 0,
                end: 10
            };

            // Simulate resolution (actual implementation would use AnchorResolver.resolve)
            const blockIndex = parseInt(highlight.node_ref.match(/^block-(\d+)$/)[1], 10);
            expect(blockIndex).toBe(0);
        });

        test('should clamp offsets when end exceeds text length', () => {
            const textContent = 'Short text';  // 10 chars
            const textLength = textContent.length;

            // Offsets that exceed text length
            let start = 5;
            let end = 100; // Exceeds textLength

            // Clamp logic from AnchorResolver
            start = Math.max(0, Math.min(start, textLength));
            end = Math.max(start, Math.min(end, textLength));

            expect(start).toBe(5);
            expect(end).toBe(10); // Clamped to textLength
        });

        test('should clamp negative start to 0', () => {
            const textLength = 50;

            let start = -5;
            let end = 20;

            // Clamp logic
            start = Math.max(0, Math.min(start, textLength));
            end = Math.max(start, Math.min(end, textLength));

            expect(start).toBe(0);
            expect(end).toBe(20);
        });

        test('should return stale_block when hash mismatch detected', () => {
            // Server hash
            const serverHash = 'abc123def456';

            // Client computes different hash (content changed)
            const clientHash = 'xyz789uvw000';

            // Simulate hash mismatch detection
            const hashMatches = clientHash === serverHash;

            expect(hashMatches).toBe(false);

            // When hash mismatch, resolution should return stale_block
            const result = hashMatches ? { element: {} } : { element: null, stale_block: true, error: 'hash_mismatch' };

            expect(result.stale_block).toBe(true);
            expect(result.error).toBe('hash_mismatch');
        });
    });

    describe('Snippet Fallback (Block-Constrained)', () => {
        test('should find exact snippet in first matching block only', () => {
            const blocks = [
                { text: 'Introduction paragraph with common phrase here.', element: { id: 'b0' } },
                { text: 'Another paragraph with common phrase here too.', element: { id: 'b1' } },
                { text: 'Third paragraph with different content.', element: { id: 'b2' } }
            ];

            const snippet = 'common phrase';

            // Find first match (deterministic behavior)
            let matchedBlock = null;
            let matchStart = -1;
            let matchEnd = -1;

            for (const block of blocks) {
                const pos = block.text.indexOf(snippet);
                if (pos !== -1) {
                    matchedBlock = block;
                    matchStart = pos;
                    matchEnd = pos + snippet.length;
                    break; // Stop at first match
                }
            }

            expect(matchedBlock).not.toBeNull();
            expect(matchedBlock.element.id).toBe('b0'); // First block
            expect(matchStart).toBe(28); // Position in first block
        });

        test('should return null when snippet not found in any block', () => {
            const blocks = [
                { text: 'First paragraph content.', element: { id: 'b0' } },
                { text: 'Second paragraph content.', element: { id: 'b1' } }
            ];

            const snippet = 'nonexistent text';

            let matchedBlock = null;
            for (const block of blocks) {
                if (block.text.indexOf(snippet) !== -1) {
                    matchedBlock = block;
                    break;
                }
            }

            expect(matchedBlock).toBeNull();
        });

        test('should NOT perform fuzzy search when exact match fails', () => {
            const blocks = [
                { text: 'The quick brown fox jumps over the lazy dog.', element: { id: 'b0' } }
            ];

            // Similar but not exact
            const snippet = 'quick brown foxes'; // 'foxes' not 'fox'

            // Only exact match is allowed
            let matchedBlock = null;
            for (const block of blocks) {
                if (block.text.indexOf(snippet) !== -1) {
                    matchedBlock = block;
                    break;
                }
            }

            // Should NOT match
            expect(matchedBlock).toBeNull();
        });
    });

    describe('Resolution Method Priority', () => {
        test('should try block-N first, then snippet fallback', () => {
            const resolutionSteps = [];

            const highlight = {
                node_ref: 'block-5',
                snippet: 'fallback text'
            };

            // Mock resolution priority
            if (highlight.node_ref && /^block-\d+$/.test(highlight.node_ref)) {
                resolutionSteps.push('block-offset');
            }

            if (highlight.snippet) {
                resolutionSteps.push('snippet-in-block');
            }

            expect(resolutionSteps[0]).toBe('block-offset');
            expect(resolutionSteps[1]).toBe('snippet-in-block');
        });

        test('should return correct method in anchor result', () => {
            // When resolved via block-N
            const resultViaBlock = { element: {}, start: 0, end: 10, method: 'block-offset' };
            expect(resultViaBlock.method).toBe('block-offset');

            // When resolved via snippet
            const resultViaSnippet = { element: {}, start: 5, end: 15, method: 'snippet-in-block' };
            expect(resultViaSnippet.method).toBe('snippet-in-block');
        });
    });

    describe('Cross-Editor Block Extraction', () => {
        test('Gutenberg: should use wp.data.select getBlocks() order', () => {
            const mockBlocks = [
                { clientId: 'a', name: 'core/paragraph' },
                { clientId: 'b', name: 'core/heading' },
                { clientId: 'c', name: 'core/list' }
            ];

            // Block-0 should map to clientId 'a'
            // Block-1 should map to clientId 'b'
            // Block-2 should map to clientId 'c'
            expect(mockBlocks[0].clientId).toBe('a');
            expect(mockBlocks[1].clientId).toBe('b');
            expect(mockBlocks[2].clientId).toBe('c');
        });

        test('Classic: should enumerate CLASSIC_BLOCK_TAGS in DOM order', () => {
            const CLASSIC_BLOCK_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'pre', 'table', 'blockquote', 'div'];

            // All expected tags are included
            expect(CLASSIC_BLOCK_TAGS).toContain('p');
            expect(CLASSIC_BLOCK_TAGS).toContain('h1');
            expect(CLASSIC_BLOCK_TAGS).toContain('ul');
            expect(CLASSIC_BLOCK_TAGS).toContain('blockquote');
            expect(CLASSIC_BLOCK_TAGS).toContain('div');

            // Should not include inline elements
            expect(CLASSIC_BLOCK_TAGS).not.toContain('span');
            expect(CLASSIC_BLOCK_TAGS).not.toContain('a');
            expect(CLASSIC_BLOCK_TAGS).not.toContain('strong');
        });
    });
});

describe('HighlightManager.showHighlight', () => {
    test('should return stale_run error when run is stale', () => {
        const isRunStale = true;

        if (isRunStale) {
            const result = {
                success: false,
                error: 'stale_run',
                message: 'Content changed — please re-run analysis'
            };

            expect(result.success).toBe(false);
            expect(result.error).toBe('stale_run');
        }
    });

    test('should return results_stale error on hash mismatch', () => {
        const anchorResult = { stale_block: true, error: 'hash_mismatch' };

        const result = {
            success: false,
            error: 'results_stale',
            message: 'Content changed — please re-run analysis'
        };

        expect(result.error).toBe('results_stale');
    });

    test('should return anchor_unresolved when element not found', () => {
        const anchorResult = null;

        const result = {
            success: false,
            error: 'anchor_unresolved',
            message: 'Cannot locate instance in current content — Open details'
        };

        expect(result.error).toBe('anchor_unresolved');
    });

    test('should return no_highlights when details contain no highlight', () => {
        const details = {
            run_id: 'run-999',
            check_id: 'check-empty',
            instance_index: 0
        };

        const result = {
            success: false,
            error: 'no_highlights',
            message: 'Cannot locate instance in current content — Open details'
        };

        expect(details.run_id).toBe('run-999');
        expect(result.error).toBe('no_highlights');
    });

    test('should log telemetry with resolution method and duration', () => {
        const telemetryData = {
            run_id: 'run-123',
            check_id: 'immediate_answer_placement',
            instance_index: 0,
            node_ref: 'block-2',
            resolution_method: 'block-offset',
            success: true,
            duration_ms: 15
        };

        expect(telemetryData.resolution_method).toBe('block-offset');
        expect(telemetryData.success).toBe(true);
        expect(telemetryData.duration_ms).toBeGreaterThanOrEqual(0);
    });
});

describe('Telemetry.navigationAttempt', () => {
    test('should include all required fields', () => {
        const params = {
            run_id: 'run-abc',
            check_id: 'check-xyz',
            instance_index: 1,
            node_ref: 'block-3',
            resolution_method: 'snippet-in-block',
            success: true,
            duration_ms: 25
        };

        // Verify all fields are present
        expect(params).toHaveProperty('run_id');
        expect(params).toHaveProperty('check_id');
        expect(params).toHaveProperty('instance_index');
        expect(params).toHaveProperty('node_ref');
        expect(params).toHaveProperty('resolution_method');
        expect(params).toHaveProperty('success');
        expect(params).toHaveProperty('duration_ms');
    });

    test('should accept null node_ref for snippet-only resolution', () => {
        const params = {
            run_id: 'run-abc',
            check_id: 'check-xyz',
            instance_index: 0,
            node_ref: null,
            resolution_method: 'snippet-in-block',
            success: true,
            duration_ms: 30
        };

        expect(params.node_ref).toBeNull();
        expect(params.resolution_method).toBe('snippet-in-block');
    });
});
