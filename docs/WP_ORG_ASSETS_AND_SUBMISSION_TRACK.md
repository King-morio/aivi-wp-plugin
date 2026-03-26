# WordPress.org Assets And Submission Track

Status: Ready to execute
Owner: AiVI
Date: 2026-03-26

## Immediate Reality Check

For the current WordPress.org submission form, only **one file** is needed:

- `ai-visibility-inspector-1.0.24.zip`

The listing assets are **not** needed at initial submission time.

They are kept for later, after plugin approval, when WordPress.org provides the SVN repository.

## Goal

Finish the non-code submission work for AiVI so the plugin is ready for WordPress.org review and easier pre-launch distribution.

This track covers:

- WordPress.org listing assets
- screenshot preparation and readme screenshot captions
- final submission smoke checks
- WordPress.org submission handoff
- optional GitHub release/landing follow-up

---

## Current Inventory

### WordPress.org Listing Assets

Source folder:
`C:\Users\Administrator\Desktop\AiVI Assets`

Files already prepared and correctly sized:

- `AiVI WP Plugin Banner.png` -> `772x250`
- `AiVI WP Plugin Banner Large.png` -> `1544x500`
- `AiVI WP Plugin Icon 128 X 128.png` -> `128x128`
- `AiVI WP Plugin Icon 256 x 256.png` -> `256x256`

Target WordPress.org asset names:

- `banner-772x250.png`
- `banner-1544x500.png`
- `icon-128x128.png`
- `icon-256x256.png`

Usage:

- banners appear at the top of the WordPress.org plugin listing
- icons appear in plugin search, plugin cards, and related listing surfaces

Important:

- these files belong in the WordPress.org top-level `assets/` SVN directory
- they are not part of the plugin ZIP

### Plugin Screenshots

Source folder:
`C:\Users\Administrator\Desktop\AiVI Screenshots`

Files currently available:

- `AiVI1.png` -> `3780x1890`
- `AiVI2.png` -> `3780x1890`
- `AiVI3.png` -> `3780x1890`
- `AiVI4.png` -> `3780x1890`
- `AiVI5.png` -> `3780x1890`

Decision:

- use all five screenshots

Target WordPress.org screenshot names:

- `screenshot-1.png`
- `screenshot-2.png`
- `screenshot-3.png`
- `screenshot-4.png`
- `screenshot-5.png`

Usage:

- screenshots appear in the WordPress.org screenshot gallery on the plugin page
- each screenshot needs a matching numbered caption line in `readme.txt`
- screenshot files are also stored in the WordPress.org top-level `assets/` SVN directory, not inside the plugin ZIP

---

## Exact Rename Map

Use this exact file mapping when preparing the WordPress.org `assets/` directory.

### Listing Assets

- `C:\Users\Administrator\Desktop\AiVI Assets\AiVI WP Plugin Banner.png`
  -> `assets/banner-772x250.png`
- `C:\Users\Administrator\Desktop\AiVI Assets\AiVI WP Plugin Banner Large.png`
  -> `assets/banner-1544x500.png`
- `C:\Users\Administrator\Desktop\AiVI Assets\AiVI WP Plugin Icon 128 X 128.png`
  -> `assets/icon-128x128.png`
- `C:\Users\Administrator\Desktop\AiVI Assets\AiVI WP Plugin Icon 256 x 256.png`
  -> `assets/icon-256x256.png`

### Screenshot Assets

- `C:\Users\Administrator\Desktop\AiVI Screenshots\AiVI1.png`
  -> `assets/screenshot-1.png`
- `C:\Users\Administrator\Desktop\AiVI Screenshots\AiVI2.png`
  -> `assets/screenshot-2.png`
- `C:\Users\Administrator\Desktop\AiVI Screenshots\AiVI3.png`
  -> `assets/screenshot-3.png`
- `C:\Users\Administrator\Desktop\AiVI Screenshots\AiVI4.png`
  -> `assets/screenshot-4.png`
- `C:\Users\Administrator\Desktop\AiVI Screenshots\AiVI5.png`
  -> `assets/screenshot-5.png`

### Readme Screenshot Caption Pairing

- `screenshot-1.png`
  -> `Click the eye icon in the editor chrome to open AiVI in the WordPress sidebar.`
- `screenshot-2.png`
  -> `Launch a new page analysis from the Analyze content button inside the AiVI sidebar.`
- `screenshot-3.png`
  -> `Follow the live progress panel while AiVI evaluates the page and builds analysis results.`
- `screenshot-4.png`
  -> `Click Edit in AiVI to open the in-context overlay editor for deeper review.`
- `screenshot-5.png`
  -> `Use the Review Rail to inspect findings, open details, and act on recommendations.`

---

## Milestones

### Right Now - Needed Before Initial Submission

This is the only required set before the first WordPress.org upload form is completed:

- upload `ai-visibility-inspector-1.0.24.zip`
- keep `readme.txt` aligned with the packaged plugin
- keep the GitHub release bundle ready as a backup download surface

### Later - Needed After WordPress.org Approval

These steps are intentionally deferred until WordPress.org approves the plugin and provides SVN access:

- upload top-level listing media into SVN `assets/`
- upload plugin runtime files into SVN `trunk/`
- publish the banner, icons, and screenshots on the WordPress.org listing
- sync screenshot captions with the listing once the SVN repository is live

### M1 - Freeze Asset Mapping

Goal:
Lock the exact files that will be used for the WordPress.org listing.

