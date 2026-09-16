import './style.css';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  initializeBlock,
  useBase,
  useRecords,
  useCustomProperties,
} from '@airtable/blocks/interface/ui';

/**
 * Deal Pod Console — a business-focused interface over the same base/data as the
 * Poké Mart game element. Same use cases, different (professional) UX:
 *   1. Team Briefs  — browse pod members, open a member, page through their
 *      1-on-1 brief snapshots.
 *   2. Source Review — triage Source Records and set their Review Status
 *      (Accepted / Pending / Rejected). Accepted items move to their own tab.
 *
 * Data bindings mirror the game element exactly (same table ids + field-name
 * detection) so both interfaces stay in sync.
 */

const DEAL_TEAM_TABLE_ID = 'tbli97fs0V1Qex7zd';
const BRIEF_SNAPSHOTS_TABLE_ID = 'tblLUnyyar0p4hruj';
const SOURCE_RECORDS_TABLE_ID = 'tblSV1PcX8QizC5da';
const DEALS_TABLE_ID = 'tblbri2zcKSTWBUDO';

/**
 * Declare the tables this element depends on. Interface custom extensions only
 * get full field/record access to tables surfaced through custom properties, so
 * each table is bound here (defaulting to the correct table id).
 */
function getCustomProperties(base: ReturnType<typeof useBase>) {
  return [
    {
      key: 'dealTeamTable',
      label: 'Deal Team',
      type: 'table' as const,
      defaultValue:
        base.getTableByIdIfExists(DEAL_TEAM_TABLE_ID) ?? base.tables[0],
    },
    {
      key: 'briefSnapshotsTable',
      label: 'Brief Snapshots',
      type: 'table' as const,
      defaultValue:
        base.getTableByIdIfExists(BRIEF_SNAPSHOTS_TABLE_ID) ?? base.tables[0],
    },
    {
      key: 'sourceRecordsTable',
      label: 'Source Records',
      type: 'table' as const,
      defaultValue:
        base.getTableByIdIfExists(SOURCE_RECORDS_TABLE_ID) ?? base.tables[0],
    },
    {
      key: 'dealsTable',
      label: 'Deals',
      type: 'table' as const,
      defaultValue:
        base.getTableByIdIfExists(DEALS_TABLE_ID) ?? base.tables[0],
    },
    {
      key: 'calendarTable',
      label: 'Calendar',
      type: 'table' as const,
      // Synced calendar table is named after the mailbox; match by name.
      defaultValue:
        base.tables.find((t) => /@/.test(t.name)) ?? base.tables[0],
    },
  ];
}

/** Neutral, professional palette (kept in JS so it renders regardless of the
 *  host's Tailwind config). */
// Palette tuned to match the Poké Mart element: teal/blue world, bold dark
// ink outlines, white dialog panels, and bright yellow/red accents.
const T = {
  bg: '#7e9bc6', // sky/wall blue backdrop
  panel: '#ffffff', // dialog paper
  headerBar: '#bcdcec', // shelf-teal header
  border: '#1b2733', // dark ink outlines
  borderStrong: '#101010', // pure ink
  text: '#101010', // ink
  textMuted: '#485868',
  textSubtle: '#7890a8', // wallDeep
  accent: '#34548f', // deep pokemart blue
  accentText: '#27406f',
  accentSoft: '#d8f0ff', // desk register light blue
  hint: '#f8e850', // pokemart yellow
  rowHover: '#eef5fc',
  selected: '#cfe6f5',
  green: '#2f8f4e',
  greenSoft: '#e2f4e9',
  greenText: '#1f7a3d',
  greenBorder: '#1b2733',
  amberSoft: '#f7ea90',
  amberText: '#6b5600',
  amberBorder: '#1b2733',
  redSoft: '#f6cccc',
  redText: '#bb2a26',
  redBorder: '#1b2733',
} as const;

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// ---------------------------------------------------------------------------
// Generic field/record helpers (defensive — the SDK throws on odd field types).
// ---------------------------------------------------------------------------

type AnyTable = ReturnType<ReturnType<typeof useBase>['getTableByIdIfExists']>;
type AnyRecords = ReturnType<typeof useRecords>;
type AnyField = { id: string; name: string; type?: unknown; isPrimaryField?: boolean };
type AnyRecord = {
  id: string;
  getCellValueAsString: (f: unknown) => string;
  getCellValue: (f: unknown) => unknown;
};

function readStr(record: unknown, field: unknown): string {
  if (!record || !field) return '';
  try {
    return (record as AnyRecord).getCellValueAsString(field) || '';
  } catch {
    return '';
  }
}

function readRaw(record: unknown, field: unknown): unknown {
  if (!record || !field) return null;
  try {
    return (record as AnyRecord).getCellValue(field);
  } catch {
    return null;
  }
}

/** Linked-record cell values may be { id } objects or raw id strings. */
function linkedIds(record: unknown, field: unknown): string[] {
  const v = readRaw(record, field);
  if (!Array.isArray(v)) return [];
  return v
    .map((l) => (typeof l === 'string' ? l : (l as { id?: string } | null)?.id ?? ''))
    .filter(Boolean);
}

/** Whether the current user can edit records on the given table. */
function canEdit(table: AnyTable): boolean {
  const t = table as { hasPermissionToUpdateRecords?: () => boolean } | null;
  if (!t || typeof t.hasPermissionToUpdateRecords !== 'function') return true;
  try {
    return t.hasPermissionToUpdateRecords();
  } catch {
    return false;
  }
}

