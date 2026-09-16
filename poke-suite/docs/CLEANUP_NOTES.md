# Cleanup notes

Prepared from the supplied `Poke_Kanban.zip` and `Poke_Mart_1-1.zip`. The original uploads were left unchanged. Both exports contained only a TSX entry point, a Tailwind stylesheet, and npm package/lock files.

## Repository structure

- Combined the companion apps in one repository, with independent `apps/poke-kanban` and `apps/poke-mart` source projects.
- Added a root README, Airtable schema/setup guide, GitHub instructions, and validation report.
- Added ignore rules, line-ending/editor settings, a Node version file, and a GitHub Actions lint/typecheck workflow.
- Added app TypeScript, ESLint flat configuration, Tailwind, PostCSS, stylesheet type declaration, and entry-point configuration. The configuration follows the relevant conventions in Airtable's official interface starter, with a minimal Tailwind theme.
- Kept `UNLICENSED` and corrected the original `licence` spelling. No GitHub visibility or open-source license was selected.

## Dependencies

- Renamed the template packages for the two apps and pinned direct dependencies to versions already recorded in the supplied exports. The existing experimental Airtable SDK version was retained rather than upgraded.
- Removed the unused icon package and redundant lint/parser or webpack CSS-loader dependencies; the supplied source does not include a webpack build configuration. Tailwind, PostCSS, and Autoprefixer remain available for stylesheet processing by the host toolchain.
- Replaced three private-registry URLs per original lockfile with public npm URLs for the same package versions and integrity hashes.
- Repaired omitted nested dependency entries using identical metadata already present elsewhere in the supplied locks, then regenerated both lockfiles with npm in offline mode. Each has 231 entries, including its root package, compared with 446 in the original export.
- Kept separate lockfiles so each extension folder can be installed independently. The root package is a command coordinator, not an npm workspace or a third app.

## Shared Airtable behavior

- Removed embedded instance-specific table and field IDs.
- Added consistent named table defaults and explicit table settings to both apps. Missing tables no longer silently select an unrelated first table.
- Restricted source-review writes to a `Review Status` single-select field. Quick acceptance recognizes exact `Accepted` or `Approved` choices and prefers `Accepted` when both exist.
- Aligned accepted/workflow grouping across both interfaces. Names such as `Not Approved` no longer qualify as accepted.
- Kept failed review saves visible; the accept shortcut closes the record only after a successful write. Mart also prevents concurrent review saves.

## Kanban corrections

- Included deals with blank or unrecognized stage values under No Stage.
- Excluded dead deals and closed/won/lost stages from open-pipeline totals.
- Removed the arbitrary long-text fallback for editable notes and required expected field types for editing.
- Displayed update failures for deal assessments, notes, dead flags, and calendar fields.
- Preserved multiple calendar opportunity links by disabling the single-deal assignment control for that case.

## Preserved behavior and remaining limits

The existing visual design, game artwork, movement, brief views, and workflow were retained. The two apps still run inside Airtable and operate on live records selected in the host. The Mart's Events and Risky Deals terminals remain decorative. Its room still has 33 distinct non-owner member positions. The Kanban's legacy stage named exactly `Closed` remains hidden as in the original.

No data migration, record changes, Airtable deployment, GitHub repository creation, or push was performed. Full runtime verification is still required; see [Validation](VALIDATION.md).
