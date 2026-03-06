const path = require('path');

describe('Inline highlight UI wiring', () => {
    beforeAll(() => {
        const scriptPath = path.resolve(__dirname, '../../assets/js/aivi-highlight-manager.js');
        require(scriptPath);
    });

    beforeEach(() => {
        document.body.innerHTML = '<div id="content">Alpha beta gamma delta</div>';
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test('creates inline span metadata and tooltip on hover', () => {
        const element = document.getElementById('content');
        const spans = window.AiviHighlightManager.applyInlineHighlight(
            element,
            6,
            16,
            {
                message: 'Missing direct answer.',
                verdict: 'fail',
                checkId: 'direct_answer_first_120',
                runId: 'run-123',
                instanceIndex: 0,
                nodeRef: 'block-0',
                snippet: 'beta gamma'
            },
            {
                outlineColor: '#ef4444',
                backgroundColor: 'transparent',
                label: 'Issue'
            }
        );

        expect(spans).toHaveLength(1);
        const span = spans[0];
        expect(span.classList.contains('aivi-inline-highlight')).toBe(true);
        expect(span.dataset.aiviMessage).toBe('Missing direct answer.');
        expect(span.dataset.aiviCheckId).toBe('direct_answer_first_120');
        expect(span.dataset.aiviRunId).toBe('run-123');
        expect(span.dataset.aiviInstanceIndex).toBe('0');
        expect(span.dataset.aiviNodeRef).toBe('block-0');
        expect(span.dataset.aiviSnippet).toBe('beta gamma');

        span.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        jest.advanceTimersByTime(100);

        const tooltip = document.querySelector('.aivi-magic-pill');
        expect(tooltip).not.toBeNull();
        const tooltipText = tooltip.querySelector('.aivi-pill-text');
        expect(tooltipText.textContent).toBe('Missing direct answer.');
        expect(tooltip.style.display).toBe('flex');

        span.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        expect(tooltip.style.display).toBe('none');
    });
});
