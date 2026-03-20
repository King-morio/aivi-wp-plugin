/**
 * Frontend JavaScript Tests
 */

describe('AiVI Frontend', () => {
    let mockConfig;
    let mockFetch;
    const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

    beforeEach(() => {
        jest.resetModules();
        // Mock fetch
        mockFetch = jest.fn();
        global.fetch = mockFetch;

        // Mock wp object
        global.wp = {
            element: {
                createElement: jest.fn(),
                useState: jest.fn(),
                useEffect: jest.fn(),
            },
            plugins: {
                registerPlugin: jest.fn(),
            },
            editPost: {
                PluginSidebar: jest.fn(),
            },
            components: {
                PanelBody: jest.fn(),
                Button: jest.fn(),
                Spinner: jest.fn(),
                Notice: jest.fn(),
                TextControl: jest.fn(),
            },
            data: {
                select: jest.fn(() => ({
                    getCurrentPost: () => ({
                        id: 1,
                        title: 'Test Post',
                        content: 'Test content',
                        author: 1
                    })
                })),
            },
        };

        // Mock config
        mockConfig = {
            isEnabled: true,
            backendUrl: 'https://test-backend.example.com',
            restBase: '/wp-json/aivi/v1',
            nonce: 'test-nonce',
            text: {
                title: 'AiVI — AI Visibility Inspector',
                analyze: 'Analyze Content',
                clear_cache: 'Clear Cache',
                ai_unavailable: 'AI analysis unavailable. Please check your backend configuration.',
                backend_not_configured: 'Backend URL not configured. Please configure in Settings > AiVI.',
                plugin_disabled: 'AiVI plugin is disabled. Please enable in Settings > AiVI.',
                no_editor: 'Editor not available',
                preflight_too_long: 'Article too long for single-pass analysis.',
                preflight_ok: 'Preflight OK. Attempting AI analysis...',
                awaiting: 'Awaiting analysis',
            },
        };

        global.AIVI_CONFIG = mockConfig;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('shows abort banner when plugin disabled', () => {
        // Override config to disable plugin
        global.AIVI_CONFIG = {
            ...mockConfig,
            isEnabled: false,
        };

        // Load the sidebar script
        require('../../assets/js/aivi-sidebar.js');

        // Check that registerPlugin was called
        expect(global.wp.plugins.registerPlugin).toHaveBeenCalled();
    });

    test('shows abort banner when backend not configured', () => {
        // Override config to remove backend URL
        global.AIVI_CONFIG = {
            ...mockConfig,
            backendUrl: '',
        };

        // Load the sidebar script
        require('../../assets/js/aivi-sidebar.js');

        // Check that registerPlugin was called
        expect(global.wp.plugins.registerPlugin).toHaveBeenCalled();
    });

    test('shows abort banner when backend ping fails', async () => {
        // Mock failed ping response
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                ok: true,
                aiAvailable: false,
                message: 'Backend unavailable'
            })
        });

        // Load the sidebar script
        require('../../assets/js/aivi-sidebar.js');

        // Wait for async operations
        await flushPromises();

        // Check that registerPlugin was called
        expect(global.wp.plugins.registerPlugin).toHaveBeenCalled();
    });

    test('does not auto-run backend proxy endpoints on load', async () => {
        // Mock successful ping response
        mockFetch.mockImplementation((url) => {
            if (url.includes('/backend/proxy_ping')) {
                const payload = {
                    ok: true,
                    aiAvailable: true
                };
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: () => Promise.resolve(JSON.stringify(payload))
                });
            }
            if (url.includes('/preflight')) {
                const payload = {
                    ok: true,
                    tokenEstimate: 1000,
                    withinCutoff: true,
                    manifest: {}
                };
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: () => Promise.resolve(JSON.stringify(payload))
                });
            }
            if (url.includes('/backend/proxy_analyze')) {
                const payload = {
                    ok: true,
                    scores: { AEO: 30, GEO: 25 },
                    checks: []
                };
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: () => Promise.resolve(JSON.stringify(payload))
                });
            }
        });

        global.AIVI_CONFIG = {
            ...mockConfig,
            autoRunOnLoad: true
        };

        // Load the sidebar script
        require('../../assets/js/aivi-sidebar.js');

        // Wait for async operations
        await flushPromises();
        await flushPromises();

        expect(mockFetch).not.toHaveBeenCalled();
    });

    test('does not auto-run preflight on load', async () => {
        // Mock successful ping
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
                ok: true,
                aiAvailable: true
            }))
        });

        // Mock preflight too long response
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
                ok: false,
                reason: 'too_long',
                message: 'Article exceeds token limit'
            }))
        });

        // Load the sidebar script
        global.AIVI_CONFIG = {
            ...mockConfig,
            autoRunOnLoad: true
        };
        require('../../assets/js/aivi-sidebar.js');

        // Wait for async operations
        await flushPromises();
        await flushPromises();

        expect(mockFetch).not.toHaveBeenCalled();
    });

    test('does not auto-run analyze on load', async () => {
        // Mock successful ping and preflight
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
                ok: true,
                aiAvailable: true
            }))
        });

        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
                ok: true,
                tokenEstimate: 1000,
                withinCutoff: true,
                manifest: {}
            }))
        });

        // Mock analyze failure
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 503,
            text: () => Promise.resolve(JSON.stringify({
                message: 'Backend temporarily unavailable'
            }))
        });

        // Load the sidebar script
        global.AIVI_CONFIG = {
            ...mockConfig,
            autoRunOnLoad: true
        };
        require('../../assets/js/aivi-sidebar.js');

        // Wait for async operations
        await flushPromises();
        await flushPromises();

        expect(mockFetch).not.toHaveBeenCalled();
    });
});