/** Numeric value of a currency/number cell (defensive against string cells). */
function numVal(record: unknown, field: unknown): number {
  const v = readRaw(record, field);
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

/** Compact money format for column/pipeline roll-ups ($1.2M, $850K, $1,234). */
function formatMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

// --- Calendar helpers -------------------------------------------------------

const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

function eventDate(rec: unknown, field: unknown): Date | null {
  const v = readRaw(rec, field);
  if (typeof v === 'string' && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function eventTimeLabel(
  rec: unknown,
  startF: unknown,
  endF: unknown,
  allDayF: unknown
): string {
  const s = eventDate(rec, startF);
  if (!s) return '';
  if (readRaw(rec, allDayF)) return 'All day';
  const e = eventDate(rec, endF);
  return e
    ? `${s.toLocaleTimeString([], TIME_OPTS)} – ${e.toLocaleTimeString([], TIME_OPTS)}`
    : s.toLocaleTimeString([], TIME_OPTS);
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type CalendarBundle = {
  table: AnyTable;
  title: AnyField | null;
  start: AnyField | null;
  end: AnyField | null;
  allDay: AnyField | null;
  activityType: AnyField | null;
  logActivity: AnyField | null;
  opportunity: AnyField | null;
  location: AnyField | null;
};

function fieldsOf(table: AnyTable): AnyField[] {
  return ((table as { fields?: AnyField[] } | null)?.fields ?? []) as AnyField[];
}

function primaryField(table: AnyTable): AnyField | null {
  const fields = fieldsOf(table);
  return fields.find((f) => f.isPrimaryField) ?? fields[0] ?? null;
}

function fieldByName(table: AnyTable, name: string): AnyField | null {
  const t = table as { getFieldIfExists?: (n: string) => AnyField | null } | null;
  if (t?.getFieldIfExists) {
    try {
      const f = t.getFieldIfExists(name);
      if (f) return f;
    } catch {
      /* fall through to a manual scan */
    }
  }
  // Fall back to scanning the table's fields by name (case/space-insensitive),
  // since getFieldIfExists can return null in some element contexts even when
  // the field is present on the table.
  const target = name.trim().toLowerCase();
  return (
    fieldsOf(table).find((f) => (f.name ?? '').trim().toLowerCase() === target) ??
    null
  );
}

/** Best single-select field that looks like a review/approval status. */
function reviewStatusField(table: AnyTable): AnyField | null {
  const selects = fieldsOf(table).filter((f) => String(f.type) === 'singleSelect');
  const score = (name: string) => {
    const s = name.toLowerCase();
    if (/review\s*status/.test(s)) return 4;
    if (s.includes('review')) return 3;
    if (s.includes('status')) return 2;
    if (s.includes('approv')) return 1;
    return 0;
  };
  let best: AnyField | null = null;
  let bestScore = -1;
  for (const f of selects) {
    const sc = score(f.name);
    if (sc > bestScore) {
      bestScore = sc;
      best = f;
    }
  }
  return best;
}

function choicesOf(field: AnyField | null): Array<{ id: string; name: string }> {
  const opts = (field as { options?: { choices?: Array<{ id: string; name: string }> } } | null)
    ?.options;
  return opts?.choices ?? [];
}

function statusTheme(name: string): { bg: string; color: string; border: string } {
  const s = name.toLowerCase();
  if (/accept|approv|done|complete|won/.test(s))
    return { bg: T.greenSoft, color: T.greenText, border: T.greenBorder };
  if (/reject|declin|denied|lost/.test(s))
    return { bg: T.redSoft, color: T.redText, border: T.redBorder };
  if (/pending|review|progress|open|unverified/.test(s))
    return { bg: T.amberSoft, color: T.amberText, border: T.amberBorder };
  return { bg: '#f3f4f6', color: T.textMuted, border: T.border };
}

// ---------------------------------------------------------------------------
// Shared small UI pieces
// ---------------------------------------------------------------------------

/** Basic inline markdown: **bold**. */
function renderInline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    )
  );
}

/**
 * Renders a block of brief text readably: blank lines break paragraphs,
 * `-`/`*`/`•` lines become bullet lists, `#`/`Heading:` lines become
 * subheadings, and **bold** is honored.
 */
function RichText({ text, size = 13 }: { text: string; size?: number }) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul
        key={`u${key++}`}
        style={{ margin: '2px 0 8px', paddingLeft: 18 }}
      >
        {bullets.map((b, i) => (
          <li key={i} style={{ marginBottom: 3, lineHeight: 1.55 }}>
            {renderInline(b)}
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      flush();
      continue;
    }
    const bullet = t.match(/^[-*•]\s+(.*)/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();
    const heading = t.match(/^#{1,6}\s+(.*)/);
    if (heading || /^[^:]{1,48}:$/.test(t)) {
      blocks.push(
        <div
          key={`h${key++}`}
          style={{
            fontWeight: 700,
            color: T.text,
            marginTop: 8,
            marginBottom: 2,
          }}
        >
          {renderInline(heading ? heading[1] : t)}
        </div>
      );
      continue;
    }
    blocks.push(
      <p
        key={`p${key++}`}
        style={{ margin: '0 0 8px', lineHeight: 1.6 }}
      >
        {renderInline(t)}
      </p>
    );
  }
  flush();

  return <div style={{ fontSize: size, color: T.text }}>{blocks}</div>;
}

function StatusPill({ label }: { label: string }) {
  const s = statusTheme(label || '');
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        padding: '2px 8px',
        borderRadius: 999,
        backgroundColor: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label || 'Unreviewed'}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        flexShrink: 0,
        backgroundColor: T.accentSoft,
        color: T.accentText,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {initials || '?'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brief view model
// ---------------------------------------------------------------------------

type BriefView = {
  id: string;
  title: string;
  subtitle: string;
  sortKey: string;
  sections: { label: string; value: string }[];
};

type Member = {
  id: string;
  name: string;
  role: string;
  briefs: BriefView[];
};

// ---------------------------------------------------------------------------
// Team Briefs view
// ---------------------------------------------------------------------------

function BriefReader({ briefs }: { briefs: BriefView[] }) {
  const [index, setIndex] = useState(0);
  const total = briefs.length;

  useEffect(() => {
    setIndex(0);
  }, [briefs]);

  const goPrev = useCallback(
    () => setIndex((i) => (total === 0 ? 0 : (i - 1 + total) % total)),
    [total]
  );
  const goNext = useCallback(
    () => setIndex((i) => (total === 0 ? 0 : (i + 1) % total)),
    [total]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext]);

  if (total === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: T.textMuted,
          fontSize: 14,
        }}
      >
        No briefs are attached to this team member yet.
      </div>
    );
  }

  const brief = briefs[Math.min(index, total - 1)];

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Brief selector strip */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          padding: '0 0 14px 0',
        }}
      >
        {briefs.map((b, i) => {
          const active = i === index;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setIndex(i)}
              style={{
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${active ? T.accent : T.border}`,
                backgroundColor: active ? T.accent : T.panel,
                color: active ? '#fff' : T.textMuted,
              }}
            >
              {b.subtitle || b.title}
            </button>
          );
        })}
      </div>

      {/* Reader card */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          backgroundColor: T.panel,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            backgroundColor: T.panel,
            borderBottom: `1px solid ${T.border}`,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{brief.title}</div>
            {brief.subtitle && (
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                {brief.subtitle}
              </div>
            )}
          </div>
          {total > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button type="button" onClick={goPrev} style={iconBtnStyle}>
                ‹
              </button>
              <span style={{ fontSize: 12, color: T.textMuted, minWidth: 44, textAlign: 'center' }}>
                {index + 1} / {total}
              </span>
              <button type="button" onClick={goNext} style={iconBtnStyle}>
                ›
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: '8px 20px 20px' }}>
          {brief.sections.length === 0 ? (
            <div style={{ color: T.textMuted, fontSize: 14, padding: '12px 0' }}>
              This snapshot has no written content.
            </div>
          ) : (
            brief.sections.map((s) => (
              <div key={s.label} style={{ padding: '16px 0', borderBottom: `1px solid ${T.border}` }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: T.textSubtle,
                    marginBottom: 6,
                  }}
                >
                  {s.label}
                </div>
                <div style={{ wordBreak: 'break-word' }}>
                  <RichText text={s.value} size={14} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  cursor: 'pointer',
  width: 30,
  height: 30,
  borderRadius: 8,
  border: `1px solid ${T.border}`,
  backgroundColor: T.panel,
  color: T.text,
  fontSize: 18,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function TeamBriefsView({ members }: { members: Member[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(
    members[0]?.id ?? null
  );

  // Keep selection valid as data loads / changes.
  useEffect(() => {
    if (members.length === 0) {
      setSelectedId(null);
    } else if (!members.some((m) => m.id === selectedId)) {
      setSelectedId(members[0].id);
    }
  }, [members, selectedId]);

  const selected = members.find((m) => m.id === selectedId) ?? null;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 20 }}>
      {/* Member list */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: T.panel,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${T.border}`,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: T.textMuted,
          }}
        >
          Pod Members · {members.length}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {members.length === 0 ? (
            <div style={{ padding: 20, color: T.textMuted, fontSize: 14 }}>
              No team members found.
            </div>
          ) : (
            members.map((m) => {
              const active = m.id === selectedId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    border: 'none',
                    borderBottom: `1px solid ${T.border}`,
                    borderLeft: `3px solid ${active ? T.accent : 'transparent'}`,
                    backgroundColor: active ? T.selected : T.panel,
                  }}
                >
                  <Avatar name={m.name} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: T.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.name}
                    </div>
                    <div style={{ fontSize: 12, color: T.textMuted }}>
                      {m.role || 'Team member'}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: m.briefs.length ? T.accentText : T.textSubtle,
                      backgroundColor: m.briefs.length ? T.accentSoft : '#f3f4f6',
                      borderRadius: 999,
                      padding: '2px 8px',
                      flexShrink: 0,
                    }}
                  >
                    {m.briefs.length}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Brief area */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!selected ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.textMuted,
              fontSize: 14,
            }}
          >
            Select a team member to view their briefs.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Avatar name={selected.name} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: 13, color: T.textMuted }}>
                  {selected.role ? `${selected.role} · ` : ''}
                  {selected.briefs.length} brief
                  {selected.briefs.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>
            <BriefReader briefs={selected.briefs} />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source Review view
// ---------------------------------------------------------------------------

function SourceReviewView({
  table,
  records,
}: {
  table: AnyTable;
  records: AnyRecords;
}) {
  const [tab, setTab] = useState<'workflow' | 'accepted'>('workflow');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordList = (records ?? []) as unknown as AnyRecord[];

  const primary = useMemo(() => primaryField(table), [table]);
  const reviewField = useMemo(
    () => fieldByName(table, 'Review Status') ?? reviewStatusField(table),
    [table]
  );
  const choices = useMemo(() => choicesOf(reviewField), [reviewField]);
  const acceptChoice = useMemo(
    () => choices.find((c) => /accept|approv/i.test(c.name)) ?? null,
    [choices]
  );

  const summaryFields = useMemo(
    () =>
      fieldsOf(table).filter(
        (f) =>
          f.id !== primary?.id &&
          f.id !== reviewField?.id &&
          String(f.type) !== 'multipleRecordLinks'
      ),
    [table, primary, reviewField]
  );

  const isAccepted = useCallback(
    (rec: AnyRecord) => !!acceptChoice && readStr(rec, reviewField) === acceptChoice.name,
    [acceptChoice, reviewField]
  );

  const workflowCount = recordList.filter((r) => !isAccepted(r)).length;
  const acceptedCount = recordList.length - workflowCount;

  const visible = useMemo(() => {
    const base = recordList.filter((r) =>
      tab === 'accepted' ? isAccepted(r) : !isAccepted(r)
    );
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((rec) => {
      if (readStr(rec, primary).toLowerCase().includes(q)) return true;
      for (const f of summaryFields) {
        if (readStr(rec, f).toLowerCase().includes(q)) return true;
      }
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordList, tab, query, primary, summaryFields, acceptChoice, reviewField]);

  const open = openId ? recordList.find((r) => r.id === openId) ?? null : null;

  const canUpdate = useMemo(() => {
    const t = table as { hasPermissionToUpdateRecords?: () => boolean } | null;
    if (!t || typeof t.hasPermissionToUpdateRecords !== 'function') return true;
    try {
      return t.hasPermissionToUpdateRecords();
    } catch {
      return false;
    }
  }, [table]);

  const setStatus = useCallback(
    async (recordId: string, choiceId: string) => {
      if (!table || !reviewField) return;
      setError(null);
      setSaving(true);
      try {
        await (
          table as unknown as {
            updateRecordAsync: (r: string, f: Record<string, unknown>) => Promise<void>;
          }
        ).updateRecordAsync(recordId, { [reviewField.id]: { id: choiceId } });
      } catch {
        setError('Could not save — check your edit permissions.');
      } finally {
        setSaving(false);
      }
    },
    [table, reviewField]
  );

  // Shift+Enter accepts the open record; Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        setOpenId(null);
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        if (acceptChoice && canUpdate && !saving) {
          void setStatus(open.id, acceptChoice.id);
          setOpenId(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, acceptChoice, canUpdate, saving, setStatus]);

  const tabBtn = (key: 'workflow' | 'accepted', label: string, count: number) => {
    const active = tab === key;
    return (
      <button
        type="button"
        onClick={() => {
          setTab(key);
          setOpenId(null);
        }}
        style={{
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          padding: '8px 14px',
          borderRadius: 8,
          border: `1px solid ${active ? T.accent : T.border}`,
          backgroundColor: active ? T.accent : T.panel,
          color: active ? '#fff' : T.textMuted,
        }}
      >
        {label}
        <span
          style={{
            marginLeft: 8,
            fontSize: 12,
            opacity: 0.9,
          }}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {tabBtn('workflow', 'Workflow', workflowCount)}
          {tabBtn('accepted', 'Accepted', acceptedCount)}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search source records…"
          style={{
            flex: 1,
            minWidth: 200,
            fontSize: 13,
            padding: '9px 12px',
            borderRadius: 8,
            border: `1px solid ${T.borderStrong}`,
            backgroundColor: T.panel,
            color: T.text,
            outline: 'none',
          }}
        />
      </div>

      {!reviewField && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: T.amberSoft,
            border: `1px solid ${T.amberBorder}`,
            color: T.amberText,
            fontSize: 13,
          }}
        >
          No single-select review-status field was found on this table, so status can't be changed.
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 20 }}>
        {/* List */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: T.panel,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {visible.length === 0 ? (
              <div style={{ padding: 24, color: T.textMuted, fontSize: 14, textAlign: 'center' }}>
                {recordList.length === 0
                  ? 'No source records.'
                  : query.trim()
                  ? 'No matches.'
                  : tab === 'accepted'
                  ? 'No accepted records yet.'
                  : 'Nothing left to review.'}
              </div>
            ) : (
              visible.map((rec) => {
                const active = rec.id === openId;
                const status = readStr(rec, reviewField);
                const meta = summaryFields
                  .slice(0, 3)
                  .map((f) => readStr(rec, f))
                  .filter(Boolean)
                  .join('  ·  ');
                return (
                  <div
                    key={rec.id}
                    onClick={() => setOpenId(rec.id)}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderBottom: `1px solid ${T.border}`,
                      borderLeft: `3px solid ${active ? T.accent : 'transparent'}`,
                      backgroundColor: active ? T.selected : T.panel,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: T.text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {readStr(rec, primary) || '(Untitled)'}
                      </div>
                      {meta && (
                        <div
                          style={{
                            fontSize: 12,
                            color: T.textMuted,
                            marginTop: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {meta}
                        </div>
                      )}
                    </div>
                    <StatusPill label={status} />
                    {tab === 'workflow' && acceptChoice && canUpdate && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!saving) void setStatus(rec.id, acceptChoice.id);
                        }}
                        style={{
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: `1px solid ${T.greenBorder}`,
                          backgroundColor: T.greenSoft,
                          color: T.greenText,
                          flexShrink: 0,
                        }}
                      >
                        Accept
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detail */}
        {open && (
          <div
            style={{
              width: 380,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: T.panel,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 18px',
                borderBottom: `1px solid ${T.border}`,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, minWidth: 0 }}>
                {readStr(open, primary) || '(Untitled)'}
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                style={{ ...iconBtnStyle, width: 28, height: 28, fontSize: 16 }}
              >
                ×
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px' }}>
              {reviewField && (
                <div style={{ marginBottom: 18 }}>
                  <div style={labelStyle}>{reviewField.name}</div>
                  <div style={{ marginBottom: 10 }}>
                    <StatusPill label={readStr(open, reviewField)} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {choices.map((c) => {
                      const current = c.name === readStr(open, reviewField);
                      const th = statusTheme(c.name);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          disabled={saving || !canUpdate || current}
                          onClick={() => setStatus(open.id, c.id)}
                          style={{
                            cursor: saving || !canUpdate || current ? 'default' : 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '7px 12px',
                            borderRadius: 8,
                            border: `1px solid ${current ? th.color : T.border}`,
                            backgroundColor: current ? th.bg : T.panel,
                            color: current ? th.color : T.text,
                            opacity: saving || !canUpdate ? 0.5 : 1,
                          }}
                        >
                          {current ? '✓ ' : ''}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                  {!canUpdate && (
                    <div style={{ marginTop: 8, fontSize: 12, color: T.redText }}>
                      You don't have permission to edit this table.
                    </div>
                  )}
                  {error && (
                    <div style={{ marginTop: 8, fontSize: 12, color: T.redText }}>{error}</div>
                  )}
                  {acceptChoice && canUpdate && (
                    <div style={{ marginTop: 8, fontSize: 11, color: T.textSubtle }}>
                      Tip: press Shift+Enter to accept.
                    </div>
                  )}
                </div>
              )}

              {summaryFields.map((f) => {
                const v = readStr(open, f);
                if (!v) return null;
                return (
                  <div key={f.id} style={{ marginBottom: 16 }}>
                    <div style={labelStyle}>{f.name}</div>
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: T.text,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {v}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: T.textSubtle,
  marginBottom: 6,
};

// ---------------------------------------------------------------------------
// Deals Kanban + deal modal
// ---------------------------------------------------------------------------

const SUMMARY_FIELD_NAMES = [
  'Account Name',
  'Gross ACV',
  'Net New ACV',
  'Close Date',
  'Quarter',
  'Probability',
  'Importance',
  'Account Tier',
  'SC Risk Score',
  'AE Risk Score',
  'Meeting Types Held',
  'Pod Members',
];

/**
 * CEP meeting types tracked in the "Meeting Types Held" field, in sequence.
 * Each matcher is lenient so it lights up regardless of exact option wording.
 */
const MEETING_TYPES: { abbr: string; label: string; re: RegExp }[] = [
  { abbr: 'DISC', label: 'Discovery', re: /discovery/i },
  { abbr: 'NBM', label: 'New Business Meeting', re: /\bnbm\b|new business/i },
  { abbr: 'SSW', label: 'Solution Scoping Workshop', re: /\bssw\b|scoping/i },
  { abbr: 'EB', label: 'EB Go/No-Go', re: /go\s*\/?\s*no[-\s]?go|\beb\b/i },
  {
    abbr: 'SVE',
    label: 'Solution Validation Event',
    re: /\bsve\b|validation event|solution validation/i,
  },
  { abbr: 'EKO', label: 'Enterprise Kickoff', re: /\beko\b|kickoff/i },
];

function EventEditRow({
  calendar,
  ev,
  canUpdate,
}: {
  calendar: CalendarBundle;
  ev: AnyRecord;
  canUpdate: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const title = calendar.title ? readStr(ev, calendar.title) : '(Untitled event)';
  const s = eventDate(ev, calendar.start);
  const dateLabel = s
    ? s.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    : '';
  const timeLabel = eventTimeLabel(
    ev,
    calendar.start,
    calendar.end,
    calendar.allDay
  );
  const actType = calendar.activityType ? readStr(ev, calendar.activityType) : '';
  const actChoices = choicesOf(calendar.activityType);
  const logged = !!readRaw(ev, calendar.logActivity);

  const write = async (fieldId: string, value: unknown) => {
    if (!calendar.table) return;
    setSaving(true);
    try {
      await (
        calendar.table as unknown as {
          updateRecordAsync: (r: string, f: Record<string, unknown>) => Promise<void>;
        }
      ).updateRecordAsync(ev.id, { [fieldId]: value });
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '12px 0', borderBottom: `1px solid ${T.border}` }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: T.text,
          lineHeight: 1.4,
          wordBreak: 'break-word',
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
        {[dateLabel, timeLabel].filter(Boolean).join(' · ')}
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {calendar.activityType && (
          <div>
            <div style={labelStyle}>Activity Type</div>
            <select
              value={actType}
              disabled={saving || !canUpdate}
              onChange={(e) => {
                const c = actChoices.find((x) => x.name === e.target.value);
                if (calendar.activityType)
                  write(calendar.activityType.id, c ? { id: c.id } : null);
              }}
              style={{
                width: '100%',
                fontFamily: FONT,
                fontSize: 12,
                padding: '6px 8px',
                borderRadius: 8,
                border: `2px solid ${T.border}`,
                backgroundColor: T.panel,
                color: T.text,
                outline: 'none',
              }}
            >
              <option value="">—</option>
              {actChoices.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {calendar.logActivity && (
          <button
            type="button"
            disabled={saving || !canUpdate}
            onClick={() =>
              calendar.logActivity && write(calendar.logActivity.id, !logged)
            }
            style={{
              alignSelf: 'flex-start',
              cursor: saving || !canUpdate ? 'default' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 700,
              padding: '6px 10px',
              borderRadius: 8,
              border: `2px solid ${T.border}`,
              backgroundColor: logged ? T.greenSoft : T.panel,
              color: logged ? T.greenText : T.textMuted,
              opacity: saving || !canUpdate ? 0.5 : 1,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                border: `2px solid ${logged ? T.greenText : T.borderStrong}`,
                backgroundColor: logged ? T.greenText : 'transparent',
                color: '#fff',
                fontSize: 10,
                lineHeight: '11px',
                textAlign: 'center',
                display: 'inline-block',
              }}
            >
              {logged ? '✓' : ''}
            </span>
            Log Activity
          </button>
        )}
      </div>
    </div>
  );
}

function DealEventsPanel({
  calendar,
  events,
  canUpdate,
}: {
  calendar: CalendarBundle;
  events: AnyRecord[];
  canUpdate: boolean;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 340,
        maxWidth: '92vw',
        maxHeight: '86vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: T.panel,
        border: `3px solid ${T.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: `6px 6px 0 ${T.border}`,
      }}
    >
      <div
        style={{
          backgroundColor: T.headerBar,
          borderBottom: `2px solid ${T.border}`,
          padding: '14px 16px',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
          Linked Events
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
          {events.length} calendar event{events.length === 1 ? '' : 's'}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px' }}>
        {events.length === 0 ? (
          <div style={{ padding: '20px 0', fontSize: 13, color: T.textMuted }}>
            No calendar events linked to this deal.
          </div>
        ) : (
          events.map((ev) => (
            <EventEditRow
              key={ev.id}
              calendar={calendar}
              ev={ev}
              canUpdate={canUpdate}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DealModal({
  table,
  deal,
  primary,
  stageField,
  summaryFields,
  brief,
  briefCount,
  notesField,
  deadField,
  techWinField,
  dealRiskField,
  calendar,
  events,
  canUpdate,
  onClose,
}: {
  table: AnyTable;
  deal: AnyRecord;
  primary: AnyField | null;
  stageField: AnyField | null;
  summaryFields: AnyField[];
  brief: BriefView | null;
  briefCount: number;
  notesField: AnyField | null;
  deadField: AnyField | null;
  techWinField: AnyField | null;
  dealRiskField: AnyField | null;
  calendar: CalendarBundle;
  events: AnyRecord[];
  canUpdate: boolean;
  onClose: () => void;
}) {
  const initial = notesField ? readStr(deal, notesField) : '';
  const [notes, setNotes] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [deadSaving, setDeadSaving] = useState(false);
  const [assessSaving, setAssessSaving] = useState(false);
  const dirty = notes !== initial;
  const dead = !!readRaw(deal, deadField);
  const techWinValue = techWinField ? readStr(deal, techWinField) : '';
  const techWinChoices = choicesOf(techWinField);
  const riskValue = dealRiskField ? readStr(deal, dealRiskField) : '';
  const riskChoices = choicesOf(dealRiskField);

  const writeCell = async (fieldId: string, value: unknown) => {
    if (!table) return;
    setAssessSaving(true);
    try {
      await (
        table as unknown as {
          updateRecordAsync: (r: string, f: Record<string, unknown>) => Promise<void>;
        }
      ).updateRecordAsync(deal.id, { [fieldId]: value });
    } catch {
      /* surfaced via lack of state change */
    } finally {
      setAssessSaving(false);
    }
  };

  const riskTheme = (name: string) => {
    const s = name.toLowerCase();
    if (/high/.test(s)) return { bg: T.redSoft, color: T.redText };
    if (/med/.test(s)) return { bg: T.amberSoft, color: T.amberText };
    if (/low/.test(s)) return { bg: T.greenSoft, color: T.greenText };
    return { bg: T.accentSoft, color: T.accentText };
  };

  const winTheme = (name: string) => {
    const s = name.toLowerCase().trim();
    if (s === 'yes') return { bg: T.greenSoft, color: T.greenText };
    if (s === 'no') return { bg: T.redSoft, color: T.redText };
    return { bg: '#f1f3f6', color: T.textMuted };
  };

  const toggleDead = async () => {
    if (!deadField || !table) return;
    setDeadSaving(true);
    try {
      await (
        table as unknown as {
          updateRecordAsync: (r: string, f: Record<string, unknown>) => Promise<void>;
        }
      ).updateRecordAsync(deal.id, { [deadField.id]: !dead });
    } catch {
      /* ignore — surfaced via lack of state change */
    } finally {
      setDeadSaving(false);
    }
  };

  // Reset the editor when a different deal is opened in the same modal instance.
  useEffect(() => {
    setNotes(notesField ? readStr(deal, notesField) : '');
    setStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    if (!notesField || !table) return;
    setSaving(true);
    setStatus(null);
    try {
      await (
        table as unknown as {
          updateRecordAsync: (r: string, f: Record<string, unknown>) => Promise<void>;
        }
      ).updateRecordAsync(deal.id, { [notesField.id]: notes });
      setStatus('Saved');
    } catch {
      setStatus('Could not save — check permissions.');
    } finally {
      setSaving(false);
    }
  };

  const stageName = stageField ? readStr(deal, stageField) : '';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(16,24,32,0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 24,
        gap: 16,
        overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: T.panel,
          border: `3px solid ${T.border}`,
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: `6px 6px 0 ${T.border}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            backgroundColor: T.headerBar,
            borderBottom: `2px solid ${T.border}`,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: dead ? T.textMuted : T.text,
                textDecoration: dead ? 'line-through' : 'none',
              }}
            >
              {readStr(deal, primary) || '(Untitled deal)'}
            </div>
            <div
              style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
            >
              {stageName && <StatusPill label={stageName} />}
              {dead && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    padding: '2px 8px',
                    borderRadius: 999,
                    backgroundColor: '#e5e9ee',
                    color: T.textMuted,
                    border: '1px solid #c3ccd6',
                  }}
                >
                  DEAD — excluded from pipeline
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {deadField && (
              <button
                type="button"
                onClick={toggleDead}
                disabled={deadSaving || !canUpdate}
                title={
                  dead
                    ? 'Restore this deal to the active pipeline'
                    : 'Flag as probably dead (drops it from pipeline totals)'
                }
                style={{
                  cursor: deadSaving || !canUpdate ? 'default' : 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: `2px solid ${T.border}`,
                  backgroundColor: dead ? T.panel : T.redSoft,
                  color: dead ? T.text : T.redText,
                  opacity: deadSaving || !canUpdate ? 0.5 : 1,
                }}
              >
                {deadSaving
                  ? 'Saving…'
                  : dead
                  ? 'Restore deal'
                  : 'Mark as dead'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                cursor: 'pointer',
                width: 30,
                height: 30,
                borderRadius: 8,
                border: `2px solid ${T.border}`,
                backgroundColor: T.hint,
                color: T.text,
                fontSize: 16,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>
          {/* Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 12,
              marginBottom: 18,
            }}
          >
            {summaryFields.map((f) => {
              const v = readStr(deal, f);
              if (!v) return null;
              return (
                <div key={f.id}>
                  <div style={labelStyle}>{f.name}</div>
                  <div
                    style={{
                      fontSize: 13,
                      color: T.text,
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}
                  >
                    {v}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Brief summary */}
          <div
            style={{
              borderTop: `2px solid ${T.border}`,
              paddingTop: 14,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
                Brief Summary
              </div>
              {briefCount > 1 && (
                <div style={{ fontSize: 11, color: T.textMuted }}>
                  latest of {briefCount}
                </div>
              )}
            </div>
            {!brief ? (
              <div style={{ fontSize: 13, color: T.textMuted }}>
                No brief snapshot for this deal yet.
              </div>
            ) : (
              <>
                {brief.subtitle && (
                  <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>
                    {brief.subtitle}
                  </div>
                )}
                {brief.sections.length === 0 ? (
                  <div style={{ fontSize: 13, color: T.textMuted }}>
                    This snapshot has no written content.
                  </div>
                ) : (
                  brief.sections.map((s) => (
                    <div key={s.label} style={{ marginBottom: 12 }}>
                      <div style={labelStyle}>{s.label}</div>
                      <div style={{ wordBreak: 'break-word' }}>
                        <RichText text={s.value} size={13} />
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>

          {/* Live notes */}
          <div style={{ borderTop: `2px solid ${T.border}`, paddingTop: 14 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
                Live Notes
                {notesField ? (
                  <span
                    style={{ fontSize: 11, fontWeight: 500, color: T.textMuted }}
                  >
                    {'  '}· {notesField.name}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 11, color: T.textMuted }}>
                {saving
                  ? 'Saving…'
                  : status
                  ? status
                  : dirty
                  ? 'Unsaved changes'
                  : ''}
              </div>
            </div>
            {!notesField ? (
              <div style={{ fontSize: 13, color: T.textMuted }}>
                No notes field found on the Deals table.
              </div>
            ) : (
              <>
                <textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setStatus(null);
                  }}
                  disabled={!canUpdate}
                  placeholder="Type notes during your discussion with the AE…"
                  rows={6}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontFamily: FONT,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: T.text,
                    backgroundColor: canUpdate ? '#fff' : '#f3f4f6',
                    border: `2px solid ${T.border}`,
                    borderRadius: 8,
                    padding: 10,
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
                <div
                  style={{
                    marginTop: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || !canUpdate || !dirty}
                    style={{
                      cursor: saving || !canUpdate || !dirty ? 'default' : 'pointer',
                      fontSize: 13,
                      fontWeight: 700,
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: `2px solid ${T.border}`,
                      backgroundColor: T.hint,
                      color: T.text,
                      boxShadow: `2px 2px 0 ${T.border}`,
                      opacity: saving || !canUpdate || !dirty ? 0.5 : 1,
                    }}
                  >
                    Save Notes
                  </button>
                  {dirty && !saving && (
                    <button
                      type="button"
                      onClick={() => {
                        setNotes(initial);
                        setStatus(null);
                      }}
                      style={{
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: `2px solid ${T.border}`,
                        backgroundColor: T.panel,
                        color: T.text,
                      }}
                    >
                      Revert
                    </button>
                  )}
                  {!canUpdate && (
                    <span style={{ fontSize: 12, color: T.redText }}>
                      Read-only (no edit permission).
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Deal assessment */}
          {(techWinField || dealRiskField) && (
            <div style={{ borderTop: `2px solid ${T.border}`, paddingTop: 14, marginTop: 18 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
                  Deal Assessment
                </div>
                <div style={{ fontSize: 11, color: T.textMuted }}>
                  {assessSaving ? 'Saving…' : ''}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 20,
                }}
              >
                {techWinField && (
                  <div>
                    <div style={labelStyle}>{techWinField.name}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {techWinChoices.map((c) => {
                        const active = c.name === techWinValue;
                        const wt = winTheme(c.name);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={assessSaving || !canUpdate || active}
                            onClick={() => writeCell(techWinField.id, { id: c.id })}
                            style={{
                              cursor:
                                assessSaving || !canUpdate || active
                                  ? 'default'
                                  : 'pointer',
                              fontSize: 13,
                              fontWeight: 700,
                              padding: '7px 12px',
                              borderRadius: 8,
                              border: `2px solid ${active ? wt.color : T.border}`,
                              backgroundColor: active ? wt.bg : T.panel,
                              color: active ? wt.color : T.textMuted,
                              opacity: assessSaving || !canUpdate ? 0.5 : 1,
                            }}
                          >
                            {active ? '● ' : ''}
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {dealRiskField && (
                  <div>
                    <div style={labelStyle}>{dealRiskField.name}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {riskChoices.map((c) => {
                        const active = c.name === riskValue;
                        const rt = riskTheme(c.name);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={assessSaving || !canUpdate || active}
                            onClick={() => writeCell(dealRiskField.id, { id: c.id })}
                            style={{
                              cursor:
                                assessSaving || !canUpdate || active
                                  ? 'default'
                                  : 'pointer',
                              fontSize: 13,
                              fontWeight: 700,
                              padding: '7px 12px',
                              borderRadius: 8,
                              border: `2px solid ${active ? rt.color : T.border}`,
                              backgroundColor: active ? rt.bg : T.panel,
                              color: active ? rt.color : T.textMuted,
                              opacity: assessSaving || !canUpdate ? 0.5 : 1,
                            }}
                          >
                            {active ? '● ' : ''}
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {!canUpdate && (
                <div style={{ marginTop: 8, fontSize: 12, color: T.redText }}>
                  Read-only (no edit permission).
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {calendar.table && (
        <DealEventsPanel
          calendar={calendar}
          events={events}
          canUpdate={canEdit(calendar.table)}
        />
      )}
    </div>
  );
}

function KanbanView({
  table,
  records,
  members,
  briefsByDeal,
  calendar,
  eventsByDeal,
}: {
  table: AnyTable;
  records: AnyRecords;
  members: Member[];
  briefsByDeal: Record<string, BriefView[]>;
  calendar: CalendarBundle;
  eventsByDeal: Record<string, AnyRecord[]>;
}) {
  const [aeId, setAeId] = useState<string>('all');
  const [quarterFilter, setQuarterFilter] = useState<string>('all');
  const [openDealId, setOpenDealId] = useState<string | null>(null);

  const primary = useMemo(() => primaryField(table), [table]);
  const stageField = useMemo(() => fieldByName(table, 'Stage'), [table]);
  const accountField = useMemo(() => fieldByName(table, 'Account Name'), [table]);
  const grossAcvField = useMemo(
    () => fieldByName(table, 'Gross ACV') ?? fieldByName(table, 'ACV'),
    [table]
  );
  const netAcvField = useMemo(() => fieldByName(table, 'Net New ACV'), [table]);
  const quarterField = useMemo(() => fieldByName(table, 'Quarter'), [table]);
  const deadField = useMemo(() => fieldByName(table, 'Dead'), [table]);
  const techWinField = useMemo(() => fieldByName(table, 'Tech win?'), [table]);
  const dealRiskField = useMemo(() => fieldByName(table, 'Deal risk'), [table]);
  const podMembersField = useMemo(() => fieldByName(table, 'Pod Members'), [table]);
  const isDead = (rec: AnyRecord) => !!readRaw(rec, deadField);
  const meetingsField = useMemo(
    () => fieldByName(table, 'Meeting Types Held'),
    [table]
  );
  const notesField = useMemo(
    () =>
      fieldByName(table, 'SC Notes') ??
      fieldByName(table, 'Notes') ??
      fieldsOf(table).find(
        (f) => String(f.type) === 'multilineText' && !f.isPrimaryField
      ) ??
      null,
    [table]
  );
  const summaryFields = useMemo(
    () =>
      SUMMARY_FIELD_NAMES.map((n) => fieldByName(table, n)).filter(
        (f): f is AnyField => !!f
      ),
    [table]
  );

  const canUpdate = useMemo(() => {
    const t = table as { hasPermissionToUpdateRecords?: () => boolean } | null;
    if (!t || typeof t.hasPermissionToUpdateRecords !== 'function') return true;
    try {
      return t.hasPermissionToUpdateRecords();
    } catch {
      return false;
    }
  }, [table]);

  const recordList = (records ?? []) as unknown as AnyRecord[];
  // Stage columns, minus the retired generic "Closed" (now Won/Lost).
  const stages = choicesOf(stageField).filter(
    (s) => s.name.trim().toLowerCase() !== 'closed'
  );
  // Index of the scoping (SSW) stage; deals beyond it are "past scope".
  const sswStageIndex = stages.findIndex((s) => /ssw|scoping/i.test(s.name));

  const quarters = useMemo(() => {
    const set = new Set<string>();
    for (const rec of recordList) {
      const q = quarterField ? readStr(rec, quarterField) : '';
      if (q) set.add(q);
    }
    return Array.from(set).sort();
  }, [recordList, quarterField]);

  const filtered = useMemo(
    () =>
      recordList.filter((rec) => {
        if (aeId !== 'all' && !linkedIds(rec, podMembersField).includes(aeId))
          return false;
        if (
          quarterFilter !== 'all' &&
          (quarterField ? readStr(rec, quarterField) : '') !== quarterFilter
        )
          return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recordList, aeId, quarterFilter, podMembersField, quarterField]
  );

  const columns = useMemo(() => {
    const byStage: { name: string; deals: AnyRecord[] }[] = stages.map((c) => ({
      name: c.name,
      deals: [],
    }));
    const noStage: AnyRecord[] = [];
    for (const rec of filtered) {
      const sName = stageField ? readStr(rec, stageField) : '';
      const col = byStage.find((c) => c.name === sName);
      if (col) col.deals.push(rec);
      // Deals in the retired "Closed" stage (or unknown) fall through silently.
      else if (sName && !/^closed$/i.test(sName)) noStage.push(rec);
    }
    if (noStage.length) byStage.push({ name: 'No Stage', deals: noStage });
    // Keep each column in order but float "dead" deals to the bottom.
    for (const c of byStage) {
      c.deals.sort((a, b) => (isDead(a) ? 1 : 0) - (isDead(b) ? 1 : 0));
    }
    return byStage;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, filtered, stageField, deadField]);

  // Open pipeline = filtered deals not in a closed stage and not flagged dead.
  const openPipeline = useMemo(() => {
    let sum = 0;
    for (const rec of filtered) {
      const sName = stageField ? readStr(rec, stageField) : '';
      if (!/closed/i.test(sName) && !isDead(rec)) sum += numVal(rec, grossAcvField);
    }
    return sum;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, stageField, grossAcvField, deadField]);

  const openDeal = openDealId
    ? recordList.find((r) => r.id === openDealId) ?? null
    : null;
  const openBriefs = openDeal ? briefsByDeal[openDeal.id] ?? [] : [];

  const fmtCount = filtered.length;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
          Filter by AE
        </span>
        <select
          value={aeId}
          onChange={(e) => setAeId(e.target.value)}
          style={{
            fontFamily: FONT,
            fontSize: 13,
            padding: '8px 10px',
            borderRadius: 8,
            border: `2px solid ${T.border}`,
            backgroundColor: T.panel,
            color: T.text,
            outline: 'none',
          }}
        >
          <option value="all">All AEs</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
          Quarter
        </span>
        <select
          value={quarterFilter}
          onChange={(e) => setQuarterFilter(e.target.value)}
          style={{
            fontFamily: FONT,
            fontSize: 13,
            padding: '8px 10px',
            borderRadius: 8,
            border: `2px solid ${T.border}`,
            backgroundColor: T.panel,
            color: T.text,
            outline: 'none',
          }}
        >
          <option value="all">All quarters</option>
          {quarters.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: T.textMuted }}>
          {fmtCount} deal{fmtCount === 1 ? '' : 's'}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 800,
            color: T.text,
            backgroundColor: T.hint,
            border: `2px solid ${T.border}`,
            borderRadius: 8,
            padding: '6px 12px',
            boxShadow: `2px 2px 0 ${T.border}`,
          }}
        >
          <span style={{ fontWeight: 600, color: T.textMuted }}>
            Open pipeline (Gross ACV)
          </span>
          {formatMoney(openPipeline)}
        </span>
      </div>

      {/* Board */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          gap: 14,
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: 8,
        }}
      >
        {columns.map((col) => {
          const th = statusTheme(col.name);
          const colTotal = col.deals.reduce(
            (sum, d) => sum + (isDead(d) ? 0 : numVal(d, grossAcvField)),
            0
          );
          return (
            <div
              key={col.name}
              style={{
                width: 270,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#eef4fb',
                border: `2px solid ${T.border}`,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '10px 12px',
                  borderBottom: `2px solid ${T.border}`,
                  backgroundColor: th.bg,
                  color: th.color,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.name}
                  </span>
                  <span style={{ fontSize: 12, flexShrink: 0, marginLeft: 8 }}>
                    {col.deals.length}
                  </span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, opacity: 0.9 }}>
                  {formatMoney(colTotal)}
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
                {col.deals.length === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: T.textSubtle,
                      textAlign: 'center',
                      padding: '16px 0',
                    }}
                  >
                    —
                  </div>
                ) : (
                  col.deals.map((deal) => {
                    const account = accountField ? readStr(deal, accountField) : '';
                    const grossAcv = grossAcvField ? readStr(deal, grossAcvField) : '';
                    const netAcv = netAcvField ? readStr(deal, netAcvField) : '';
                    const quarter = quarterField ? readStr(deal, quarterField) : '';
                    const dead = isDead(deal);
                    const briefN = (briefsByDeal[deal.id] ?? []).length;
                    const heldStr = meetingsField
                      ? readStr(deal, meetingsField)
                      : '';
                    const stageName = stageField ? readStr(deal, stageField) : '';
                    const stageIdx = stages.findIndex((s) => s.name === stageName);
                    const pastScope =
                      sswStageIndex >= 0 &&
                      stageIdx > sswStageIndex &&
                      !/closed/i.test(stageName);
                    const hasSSW = /\bssw\b|scoping/i.test(heldStr);
                    const hasEB = /go\s*\/?\s*no[-\s]?go|\beb\b/i.test(heldStr);
                    const warn = pastScope && (!hasSSW || !hasEB);
                    const warnMissing = [
                      !hasSSW ? 'SSW' : null,
                      !hasEB ? 'EB Go/No-Go' : null,
                    ]
                      .filter(Boolean)
                      .join(' + ');
                    return (
                      <button
                        key={deal.id}
                        type="button"
                        onClick={() => setOpenDealId(deal.id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'block',
                          marginBottom: 10,
                          padding: 12,
                          borderRadius: 10,
                          border: `2px solid ${
                            dead ? '#c3ccd6' : warn ? T.redText : T.border
                          }`,
                          backgroundColor: dead ? '#eef1f5' : T.panel,
                          boxShadow: `2px 2px 0 ${
                            dead ? '#c3ccd6' : warn ? T.redText : T.border
                          }`,
                          opacity: dead ? 0.72 : 1,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 6,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: dead ? T.textMuted : T.text,
                              textDecoration: dead ? 'line-through' : 'none',
                              lineHeight: 1.4,
                              wordBreak: 'break-word',
                              flex: 1,
                            }}
                          >
                            {readStr(deal, primary) || '(Untitled)'}
                          </div>
                          {dead ? (
                            <span
                              style={{
                                flexShrink: 0,
                                fontSize: 9,
                                fontWeight: 800,
                                letterSpacing: 0.5,
                                lineHeight: 1.4,
                                padding: '1px 5px',
                                borderRadius: 6,
                                backgroundColor: '#e5e9ee',
                                color: T.textMuted,
                                border: `1px solid #c3ccd6`,
                              }}
                            >
                              DEAD
                            </span>
                          ) : (
                            warn && (
                              <span
                                title={`Past scoping but missing ${warnMissing}`}
                                style={{
                                  flexShrink: 0,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  lineHeight: 1.2,
                                  padding: '1px 5px',
                                  borderRadius: 6,
                                  backgroundColor: T.redSoft,
                                  color: T.redText,
                                  border: `1px solid ${T.redText}`,
                                }}
                              >
                                ⚠
                              </span>
                            )
                          )}
                        </div>
                        {account && (
                          <div
                            style={{
                              fontSize: 12,
                              color: T.textMuted,
                              marginTop: 3,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {account}
                          </div>
                        )}
                        {/* Meeting types held */}
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 3,
                            marginTop: 8,
                          }}
                        >
                          {MEETING_TYPES.map((mt) => {
                            const held = mt.re.test(heldStr);
                            return (
                              <span
                                key={mt.abbr}
                                title={`${mt.label}${held ? ' — held' : ' — not held'}`}
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  lineHeight: 1.5,
                                  padding: '1px 4px',
                                  borderRadius: 4,
                                  border: `1px solid ${held ? T.border : '#cdd6e0'}`,
                                  backgroundColor: held ? T.accent : '#fff',
                                  color: held ? '#fff' : '#aab4c0',
                                }}
                              >
                                {mt.abbr}
                              </span>
                            );
                          })}
                        </div>
                        <div
                          style={{
                            marginTop: 8,
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            {grossAcv && (
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 800,
                                  color: T.accentText,
                                  lineHeight: 1.2,
                                }}
                              >
                                {grossAcv}
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 600,
                                    color: T.textMuted,
                                  }}
                                >
                                  {'  '}gross
                                </span>
                              </div>
                            )}
                            {netAcv && (
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: T.textMuted,
                                  marginTop: 1,
                                }}
                              >
                                {netAcv} net new
                              </div>
                            )}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-end',
                              gap: 4,
                              flexShrink: 0,
                            }}
                          >
                            {quarter && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 800,
                                  color: T.accentText,
                                  backgroundColor: T.accentSoft,
                                  border: `1px solid ${T.border}`,
                                  borderRadius: 999,
                                  padding: '1px 7px',
                                }}
                              >
                                {quarter}
                              </span>
                            )}
                            {briefN > 0 && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: T.text,
                                  backgroundColor: T.hint,
                                  border: `1px solid ${T.border}`,
                                  borderRadius: 999,
                                  padding: '1px 6px',
                                }}
                              >
                                {briefN} brief{briefN === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
        {columns.length === 0 && (
          <div style={{ color: T.textMuted, fontSize: 14, padding: 24 }}>
            No deal stages found on the Deals table.
          </div>
        )}
      </div>

      {openDeal && (
        <DealModal
          table={table}
          deal={openDeal}
          primary={primary}
          stageField={stageField}
          summaryFields={summaryFields}
          brief={openBriefs[0] ?? null}
          briefCount={openBriefs.length}
          notesField={notesField}
          deadField={deadField}
          techWinField={techWinField}
          dealRiskField={dealRiskField}
          calendar={calendar}
          events={eventsByDeal[openDeal.id] ?? []}
          canUpdate={canUpdate}
          onClose={() => setOpenDealId(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar view
// ---------------------------------------------------------------------------

function CalEventCard({
  calendar,
  ev,
  dealOptions,
  canUpdate,
}: {
  calendar: CalendarBundle;
  ev: AnyRecord;
  dealOptions: { id: string; name: string }[];
  canUpdate: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const title = calendar.title ? readStr(ev, calendar.title) : '(Untitled)';
  const time = eventTimeLabel(ev, calendar.start, calendar.end, calendar.allDay);
  const actType = calendar.activityType ? readStr(ev, calendar.activityType) : '';
  const currentOpp = linkedIds(ev, calendar.opportunity)[0] ?? '';

  const assign = async (dealId: string) => {
    if (!calendar.table || !calendar.opportunity) return;
    setSaving(true);
    try {
      await (
        calendar.table as unknown as {
          updateRecordAsync: (r: string, f: Record<string, unknown>) => Promise<void>;
        }
      ).updateRecordAsync(ev.id, {
        [calendar.opportunity.id]: dealId ? [{ id: dealId }] : [],
      });
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        marginBottom: 8,
        padding: 8,
        borderRadius: 8,
        border: `2px solid ${currentOpp ? T.accent : T.border}`,
        backgroundColor: T.panel,
        opacity: saving ? 0.6 : 1,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: T.accentText }}>
        {time}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: T.text,
          lineHeight: 1.35,
          margin: '2px 0 4px',
          wordBreak: 'break-word',
        }}
      >
        {title}
      </div>
      {actType && (
        <div
          style={{
            display: 'inline-block',
            fontSize: 9,
            fontWeight: 700,
            color: T.textMuted,
            backgroundColor: '#eef2f7',
            border: `1px solid ${T.border}`,
            borderRadius: 4,
            padding: '1px 5px',
            marginBottom: 6,
          }}
        >
          {actType}
        </div>
      )}
      {calendar.opportunity && (
        <select
          value={currentOpp}
          disabled={saving || !canUpdate}
          onChange={(e) => assign(e.target.value)}
          title="Assign to Opportunity"
          style={{
            width: '100%',
            fontFamily: FONT,
            fontSize: 11,
            padding: '4px 6px',
            borderRadius: 6,
            border: `2px solid ${currentOpp ? T.accent : T.borderStrong}`,
            backgroundColor: currentOpp ? T.accentSoft : T.panel,
            color: T.text,
            outline: 'none',
          }}
        >
          <option value="">— Unassigned —</option>
          {dealOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function CalendarView({
  calendar,
  records,
  dealOptions,
  canUpdate,
}: {
  calendar: CalendarBundle;
  records: AnyRecords;
  dealOptions: { id: string; name: string }[];
  canUpdate: boolean;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const recordList = (records ?? []) as unknown as AnyRecord[];
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date();

  const eventsByDay = useMemo(() => {
    const map: Record<string, AnyRecord[]> = {};
    for (const d of days) map[keyOf(d)] = [];
    for (const ev of recordList) {
      const s = eventDate(ev, calendar.start);
      if (!s) continue;
      if (unassignedOnly && linkedIds(ev, calendar.opportunity).length > 0) continue;
      const k = keyOf(s);
      if (map[k]) map[k].push(ev);
    }
    for (const k of Object.keys(map)) {
      map[k].sort(
        (a, b) =>
          (eventDate(a, calendar.start)?.getTime() ?? 0) -
          (eventDate(b, calendar.start)?.getTime() ?? 0)
      );
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordList, weekStart, unassignedOnly, calendar]);

  const weekLabel = `${weekStart.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })} – ${addDays(weekStart, 6).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;

  const navBtnStyle: React.CSSProperties = {
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    padding: '7px 12px',
    borderRadius: 8,
    border: `2px solid ${T.border}`,
    backgroundColor: T.panel,
    color: T.text,
  };

  if (!calendar.table) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: T.textMuted,
          fontSize: 14,
          textAlign: 'center',
          padding: 24,
        }}
      >
        Bind the Calendar table in the element's settings panel to use this view.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          style={navBtnStyle}
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(startOfWeek(new Date()))}
          style={{ ...navBtnStyle, backgroundColor: T.hint }}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          style={navBtnStyle}
        >
          ›
        </button>
        <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
          {weekLabel}
        </span>
        <label
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: T.text,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => setUnassignedOnly(e.target.checked)}
          />
          Unassigned only
        </label>
      </div>

      {/* Week grid */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
        }}
      >
        {days.map((d) => {
          const list = eventsByDay[keyOf(d)] ?? [];
          const isToday = sameDay(d, today);
          return (
            <div
              key={keyOf(d)}
              style={{
                flex: 1,
                minWidth: 150,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#eef4fb',
                border: `2px solid ${isToday ? T.accent : T.border}`,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '8px 10px',
                  borderBottom: `2px solid ${T.border}`,
                  backgroundColor: isToday ? T.hint : T.headerBar,
                  color: T.text,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                  {d.toLocaleDateString([], { weekday: 'short' })}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{d.getDate()}</div>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
                {list.length === 0 ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: T.textSubtle,
                      textAlign: 'center',
                      padding: '10px 0',
                    }}
                  >
                    —
                  </div>
                ) : (
                  list.map((ev) => (
                    <CalEventCard
                      key={ev.id}
                      calendar={calendar}
                      ev={ev}
                      dealOptions={dealOptions}
                      canUpdate={canUpdate}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function DealPodConsole() {
  const { customPropertyValueByKey, errorState } =
    useCustomProperties(getCustomProperties);
  const dealTeamTable = (customPropertyValueByKey.dealTeamTable ??
    null) as AnyTable;
  const briefSnapshotsTable = (customPropertyValueByKey.briefSnapshotsTable ??
    null) as AnyTable;
  const sourceRecordsTable = (customPropertyValueByKey.sourceRecordsTable ??
    null) as AnyTable;
  const dealsTable = (customPropertyValueByKey.dealsTable ?? null) as AnyTable;
  const calendarTable = (customPropertyValueByKey.calendarTable ??
    null) as AnyTable;

  const dealTeamRecords = useRecords(dealTeamTable ?? null);
  const briefSnapshotsRecords = useRecords(briefSnapshotsTable ?? null);
  const sourceRecordsRecords = useRecords(sourceRecordsTable ?? null);
  const dealsRecords = useRecords(dealsTable ?? null);
  const calendarRecords = useRecords(calendarTable ?? null);

  const [view, setView] = useState<'briefs' | 'review' | 'deals' | 'calendar'>(
    'deals'
  );

  // Calendar field bundle + events grouped by linked Opportunity (deal).
  const calendar = useMemo<CalendarBundle>(
    () => ({
      table: calendarTable,
      title: primaryField(calendarTable) ?? fieldByName(calendarTable, 'Title'),
      start: fieldByName(calendarTable, 'Start'),
      end: fieldByName(calendarTable, 'End'),
      allDay: fieldByName(calendarTable, 'All Day'),
      activityType: fieldByName(calendarTable, 'Activity Type'),
      logActivity: fieldByName(calendarTable, 'Log Activity'),
      opportunity: fieldByName(calendarTable, 'Opportunity'),
      location: fieldByName(calendarTable, 'Location'),
    }),
    [calendarTable]
  );

  const eventsByDeal = useMemo(() => {
    const map: Record<string, AnyRecord[]> = {};
    if (!calendar.table || !calendarRecords || !calendar.opportunity) return map;
    for (const ev of calendarRecords as unknown as AnyRecord[]) {
      for (const dealId of linkedIds(ev, calendar.opportunity)) {
        (map[dealId] ||= []).push(ev);
      }
    }
    for (const k of Object.keys(map)) {
      map[k].sort(
        (a, b) =>
          (eventDate(a, calendar.start)?.getTime() ?? 0) -
          (eventDate(b, calendar.start)?.getTime() ?? 0)
      );
    }
    return map;
  }, [calendar, calendarRecords]);

  const dealOptions = useMemo(() => {
    if (!dealsTable || !dealsRecords) return [];
    const p = primaryField(dealsTable);
    return (dealsRecords as unknown as AnyRecord[])
      .map((r) => ({ id: r.id, name: readStr(r, p) || '(Untitled)' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dealsTable, dealsRecords]);

  // Build briefs grouped by team-member record id. Linked-record cell values
  // can come back as either { id } objects or raw id strings, so normalize.
  const briefsByMember = useMemo(() => {
    const map: Record<string, BriefView[]> = {};
    if (!briefSnapshotsTable || !briefSnapshotsRecords) return map;

    const primary = primaryField(briefSnapshotsTable);
    const dateField = fieldByName(briefSnapshotsTable, 'Snapshot Date');
    const dealField = fieldByName(briefSnapshotsTable, 'Deal');
    const forMemberField = fieldByName(briefSnapshotsTable, 'For Team Member');
    const bodyFields = fieldsOf(briefSnapshotsTable).filter(
      (f) =>
        f.id !== primary?.id &&
        f.id !== dateField?.id &&
        String(f.type) !== 'multipleRecordLinks'
    );

    const idOf = (l: unknown): string =>
      typeof l === 'string' ? l : (l as { id?: string } | null)?.id ?? '';

    const viewOf = (snap: AnyRecord): BriefView => {
      const dateStr = dateField ? readStr(snap, dateField) : '';
      const dealStr = dealField ? readStr(snap, dealField) : '';
      return {
        id: snap.id,
        title: (primary ? readStr(snap, primary) : '') || dateStr || 'Brief',
        subtitle: [dateStr, dealStr].filter(Boolean).join('  ·  '),
        sortKey: String(dateField ? readRaw(snap, dateField) ?? '' : ''),
        sections: bodyFields
          .map((f) => ({ label: f.name, value: readStr(snap, f) }))
          .filter((s) => s.value),
      };
    };

    const snaps = briefSnapshotsRecords as unknown as AnyRecord[];
    const viewById: Record<string, BriefView> = {};
    for (const snap of snaps) viewById[snap.id] = viewOf(snap);

    const push = (memberId: string, view: BriefView | undefined) => {
      if (!memberId || !view) return;
      const arr = (map[memberId] ||= []);
      if (!arr.some((v) => v.id === view.id)) arr.push(view);
    };

    // Direction 1: Brief Snapshots → For Team Member.
    if (forMemberField) {
      for (const snap of snaps) {
        const linked = readRaw(snap, forMemberField);
        if (!Array.isArray(linked)) continue;
        for (const l of linked) push(idOf(l), viewById[snap.id]);
      }
    }

    // Direction 2: Deal Team → Brief Snapshots (inverse link) for robustness.
    const briefLinkOnTeam = dealTeamTable
      ? fieldByName(dealTeamTable, 'Brief Snapshots')
      : null;
    if (briefLinkOnTeam && dealTeamRecords) {
      for (const member of dealTeamRecords as unknown as AnyRecord[]) {
        const linked = readRaw(member, briefLinkOnTeam);
        if (!Array.isArray(linked)) continue;
        for (const l of linked) push(member.id, viewById[idOf(l)]);
      }
    }

    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    }
    return map;
  }, [briefSnapshotsTable, briefSnapshotsRecords, dealTeamTable, dealTeamRecords]);

  // Build briefs grouped by deal record id (for the Kanban deal modal).
  const briefsByDeal = useMemo(() => {
    const map: Record<string, BriefView[]> = {};
    if (!briefSnapshotsTable || !briefSnapshotsRecords) return map;

    const primary = primaryField(briefSnapshotsTable);
    const dateField = fieldByName(briefSnapshotsTable, 'Snapshot Date');
    const dealField = fieldByName(briefSnapshotsTable, 'Deal');
    const memberField = fieldByName(briefSnapshotsTable, 'For Team Member');
    const bodyFields = fieldsOf(briefSnapshotsTable).filter(
      (f) =>
        f.id !== primary?.id &&
        f.id !== dateField?.id &&
        String(f.type) !== 'multipleRecordLinks'
    );

    const viewOf = (snap: AnyRecord): BriefView => {
      const dateStr = dateField ? readStr(snap, dateField) : '';
      const memberStr = memberField ? readStr(snap, memberField) : '';
      return {
        id: snap.id,
        title: (primary ? readStr(snap, primary) : '') || dateStr || 'Brief',
        subtitle: [dateStr, memberStr].filter(Boolean).join('  ·  '),
        sortKey: String(dateField ? readRaw(snap, dateField) ?? '' : ''),
        sections: bodyFields
          .map((f) => ({ label: f.name, value: readStr(snap, f) }))
          .filter((s) => s.value),
      };
    };

    const snaps = briefSnapshotsRecords as unknown as AnyRecord[];
    if (dealField) {
      for (const snap of snaps) {
        const view = viewOf(snap);
        for (const dealId of linkedIds(snap, dealField)) {
          const arr = (map[dealId] ||= []);
          if (!arr.some((v) => v.id === view.id)) arr.push(view);
        }
      }
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    }
    return map;
  }, [briefSnapshotsTable, briefSnapshotsRecords]);

  // Build pod members (excluding the System Owner = current user / player).
  const members = useMemo((): Member[] => {
    if (!dealTeamTable || !dealTeamRecords) return [];
    const nameField = primaryField(dealTeamTable) ?? fieldByName(dealTeamTable, 'Name');
    const roleField = fieldByName(dealTeamTable, 'Role');
    const systemOwnerField = fieldByName(dealTeamTable, 'System Owner');

    return (dealTeamRecords as unknown as AnyRecord[])
      .filter((rec) => {
        if (!systemOwnerField) return true;
        return !readRaw(rec, systemOwnerField);
      })
      .map((rec) => ({
        id: rec.id,
        name: readStr(rec, nameField) || 'Unnamed',
        role: roleField ? readStr(rec, roleField) : '',
        briefs: briefsByMember[rec.id] ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dealTeamTable, dealTeamRecords, briefsByMember]);

  const loading = !dealTeamTable || !dealTeamRecords;

  const navBtn = (
    key: 'briefs' | 'review' | 'deals' | 'calendar',
    label: string
  ) => {
    const active = view === key;
    return (
      <button
        type="button"
        onClick={() => setView(key)}
        style={{
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 700,
          padding: '7px 16px',
          borderRadius: 8,
          border: `2px solid ${active ? T.border : 'transparent'}`,
          backgroundColor: active ? T.hint : 'transparent',
          color: active ? T.text : '#2c3e50',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: T.bg,
        fontFamily: FONT,
        color: T.text,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          flexShrink: 0,
          backgroundColor: T.headerBar,
          borderBottom: `2px solid ${T.border}`,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          height: 60,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: T.accent,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            D
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Deal Pod Console</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {navBtn('briefs', 'Team Briefs')}
          {navBtn('review', 'Source Review')}
          {navBtn('deals', 'Deals')}
          {navBtn('calendar', 'Calendar')}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, padding: 24, display: 'flex', flexDirection: 'column' }}>
        {errorState ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.textMuted,
              fontSize: 14,
              textAlign: 'center',
              padding: 24,
            }}
          >
            Open the element's settings panel and bind the Deal Team, Brief
            Snapshots, and Source Records tables.
          </div>
        ) : loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.textMuted,
              fontSize: 14,
            }}
          >
            Loading…
          </div>
        ) : view === 'briefs' ? (
          <TeamBriefsView members={members} />
        ) : view === 'review' ? (
          <SourceReviewView table={sourceRecordsTable} records={sourceRecordsRecords} />
        ) : view === 'calendar' ? (
          <CalendarView
            calendar={calendar}
            records={calendarRecords}
            dealOptions={dealOptions}
            canUpdate={canEdit(calendarTable)}
          />
        ) : (
          <KanbanView
            table={dealsTable}
            records={dealsRecords}
            members={members}
            briefsByDeal={briefsByDeal}
            calendar={calendar}
            eventsByDeal={eventsByDeal}
          />
        )}
      </div>
    </div>
  );
}

initializeBlock({ interface: () => <DealPodConsole /> });
