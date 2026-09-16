# Poké Suite

Two companion Airtable interfaces for the same deal-team workflow. **Poké Kanban** is the deal board, team briefs, source-review queue, and calendar. **Poké Mart** presents team members and their briefs in a walkable pixel-art room, with a Source Records review terminal.

Both read and update the same Airtable tables. Airtable is the shared data layer; there is no separate server or synchronization service in this repository.

| Folder | Purpose |
| --- | --- |
| `apps/poke-kanban` | Deal Pod Console / Kanban interface |
| `apps/poke-mart` | Pixel-art team room |
| `docs` | Airtable setup, schema, GitHub instructions, and validation notes |

The apps remain separate source projects so each can be used in its own Airtable interface element. Both use React 19 and the Airtable interface SDK. They require an Airtable host; opening an HTML file or deploying this repository to GitHub Pages will not run them.

## Get started

Use Node.js 24 and npm. From the repository root:

```sh
npm run setup
npm run check
```

Each app has its own pinned dependencies and npm lockfile. The root package only coordinates commands. To work on just one app:

```sh
cd apps/poke-kanban
npm ci
npm run check
```

Follow [Airtable setup](docs/AIRTABLE_SETUP.md) to update the two existing interface elements and select the same tables in both. The original ZIPs did not include deployment credentials or complete local host configuration; those remain specific to your Airtable setup. Table names are suggested defaults, and each element's settings let you select differently named tables.

## Documentation

- [Data schema and table mapping](docs/DATA_SCHEMA.md)
- [Airtable setup and manual smoke test](docs/AIRTABLE_SETUP.md)
- [Add this repository to GitHub](docs/GITHUB_SETUP.md)
- [Cleanup changes](docs/CLEANUP_NOTES.md)
- [Validation results and remaining checks](docs/VALIDATION.md)

## Current boundaries

- The Mart's Events and Risky Deals computers remain decorative; the Source Records terminal is interactive.
- The Mart has 33 distinct positions for team members other than the System Owner. Larger teams need a layout or pagination change.
- The Mart requests its pixel font from Google Fonts and falls back to a local monospace font.
- Table bindings and field access must be enabled in Airtable. Review actions require a writable `Review Status` single-select field with an exact `Accepted` or `Approved` option.
- Local syntax checks and focused behavior probes passed during cleanup. Full SDK typechecking, ESLint, dependency installation, and live Airtable testing still need to run in an environment with package access; see the validation report.

## License

The original package metadata indicated `UNLICENSED`; that intent is preserved. No open-source license has been chosen. The npm `private` flag prevents accidental npm publication and does not set GitHub repository visibility.
