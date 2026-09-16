# Airtable setup

Poké Kanban and Poké Mart are two independent Airtable interface extensions in one repository. They work together by reading and updating the same Airtable records. There is no separate server, synchronization service, API token, or `.env` file to configure: both use the Airtable host SDK and the current user's permissions.

## Restore each extension

1. Open each existing extension in the Airtable source editing/import workflow that produced the original ZIPs.
2. Replace its source with the matching project: `apps/poke-kanban` or `apps/poke-mart`. Preserve the `frontend/index.tsx`, `frontend/style.css`, and package dependencies together; the TSX imports the stylesheet.
3. Keep each extension attached to its intended interface element. Save and preview using that workflow.
4. Open each element's settings and select its table bindings below. Select the **same actual tables in both elements**, not separate copies with similar names.
5. Make the relevant tables and fields available to each element, including primary fields, linked-record fields, and fields used for editing. See [Data schema](DATA_SCHEMA.md).

The repository does not create Airtable tables, records, automations, or interface elements. Existing Airtable data remains the source of truth.

## Shared bindings

| Element setting | Property key | Default table name |
| --- | --- | --- |
| Deal Team | `dealTeamTable` | `Deal Team` |
| Brief Snapshots | `briefSnapshotsTable` | `Brief Snapshots` |
| Source Records | `sourceRecordsTable` | `Source Records` |
| Deals | `dealsTable` | `Deals` |
| Calendar | `calendarTable` | `Calendar` |

Default matching ignores capitalization and surrounding spaces. If a table is renamed or no match exists, select it explicitly in the settings. The apps do not substitute an arbitrary table.

| View | Required table bindings | Additional bindings that enable related information |
| --- | --- | --- |
| Mart room, member briefs, and Source Records terminal | Deal Team, Brief Snapshots, Source Records | Deals and Calendar are optional; the Events and Risky Deals terminals remain decorative and inactive. |
| Kanban Team Briefs | Deal Team, Brief Snapshots | — |
| Kanban Source Review | Source Records | — |
| Kanban Deals | Deals | Deal Team for team-member filters; Brief Snapshots for linked briefs; Calendar for linked events. |
| Kanban Calendar | Calendar | Deals for opportunity selection. |

Each element retains its own settings. Changing a binding in one does not configure the other.

## Local source checks

Use Node.js 24, matching the root `.nvmrc`. With nvm installed, run from the repository root:

```sh
nvm use
npm run setup
npm run check
```

`setup` installs each app's dependencies. `check` runs each app's lint and TypeScript checks. These commands require npm registry access and do not launch Airtable or publish anything.

For local Blocks CLI development, follow Airtable's [interface extension getting started guide](https://airtable.com/developers/interface-extensions/guides/getting-started) and restore or generate the personal remote configuration for each existing extension. The repository excludes `.block` and local credentials. The CLI configuration must come from your Airtable project; this cleanup does not recreate it. The included project configuration is based on Airtable's [TypeScript interface starter](https://github.com/Airtable/interface-extensions-hello-world-typescript).

## Verify both elements in Airtable

- Confirm the same team members and briefs appear in both apps. A brief needs a `For Team Member` link to appear in Mart.
- Change a Source Records review status in one app, then verify that record's value and workflow/accepted placement in the other. Both edit the existing record.
- In Kanban, check a deal's notes, assessments, linked briefs, and calendar events using a record you intend to edit.
- Verify the interface user's edit permissions. A rejected write should show an error; source checks cannot validate Airtable permissions.
- Test Mart movement with arrows or WASD, face a member or the Source Records terminal, and press Enter. Mart has 33 distinct member positions; additional members overlap.

Publishing source to GitHub and publishing an Airtable extension are separate actions. No external publication is performed by the repository's setup or check scripts.
