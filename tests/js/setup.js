// Jest DOM setup
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for TextEncoder/TextDecoder for Jest
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock WordPress globals
global.wp = {
    element: {
        createElement: jest.fn(),
        useState: jest.fn(),
        useEffect: jest.fn(),
    },
    components: {
        PanelBody: jest.fn(),
        Button: jest.fn(),
        Spinner: jest.fn(),
        Notice: jest.fn(),
        TextControl: jest.fn(),
    },
    plugins: {
        registerPlugin: jest.fn(),
    },
    editPost: {
        PluginSidebar: jest.fn(),
    },
    data: {
        select: jest.fn(),
    }
};

// Mock AIVI config
global.AIVI_CONFIG = {
    restBase: 'http://localhost/wp-json/aivi/v1',
    nonce: 'test-nonce',
    text: {
        title: 'AiVI Test',
        analyze: 'Analyze Content',
        clear_cache: 'Clear Cache'
    }
};

// Mock fetch
global.fetch = jest.fn();
