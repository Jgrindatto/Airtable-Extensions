# Shared Airtable data schema

This is the schema expected by the source, not an export of your base. Bind both elements to the same tables as described in [Airtable setup](AIRTABLE_SETUP.md). Tables may have different names when selected explicitly, but retain the field names below for predictable behavior in both apps.

Primary fields supply record titles. Other exposed fields are displayed where the views support them. Optional fields enable the listed features; missing fields generally remove information or editing controls. Writable fields must also have the specified Airtable type and be editable by the current user.

## Deal Team

| Field | Expected type | Use |
| --- | --- | --- |
| Primary field, normally `Name` | Text or another title-producing primary field | Member names in both apps. |
| `System Owner` | Checkbox | Checked members are excluded from the member list and Mart characters. This is a record flag, not automatic current-user detection. |
| `Role` | Text or single select | Optional role label in Kanban. |
| `Brief Snapshots` | Links to Brief Snapshots | Optional reverse link used by Kanban to associate member briefs. Mart uses the forward `For Team Member` link below. |

Mart has 33 distinct member positions. More non-owner members fall back to an overlapping position.

## Brief Snapshots

| Field | Expected type | Use |
| --- | --- | --- |
| Primary field | Text or another title-producing primary field | Brief title. |
| `For Team Member` | Links to Deal Team | Associates briefs with members in both apps; required for Mart member briefs. |
| `Deal` | Links to Deals | Deal label in brief subtitles; links briefs to Kanban deal details. |
| `Snapshot Date` | Date or date/time | Subtitle and newest-first ordering. |
| Narrative fields, with any descriptive names | Usually long text | Nonempty values become brief sections. Primary, date, and linked-record fields are excluded from the body. |

These apps read existing snapshots. They do not generate briefs or populate the table.

## Source Records

| Field | Expected type | Use |
| --- | --- | --- |
| Primary field | Text or another title-producing primary field | Record title. |
| `Review Status` | **Single select** | Enables review status updates in both apps. An unrelated single-select field is never used as a substitute. |
| Context fields, with any descriptive names | Text, URLs, dates, or other displayable values | Existing record content shown in the review views. |

For a straightforward shared workflow, use choices `Pending`, `Accepted`, and `Rejected`. Existing `Approved` is also recognized as an accepted status. The quick Accept action prefers an exact `Accepted` choice, falling back to `Approved`, ignoring capitalization and surrounding spaces; a name such as `Not Accepted` does not qualify. The status selector offers the field's existing choices and writes the chosen option ID. The apps do not create status options. Mart displays up to six context fields in field order.

## Deals

Deals power Kanban. The Mart Risky Deals terminal is currently inactive.

| Field | Expected type | Use |
| --- | --- | --- |
| Primary field | Text or another title-producing primary field | Deal title. |
| `Stage` | **Single select** | Board columns follow the field's option order. |
| `Account Name` | Text | Account label and deal details. |
| `Gross ACV`, falling back to `ACV` | Number, currency, or numeric formula | Card amount and open-pipeline total. |
| `Net New ACV` | Number, currency, or numeric formula | Additional amount. |
| `Quarter` | Text or single select | Quarter filter. |
| `Pod Members` | Links to Deal Team | Team-member filter. |
| `Dead` | **Checkbox** | Editable flag; dead deals move to the bottom of their stage and are excluded from open pipeline. |
| `Tech win?` | **Single select** | Editable assessment using existing choices. |
| `Deal risk` | **Single select** | Editable risk using existing choices. |
| `SC Notes`, falling back to `Notes` | **Long text** (`multilineText`) | Editable notes. |
| `Meeting Types Held` | Text or multiple select | Meeting progression indicators. |

Optional detail fields: `Close Date`, `Probability`, `Importance`, `Account Tier`, `SC Risk Score`, and `AE Risk Score`.

Blank or unmatched stages appear under **No Stage**. The legacy choice named exactly `Closed` is intentionally hidden; use specific closed stages such as `Closed Won` and `Closed Lost` if those records should have visible columns. Open pipeline excludes dead deals and stage names containing the words `closed`, `won`, or `lost`. A stage name containing `SSW` or `scoping` marks the scoping point used by the progression indicator.

## Calendar

Calendar powers Kanban. The Mart Events terminal is currently inactive.

| Field | Expected type | Use |
| --- | --- | --- |
| Primary field, normally `Title` | Text or another title-producing primary field | Event title. |
| `Start` | Date/time | Calendar placement; events without a readable start do not appear in the weekly grid. |
| `End` | Date/time | Optional end time. |
| `All Day` | Checkbox | Optional all-day display. |
| `Location` | Text | Optional event location. |
| `Activity Type` | **Single select** | Editable classification using existing choices. |
| `Log Activity` | **Checkbox** | Editable logging flag. |
| `Opportunity` | **Links to Deals** (`multipleRecordLinks`) | Associates events with deal details and enables opportunity assignment. |

An event may link to multiple deals and appears under each linked deal. Kanban's single-choice assignment control is disabled for an event with multiple opportunity links so it preserves those links; edit that case directly in Airtable.

## Write scope

Both apps can update `Source Records.Review Status`. Kanban can also update the listed deal notes/assessment/dead fields and calendar activity/logging/opportunity fields. These actions modify records in the bound tables; the repository does not include table creation, data migration, or automation logic.
