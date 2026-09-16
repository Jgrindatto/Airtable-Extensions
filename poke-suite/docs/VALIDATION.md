# Validation report

Validation performed on September 16, 2026, using Node.js 24.19.0 and npm 11.9.0.

## Completed

| Check | Result |
| --- | --- |
| Archive inspection | Both original ZIPs contained four files and one directory each; no dependency directories, build output, or repository history were present. |
| TSX parsing and transformation | Both edited entry points parsed and transformed with Babel; the resulting JavaScript compiled successfully. This is a syntax check, not TypeScript typechecking. |
| Kanban behavior probes | 16 focused checks passed against extracted source helpers/callbacks, including table selection, review field/choice safety, missing-stage cards, pipeline totals, and preservation of linked IDs. |
| Mart behavior probes | Nine initial checks passed using a mocked React/Airtable harness, including safe review selection, failed/successful shortcut saves, permission denial, and concurrent-save protection. Follow-up probes confirmed accepted-status grouping and preferred choice behavior when both Accepted and Approved exist. |
| Package lock regeneration | Both apps completed `npm install --package-lock-only --offline --ignore-scripts --no-audit --no-fund`. |
| Installation-plan check | Both apps completed `npm ci --dry-run --offline --ignore-scripts --no-audit --no-fund`. This validates npm's install plan but does not download or install the packages. |
| Manifest consistency | Direct dependency versions and dependency declarations match the regenerated lockfiles. All resolved package URLs use the public npm registry. |
| Source/config review | No unexpected free JavaScript identifiers after transformation; config files pass Node syntax parsing. Shared table keys and review-status behavior align across apps. |
| Sensitive-pattern scan | No embedded Airtable instance IDs, common credential/token patterns, or private registry URLs found in the prepared package. This is a bounded pattern scan, not a guarantee against every possible secret. |
| Repository documentation | Relative links and fenced code blocks checked. |

The behavioral probes were temporary cleanup checks; this repository does not yet contain a maintained automated test suite.

## Not completed

The session's network policy rejected npm registry access. Dependency packages were not downloaded, so full ESLint, `tsc`, stylesheet compilation, and a bundled build were not run. There was no connection to the user's Airtable base, so live rendering, field exposure, custom-property behavior, record permissions, and writes were not exercised in Airtable. No dependency vulnerability audit was completed.

## Run before deploying the edited interfaces

From the repository root on a machine with npm access:

```sh
npm run setup
npm run check
```

Resolve any reported lint or SDK type errors, then follow the [Airtable smoke test](AIRTABLE_SETUP.md#verify-both-elements-in-airtable). Configure both interface elements against the same actual tables. Preview updates in the existing Airtable source workflow before publishing those elements.

The GitHub Actions workflow runs the same app-level checks after a push. The repository does not include deployment credentials, create a base, or automatically release an Airtable extension.