Checklist:

- keep the current banner files as the final listing headers
- keep the current icon files as the final listing icons
- rename/copy them for WordPress.org as:
  - `banner-772x250.png`
  - `banner-1544x500.png`
  - `icon-128x128.png`
  - `icon-256x256.png`
- keep all five screenshots and rename/copy them for WordPress.org as:
  - `screenshot-1.png`
  - `screenshot-2.png`
  - `screenshot-3.png`
  - `screenshot-4.png`
  - `screenshot-5.png`

Exit criteria:

- final asset set is frozen
- no more design changes unless review feedback forces them

### M2 - Add Screenshot Captions To Readme

Goal:
Make the screenshot gallery meaningful on the plugin listing.

Checklist:

- add a `== Screenshots ==` section to `readme.txt`
- add one caption line for each screenshot kept
- keep captions clear and product-facing, for example:
  - `1. AiVI review sidebar showing global score, category scores, and analysis groups.`
  - `2. Review Rail highlighting machine-readability issues inside the overlay editor.`
  - `3. AiVI overlay editor with guided block-level review and issue context.`
  - `4. Plans and credits view inside AiVI settings.`
  - `5. Support and connection surfaces inside AiVI settings.`

Exit criteria:

- screenshot count matches caption count exactly
- captions read cleanly to a first-time visitor on WordPress.org

### M3 - Final Submission Smoke Test

Goal:
Confirm the submitted build is the one you actually want reviewed.

Checklist:

- install `ai-visibility-inspector-1.0.24.zip` on a clean WordPress site
- confirm activation works cleanly
- confirm plugin metadata looks right in WordPress admin:
  - name
  - author
  - description
  - version
- verify core flows:
  - open AiVI settings
  - run analysis
  - check sidebar layout
  - check overlay open/close behavior
  - check Gutenberg compatibility
  - check Classic Editor compatibility
- do one upgrade test from an earlier AiVI version if possible

Exit criteria:

- no new blocker found in clean install or upgrade path

### M4 - WordPress.org Submission Upload

Goal:
Submit the plugin package and associated listing assets cleanly.

Checklist:

- submit the plugin ZIP for review using:
  - `ai-visibility-inspector-1.0.24.zip`
- after approval, prepare WordPress.org SVN structure:
  - `trunk/` for plugin files
  - top-level `assets/` for banner, icon, and screenshot files
- after approval, upload asset files using the exact WordPress.org names
- after approval, upload screenshot files using lowercase names only
- after approval, make sure screenshot filenames and `readme.txt` screenshot numbering match

Exit criteria:

- plugin submission is sent
- asset pack is staged and waiting for the post-approval SVN step

### M5 - Optional Pre-Repo Distribution

Goal:
Make downloading AiVI easy before WordPress.org approval finishes.

Checklist:

- create or update a GitHub Release for `v1.0.24`
- attach `ai-visibility-inspector-1.0.24.zip`
- optionally create a lightweight GitHub landing page with:
  - AiVI headline
  - what it does
  - download button
  - install steps
  - support/privacy links

Exit criteria:

- users can download the plugin easily even before WordPress.org listing goes live

---

## Remaining Decisions

Only one small decision remains:

- whether to launch with a GitHub landing page immediately or rely on GitHub Releases first

Everything else in this track is execution.

---

## Recommended Order

1. Freeze the exact screenshots you want to use.
2. Add the screenshot captions to `readme.txt`.
3. Run the final clean-install and upgrade smoke test.
4. Submit the ZIP and prepare the WordPress.org `assets/` upload set.
5. Publish a GitHub Release as a backup download surface.

---

## Notes

- The current asset files already match WordPress.org banner and icon size requirements.
- No resizing is required for the four listing assets currently in `C:\Users\Administrator\Desktop\AiVI Assets`.
- The screenshot files are high-resolution enough for WordPress.org and can be exported directly as numbered `screenshot-N.png` files.

---

## WordPress.org SVN Structure Note

WordPress.org uses two different upload surfaces:

- plugin code goes in `trunk/`
- listing media goes in top-level `assets/`

That means the banner, icon, and screenshot files are **not** packaged inside the plugin ZIP.

### Mechanical Folder Layout

When preparing the WordPress.org SVN checkout, the structure should look like this:

```text
your-plugin-slug/
  assets/
    banner-772x250.png
    banner-1544x500.png
    icon-128x128.png
    icon-256x256.png
    screenshot-1.png
    screenshot-2.png
    screenshot-3.png
    screenshot-4.png
    screenshot-5.png
  trunk/
    ai-visibility-inspector.php
    readme.txt
    assets/
    includes/
    languages/
    LICENSE
    CHANGELOG.md
```

### Important Clarification

- do **not** put the WordPress.org banner, icon, or screenshot files inside the plugin ZIP just because `readme.txt` references screenshots
- `readme.txt` screenshot numbering maps to the WordPress.org top-level `assets/screenshot-N.png` files
- the plugin ZIP should remain the clean runtime package only

### Recommended Submission Sequence

1. Keep your original desktop source files as-is.
2. Create renamed copies for WordPress.org upload:
   - `banner-772x250.png`
   - `banner-1544x500.png`
   - `icon-128x128.png`
   - `icon-256x256.png`
   - `screenshot-1.png` to `screenshot-5.png`
3. Upload the plugin code to `trunk/`.
4. Upload the renamed media files to the top-level `assets/`.
5. Commit both so the listing and screenshots render correctly.
