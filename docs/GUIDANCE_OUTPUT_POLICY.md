# Guidance Output Policy

User-facing issue guidance must be concise, natural, and actionable.

Rules:
- Use free-flow narrative prose for issue explanations.
- Do not render UI labels like `Next steps:` or `Use this pattern:`.
- Do not surface internal anchoring/debug reasons in user-facing text.
- Keep `failure_reason` and other diagnostics for telemetry/logging only.
- Prefer semantic analyzer-authored explanations when present.
- Deterministic guidance should use natural variants, not rigid templates.
