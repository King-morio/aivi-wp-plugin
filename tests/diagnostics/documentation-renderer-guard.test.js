const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

describe('documentation renderer guard', () => {
    test('user guide uses bundled screenshots instead of placeholder gaps', () => {
        const guide = read('includes/data/docs/USER_GUIDE.md');

        expect(guide).toContain('![Open AiVI from the eye icon in the editor chrome.](assets/img/docs/user-guide-open-sidebar.jpg)');
        expect(guide).toContain('![Launch analysis from the Analyze content button in the AiVI sidebar.](assets/img/docs/user-guide-run-analysis.jpg)');
        expect(guide).toContain('![Watch the live progress panel while AiVI runs the analysis.](assets/img/docs/user-guide-analysis-progress.jpg)');
        expect(guide).toContain('![Open the AiVI overlay editor from the completed analysis surface.](assets/img/docs/user-guide-open-overlay.jpg)');
        expect(guide).toContain('![Review the surfaced findings and act on the recommendations that matter most.](assets/img/docs/user-guide-review-results.jpg)');
        expect(guide).not.toContain('[Screenshot:');
    });

    test('documentation renderer supports bundled figures and explicit list markers', () => {
        const settings = read('includes/class-admin-settings.php');

        expect(settings).toContain('render_documentation_figure');
        expect(settings).toContain('resolve_documentation_resource_url');
        expect(settings).toContain("'li_open' => false");
        expect(settings).toContain(".aivi-docs-article__body ul{margin:0 0 16px;padding-left:22px;list-style:disc outside;");
        expect(settings).toContain(".aivi-docs-article__body ol{margin:0 0 16px;padding-left:24px;list-style:decimal outside;");
        expect(settings).toContain('.aivi-docs-article__body li > ul,.aivi-docs-article__body li > ol{margin:10px 0 0;}');
        expect(settings).toContain('.aivi-docs-figure img{display:block;width:100%;height:auto;');
    });

    test('bundled docs no longer ship public-facing placeholders or stale readme references', () => {
        const terms = read('includes/data/docs/TERMS_OF_SERVICE.md');
        const checkReference = read('includes/data/docs/CHECK_REFERENCE.md');
        const troubleshooting = read('includes/data/docs/TROUBLESHOOTING.md');
        const development = read('includes/data/docs/DEVELOPMENT.md');
        const operations = read('includes/data/docs/OPERATIONS.md');

        expect(terms).toContain('March 3, 2026');
        expect(terms).toContain('Dollarchain Investments LTD');
        expect(terms).toContain('okendo017@gmail.com');
        expect(terms).toContain('competent courts of Nairobi, Kenya');
        expect(terms).not.toContain('[Add');
        expect(terms).not.toContain('Important note');
        expect(checkReference).not.toContain('readme.md');
        expect(troubleshooting).not.toContain('readme.md');
        expect(troubleshooting).not.toContain('upcoming privacy and terms');
        expect(troubleshooting).not.toContain('run ID');
        expect(development).not.toContain('readme.md');
        expect(operations).not.toContain('readme.md');
    });

    test('check reference and docs catalog stay customer-facing by default', () => {
        const settings = read('includes/class-admin-settings.php');
        const checkReference = read('includes/data/docs/CHECK_REFERENCE.md');

        expect(settings).toContain("apply_filters( 'aivi_show_advanced_docs', $default )");
        expect(settings).toContain("unset( $catalog['development'], $catalog['architecture'], $catalog['operations'], $catalog['changelog'] );");
        expect(settings).toContain('Use the documentation hub to understand findings, fix issues, and review trust and policy guidance without leaving AiVI.');
        expect(checkReference).toContain('## How to Read AiVI Verdicts');
        expect(checkReference).toContain('## What AiVI Checks');
        expect(checkReference).toContain('## How to Use a Finding');
        expect(checkReference).toContain('## Common Patterns You Will See');
        expect(checkReference).not.toContain('## Intro Focus & Factuality');
        expect(checkReference).not.toContain('## Entities & Semantic Clarity');
        expect(checkReference).not.toContain('## What AiVI Surfaces vs What It Keeps Quiet');
    });

    test('user-facing docs and connection guidance avoid overly internal wording', () => {
        const privacy = read('includes/data/docs/PRIVACY.md');
        const guide = read('includes/data/docs/USER_GUIDE.md');
        const support = read('includes/data/docs/SUPPORT.md');
        const settings = read('includes/class-admin-settings.php');
        const readme = read('readme.txt');

        expect(privacy).not.toContain('manifest and block map');
        expect(privacy).not.toContain('run ID');
        expect(privacy).not.toContain('current WordPress user ID');
        expect(guide).not.toContain('manifest and block map');
        expect(guide).not.toContain('run ID');
        expect(guide).not.toContain('development, architecture, operations');
        expect(support).not.toContain('backend debug data');
        expect(support).not.toContain('manual run IDs');
        expect(settings).not.toContain('operator-issued connection token');
        expect(settings).not.toContain('AiVI operator surface');
        expect(settings).toContain("<?php if ( $show_operational_settings ) : ?>");
        expect(readme).not.toContain('managed AiVI backend routes');
        expect(readme).toContain('uses its hosted service for deeper analysis and guided editing support.');
    });
});
