=== AiVI - AI Visibility Inspector ===
Contributors: elsafelix
Tags: ai, seo, structured-data, content-analysis, answer-engine
Requires at least: 5.8
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 1.0.24
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

AiVI analyzes WordPress content for AI visibility and shows where extraction, structure, schema, and trust need work before publishing.

== Description ==

AiVI is a content intelligence and correction layer for AI-driven search. It analyzes WordPress content for extraction, trust, structure, schema, and answer readiness, then guides fixes before publication.

Instead of treating content as only a human-reading problem, AiVI helps publishers understand whether a post is usable by AI systems and answer engines before it goes live.

The plugin combines WordPress-side extraction with a managed AiVI backend to surface:

* answer clarity and extractability issues
* structure and heading issues
* structured data and schema opportunities
* factuality, freshness, and trust-oriented signals
* guided overlay editing and review flows

AiVI supports both Gutenberg and Classic Editor workflows.

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/`, or install the ZIP through **Plugins > Add New > Upload Plugin**.
2. Activate **AiVI - AI Visibility Inspector** in WordPress.
3. Open the **AiVI** settings screen in WordPress admin.
4. Review the available tabs for Overview, Plans, Credits, Connection, Support, and Documentation.
5. Open a post or page and run analysis from the AiVI editor surface.

== Frequently Asked Questions ==

= Does this plugin work in Gutenberg and Classic Editor? =

Yes. AiVI supports both Gutenberg and Classic Editor analysis flows.

= Does the plugin include its own analysis engine? =

The plugin performs WordPress-side extraction and preflight checks, then sends requests through managed AiVI backend routes for deeper analysis and guided editing support.

= Does AiVI automatically publish or overwrite my edits? =

No. AiVI does not publish for you. The current overlay flow lets you review revisions in AiVI, then copy and paste them into the matching WordPress block before you click **Update** or **Publish**.

== Screenshots ==

1. Click the eye icon in the editor chrome to open AiVI in the WordPress sidebar.
2. Launch a new page analysis from the **Analyze content** button inside the AiVI sidebar.
3. Follow the live progress panel while AiVI evaluates the page and builds analysis results.
4. Click **Edit in AiVI** to open the in-context overlay editor for deeper review.
5. Use the Review Rail to inspect findings, open details, and act on recommendations.

== Changelog ==

= 1.0.24 =

* refined the submission-facing plugin description, author, and contributor metadata for WordPress.org
* simplified public changelog language so the distributed readme stays focused on user-facing changes
* kept the current overlay, sidebar, and submission-readiness fixes intact in the same package

= 1.0.23 =

* restored the block actions menu to a slimmer footprint so it no longer feels oversized inside the editorial area
* fixed outside-click dismissal for the block actions menu so it closes reliably when you click away
* kept the wider writing stage and safer manual-copy review rail flow intact

= 1.0.22 =

* widened the overlay editorial stage so authors have more room to read and write comfortably
* kept the review rail readable while reducing how much horizontal space it claims from the document area
* preserved the safer manual-copy overlay model and the restrained live-sidebar edge glow

= 1.0.21 =

* replaced the risky top overlay apply controls with a calmer manual copy-and-paste guidance flow
* changed inline rewrite variants to copy revised text for manual paste instead of auto-applying into the editor
* added the approved restrained edge glow treatment to the live analysis sidebar shell

= 1.0.20 =

* fixed an overlay apply regression where unchanged blocks below an edited area could be rewritten or wiped during Apply Changes
* changed overlay apply to commit only blocks that were actually edited in AiVI
* normalized editable list round-tripping so list blocks no longer collapse into broken placeholder output

= 1.0.19 =

* hardened overlay apply integrity across Gutenberg and Classic so AiVI verifies changes before reporting success
* tightened answer extractability explanations so impossible templated math does not leak into the review rail
* preserved post-body image blocks end to end so overlay previews and missing-alt anchoring stay faithful

= 1.0.18 =

* improved packaging, translation readiness, and submission compatibility for WordPress.org

== Upgrade Notice ==

= 1.0.24 =

Recommended update for the polished WordPress.org-facing copy and metadata in the clean submission package.

= 1.0.23 =

Recommended update for the restored block actions menu behavior and the slimmer, less intrusive overlay popover.

= 1.0.22 =

Recommended update for the wider overlay writing stage, steadier review-rail balance, and safer manual-copy editing flow.

= 1.0.21 =

Recommended update for the safer manual-copy overlay model and the refined live analysis sidebar glow treatment.

= 1.0.20 =

Recommended update for the overlay apply hotfix that protects unchanged blocks and stabilizes list editing.

= 1.0.19 =

Recommended update for safer cross-editor overlay apply behavior, calmer extractability explanations, and better post-body image fidelity.
