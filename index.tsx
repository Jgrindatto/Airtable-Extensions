import './style.css';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { initializeBlock, useBase, useRecords } from '@airtable/blocks/interface/ui';

/**
 * Gen-I Poké Mart inspired — cream diamond floor, white + teal desks, bold black ink UI
 */
const PK = {
  ink: '#101010',
  wall: '#b8c8d8',
  wallDeep: '#7890a8',
  sky: '#a0c0e8',
  skyDeep: '#6080c0',
  floorBase: '#f8f8f0',
  floorDark: '#e8e8d8',
  floorDiamondLine: 'rgba(16, 24, 32, 0.11)',
  deskTop: '#f8f8f8',
  deskFace: '#7898b8',
  deskFaceDark: '#506878',
  deskTrim: '#202830',
  deskRegister: '#d8f0ff',
  door: '#a8c8e8',
  doorSill: '#303848',
  shelfTop: '#f0f8f8',
  shelfMid: '#b8d8e8',
  shelfDeep: '#88b0c8',
  shelfAccent: '#e05858',
  dialogPaper: '#ffffff',
  dialogInner: '#f8fcff',
  dialogBorder: '#101010',
  text: '#101010',
  textMuted: '#485868',
  hint: '#f8e850',
  white: '#ffffff',
  pokeballRed: '#e83038',
  scanline: 'rgba(24, 32, 48, 0.06)',
} as const;

/** Tile grid — top-down, y grows downward */
const COLS = 18;
const ROWS = 13;
const TILE = 28;

/** Single-tile exit at bottom center */
const DOOR_X = Math.floor(COLS / 2);

/** Mart counter: clerk north of aisle, 3×2 slab directly south */
type DeskStation = {
  readonly clerk: { readonly x: number; readonly y: number };
  readonly slabs: readonly [number, number][];
};

/**
 * Cashier stations evenly spread along the back wall between the corner Poké-Ball
 * shelves. Clerks at y=1 (touching top wall); 3×2 counters extend south to y=2-3.
 * Customer aisle starts at y=4, leaving the full middle/lower room open.
 */
const ROOM_DESK_CLERKS: readonly [number, number][] = [
  [4, 1],
  [7, 1],
  [10, 1],
  [13, 1],
];

/**
 * Open floor tiles for pod members beyond the four counter clerks. Each tile is
 * unique so sprites never overlap (which would otherwise make the faced member
 * ambiguous). Spaced on odd columns so the player can weave between them, and
 * the Source Records terminal approach tile [3,7] is kept clear.
 */
const STANDEE_SPOTS: readonly [number, number][] = (() => {
  const out: [number, number][] = [];
  // Skip column 9 to keep the central exit aisle clear.
  const xs = [3, 5, 7, 11, 13];
  const ys = [5, 7, 9, 6, 8, 10];
  for (const y of ys) {
    for (const x of xs) {
      if (x === 3 && y === 7) continue;
      out.push([x, y]);
    }
  }
  return out;
})();

function slabsSouthOfClerk(cx: number, clerkY: number): [number, number][] {
  const out: [number, number][] = [];
  for (const dy of [1, 2] as const) {
    for (let dx = -1; dx <= 1; dx++)
      out.push([cx + dx, clerkY + dy]);
  }
  return out;
}

function deskStationsForNpcCount(count: number): DeskStation[] {
  const n = Math.min(Math.max(count, 0), ROOM_DESK_CLERKS.length);
  return ROOM_DESK_CLERKS.slice(0, n).map(([cx, cy]) => ({
    clerk: { x: cx, y: cy },
    slabs: slabsSouthOfClerk(cx, cy),
  }));
}

function deskSlabKeySet(stations: readonly DeskStation[]): Set<string> {
  const s = new Set<string>();
  for (const st of stations) {
    for (const [sx, sy] of st.slabs) s.add(keyXY(sx, sy));
  }
  return s;
}

function deskStationOwningTile(
  x: number,
  y: number,
  stations: readonly DeskStation[],
): DeskStation | undefined {
  return stations.find((st) => st.slabs.some(([sx, sy]) => sx === x && sy === y));
}

/** Floor props Ash cannot walk through */
const FURNITURE_TILES: readonly [number, number][] = [
  // Trash can wedged between the two east-wall terminals
  [15, 8],
  // Symmetric pair of plants in the front corners
  [3, 11],
  [14, 11],
  // Centered merchandise pedestal just inside the door
  [8, 11],
];

/**
 * Interactive Poké Computer stations along the east-wall interior.
 * Each station occupies two adjacent floor tiles (the PixelPokeComputer SVG
 * is ~2 tiles wide); all listed tiles are collision-blocked. Player faces any
 * tile in `tiles` to interact.
 */
type ComputerStationKey = 'events' | 'risky-deals' | 'source-records';

type ComputerStation = {
  readonly key: ComputerStationKey;
  readonly tiles: readonly [number, number][];
  /** Top-left tile of the visual DecorLayer footprint. */
  readonly anchor: { readonly x: number; readonly y: number };
  readonly wTiles: number;
  readonly label: string;
  readonly terminalTitle: string;
  readonly promptText: string;
  readonly tableId: string;
  readonly primaryFieldId: string;
  /** 1-2 fields shown as a single-line subtitle in the list view. */
  readonly subtitleFieldIds: readonly string[];
  /** Fields shown in the full record detail view (in order). */
  readonly detailFieldIds: readonly string[];
  /** Whether approaching + ENTER opens this terminal. */
  readonly interactive?: boolean;
};

const COMPUTER_STATIONS: readonly ComputerStation[] = [
  {
    key: 'events',
    tiles: [
      [15, 5],
      [16, 5],
    ],
    anchor: { x: 15, y: 5 },
    wTiles: 2,
    label: 'EVENTS',
    terminalTitle: 'EVENTS TERMINAL',
    promptText: 'Access event records?',
    interactive: false,
    tableId: 'tblj9MAQUn7dJkXSc',
    primaryFieldId: 'fldbfHTeezN3I9MlT',
    subtitleFieldIds: ['fld9SwwWKqXBgbYKY', 'flddoNIObYEKbiCZF'],
    detailFieldIds: [
      'fld9SwwWKqXBgbYKY',
      'fld4ApTVZVKR8TWuu',
      'fldsmprgVNejxLGrN',
      'flddoNIObYEKbiCZF',
      'fldAgqyUFNRxyku9h',
      'fldW5zwO7KNvRcmrY',
      'fldtn956UiytU6I3a',
    ],
  },
  {
    key: 'risky-deals',
    tiles: [
      [15, 10],
      [16, 10],
    ],
    anchor: { x: 15, y: 10 },
    wTiles: 2,
    label: 'RISKY DEALS',
    terminalTitle: 'RISKY DEALS TERMINAL',
    promptText: 'Access deal records?',
    interactive: false,
    tableId: 'tbl3zFP1BTUFbfxJz',
    primaryFieldId: 'fldqZPIPatVhrRxkE',
    subtitleFieldIds: ['fldtivLo1qgbpu029', 'fldnk9eWpRZjBL3N3'],
    detailFieldIds: [
      'fldtivLo1qgbpu029',
      'fldnk9eWpRZjBL3N3',
      'fld5NQHfP4rxmYEF3',
      'fldD8kNNnWJa2saf7',
      'fldQOutlqNyrpf4jN',
      'fldA3V8IZkn8eTG6z',
      'fldW7bZO5FIQPBHm2',
      'fldVsJDF81iqq8Idp',
      'fldhPyh7TPuXaoawN',
    ],
  },
  {
    key: 'source-records',
    tiles: [
      [1, 7],
      [2, 7],
    ],
    anchor: { x: 1, y: 7 },
    wTiles: 2,
    label: 'SOURCE RECORDS',
    terminalTitle: 'SOURCE RECORDS TERMINAL',
    promptText: 'Review source records?',
    interactive: true,
    tableId: 'tblSV1PcX8QizC5da',
    primaryFieldId: '',
    subtitleFieldIds: [],
    detailFieldIds: [],
  },
];

function computerStationAtTile(x: number, y: number): ComputerStation | null {
  for (const s of COMPUTER_STATIONS) {
    for (const [tx, ty] of s.tiles) {
      if (tx === x && ty === y) return s;
    }
  }
  return null;
}

/** Bezel inset around TileLayer (matches JSX padding on bezel div). */
const BEZEL_PAD = 6;

type Direction = 'up' | 'down' | 'left' | 'right';

const DIR_VEC: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

function keyXY(x: number, y: number) {
  return `${x},${y}`;
}

/** Single tag above sprites: first given name (“Jane Doe” → “Jane”; “Doe, Jane” → “Jane”). */
function labelFirstName(raw: string): string {
  const t = raw.trim();
  if (!t) return '—';
  if (/,/.test(t)) {
    const bits = t.split(',').map((s) => s.trim()).filter(Boolean);
    const tail = bits.slice(1).join(', ').trim();
    const pick = tail || bits[0] || t;
    return pick.split(/\s+/)[0] ?? pick;
  }
  return t.split(/\s+/)[0] ?? t;
}

type GameNpc = {
  recordId: string;
  name: string;
  x: number;
  y: number;
};

/** In-progress slide from one tile to another (fractional screen position lerps fx→tx). */
type PlayerMotion = {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  /** performance.now() at move start */
  start: number;
};

/** Tweens Ash between tile centers (~8px/tile-ish feel at TILE=28). */
const MOVE_GRID_MS = 135;

function smoothstep01(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
}

function buildBlockedCells(npcs: GameNpc[]): Set<string> {
  const blocked = new Set<string>();
  const add = (x: number, y: number) => blocked.add(keyXY(x, y));

  for (let x = 0; x < COLS; x++) add(x, 0);

  for (let x = 0; x < COLS; x++) {
    if (x !== DOOR_X) add(x, ROWS - 1);
  }

  for (let y = 0; y < ROWS; y++) {
    add(0, y);
    add(COLS - 1, y);
  }

  for (const [sx, sy] of [
    [1, 1],
    [2, 1],
    [1, 2],
    [2, 2],
    [COLS - 2, 1],
    [COLS - 3, 1],
    [COLS - 2, 2],
    [COLS - 3, 2],
  ] as const) {
    add(sx, sy);
  }

  const deskTiles = deskSlabKeySet(deskStationsForNpcCount(npcs.length));
  for (const dk of deskTiles) blocked.add(dk);

  for (const npc of npcs) add(npc.x, npc.y);
  for (const [fx, fy] of FURNITURE_TILES) add(fx, fy);
  for (const station of COMPUTER_STATIONS) {
    for (const [tx, ty] of station.tiles) add(tx, ty);
  }
  return blocked;
}

function facingCell(px: number, py: number, dir: Direction) {
  const { dx, dy } = DIR_VEC[dir];
  return { x: px + dx, y: py + dy };
}

/**
 * Game Boy overworld — thick black silhouette, four gray ramps.
 * '#' outline, '.' empty, '1' dark, '2' mid, '3' highlight/skin.
 */
const GB_GRAY = ['#17181a', '#4a5158', '#8e959c', '#e4e8ec'] as const;

/** Pure Gen-I 4-tone grayscale palette */
const GB_SPRITE_PX: Record<string, string> = {
  '#': GB_GRAY[0],
  '1': GB_GRAY[1],
  '2': GB_GRAY[2],
  '3': GB_GRAY[3],
};

function gbBits(rows: readonly string[]): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  let idx = 0;
  rows.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      const fill = GB_SPRITE_PX[ch];
      if (fill === undefined) return;
      out.push(
        <rect
          key={idx++}
          x={x}
          y={y}
          width={1}
          height={1}
          fill={fill}
        />
      );
    })
  );
  return out;
}

/**
 * Pokémon Red overworld sprites (grayscale ramps # / 1 / 2 / 3 only).
 * Decoded from pret/pokered `gfx/sprites/red.png`: StandingDown slab 0×16 +
 * WalkingDown 16×16; StandingBack = 8×8 tiles (5,4,7,6) TL/TR/BL/BR;
 * StandingWest 32×16 + WalkingWest 80×16. Horizontally mirrored for facing east.
 *
 * Pokémon is © Nintendo/Creatures/Game Freak — community uses these assets for fidelity.
 */
const ASH_SOUTH_F0 = [
  '.....######.....',
  '....#111111#....',
  '...#11111111#...',
  '...#11111111#...',
  '..###122221###..',
  '..##2######2##..',
  '.#2#22222222#2#.',
  '.#2222#22#2222#.',
  '..##22#22#22##..',
  '..###221122###..',
  '.#22########22#.',
  '.#22########22#.',
  '..###11##11###..',
  '...#1##11##1#...',
  '...#111##111#...',
  '....###..###....',
] as const;

/** WalkingDown — strip at y=48 of red.png */
const ASH_SOUTH_F1 = [
  '................',
  '.....######.....',
  '....#111111#....',
  '...#11111111#...',
  '...#11111111#...',
  '..###122221###..',
  '..############..',
  '.#2#22222222#2#.',
  '.#2222#22#2222#.',
  '.###22#22#22##..',
  '.#2##221122#1#..',
  '..##########2#..',
  '...##1####22##..',
  '....###11#22#...',
  '....#11##.##....',
  '.....###........',
] as const;

/** Facing north (back to camera): StandingUp strip at y=16 — single 16×16 figure, not split */
const ASH_NORTH_F0 = [
  '.....######.....',
  '....#111111#....',
  '...#11111111#...',
  '...#11111111#...',
  '..##11111111##..',
  '..###111111###..',
  '.#2##########2#.',
  '.#22########22#.',
  '..##22####22##..',
  '..####1111####..',
  '.#2##1####1##2#.',
  '.#2##112211##2#.',
  '..####1111####..',
  '...#1######1#...',
  '...#111##111#...',
  '....###..###....',
] as const;

/** WalkingUp — strip at y=64 of red.png */
const ASH_NORTH_F1 = [
  '................',
  '.....######.....',
  '....#111111#....',
  '...#11111111#...',
  '...#11111111#...',
  '..##11111111##..',
  '..###111111###..',
  '.#2##########2#.',
  '.#22########22#.',
  '.###22####22##..',
  '.#2###1111####..',
  '..###1####1#22#.',
  '...##112211#22#.',
  '....##1111####..',
  '....#1####......',
  '.....###........',
] as const;

/** Facing west — mirror for facing east (`scaleX(-1)`), identical to OG hardware. */
const ASH_WEST_F0 = [
  '.....######.....',
  '....#111111#....',
  '...#11111111#...',
  '..##21111111#...',
  '.#222211111###..',
  '..##111#######..',
  '...#2#22######..',
  '...#2#22#22##...',
  '...#2222222#....',
  '....#1222##1#...',
  '.....#####11#...',
  '......##22#1#...',
  '......##22#1#...',
  '.....#11####....',
  '.....#1111#.....',
  '......####......',
] as const;

const ASH_WEST_F1 = [
  '................',
  '.....######.....',
  '....#111111#....',
  '...#11111111#...',
  '..##21111111#...',
  '.#222211111###..',
  '..##111#######..',
  '...#2#22######..',
  '...#2#22#22##...',
  '...#2222222#....',
  '....#1222##1#...',
  '.....######1#...',
  '...######22##...',
  '..#11#11#22#1#..',
  '...#11#####11#..',
  '....###....##...',
] as const;

/**
 * Original AE clerk sprites — six distinct silhouettes, same Gen-I 4-tone
 * grayscale rendering conventions as Ash (# outline, 1 dark, 2 mid, 3 highlight).
 * F1 alternates legs for a subtle step animation.
 */

/** 1) CAP & APRON — rounded cap with brim band, apron front */
const AE_CAP_APRON_F0 = [
  '.....######.....',
  '....##2222##....',
  '...##222222##...',
  '..############..',
  '..##2######2##..',
  '.#2#22222222#2#.',
  '.#2222#22#2222#.',
  '..##22#22#22##..',
  '..##22####22##..',
  '..###111111###..',
  '.#11########11#.',
  '.#11##2222##11#.',
  '..###11##11###..',
  '...#1##11##1#...',
  '...#111##111#...',
  '....###..###....',
] as const;

const AE_CAP_APRON_F1 = [
  '.....######.....',
  '....##2222##....',
  '...##222222##...',
  '..############..',
  '..##2######2##..',
  '.#2#22222222#2#.',
  '.#2222#22#2222#.',
  '..##22#22#22##..',
  '..##22####22##..',
  '..###111111###..',
  '.#11########11#.',
  '.#11##2222##11#.',
  '..###11##11###..',
  '...###1##1###...',
  '....##....##....',
  '....##....##....',
] as const;

/** 2) SPIKE PUNK — tall pointed hair, dark sweater */
const AE_SPIKE_PUNK_F0 = [
  '....#.#.#.#.....',
  '....########....',
  '...##########...',
  '...##111111##...',
  '..###111111###..',
  '..##2######2##..',
  '.#2#22222222#2#.',
  '.#2222#22#2222#.',
  '..##22####22##..',
  '..###221122###..',
  '.#11########11#.',
  '.#11########11#.',
  '..###11##11###..',
  '...#1##11##1#...',
  '...#111##111#...',
  '....###..###....',
] as const;

const AE_SPIKE_PUNK_F1 = [
  '....#.#.#.#.....',
  '....########....',
  '...##########...',
  '...##111111##...',
  '..###111111###..',
  '..##2######2##..',
  '.#2#22222222#2#.',
  '.#2222#22#2222#.',
  '..##22####22##..',
  '..###221122###..',
  '.#11########11#.',
  '.#11########11#.',
  '..###11##11###..',
  '...###1##1###...',
  '....##....##....',
  '....##....##....',
] as const;

/** 3) TOPKNOT — small bun above the head, lighter top */
const AE_TOPKNOT_F0 = [
  '......####......',
  '.....######.....',
  '....##1111##....',
  '...##111111##...',
  '..###222222###..',
  '..##2######2##..',
  '.#2#22222222#2#.',
  '.#2222#22#2222#.',
  '..##22####22##..',
  '..###111111###..',
  '.#22########22#.',
  '.#22##2222##22#.',
  '..###11##11###..',
  '...#1##11##1#...',
  '...#111##111#...',
  '....###..###....',
] as const;

const AE_TOPKNOT_F1 = [
  '......####......',
  '.....######.....',
  '....##1111##....',
  '...##111111##...',
  '..###222222###..',
  '..##2######2##..',
  '.#2#22222222#2#.',
  '.#2222#22#2222#.',
  '..##22####22##..',
  '..###111111###..',
  '.#22########22#.',
  '.#22##2222##22#.',
  '..###11##11###..',
  '...###1##1###...',
  '....##....##....',
  '....##....##....',
] as const;

/** 4) NERD GLASSES — combover hair, framed eyes, lab coat */
const AE_NERD_GLASSES_F0 = [
  '.....######.....',
  '....########....',
  '...##111##11#...',
  '...#11111111#...',
  '..###111111###..',
  '..##2######2##..',
  '.#2##22##22##2#.',
  '.#2222#22#2222#.',
  '..##22####22##..',
  '..############..',
  '.#11########11#.',
  '.#11##2222##11#.',
  '..#####22#####..',
  '...#1##11##1#...',
  '...#111##111#...',
  '....###..###....',
] as const;

const AE_NERD_GLASSES_F1 = [
  '.....######.....',
  '....########....',
  '...##111##11#...',
  '...#11111111#...',
  '..###111111###..',
  '..##2######2##..',
  '.#2##22##22##2#.',
  '.#2222#22#2222#.',
  '..##22####22##..',
  '..############..',
  '.#11########11#.',
  '.#11##2222##11#.',
  '..#####22#####..',
  '...###1##1###...',
  '....##....##....',
  '....##....##....',
] as const;

/** 5) BERET — wide soft cap, sash collar */
const AE_BERET_F0 = [
  '....########....',
  '..############..',
  '....########....',
  '...##111111##...',
  '..###222222###..',
  '..##2######2##..',
  '.#2#22222222#2#.',
  '.#2222#22#2222#.',
  '..##22####22##..',
  '..############..',
  '.#22########22#.',
  '.#22########22#.',
  '..###11##11###..',
  '...#1##11##1#...',
  '...#111##111#...',
  '....###..###....',
] as const;

const AE_BERET_F1 = [
  '....########....',
  '..############..',
  '....########....',
  '...##111111##...',
  '..###222222###..',
  '..##2######2##..',
  '.#2#22222222#2#.',
  '.#2222#22#2222#.',
  '..##22####22##..',
  '..############..',
  '.#22########22#.',
  '.#22########22#.',
  '..###11##11###..',
  '...###1##1###...',
  '....##....##....',
  '....##....##....',
] as const;

/** 6) BROAD VEST — bald, broader shoulders, belted vest */
const AE_BROAD_VEST_F0 = [
  '.....######.....',
  '....#222222#....',
  '...#22222222#...',
  '...#22222222#...',
  '..###222222###..',
  '..##2######2##..',
  '.#2#22222222#2#.',
  '.#2222#22#2222#.',
  '..##22####22##..',
  '..############..',
  '.##11######11##.',
  '.##11######11##.',
  '..############..',
  '...#1##11##1#...',
  '...#111##111#...',
  '....###..###....',
] as const;

const AE_BROAD_VEST_F1 = [
  '.....######.....',
  '....#222222#....',
  '...#22222222#...',
  '...#22222222#...',
  '..###222222###..',
  '..##2######2##..',
  '.#2#22222222#2#.',
  '.#2222#22#2222#.',
  '..##22####22##..',
  '..############..',
  '.##11######11##.',
  '.##11######11##.',
  '..############..',
  '...###1##1###...',
  '....##....##....',
  '....##....##....',
] as const;

/** Six distinct clerks cycling by record index (%). */
const AE_VARIANT_FRAMES = [
  { stand: AE_CAP_APRON_F0, step: AE_CAP_APRON_F1 },
  { stand: AE_SPIKE_PUNK_F0, step: AE_SPIKE_PUNK_F1 },
  { stand: AE_TOPKNOT_F0, step: AE_TOPKNOT_F1 },
  { stand: AE_NERD_GLASSES_F0, step: AE_NERD_GLASSES_F1 },
  { stand: AE_BERET_F0, step: AE_BERET_F1 },
  { stand: AE_BROAD_VEST_F0, step: AE_BROAD_VEST_F1 },
] as const;

function npcRows(variantIndex: number, frame: 0 | 1): readonly string[] {
  const pair = AE_VARIANT_FRAMES[variantIndex % AE_VARIANT_FRAMES.length];
  return frame === 0 ? pair.stand : pair.step;
}

function ashRowsForFacing(frame: 0 | 1, dir: Direction): readonly string[] {
  switch (dir) {
    case 'down':
      return frame === 0 ? ASH_SOUTH_F0 : ASH_SOUTH_F1;
    case 'up':
      return frame === 0 ? ASH_NORTH_F0 : ASH_NORTH_F1;
    case 'left':
    case 'right':
      return frame === 0 ? ASH_WEST_F0 : ASH_WEST_F1;
  }
}

function AshSpriteDraw({ frame, dir }: { frame: 0 | 1; dir: Direction }) {
  const rows = ashRowsForFacing(frame, dir);
  const flipX = dir === 'right';
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      style={{
        imageRendering: 'pixelated',
        ...(flipX
          ? { transform: 'scaleX(-1)', transformOrigin: '50% 50%' }
          : {}),
      }}
    >
      {gbBits(rows)}
    </svg>
  );
}

function NpcGbSprite({ variant, frame }: { variant: number; frame?: 0 | 1 }) {
  const rows = npcRows(variant, frame ?? 0);
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated' }}
    >
      {gbBits(rows)}
    </svg>
  );
}

function PokeShelfDecor() {
  return (
    <svg
      className="absolute inset-1"
      viewBox="0 0 12 12"
      style={{ opacity: 0.95 }}
    >
      <circle
        cx="6"
        cy="6"
        r="4"
        fill={PK.white}
        stroke={PK.ink}
        strokeWidth="1"
      />
      <path d="M6 2 V10" stroke={PK.ink} strokeWidth="1" />
      <path
        d="M2 6 Q6 2 10 6"
        fill="none"
        stroke={PK.shelfAccent}
        strokeWidth="1.3"
      />
      <path d="M2 6 H10" stroke={PK.ink} strokeWidth="1" />
      <circle cx="6" cy="4.8" r="1.2" fill={PK.ink} />
    </svg>
  );
}

function WallPosterDecor() {
  return (
    <svg
      className="absolute inset-0.5"
      viewBox="0 0 20 16"
      preserveAspectRatio="xMidYMid meet"
      style={{ imageRendering: 'pixelated' }}
    >
      <rect x="2" y="1" width="16" height="14" fill="#d8c8a8" stroke={PK.ink} strokeWidth="1" />
      <rect x="4" y="3" width="12" height="9" fill={PK.shelfMid} />
      <circle cx="10" cy="7.5" r="3.5" fill={PK.white} stroke={PK.ink} strokeWidth="0.8" />
      <path d="M6.5 7.5 H13.5" stroke={PK.ink} strokeWidth="0.8" />
      <circle cx="10" cy="6.3" r="1" fill={PK.shelfAccent} />
    </svg>
  );
}

function PixelPlant() {
  return (
    <svg
      width={22}
      height={26}
      viewBox="0 0 11 13"
      shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Clay pot rim */}
      <rect x="2.4" y="8" width="6.2" height="0.9" fill="#a85838" stroke={PK.ink} strokeWidth="0.4" />
      {/* Pot body */}
      <path
        d="M 3 8.9 L 8 8.9 L 7.6 12.2 L 3.4 12.2 Z"
        fill="#7a3818"
        stroke={PK.ink}
        strokeWidth="0.4"
      />
      <path d="M 3.3 9.4 L 7.7 9.4 L 7.55 10 L 3.45 10 Z" fill="#a85838" opacity="0.55" />
      {/* Soil */}
      <rect x="2.6" y="7.6" width="5.8" height="0.6" fill="#3a1e10" />
      {/* Foliage clumps */}
      <ellipse cx="5.5" cy="5" rx="3.8" ry="3.4" fill="#1c5028" stroke={PK.ink} strokeWidth="0.5" />
      <ellipse cx="3.5" cy="4.2" rx="1.6" ry="2" fill="#1c5028" stroke={PK.ink} strokeWidth="0.4" />
      <ellipse cx="7.5" cy="4.2" rx="1.6" ry="2" fill="#1c5028" stroke={PK.ink} strokeWidth="0.4" />
      <ellipse cx="5.5" cy="2.6" rx="1.6" ry="1.9" fill="#1c5028" stroke={PK.ink} strokeWidth="0.4" />
      {/* Lighter highlights */}
      <ellipse cx="4.4" cy="4.2" rx="0.8" ry="1.1" fill="#3a8848" />
      <ellipse cx="6.7" cy="4.5" rx="0.7" ry="1" fill="#3a8848" />
      <ellipse cx="5.5" cy="5.8" rx="1" ry="0.8" fill="#3a8848" />
      <ellipse cx="5.2" cy="3.5" rx="0.45" ry="0.6" fill="#60b070" />
    </svg>
  );
}

function PixelPokeComputer() {
  return (
    <svg
      width={52}
      height={28}
      viewBox="0 0 26 14"
      shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Wooden desk */}
      <rect x="0" y="10.5" width="26" height="3.5" fill="#a87850" stroke={PK.ink} strokeWidth="0.6" />
      <rect x="0" y="12.4" width="26" height="1.6" fill="#704830" />
      <rect x="0" y="13.6" width="26" height="0.4" fill="#3a1e10" />
      {/* Desk grain */}
      <rect x="2" y="11.2" width="6" height="0.2" fill="#8a5e3a" opacity="0.7" />
      <rect x="14" y="11.2" width="8" height="0.2" fill="#8a5e3a" opacity="0.7" />
      {/* Monitor / PC casing */}
      <rect x="3" y="1" width="20" height="10" fill="#f0e8d8" stroke={PK.ink} strokeWidth="0.6" />
      {/* Casing top ridge */}
      <rect x="3" y="2.4" width="20" height="0.35" fill={PK.ink} />
      {/* Screen frame */}
      <rect x="5" y="3.4" width="16" height="6" fill={PK.ink} />
      {/* Screen glow */}
      <rect x="5.7" y="4.1" width="14.6" height="4.6" fill="#1c4848" />
      {/* Scan-line text */}
      <rect x="6.3" y="4.6" width="6" height="0.35" fill="#60d0c0" />
      <rect x="6.3" y="5.4" width="10" height="0.35" fill="#60d0c0" />
      <rect x="6.3" y="6.2" width="4" height="0.35" fill="#60d0c0" />
      <rect x="6.3" y="7" width="8" height="0.35" fill="#60d0c0" />
      <rect x="6.3" y="7.8" width="5" height="0.35" fill="#60d0c0" />
      {/* Cursor block */}
      <rect x="12.3" y="7.8" width="0.7" height="0.45" fill="#a0f0d8" />
      {/* Vent slits along bottom of casing */}
      <rect x="5.2" y="10" width="2" height="0.35" fill="#888070" />
      <rect x="8" y="10" width="2" height="0.35" fill="#888070" />
      <rect x="10.8" y="10" width="2" height="0.35" fill="#888070" />
      <rect x="13.6" y="10" width="2" height="0.35" fill="#888070" />
      <rect x="16.4" y="10" width="2" height="0.35" fill="#888070" />
      <rect x="19.2" y="10" width="2" height="0.35" fill="#888070" />
      {/* Power LED */}
      <circle cx="21.5" cy="2.05" r="0.45" fill="#e84040" stroke={PK.ink} strokeWidth="0.2" />
      {/* Brand stripe */}
      <rect x="5" y="2.9" width="3" height="0.25" fill="#c0b8a0" />
    </svg>
  );
}

function PixelTrashCan() {
  return (
    <svg
      width={18}
      height={22}
      viewBox="0 0 9 11"
      shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Lid knob */}
      <rect x="4.1" y="0.4" width="0.8" height="0.6" fill="#383848" stroke={PK.ink} strokeWidth="0.3" />
      {/* Lid */}
      <rect x="1.4" y="1" width="6.2" height="1.2" fill="#383848" stroke={PK.ink} strokeWidth="0.4" />
      <rect x="1.4" y="1.85" width="6.2" height="0.35" fill="#181828" />
      {/* Body */}
      <rect x="1.8" y="2.4" width="5.4" height="7.6" fill="#9098a8" stroke={PK.ink} strokeWidth="0.45" />
      {/* Body bands */}
      <rect x="1.8" y="4" width="5.4" height="0.35" fill="#404858" />
      <rect x="1.8" y="6.6" width="5.4" height="0.35" fill="#404858" />
      <rect x="1.8" y="9.3" width="5.4" height="0.35" fill="#404858" />
      {/* Vertical highlight */}
      <rect x="2.2" y="2.8" width="0.45" height="6.7" fill="#c8d0e0" />
      {/* Base shadow */}
      <rect x="1.8" y="9.65" width="5.4" height="0.35" fill="#3a4252" />
    </svg>
  );
}

function PixelDisplayTable() {
  return (
    <svg
      width={24}
      height={22}
      viewBox="0 0 12 11"
      shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Top rim */}
      <rect x="1.4" y="6.3" width="9.2" height="0.9" fill="#704830" stroke={PK.ink} strokeWidth="0.4" />
      {/* Pedestal */}
      <rect x="2" y="7.1" width="8" height="3" fill="#a87850" stroke={PK.ink} strokeWidth="0.4" />
      <rect x="2" y="8.5" width="8" height="1.5" fill="#704830" />
      <rect x="2" y="9.6" width="8" height="0.4" fill="#3a1e10" />
      {/* Pokeball */}
      <circle cx="6" cy="3.6" r="2.5" fill={PK.white} stroke={PK.ink} strokeWidth="0.55" />
      <path
        d="M 3.5 3.6 A 2.5 2.5 0 0 1 8.5 3.6 Z"
        fill={PK.shelfAccent}
        stroke={PK.ink}
        strokeWidth="0.55"
      />
      <line x1="3.5" y1="3.6" x2="8.5" y2="3.6" stroke={PK.ink} strokeWidth="0.5" />
      <circle cx="6" cy="3.6" r="0.7" fill={PK.white} stroke={PK.ink} strokeWidth="0.5" />
      <circle cx="6" cy="3.6" r="0.3" fill={PK.ink} />
      {/* Highlights */}
      <ellipse cx="5" cy="2.3" rx="0.55" ry="0.3" fill="#ffb0b0" />
      <ellipse cx="5" cy="4.6" rx="0.6" ry="0.35" fill="#f0f0f0" />
    </svg>
  );
}

function WallClockDecor() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  // Continuous angles so the hour hand drifts naturally between marks.
  const minuteAngle = minutes * 6;
  const hourAngle = hours * 30 + minutes * 0.5;

  return (
    <svg
      className="absolute inset-1"
      viewBox="0 0 10 10"
      style={{ imageRendering: 'pixelated' }}
    >
      <circle cx="5" cy="5" r="4" fill="#f8f8f8" stroke={PK.ink} strokeWidth="0.6" />
      <line
        x1="5"
        y1="5"
        x2="5"
        y2="2.5"
        stroke={PK.ink}
        strokeWidth="0.5"
        transform={`rotate(${minuteAngle} 5 5)`}
      />
      <line
        x1="5"
        y1="5"
        x2="5"
        y2="3.5"
        stroke={PK.ink}
        strokeWidth="0.4"
        transform={`rotate(${hourAngle} 5 5)`}
      />
      <circle cx="5" cy="5" r="0.4" fill={PK.shelfAccent} />
    </svg>
  );
}

function DecorLayer({
  left,
  top,
  wTiles,
  hTiles,
  children,
}: {
  left: number;
  top: number;
  wTiles: number;
  hTiles: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="absolute flex items-end justify-center pointer-events-none"
      style={{
        left: left * TILE,
        top: top * TILE,
        width: wTiles * TILE,
        height: hTiles * TILE,
      }}
    >
      {children}
    </div>
  );
}

function MartDeskIslandGroup({ deskStations }: { deskStations: readonly DeskStation[] }) {
  return (
    <>
      {deskStations.map((st) => {
        const slabTop = Math.min(...st.slabs.map(([, sy]) => sy));
        return (
          <React.Fragment key={`island-${st.clerk.x}-${st.clerk.y}`}>
            <DecorLayer
              left={st.clerk.x - 1}
              top={slabTop}
              wTiles={3}
              hTiles={2}
            >
              <svg
                width={3 * TILE - 4}
                height={2 * TILE - 4}
                viewBox="0 0 81 53"
                style={{ imageRendering: 'pixelated' }}
              >
                <rect
                  x="4"
                  y="3"
                  width="73"
                  height="21"
                  fill={PK.deskTop}
                  stroke={PK.ink}
                  strokeWidth="3"
                />
                <rect
                  x="6"
                  y="6"
                  width="69"
                  height="4"
                  fill={PK.deskFace}
                  opacity={0.55}
                />
                <rect
                  x="4"
                  y="24"
                  width="73"
                  height="26"
                  fill={PK.deskFace}
                  stroke={PK.ink}
                  strokeWidth="3"
                />
                <rect x="10" y="10" width="18" height="10" rx="1" fill={PK.deskRegister} stroke={PK.ink} strokeWidth="2" />
                <rect x="54" y="12" width="14" height="6" rx="1" fill={PK.deskRegister} stroke={PK.ink} strokeWidth="2" />
                <path
                  d="M14 42 H67"
                  stroke={PK.deskFaceDark}
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
              </svg>
            </DecorLayer>
          </React.Fragment>
        );
      })}
    </>
  );
}

function RoomDecorations({ deskStations }: { deskStations: readonly DeskStation[] }) {
  return (
    <>
      <MartDeskIslandGroup deskStations={deskStations} />
      {/* Symmetric plants in the front corners */}
      <DecorLayer left={3} top={11} wTiles={1} hTiles={1}>
        <PixelPlant />
      </DecorLayer>
      <DecorLayer left={14} top={11} wTiles={1} hTiles={1}>
        <PixelPlant />
      </DecorLayer>
      {/* Featured merchandise pedestal beside the exit */}
      <DecorLayer left={8} top={11} wTiles={1} hTiles={1}>
        <PixelDisplayTable />
      </DecorLayer>
      {/* Trash can between the two east-wall terminals */}
      <DecorLayer left={15} top={8} wTiles={1} hTiles={1}>
        <PixelTrashCan />
      </DecorLayer>
    </>
  );
}

function TileLayer({ deskStations }: { deskStations: readonly DeskStation[] }) {
  const tiles: React.ReactElement[] = [];
  const dm = `${Math.floor(TILE / 3)}px`;
  const floorDiamond: React.CSSProperties = {
    backgroundImage: `
      linear-gradient(45deg, ${PK.floorDiamondLine} 43%, transparent 43%, transparent 57%, ${PK.floorDiamondLine} 57%),
      linear-gradient(-45deg, ${PK.floorDiamondLine} 43%, transparent 43%, transparent 57%, ${PK.floorDiamondLine} 57%)
    `,
    backgroundSize: `${dm} ${dm}`,
  };

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const k = keyXY(x, y);
      const floorAlt = (x + y) % 2 === 0;
      let bg: string = floorAlt ? PK.floorBase : PK.floorDark;
      let decoration: React.ReactNode = null;

      const isTopWall = y === 0;
      const isLeftWall = x === 0;
      const isRightWall = x === COLS - 1;
      const isBottomWall = y === ROWS - 1 && x !== DOOR_X;
      const isDoorTile = y === ROWS - 1 && x === DOOR_X;
      const shelfCorner =
        ([1, 2].includes(x) && [1, 2].includes(y)) ||
        ([COLS - 2, COLS - 3].includes(x) && [1, 2].includes(y));

      const deskStation = deskStationOwningTile(x, y, deskStations);
      const slabTopY =
        deskStation === undefined ? undefined : Math.min(...deskStation.slabs.map(([, sy]) => sy));

      let tileStyle: React.CSSProperties = {
        width: TILE,
        height: TILE,
        boxSizing: 'border-box',
        boxShadow: `inset 0 0 0 1px rgba(26,38,54,0.13)`,
        backgroundColor: bg,
      };

      if (isTopWall || isLeftWall || isRightWall || isBottomWall) {
        bg = PK.wallDeep;
      } else if (isDoorTile) {
        bg = PK.door;
        decoration = (
          <div
            className="absolute inset-0 flex items-end justify-center pb-0.5"
            style={{
              borderTop: `5px solid ${PK.doorSill}`,
              boxShadow: `inset 0 0 0 2px ${PK.wallDeep}`,
              color: PK.white,
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '5px',
              lineHeight: 1,
              textShadow: `1px 1px 0 ${PK.ink}`,
            }}
          >
            EXIT
          </div>
        );
      } else if (deskStation !== undefined && slabTopY !== undefined) {
        const isTopSlabRow = y === slabTopY;
        bg = isTopSlabRow ? PK.deskTop : PK.deskFace;
        decoration =
          isTopSlabRow ? (
            <>
              <div
                className="absolute left-0 right-0 top-0 pointer-events-none"
                style={{
                  height: '5px',
                  backgroundColor: PK.deskFaceDark,
                  opacity: 0.38,
                }}
              />
              {x === deskStation.clerk.x ? (
                <div
                  className="absolute left-[18%] right-[18%] top-1 pointer-events-none"
                  style={{
                    height: '5px',
                    backgroundColor: PK.deskTrim,
                    opacity: 0.22,
                  }}
                />
              ) : null}
            </>
          ) : (
            <div
              className="pointer-events-none absolute inset-x-2 top-2 bottom-2"
              style={{
                backgroundImage: `linear-gradient(${PK.deskFaceDark}aa 38%, transparent 38%)`,
                backgroundSize: '100% 5px',
                opacity: 0.85,
              }}
            />
          );
      } else if (shelfCorner) {
        bg = y === 1 ? PK.shelfTop : PK.shelfDeep;
        decoration = <PokeShelfDecor />;
      }

      if (isTopWall && (x === 5 || x === 12)) {
        decoration = (
          <>
            {decoration}
            <WallPosterDecor />
          </>
        );
      }
      if (isTopWall && x === DOOR_X) {
        decoration = (
          <>
            {decoration}
            <WallClockDecor />
          </>
        );
      }
      if (y === ROWS - 2 && x === DOOR_X && !isTopWall && !isDoorTile) {
        decoration = (
          <>
            {decoration}
            <div
              className="absolute inset-2 rounded-sm"
              style={{
                border: `2px dashed ${PK.ink}`,
                opacity: 0.42,
                boxSizing: 'border-box',
              }}
            />
          </>
        );
      }

      tileStyle.backgroundColor = bg;

      const isFloorDiamond =
        !isTopWall &&
        !isLeftWall &&
        !isRightWall &&
        !isBottomWall &&
        !isDoorTile &&
        !shelfCorner &&
        deskStation === undefined;

      if (isFloorDiamond) tileStyle = { ...tileStyle, ...floorDiamond };

      tiles.push(
        <div key={k} className="relative" style={tileStyle}>
          {decoration}
        </div>
      );
    }
  }
  return (
    <div
      className="absolute left-0 top-0 grid"
      style={{
        gridTemplateColumns: `repeat(${COLS}, ${TILE}px)`,
        gridTemplateRows: `repeat(${ROWS}, ${TILE}px)`,
        width: COLS * TILE,
        height: ROWS * TILE,
      }}
    >
      {tiles}
    </div>
  );
}

function NpcFigure({ name, variant }: { name: string; variant: number }) {
  const tag = labelFirstName(name);
  return (
    <div
      className="relative"
      style={{
        width: TILE,
        height: TILE,
        pointerEvents: 'none',
      }}
    >
      <div
        className="absolute left-1/2 z-[6]"
        title={name}
        style={{
          bottom: TILE + 4,
          maxWidth: 80,
          padding: '1px 3px',
          transform: 'translateX(-50%)',
          transformOrigin: 'center bottom',
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '5px',
          lineHeight: 1.2,
          color: PK.text,
          backgroundColor: PK.dialogPaper,
          border: `1px solid ${PK.ink}`,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        {tag}
      </div>
      <div
        className="absolute left-1/2 bottom-0"
        style={{
          transform: 'translateX(-50%)',
          imageRendering: 'pixelated',
        }}
      >
        <div
          style={{
            transform: 'scale(2)',
            transformOrigin: '50% 80%',
            imageRendering: 'pixelated',
          }}
        >
          <NpcGbSprite variant={variant} frame={0} />
        </div>
      </div>
    </div>
  );
}

function SvgGen1DialogCornerBall({
  sx,
}: {
  sx?: React.CSSProperties;
}) {
  return (
    <svg
      width={36}
      height={36}
      viewBox="0 0 32 32"
      style={{ overflow: 'visible', imageRendering: 'pixelated', ...sx }}
    >
      <circle cx="16" cy="16" r="13" fill={PK.white} stroke={PK.ink} strokeWidth="4" />
      <path d="M3 16 H29" stroke={PK.ink} strokeWidth="4" strokeLinecap="square" />
      <path d="M3 16 A13 13 0 0 1 29 16 Z" fill={PK.pokeballRed} stroke={PK.ink} strokeWidth="2" />
      <circle cx="16" cy="16" r="6" fill={PK.white} stroke={PK.ink} strokeWidth="3.5" />
      <circle cx="16" cy="16" r="4" fill={PK.ink} stroke={PK.ink} strokeWidth="1.5" />
      <circle cx="16" cy="16" r="2" fill={PK.dialogPaper} />
    </svg>
  );
}

function DialogBox({ children }: { children?: React.ReactNode }) {
  const cornerSx = (corner: 'tl' | 'tr' | 'bl' | 'br'): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      width: 36,
      height: 36,
      pointerEvents: 'none',
      zIndex: 2,
    };
    switch (corner) {
      case 'tl':
        return { ...base, top: -10, left: -10 };
      case 'tr':
        return {
          ...base,
          top: -10,
          right: -10,
          transform: 'scaleX(-1)',
          transformOrigin: 'center',
        };
      case 'bl':
        return {
          ...base,
          bottom: -10,
          left: -10,
          transform: 'scaleY(-1)',
          transformOrigin: 'center',
        };
      case 'br':
        return {
          ...base,
          bottom: -10,
          right: -10,
          transform: 'scale(-1)',
          transformOrigin: 'center',
        };
    }
  };

  return (
    <div
      className="w-full"
      style={{
        backgroundColor: PK.wallDeep,
        padding: '14px',
        paddingBottom: '18px',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="relative mx-auto w-full max-w-none"
        style={{
          padding: '34px',
          paddingTop: '42px',
          paddingBottom: '38px',
          backgroundColor: PK.dialogPaper,
          border: `${7}px solid ${PK.dialogBorder}`,
          boxShadow: `
              inset 0 0 0 4px ${PK.dialogPaper},
              inset 0 0 0 8px ${PK.dialogBorder}
            `,
          minHeight: '112px',
        }}
      >
        <span style={cornerSx('tl')}>
          <SvgGen1DialogCornerBall />
        </span>
        <span style={cornerSx('tr')}>
          <SvgGen1DialogCornerBall />
        </span>
        <span style={cornerSx('bl')}>
          <SvgGen1DialogCornerBall />
        </span>
        <span style={cornerSx('br')}>
          <SvgGen1DialogCornerBall />
        </span>
        <div className="relative z-[3]">{children}</div>
      </div>
    </div>
  );
}

type BriefSnapshotView = {
  id: string;
  title: string;
  subtitle: string;
  sections: { label: string; value: string }[];
};

function BriefViewer({
  briefs,
  aeName,
  onClose,
}: {
  briefs: BriefSnapshotView[];
  aeName: string;
  onClose: () => void;
}) {
  const total = briefs.length;
  const [mode, setMode] = useState<'list' | 'detail'>('list');
  const [index, setIndex] = useState(0);
  const [listSel, setListSel] = useState(0);
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  // Start on the brief picker each time the viewer opens for a member.
  useEffect(() => {
    setMode('list');
    setIndex(0);
    setListSel(0);
  }, [aeName, total]);

  const goPrev = useCallback(() => {
    setIndex((i) => (total === 0 ? 0 : (i - 1 + total) % total));
  }, [total]);
  const goNext = useCallback(() => {
    setIndex((i) => (total === 0 ? 0 : (i + 1) % total));
  }, [total]);
  const openAt = useCallback((i: number) => {
    setIndex(i);
    setMode('detail');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        onClose();
        return;
      }
      if (mode === 'detail') {
        if (e.key === 'Escape') {
          e.preventDefault();
          setListSel(index);
          setMode('list');
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goPrev();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          goNext();
        }
        return;
      }
      // Brief picker (list mode).
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (total === 0) {
        return;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setListSel((i) => Math.min(i + 1, total - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setListSel((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        openAt(listSel);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, index, listSel, total, goPrev, goNext, openAt, onClose]);

  useEffect(() => {
    if (mode !== 'list') return;
    const root = listScrollRef.current;
    if (!root) return;
    const node = root.querySelector(
      `[data-brief-idx="${listSel}"]`
    ) as HTMLElement | null;
    if (node) node.scrollIntoView({ block: 'nearest' });
  }, [listSel, mode]);

  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  };

  const multiple = total > 1;
  const brief = total > 0 ? briefs[Math.min(index, total - 1)] : null;
  const inDetail = mode === 'detail' && !!brief;
  const navBtnStyle: React.CSSProperties = {
    fontFamily: '"Press Start 2P", monospace',
    fontSize: '8px',
    backgroundColor: PK.hint,
    color: PK.ink,
    border: `3px solid ${PK.ink}`,
    boxShadow: `2px 2px 0 ${PK.ink}`,
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-stretch"
      style={{
        backgroundColor: PK.wallDeep,
        padding: 14,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          border: `8px solid ${PK.skyDeep}`,
          outline: `5px solid ${PK.shelfMid}`,
          boxShadow: `0 0 0 4px ${PK.ink}, 0 0 0 14px ${PK.shelfAccent}`,
          backgroundColor: PK.ink,
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-2 py-2 flex-shrink-0"
          style={{
            backgroundColor: PK.shelfMid,
            borderBottom: `4px solid ${PK.skyDeep}`,
          }}
        >
          <div
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '10px',
              lineHeight: 1.6,
              color: PK.dialogInner,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {aeName}
            <span style={{ color: PK.hint }}>
              {inDetail ? ' — BRIEF' : ' — BRIEFS'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {inDetail && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setListSel(index);
                    setMode('list');
                  }}
                  className="cursor-pointer px-2 py-1"
                  style={navBtnStyle}
                >
                  LIST
                </button>
                {multiple && (
                  <>
                    <button
                      type="button"
                      onClick={goPrev}
                      className="cursor-pointer px-2 py-1"
                      style={navBtnStyle}
                    >
                      ◀
                    </button>
                    <span
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '8px',
                        color: PK.dialogInner,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {index + 1}/{total}
                    </span>
                    <button
                      type="button"
                      onClick={goNext}
                      className="cursor-pointer px-2 py-1"
                      style={navBtnStyle}
                    >
                      ▶
                    </button>
                  </>
                )}
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer px-2 py-1"
              style={navBtnStyle}
            >
              B CLOSE
            </button>
          </div>
        </div>

        {!inDetail && (
          <div
            ref={listScrollRef}
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ backgroundColor: PK.dialogInner }}
          >
            {total === 0 ? (
              <div
                className="flex items-center justify-center p-6 text-center"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '9px',
                  color: PK.text,
                  minHeight: '100%',
                }}
              >
                NO BRIEFS AVAILABLE FOR THIS MEMBER.
              </div>
            ) : (
              briefs.map((b, i) => {
                const sel = i === listSel;
                return (
                  <div
                    key={b.id}
                    data-brief-idx={i}
                    onClick={() => {
                      setListSel(i);
                      openAt(i);
                    }}
                    onMouseEnter={() => setListSel(i)}
                    className="cursor-pointer px-3 py-2"
                    style={{
                      backgroundColor: sel ? PK.shelfMid : 'transparent',
                      borderBottom: `2px solid ${PK.wallDeep}`,
                      fontFamily: '"Press Start 2P", monospace',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        color: PK.text,
                        lineHeight: 1.5,
                        letterSpacing: '0.5px',
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          color: PK.shelfAccent,
                          width: 10,
                          display: 'inline-block',
                        }}
                      >
                        {sel ? '▶' : ' '}
                      </span>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {b.title}
                      </span>
                    </div>
                    {b.subtitle && (
                      <div
                        style={{
                          fontSize: '7px',
                          color: PK.textMuted,
                          marginTop: 4,
                          marginLeft: 16,
                          lineHeight: 1.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {b.subtitle}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {inDetail && brief && (
          <div
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ backgroundColor: PK.dialogInner }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div className="p-4">
              <div
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '11px',
                  color: PK.shelfAccent,
                  lineHeight: 1.5,
                  marginBottom: 4,
                  letterSpacing: '0.5px',
                  wordBreak: 'break-word',
                }}
              >
                {brief.title}
              </div>
              {brief.subtitle && (
                <div
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '7px',
                    color: PK.textMuted,
                    letterSpacing: '0.5px',
                    marginBottom: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {brief.subtitle}
                </div>
              )}
              {brief.sections.length === 0 ? (
                <div
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '9px',
                    color: PK.textMuted,
                  }}
                >
                  EMPTY BRIEF.
                </div>
              ) : (
                brief.sections.map((s) => (
                  <div
                    key={s.label}
                    style={{
                      marginBottom: 12,
                      paddingBottom: 10,
                      borderBottom: `1px dashed ${PK.wallDeep}`,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '7px',
                        color: PK.textMuted,
                        letterSpacing: '1px',
                        marginBottom: 4,
                        textTransform: 'uppercase',
                      }}
                    >
                      {s.label}
                    </div>
                    <div
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '10px',
                        color: PK.text,
                        lineHeight: 1.7,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {s.value}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div
          className="py-1 text-center flex-shrink-0"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '6px',
            color: PK.sky,
            backgroundColor: PK.ink,
          }}
        >
          {inDetail
            ? multiple
              ? '← → BRIEF · ESC LIST · B CLOSE'
              : 'ESC LIST · B CLOSE'
            : '↑↓ NAVIGATE · ENTER OPEN · B OR ESC CLOSE'}
        </div>
      </div>
    </div>
  );
}

type ComputerTable = ReturnType<
  ReturnType<typeof useBase>['getTableByIdIfExists']
>;
type ComputerRecords = ReturnType<typeof useRecords>;

function ComputerRecordBrowser({
  station,
  table,
  records,
  onClose,
}: {
  station: ComputerStation;
  table: ComputerTable;
  records: ComputerRecords;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  const primaryField = table?.getFieldByIdIfExists(station.primaryFieldId) ?? null;

  const subtitleFields = useMemo(() => {
    if (!table) return [] as NonNullable<
      ReturnType<NonNullable<ComputerTable>['getFieldByIdIfExists']>
    >[];
    const out: NonNullable<
      ReturnType<NonNullable<ComputerTable>['getFieldByIdIfExists']>
    >[] = [];
    for (const id of station.subtitleFieldIds) {
      const f = table.getFieldByIdIfExists(id);
      if (f) out.push(f);
    }
    return out;
  }, [table, station]);

  const detailFields = useMemo(() => {
    if (!table) return [] as NonNullable<
      ReturnType<NonNullable<ComputerTable>['getFieldByIdIfExists']>
    >[];
    const out: NonNullable<
      ReturnType<NonNullable<ComputerTable>['getFieldByIdIfExists']>
    >[] = [];
    for (const id of station.detailFieldIds) {
      const f = table.getFieldByIdIfExists(id);
      if (f) out.push(f);
    }
    return out;
  }, [table, station]);

  const recordList = records ?? [];

  const safeRead = (record: unknown, field: unknown): string => {
    if (!record || !field) return '';
    try {
      const r = record as { getCellValueAsString: (f: unknown) => string };
      return r.getCellValueAsString(field) || '';
    } catch {
      return '';
    }
  };

  const searchableFields = useMemo(() => {
    const all: unknown[] = [];
    if (primaryField) all.push(primaryField);
    for (const f of subtitleFields) all.push(f);
    for (const f of detailFields) all.push(f);
    return all;
  }, [primaryField, subtitleFields, detailFields]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recordList;
    return recordList.filter((rec) => {
      for (const f of searchableFields) {
        const v = safeRead(rec, f);
        if (v && v.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [recordList, searchableFields, query]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedIdx(0);
    } else if (selectedIdx >= filtered.length) {
      setSelectedIdx(filtered.length - 1);
    }
  }, [filtered.length, selectedIdx]);

  const openRecord = openRecordId
    ? recordList.find((r) => r.id === openRecordId) ?? null
    : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (openRecord) setOpenRecordId(null);
        else onClose();
        return;
      }
      if (openRecord) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) =>
          Math.min(i + 1, Math.max(filtered.length - 1, 0))
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const rec = filtered[selectedIdx];
        if (rec) setOpenRecordId(rec.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openRecord, selectedIdx, filtered, onClose]);

  useEffect(() => {
    if (openRecord) return;
    const root = listScrollRef.current;
    if (!root) return;
    const node = root.querySelector(
      `[data-row-idx="${selectedIdx}"]`
    ) as HTMLElement | null;
    if (node) node.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, openRecord]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-stretch"
      style={{
        backgroundColor: PK.wallDeep,
        padding: 14,
        boxSizing: 'border-box',
        fontFamily: '"Press Start 2P", monospace',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          border: `8px solid ${PK.skyDeep}`,
          outline: `5px solid ${PK.shelfMid}`,
          boxShadow: `0 0 0 4px ${PK.ink}, 0 0 0 14px ${PK.shelfAccent}`,
          backgroundColor: PK.ink,
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-2 py-2 flex-shrink-0"
          style={{
            backgroundColor: PK.shelfMid,
            borderBottom: `4px solid ${PK.skyDeep}`,
          }}
        >
          <div
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '10px',
              lineHeight: 1.6,
              color: PK.dialogInner,
              letterSpacing: '1px',
            }}
          >
            <span style={{ color: PK.hint }}>{station.label}</span>
            <span style={{ color: PK.dialogInner }}> — TERMINAL</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer px-2 py-1"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '8px',
              backgroundColor: PK.hint,
              color: PK.ink,
              border: `3px solid ${PK.ink}`,
              boxShadow: `2px 2px 0 ${PK.ink}`,
            }}
          >
            ESC CLOSE
          </button>
        </div>

        {!openRecord && (
          <>
            <div
              className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
              style={{
                backgroundColor: PK.dialogPaper,
                borderBottom: `4px solid ${PK.dialogBorder}`,
              }}
            >
              <span
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '9px',
                  color: PK.textMuted,
                  letterSpacing: '1px',
                }}
              >
                SEARCH
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to filter..."
                autoFocus
                style={{
                  flex: 1,
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '9px',
                  backgroundColor: PK.dialogInner,
                  color: PK.text,
                  border: `3px solid ${PK.dialogBorder}`,
                  padding: '6px 8px',
                  outline: 'none',
                  letterSpacing: '0.5px',
                }}
              />
              <span
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '8px',
                  color: PK.textMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                {filtered.length}/{recordList.length}
              </span>
            </div>

            <div
              ref={listScrollRef}
              className="flex-1 min-h-0 overflow-y-auto"
              style={{ backgroundColor: PK.dialogInner }}
            >
              {filtered.length === 0 ? (
                <div
                  className="flex items-center justify-center p-6 text-center"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '10px',
                    color: PK.textMuted,
                    letterSpacing: '1px',
                  }}
                >
                  {recordList.length === 0
                    ? `NO ${station.label} RECORDS.`
                    : 'NO MATCHES.'}
                </div>
              ) : (
                filtered.map((rec, i) => {
                  const isSel = i === selectedIdx;
                  const title = safeRead(rec, primaryField) || '(UNTITLED)';
                  const subtitle = subtitleFields
                    .map((f) => safeRead(rec, f))
                    .filter(Boolean)
                    .join('  ·  ');
                  return (
                    <div
                      key={rec.id}
                      data-row-idx={i}
                      onClick={() => {
                        setSelectedIdx(i);
                        setOpenRecordId(rec.id);
                      }}
                      onMouseEnter={() => setSelectedIdx(i)}
                      className="cursor-pointer px-3 py-2"
                      style={{
                        backgroundColor: isSel ? PK.shelfMid : 'transparent',
                        borderBottom: `2px solid ${PK.wallDeep}`,
                        fontFamily: '"Press Start 2P", monospace',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '10px',
                          color: PK.text,
                          lineHeight: 1.5,
                          letterSpacing: '0.5px',
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            color: PK.shelfAccent,
                            width: 10,
                            display: 'inline-block',
                          }}
                        >
                          {isSel ? '▶' : ' '}
                        </span>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {title}
                        </span>
                      </div>
                      {subtitle && (
                        <div
                          style={{
                            fontSize: '7px',
                            color: PK.textMuted,
                            marginTop: 4,
                            marginLeft: 16,
                            lineHeight: 1.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {subtitle}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {openRecord && (
          <>
            <div
              className="flex items-center justify-between gap-2 px-3 py-2 flex-shrink-0"
              style={{
                backgroundColor: PK.dialogPaper,
                borderBottom: `4px solid ${PK.dialogBorder}`,
              }}
            >
              <div
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '10px',
                  color: PK.text,
                  letterSpacing: '0.5px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                <span style={{ color: PK.shelfAccent }}>▶ </span>
                {safeRead(openRecord, primaryField) || '(UNTITLED)'}
              </div>
              <button
                type="button"
                onClick={() => setOpenRecordId(null)}
                className="cursor-pointer px-2 py-1"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '8px',
                  backgroundColor: PK.dialogInner,
                  color: PK.text,
                  border: `3px solid ${PK.ink}`,
                  boxShadow: `2px 2px 0 ${PK.ink}`,
                }}
              >
                ESC BACK
              </button>
            </div>

            <div
              className="flex-1 min-h-0 overflow-y-auto p-4"
              style={{ backgroundColor: PK.dialogInner }}
            >
              {detailFields.length === 0 && (
                <div
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '9px',
                    color: PK.textMuted,
                    textAlign: 'center',
                    padding: 12,
                  }}
                >
                  NO DETAIL FIELDS AVAILABLE.
                </div>
              )}
              {detailFields.map((f) => {
                const value = safeRead(openRecord, f);
                return (
                  <div
                    key={f.id}
                    style={{
                      marginBottom: 12,
                      paddingBottom: 10,
                      borderBottom: `1px dashed ${PK.wallDeep}`,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '7px',
                        color: PK.textMuted,
                        letterSpacing: '1px',
                        marginBottom: 4,
                        textTransform: 'uppercase',
                      }}
                    >
                      {f.name}
                    </div>
                    <div
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '10px',
                        color: PK.text,
                        lineHeight: 1.7,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {value || '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div
          className="py-1 text-center flex-shrink-0"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '7px',
            color: PK.sky,
            backgroundColor: PK.ink,
            letterSpacing: '1px',
          }}
        >
          {openRecord
            ? 'ESC: BACK TO LIST'
            : '↑↓ NAVIGATE  ·  ENTER SELECT  ·  ESC CLOSE'}
        </div>
      </div>
    </div>
  );
}

/**
 * Source Records review terminal. Lists source records, shows each record's
 * current review status, and lets the user change it (approve / reject / etc.)
 * by writing back to the table's single-select status field.
 */
function SourceRecordsReview({
  table,
  records,
  onClose,
}: {
  station: ComputerStation;
  table: ComputerTable;
  records: ComputerRecords;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<'workflow' | 'accepted'>('workflow');
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  const recordList = records ?? [];

  const safeRead = (record: unknown, field: unknown): string => {
    if (!record || !field) return '';
    try {
      const r = record as { getCellValueAsString: (f: unknown) => string };
      return r.getCellValueAsString(field) || '';
    } catch {
      return '';
    }
  };

  const primaryField = useMemo(
    () =>
      table?.fields.find((f) => f.isPrimaryField) ?? table?.fields[0] ?? null,
    [table]
  );

  // Review-status field: prefer the field literally named "Review Status",
  // then fall back to any single-select that looks like a review/status field.
  const reviewField = useMemo(() => {
    if (!table) return null;
    const byName = table.getFieldIfExists('Review Status');
    if (byName) return byName;
    const selects = table.fields.filter(
      (f) => String(f.type) === 'singleSelect'
    );
    const score = (name: string) => {
      const s = name.toLowerCase();
      if (/review\s*status/.test(s)) return 4;
      if (s.includes('review')) return 3;
      if (s.includes('status')) return 2;
      if (s.includes('approv')) return 1;
      return 0;
    };
    let best: (typeof selects)[number] | null = null;
    let bestScore = -1;
    for (const f of selects) {
      const sc = score(f.name);
      if (sc > bestScore) {
        bestScore = sc;
        best = f;
      }
    }
    return best;
  }, [table]);

  const reviewChoices = useMemo(() => {
    const opts = (
      reviewField as {
        options?: {
          choices?: Array<{ id: string; name: string }>;
        };
      } | null
    )?.options;
    return opts?.choices ?? [];
  }, [reviewField]);

  // The "accepted" status used by the Shift+Enter hotkey and the tab filter.
  const acceptChoice = useMemo(
    () => reviewChoices.find((c) => /accept|approv/i.test(c.name)) ?? null,
    [reviewChoices]
  );

  const isAccepted = (rec: unknown) =>
    !!acceptChoice && safeRead(rec, reviewField) === acceptChoice.name;

  const contextFields = useMemo(() => {
    if (!table) return [];
    return table.fields
      .filter((f) => f.id !== primaryField?.id && f.id !== reviewField?.id)
      .slice(0, 6);
  }, [table, primaryField, reviewField]);

  const searchableFields = useMemo(() => {
    const all: unknown[] = [];
    if (primaryField) all.push(primaryField);
    if (reviewField) all.push(reviewField);
    for (const f of contextFields) all.push(f);
    return all;
  }, [primaryField, reviewField, contextFields]);

  // Accepted records leave the main workflow list and live in their own tab.
  const workflowCount = recordList.filter((r) => !isAccepted(r)).length;
  const acceptedCount = recordList.length - workflowCount;

  const filtered = useMemo(() => {
    const base = recordList.filter((rec) =>
      tab === 'accepted' ? isAccepted(rec) : !isAccepted(rec)
    );
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((rec) => {
      for (const f of searchableFields) {
        const v = safeRead(rec, f);
        if (v && v.toLowerCase().includes(q)) return true;
      }
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordList, searchableFields, query, tab, acceptChoice, reviewField]);

  useEffect(() => {
    if (filtered.length === 0) setSelectedIdx(0);
    else if (selectedIdx >= filtered.length) setSelectedIdx(filtered.length - 1);
  }, [filtered.length, selectedIdx]);

  const openRecord = openRecordId
    ? recordList.find((r) => r.id === openRecordId) ?? null
    : null;

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
      setErrorMsg(null);
      setSaving(true);
      try {
        await (
          table as unknown as {
            updateRecordAsync: (
              r: string,
              f: Record<string, unknown>
            ) => Promise<void>;
          }
        ).updateRecordAsync(recordId, { [reviewField.id]: { id: choiceId } });
      } catch {
        setErrorMsg('COULD NOT SAVE — CHECK PERMISSIONS.');
      } finally {
        setSaving(false);
      }
    },
    [table, reviewField]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (openRecord) setOpenRecordId(null);
        else onClose();
        return;
      }
      if (openRecord) {
        // Shift+Enter accepts the open record and returns to the list.
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          if (acceptChoice && canUpdate && !saving) {
            void setStatus(openRecord.id, acceptChoice.id);
            setOpenRecordId(null);
          }
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const rec = filtered[selectedIdx];
        if (rec) setOpenRecordId(rec.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    openRecord,
    selectedIdx,
    filtered,
    onClose,
    acceptChoice,
    canUpdate,
    saving,
    setStatus,
  ]);

  useEffect(() => {
    if (openRecord) return;
    const root = listScrollRef.current;
    if (!root) return;
    const node = root.querySelector(
      `[data-row-idx="${selectedIdx}"]`
    ) as HTMLElement | null;
    if (node) node.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, openRecord]);

  const statusBadge = (text: string) => (
    <span
      style={{
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '7px',
        color: PK.ink,
        backgroundColor: text ? PK.hint : PK.wallDeep,
        border: `2px solid ${PK.ink}`,
        padding: '2px 4px',
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}
    >
      {text || 'UNREVIEWED'}
    </span>
  );

  const openRecordStatus = openRecord ? safeRead(openRecord, reviewField) : '';

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-stretch"
      style={{
        backgroundColor: PK.wallDeep,
        padding: 14,
        boxSizing: 'border-box',
        fontFamily: '"Press Start 2P", monospace',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          border: `8px solid ${PK.skyDeep}`,
          outline: `5px solid ${PK.shelfMid}`,
          boxShadow: `0 0 0 4px ${PK.ink}, 0 0 0 14px ${PK.shelfAccent}`,
          backgroundColor: PK.ink,
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-2 py-2 flex-shrink-0"
          style={{
            backgroundColor: PK.shelfMid,
            borderBottom: `4px solid ${PK.skyDeep}`,
          }}
        >
          <div
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '10px',
              lineHeight: 1.6,
              color: PK.dialogInner,
              letterSpacing: '1px',
            }}
          >
            <span style={{ color: PK.hint }}>SOURCE RECORDS</span>
            <span style={{ color: PK.dialogInner }}> — REVIEW</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer px-2 py-1"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '8px',
              backgroundColor: PK.hint,
              color: PK.ink,
              border: `3px solid ${PK.ink}`,
              boxShadow: `2px 2px 0 ${PK.ink}`,
            }}
          >
            ESC CLOSE
          </button>
        </div>

        {!openRecord && (
          <>
            <div
              className="flex items-stretch flex-shrink-0"
              style={{
                backgroundColor: PK.dialogPaper,
                borderBottom: `4px solid ${PK.dialogBorder}`,
              }}
            >
              {(
                [
                  ['workflow', `WORKFLOW (${workflowCount})`],
                  ['accepted', `ACCEPTED (${acceptedCount})`],
                ] as const
              ).map(([key, label]) => {
                const active = tab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setTab(key);
                      setSelectedIdx(0);
                      setQuery('');
                    }}
                    className="cursor-pointer px-3 py-2"
                    style={{
                      flex: 1,
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: '8px',
                      letterSpacing: '0.5px',
                      color: PK.ink,
                      backgroundColor: active ? PK.hint : PK.dialogInner,
                      border: 'none',
                      borderRight: `2px solid ${PK.dialogBorder}`,
                      opacity: active ? 1 : 0.7,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div
              className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
              style={{
                backgroundColor: PK.dialogPaper,
                borderBottom: `4px solid ${PK.dialogBorder}`,
              }}
            >
              <span
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '9px',
                  color: PK.textMuted,
                  letterSpacing: '1px',
                }}
              >
                SEARCH
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to filter..."
                autoFocus
                style={{
                  flex: 1,
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '9px',
                  backgroundColor: PK.dialogInner,
                  color: PK.text,
                  border: `3px solid ${PK.dialogBorder}`,
                  padding: '6px 8px',
                  outline: 'none',
                  letterSpacing: '0.5px',
                }}
              />
              <span
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '8px',
                  color: PK.textMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                {filtered.length}/{tab === 'accepted' ? acceptedCount : workflowCount}
              </span>
            </div>

            <div
              ref={listScrollRef}
              className="flex-1 min-h-0 overflow-y-auto"
              style={{ backgroundColor: PK.dialogInner }}
            >
              {filtered.length === 0 ? (
                <div
                  className="flex items-center justify-center p-6 text-center"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '10px',
                    color: PK.textMuted,
                    letterSpacing: '1px',
                  }}
                >
                  {recordList.length === 0
                    ? 'NO SOURCE RECORDS.'
                    : query.trim()
                    ? 'NO MATCHES.'
                    : tab === 'accepted'
                    ? 'NO ACCEPTED RECORDS YET.'
                    : 'NOTHING LEFT TO REVIEW.'}
                </div>
              ) : (
                filtered.map((rec, i) => {
                  const isSel = i === selectedIdx;
                  const title = safeRead(rec, primaryField) || '(UNTITLED)';
                  const status = safeRead(rec, reviewField);
                  return (
                    <div
                      key={rec.id}
                      data-row-idx={i}
                      onClick={() => {
                        setSelectedIdx(i);
                        setOpenRecordId(rec.id);
                      }}
                      onMouseEnter={() => setSelectedIdx(i)}
                      className="cursor-pointer px-3 py-2 flex items-center gap-2"
                      style={{
                        backgroundColor: isSel ? PK.shelfMid : 'transparent',
                        borderBottom: `2px solid ${PK.wallDeep}`,
                        fontFamily: '"Press Start 2P", monospace',
                      }}
                    >
                      <span
                        style={{
                          color: PK.shelfAccent,
                          width: 10,
                          display: 'inline-block',
                          fontSize: '10px',
                        }}
                      >
                        {isSel ? '▶' : ' '}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          color: PK.text,
                          lineHeight: 1.5,
                          letterSpacing: '0.5px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {title}
                      </span>
                      {statusBadge(status)}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {openRecord && (
          <>
            <div
              className="flex items-center justify-between gap-2 px-3 py-2 flex-shrink-0"
              style={{
                backgroundColor: PK.dialogPaper,
                borderBottom: `4px solid ${PK.dialogBorder}`,
              }}
            >
              <div
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '10px',
                  color: PK.text,
                  letterSpacing: '0.5px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                <span style={{ color: PK.shelfAccent }}>▶ </span>
                {safeRead(openRecord, primaryField) || '(UNTITLED)'}
              </div>
              <button
                type="button"
                onClick={() => setOpenRecordId(null)}
                className="cursor-pointer px-2 py-1"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '8px',
                  backgroundColor: PK.dialogInner,
                  color: PK.text,
                  border: `3px solid ${PK.ink}`,
                  boxShadow: `2px 2px 0 ${PK.ink}`,
                }}
              >
                ESC BACK
              </button>
            </div>

            <div
              className="flex-1 min-h-0 overflow-y-auto p-4"
              style={{ backgroundColor: PK.dialogInner }}
            >
              <div
                style={{
                  marginBottom: 14,
                  paddingBottom: 12,
                  borderBottom: `2px solid ${PK.wallDeep}`,
                }}
              >
                <div
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '7px',
                    color: PK.textMuted,
                    letterSpacing: '1px',
                    marginBottom: 6,
                    textTransform: 'uppercase',
                  }}
                >
                  {reviewField ? reviewField.name : 'REVIEW STATUS'}
                </div>
                <div style={{ marginBottom: 10 }}>
                  {statusBadge(openRecordStatus)}
                </div>

                {!reviewField ? (
                  <div
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: '8px',
                      color: PK.textMuted,
                      lineHeight: 1.6,
                    }}
                  >
                    NO SINGLE-SELECT STATUS FIELD FOUND ON THIS TABLE.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {reviewChoices.map((choice) => {
                      const isCurrent = choice.name === openRecordStatus;
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          disabled={saving || !canUpdate || isCurrent}
                          onClick={() => setStatus(openRecord.id, choice.id)}
                          className="cursor-pointer px-2 py-1"
                          style={{
                            fontFamily: '"Press Start 2P", monospace',
                            fontSize: '8px',
                            color: PK.ink,
                            backgroundColor: isCurrent
                              ? PK.hint
                              : PK.dialogPaper,
                            border: `3px solid ${PK.ink}`,
                            boxShadow: `2px 2px 0 ${PK.ink}`,
                            opacity: saving || !canUpdate ? 0.5 : 1,
                            cursor:
                              saving || !canUpdate || isCurrent
                                ? 'default'
                                : 'pointer',
                          }}
                        >
                          {isCurrent ? '✓ ' : ''}
                          {choice.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {!canUpdate && (
                  <div
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: '7px',
                      color: PK.shelfAccent,
                      marginTop: 8,
                      lineHeight: 1.6,
                    }}
                  >
                    NO PERMISSION TO EDIT THIS TABLE.
                  </div>
                )}
                {errorMsg && (
                  <div
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: '7px',
                      color: PK.shelfAccent,
                      marginTop: 8,
                      lineHeight: 1.6,
                    }}
                  >
                    {errorMsg}
                  </div>
                )}
              </div>

              {contextFields.map((f) => {
                const value = safeRead(openRecord, f);
                return (
                  <div
                    key={f.id}
                    style={{
                      marginBottom: 12,
                      paddingBottom: 10,
                      borderBottom: `1px dashed ${PK.wallDeep}`,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '7px',
                        color: PK.textMuted,
                        letterSpacing: '1px',
                        marginBottom: 4,
                        textTransform: 'uppercase',
                      }}
                    >
                      {f.name}
                    </div>
                    <div
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '10px',
                        color: PK.text,
                        lineHeight: 1.7,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {value || '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div
          className="py-1 text-center flex-shrink-0"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '7px',
            color: PK.sky,
            backgroundColor: PK.ink,
            letterSpacing: '1px',
          }}
        >
          {openRecord
            ? saving
              ? 'SAVING…'
              : 'SHIFT+ENTER ACCEPT · PICK A STATUS · ESC BACK'
            : '↑↓ NAVIGATE  ·  ENTER SELECT  ·  ESC CLOSE'}
        </div>
      </div>
    </div>
  );
}

function PokeMartInterface() {
  const base = useBase();
  // Characters come from the Deal Team table.
  const table = useMemo(
    () => base.getTableByIdIfExists('tbli97fs0V1Qex7zd') ?? base.tables[0],
    [base]
  );
  const records = useRecords(table ?? null);

  // 1-on-1 brief snapshots live in their own table, each linked to a team
  // member via the "For Team Member" field. A member can now have several.
  const briefSnapshotsTable = useMemo(
    () => base.getTableByIdIfExists('tblLUnyyar0p4hruj'),
    [base]
  );
  const briefSnapshotsRecords = useRecords(briefSnapshotsTable ?? null);

  // Source Records terminal data (review / approval).
  const sourceRecordsTable = useMemo(
    () => base.getTableByIdIfExists('tblSV1PcX8QizC5da'),
    [base]
  );
  const sourceRecordsRecords = useRecords(sourceRecordsTable ?? null);

  const nameField = useMemo(
    () =>
      table?.fields.find((f) => f.isPrimaryField) ??
      table?.getFieldIfExists('Name') ??
      null,
    [table]
  );

  // The System Owner (checkbox) is the player — exclude them from the sprites.
  const systemOwnerField = useMemo(
    () => table?.getFieldIfExists('System Owner') ?? null,
    [table]
  );

  const npcs = useMemo((): GameNpc[] => {
    if (!records || !nameField) return [];
    const members = records.filter((record) => {
      if (!systemOwnerField) return true;
      try {
        return !record.getCellValue(systemOwnerField);
      } catch {
        return true;
      }
    });
    const stations = deskStationsForNpcCount(members.length);
    return members.map((record, index) => {
      const desk = stations[index]?.clerk;
      const standee = STANDEE_SPOTS[index - ROOM_DESK_CLERKS.length];
      const x = desk?.x ?? standee?.[0] ?? Math.floor(COLS / 2);
      const y = desk?.y ?? standee?.[1] ?? 4;
      return {
        recordId: record.id,
        name: record.getCellValueAsString(nameField) || `AE ${index + 1}`,
        x,
        y,
      };
    });
  }, [records, nameField, systemOwnerField]);

  const deskStations = useMemo(
    () => deskStationsForNpcCount(npcs.length),
    [npcs.length]
  );

  const blockedCells = useMemo(() => buildBlockedCells(npcs), [npcs]);
  const [player, setPlayer] = useState(() => ({
    x: Math.floor(COLS / 2),
    y: ROWS - 2,
  }));
  const [direction, setDirection] = useState<Direction>('up');
  const [walkFrame, setWalkFrame] = useState<0 | 1>(0);
  const [playerMotion, setPlayerMotion] = useState<PlayerMotion | null>(null);
  const [moveAnimTick, setMoveAnimTick] = useState(0);

  const [dialogNpc, setDialogNpc] = useState<GameNpc | null>(null);
  const [line1Shown, setLine1Shown] = useState('');
  const [line2Shown, setLine2Shown] = useState('');
  const [dialogPhase, setDialogPhase] = useState<
    'line1' | 'line2' | 'menu' | null
  >(null);
  const [menuYes, setMenuYes] = useState(true);
  const [showBrief, setShowBrief] = useState(false);
  const [briefRecordId, setBriefRecordId] = useState<string | null>(null);
  const [briefAeName, setBriefAeName] = useState('');

  const [dialogComputer, setDialogComputer] = useState<ComputerStation | null>(
    null
  );
  const [computerLine1Shown, setComputerLine1Shown] = useState('');
  const [computerLine2Shown, setComputerLine2Shown] = useState('');
  const [computerDialogPhase, setComputerDialogPhase] = useState<
    'line1' | 'line2' | 'menu' | null
  >(null);
  const [computerMenuYes, setComputerMenuYes] = useState(true);
  const [openBrowser, setOpenBrowser] = useState<ComputerStation | null>(null);

  const gameRef = useRef<HTMLDivElement | null>(null);
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const computerTypeTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const scaleHostRef = useRef<HTMLDivElement | null>(null);
  const [frameScale, setFrameScale] = useState(1);

  /** Unscaled outer size (bezel pad + pixel grid); used only for proportional layout spacing. */
  const frameUnscaledW = COLS * TILE + BEZEL_PAD * 2;
  const frameUnscaledH = ROWS * TILE + BEZEL_PAD * 2;

  useEffect(() => {
    const host = scaleHostRef.current;
    if (!host) return;

    const EDGE = 10;

    function updateScale() {
      const { width: cw, height: ch } = host.getBoundingClientRect();
      const availW = Math.max(cw - EDGE, 0);
      const availH = Math.max(ch - EDGE, 0);
      if (availW <= 1 || availH <= 1) return;
      const s = Math.min(availW / frameUnscaledW, availH / frameUnscaledH);
      /** Cap so sprites stay crisp on huge monitors */
      const clamped = Math.min(Math.max(s, 0.4), 6);
      setFrameScale(clamped);
    }

    updateScale();
    requestAnimationFrame(() => {
      requestAnimationFrame(updateScale);
    });
    const ro = new ResizeObserver(() => updateScale());
    ro.observe(host);
    window.addEventListener('resize', updateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [frameUnscaledW, frameUnscaledH]);

  const line1Full = dialogNpc ? `${dialogNpc.name} wants to chat!` : '';

  const getBriefsForRecordId = useCallback(
    (recordId: string | null): BriefSnapshotView[] => {
      if (!recordId || !briefSnapshotsRecords || !briefSnapshotsTable) {
        return [];
      }
      // Link field back to the Deal Team member this brief is framed for.
      const forMemberField =
        briefSnapshotsTable.getFieldIfExists('For Team Member') ?? null;
      if (!forMemberField) return [];

      // Linked-record cell values may be { id } objects or raw id strings.
      const idOf = (l: unknown): string =>
        typeof l === 'string' ? l : (l as { id?: string } | null)?.id ?? '';

      const primaryField =
        briefSnapshotsTable.fields.find((f) => f.isPrimaryField) ?? null;
      const dateField = briefSnapshotsTable.getFieldIfExists('Snapshot Date');
      const dealField = briefSnapshotsTable.getFieldIfExists('Deal');

      // Brief body = narrative fields only: drop record links, the primary
      // title, and the date (those are surfaced in the title / subtitle).
      const bodyFields = briefSnapshotsTable.fields.filter(
        (f) =>
          f.id !== primaryField?.id &&
          f.id !== dateField?.id &&
          String(f.type) !== 'multipleRecordLinks'
      );

      const readStr = (rec: unknown, field: unknown): string => {
        if (!rec || !field) return '';
        try {
          return (
            (rec as {
              getCellValueAsString: (f: unknown) => string;
            }).getCellValueAsString(field) || ''
          );
        } catch {
          return '';
        }
      };
      const readDate = (rec: { getCellValue: (f: unknown) => unknown }) => {
        if (!dateField) return '';
        try {
          const v = rec.getCellValue(dateField);
          return typeof v === 'string' ? v : '';
        } catch {
          return '';
        }
      };

      const matching = briefSnapshotsRecords.filter((snap) => {
        let linked: unknown = null;
        try {
          linked = snap.getCellValue(forMemberField);
        } catch {
          linked = null;
        }
        return Array.isArray(linked) && linked.some((l) => idOf(l) === recordId);
      });

      // Newest snapshot first (ISO date strings sort lexically).
      matching.sort((a, b) => readDate(b).localeCompare(readDate(a)));

      return matching.map((snap) => {
        const dateStr = dateField ? readStr(snap, dateField) : '';
        const dealStr = dealField ? readStr(snap, dealField) : '';
        return {
          id: snap.id,
          title:
            (primaryField ? readStr(snap, primaryField) : '') ||
            dateStr ||
            'BRIEF',
          subtitle: [dateStr, dealStr].filter(Boolean).join('  ·  '),
          sections: bodyFields
            .map((f) => ({ label: f.name, value: readStr(snap, f) }))
            .filter((s) => s.value),
        };
      });
    },
    [briefSnapshotsRecords, briefSnapshotsTable]
  );

  const facedTile = useMemo(
    () => facingCell(player.x, player.y, direction),
    [player, direction]
  );

  const facingNpc = useMemo(() => {
    const { x: fx, y: fy } = facedTile;
    const direct = npcs.find((n) => n.x === fx && n.y === fy);
    if (direct) return direct;
    // Facing the front of a counter — talk to the clerk standing behind it.
    const station = deskStationOwningTile(fx, fy, deskStations);
    if (!station) return null;
    return (
      npcs.find(
        (n) => n.x === station.clerk.x && n.y === station.clerk.y
      ) ?? null
    );
  }, [facedTile, npcs, deskStations]);

  const facingComputer = useMemo(
    () => computerStationAtTile(facedTile.x, facedTile.y),
    [facedTile]
  );

  useEffect(() => {
    gameRef.current?.focus();
  }, [records, table]);

  useEffect(() => {
    if (records?.length != null) {
      setPlayer({ x: Math.floor(COLS / 2), y: ROWS - 2 });
      setPlayerMotion(null);
    }
  }, [records?.length, npcs.length]);

  useEffect(() => {
    if (!dialogNpc) {
      setLine1Shown('');
      setLine2Shown('');
      setDialogPhase(null);
      if (typeTimerRef.current) {
        clearInterval(typeTimerRef.current);
        typeTimerRef.current = null;
      }
      return;
    }
    setLine1Shown('');
    setLine2Shown('');
    setDialogPhase('line1');
    setMenuYes(true);
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);

    const full1 = `${dialogNpc.name} wants to chat!`;

    let i1 = 0;
    typeTimerRef.current = setInterval(() => {
      i1 += 1;
      setLine1Shown(full1.slice(0, i1));
      if (i1 >= full1.length) {
        if (typeTimerRef.current) clearInterval(typeTimerRef.current);
        typeTimerRef.current = null;
        setDialogPhase('menu');
      }
    }, 38);

    return () => {
      if (typeTimerRef.current) {
        clearInterval(typeTimerRef.current);
        typeTimerRef.current = null;
      }
    };
  }, [dialogNpc]);

  useEffect(() => {
    if (!dialogComputer) {
      setComputerLine1Shown('');
      setComputerLine2Shown('');
      setComputerDialogPhase(null);
      if (computerTypeTimerRef.current) {
        clearInterval(computerTypeTimerRef.current);
        computerTypeTimerRef.current = null;
      }
      return;
    }
    setComputerLine1Shown('');
    setComputerLine2Shown('');
    setComputerDialogPhase('line1');
    setComputerMenuYes(true);
    if (computerTypeTimerRef.current) clearInterval(computerTypeTimerRef.current);

    const full1 = dialogComputer.terminalTitle;
    const full2 = dialogComputer.promptText;

    let i1 = 0;
    computerTypeTimerRef.current = setInterval(() => {
      i1 += 1;
      setComputerLine1Shown(full1.slice(0, i1));
      if (i1 >= full1.length) {
        if (computerTypeTimerRef.current)
          clearInterval(computerTypeTimerRef.current);
        computerTypeTimerRef.current = null;
        setComputerDialogPhase('line2');
        let i2 = 0;
        computerTypeTimerRef.current = setInterval(() => {
          i2 += 1;
          setComputerLine2Shown(full2.slice(0, i2));
          if (i2 >= full2.length) {
            if (computerTypeTimerRef.current)
              clearInterval(computerTypeTimerRef.current);
            computerTypeTimerRef.current = null;
            setComputerDialogPhase('menu');
          }
        }, 38);
      }
    }, 38);

    return () => {
      if (computerTypeTimerRef.current) {
        clearInterval(computerTypeTimerRef.current);
        computerTypeTimerRef.current = null;
      }
    };
  }, [dialogComputer]);

  useEffect(() => {
    if (!playerMotion) return;
    let raf = 0;
    let cancelled = false;
    const step = (): void => {
      if (cancelled) return;
      const elapsed = performance.now() - playerMotion.start;
      if (elapsed >= MOVE_GRID_MS) {
        if (!cancelled) {
          setPlayer({ x: playerMotion.tx, y: playerMotion.ty });
          setPlayerMotion(null);
        }
        return;
      }
      setMoveAnimTick(performance.now());
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [playerMotion]);

  const displayGrid = useMemo(() => {
    void moveAnimTick;
    const m = playerMotion;
    if (!m)
      return { x: player.x, y: player.y } as const;
    const u = smoothstep01((performance.now() - m.start) / MOVE_GRID_MS);
    return {
      x: m.fx + (m.tx - m.fx) * u,
      y: m.fy + (m.ty - m.fy) * u,
    } as const;
  }, [playerMotion, player.x, player.y, moveAnimTick]);

  const tryMove = useCallback(
    (dir: Direction) => {
      if (
        dialogNpc ||
        showBrief ||
        playerMotion ||
        dialogComputer ||
        openBrowser
      )
        return;
      setDirection(dir);
      const { dx, dy } = DIR_VEC[dir];
      const nx = player.x + dx;
      const ny = player.y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;
      if (blockedCells.has(keyXY(nx, ny))) return;
      setWalkFrame((f) => (f === 0 ? 1 : 0));
      setPlayerMotion({
        fx: player.x,
        fy: player.y,
        tx: nx,
        ty: ny,
        start: performance.now(),
      });
    },
    [
      player,
      blockedCells,
      dialogNpc,
      showBrief,
      playerMotion,
      dialogComputer,
      openBrowser,
    ]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showBrief || openBrowser) return;

      if (dialogComputer) {
        if (e.key === 'ArrowLeft') {
          if (computerDialogPhase === 'menu') {
            e.preventDefault();
            setComputerMenuYes(true);
          }
        } else if (e.key === 'ArrowRight') {
          if (computerDialogPhase === 'menu') {
            e.preventDefault();
            setComputerMenuYes(false);
          }
        } else if (
          e.key === 'Escape' ||
          e.key === 'b' ||
          e.key === 'B'
        ) {
          e.preventDefault();
          setDialogComputer(null);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (
            computerDialogPhase === 'line1' ||
            computerDialogPhase === 'line2'
          ) {
            setComputerLine1Shown(dialogComputer.terminalTitle);
            setComputerLine2Shown(dialogComputer.promptText);
            setComputerDialogPhase('menu');
            if (computerTypeTimerRef.current) {
              clearInterval(computerTypeTimerRef.current);
              computerTypeTimerRef.current = null;
            }
          } else if (computerDialogPhase === 'menu') {
            const willOpen = computerMenuYes ? dialogComputer : null;
            setDialogComputer(null);
            if (willOpen) setOpenBrowser(willOpen);
          }
        }
        return;
      }

      if (dialogNpc) {
        if (e.key === 'ArrowLeft') {
          if (dialogPhase === 'menu') {
            e.preventDefault();
            setMenuYes(true);
          }
        } else if (e.key === 'ArrowRight') {
          if (dialogPhase === 'menu') {
            e.preventDefault();
            setMenuYes(false);
          }
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (dialogPhase === 'line1' || dialogPhase === 'line2') {
            setLine1Shown(line1Full);
            setDialogPhase('menu');
            if (typeTimerRef.current) {
              clearInterval(typeTimerRef.current);
              typeTimerRef.current = null;
            }
          } else if (dialogPhase === 'menu') {
            if (menuYes) {
              setBriefRecordId(dialogNpc.recordId);
              setBriefAeName(dialogNpc.name);
              setShowBrief(true);
            }
            setDialogNpc(null);
          }
        }
        return;
      }

      let moved: Direction | null = null;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') moved = 'up';
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S')
        moved = 'down';
      else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A')
        moved = 'left';
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D')
        moved = 'right';

      if (moved) {
        e.preventDefault();
        tryMove(moved);
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        if (facingNpc) {
          e.preventDefault();
          setDialogNpc(facingNpc);
        } else if (facingComputer && facingComputer.interactive) {
          // Only interactive terminals (Source Records) open; Events / Risky
          // Deals are visual-only.
          e.preventDefault();
          setDialogComputer(facingComputer);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    tryMove,
    dialogNpc,
    dialogPhase,
    menuYes,
    facingNpc,
    facingComputer,
    line1Full,
    showBrief,
    openBrowser,
    dialogComputer,
    computerDialogPhase,
    computerMenuYes,
  ]);

  if (!table || !records) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          backgroundColor: PK.sky,
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '12px',
          color: PK.text,
        }}
      >
        LOADING...
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{
        backgroundColor: PK.ink,
        fontFamily: '"Press Start 2P", monospace',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
        rel="stylesheet"
      />

      <div
        className="flex-1 flex flex-col min-h-0 w-full min-w-0"
        style={{ backgroundColor: PK.skyDeep }}
      >
        <div
          ref={scaleHostRef}
          className="flex-1 flex min-h-[120px] w-full items-center justify-center px-2 py-2 overflow-visible"
          style={{ minHeight: 0 }}
        >
          <div
            className="flex shrink-0 items-center justify-center"
            style={{
              width: frameUnscaledW * frameScale,
              height: frameUnscaledH * frameScale,
            }}
          >
            <div
              className="relative"
              style={{
                transform: `scale(${frameScale})`,
                transformOrigin: 'center center',
                padding: BEZEL_PAD,
                backgroundColor: PK.ink,
                borderRadius: 4,
                boxShadow: `
                inset 0 0 0 4px ${PK.shelfMid},
                0 0 0 4px ${PK.ink},
                0 0 0 8px ${PK.hint}
              `,
              }}
            >
              <div
                ref={gameRef}
                tabIndex={0}
                className="relative outline-none overflow-visible"
                style={{
                  width: COLS * TILE,
                  height: ROWS * TILE,
                  backgroundColor: PK.floorBase,
                }}
                onMouseDown={() => gameRef.current?.focus()}
              >
                <TileLayer deskStations={deskStations} />
                <RoomDecorations deskStations={deskStations} />
                {COMPUTER_STATIONS.map((station) => (
                  <React.Fragment key={`computer-${station.key}`}>
                    <DecorLayer
                      left={station.anchor.x}
                      top={station.anchor.y}
                      wTiles={station.wTiles}
                      hTiles={1}
                    >
                      <PixelPokeComputer />
                    </DecorLayer>
                    <div
                      className="absolute pointer-events-none flex justify-center"
                      style={{
                        left: station.anchor.x * TILE,
                        top: station.anchor.y * TILE - 11,
                        width: station.wTiles * TILE,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: '"Press Start 2P", monospace',
                          fontSize: '5px',
                          color: PK.text,
                          backgroundColor: PK.dialogPaper,
                          border: `1px solid ${PK.ink}`,
                          padding: '1px 3px',
                          whiteSpace: 'nowrap',
                          letterSpacing: '0.5px',
                          lineHeight: 1,
                        }}
                      >
                        {station.label}
                      </div>
                    </div>
                  </React.Fragment>
                ))}
                {npcs.map((npc, i) => (
                  <div
                    key={npc.recordId}
                    className="absolute pointer-events-none"
                    style={{
                      left: npc.x * TILE,
                      top: npc.y * TILE,
                      width: TILE,
                      height: TILE,
                    }}
                  >
                    <NpcFigure
                      name={npc.name}
                      variant={i % AE_VARIANT_FRAMES.length}
                    />
                  </div>
                ))}
                <div
                  className="absolute flex items-center justify-center pointer-events-none"
                  style={{
                    left: displayGrid.x * TILE,
                    top: displayGrid.y * TILE,
                    width: TILE,
                    height: TILE,
                  }}
                >
                  <div
                    style={{ transform: 'scale(2)', transformOrigin: '50% 80%' }}
                  >
                    <AshSpriteDraw frame={walkFrame} dir={direction} />
                  </div>
                </div>
                {facingNpc &&
                  !dialogNpc &&
                  !dialogComputer &&
                  !openBrowser &&
                  !showBrief && (
                    <div
                      className="absolute pointer-events-none z-[10]"
                      style={{
                        left: facingNpc.x * TILE + TILE / 2 - 4,
                        top: facingNpc.y * TILE - 28,
                      }}
                    >
                      <svg
                        width={8}
                        height={10}
                        viewBox="0 0 8 10"
                        shapeRendering="crispEdges"
                        style={{ imageRendering: 'pixelated' }}
                      >
                        <rect x="3" y="0" width="2" height="1" fill={PK.ink} />
                        <rect x="2" y="1" width="4" height="1" fill={PK.ink} />
                        <rect x="3" y="1" width="2" height="1" fill={PK.hint} />
                        <rect x="2" y="2" width="4" height="4" fill={PK.ink} />
                        <rect x="3" y="2" width="2" height="3" fill={PK.hint} />
                        <rect x="2" y="6" width="4" height="1" fill={PK.ink} />
                        <rect x="3" y="6" width="2" height="1" fill={PK.hint} />
                        <rect x="2" y="8" width="4" height="2" fill={PK.ink} />
                        <rect x="3" y="8" width="2" height="1" fill={PK.hint} />
                      </svg>
                    </div>
                  )}
                {facingComputer &&
                  facingComputer.interactive &&
                  !facingNpc &&
                  !dialogNpc &&
                  !dialogComputer &&
                  !openBrowser &&
                  !showBrief && (
                    <div
                      className="absolute pointer-events-none z-[10]"
                      style={{
                        left:
                          (facingComputer.anchor.x +
                            facingComputer.wTiles / 2) *
                            TILE -
                          4,
                        top: facingComputer.anchor.y * TILE - 28,
                      }}
                    >
                      <svg
                        width={8}
                        height={10}
                        viewBox="0 0 8 10"
                        shapeRendering="crispEdges"
                        style={{ imageRendering: 'pixelated' }}
                      >
                        <rect x="3" y="0" width="2" height="1" fill={PK.ink} />
                        <rect x="2" y="1" width="4" height="1" fill={PK.ink} />
                        <rect x="3" y="1" width="2" height="1" fill={PK.hint} />
                        <rect x="2" y="2" width="4" height="4" fill={PK.ink} />
                        <rect x="3" y="2" width="2" height="3" fill={PK.hint} />
                        <rect x="2" y="6" width="4" height="1" fill={PK.ink} />
                        <rect x="3" y="6" width="2" height="1" fill={PK.hint} />
                        <rect x="2" y="8" width="4" height="2" fill={PK.ink} />
                        <rect x="3" y="8" width="2" height="1" fill={PK.hint} />
                      </svg>
                    </div>
                  )}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, ${PK.scanline} 2px, ${PK.scanline} 3px)`,
                    mixBlendMode: 'multiply',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex-shrink-0 text-center px-2 pb-2"
          style={{
            fontSize: '6px',
            color: PK.dialogInner,
            maxWidth: '100%',
          }}
        >
          WASD / ARROWS MOVE · FACE NPC OR TERMINAL + ENTER · ← → CHOOSE YES / NO
        </div>
      </div>

      <div className="p-2 flex-shrink-0" style={{ backgroundColor: PK.skyDeep }}>
        <DialogBox>
          {dialogComputer ? (
            <div>
              <div
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '12px',
                  lineHeight: 1.7,
                  color: PK.text,
                  minHeight: '3.5em',
                }}
              >
                <span style={{ color: PK.shelfAccent }}>
                  {computerLine1Shown}
                </span>
                {computerDialogPhase === 'line1' &&
                  computerLine1Shown.length <
                    dialogComputer.terminalTitle.length && (
                    <span style={{ opacity: 0.9 }}>▍</span>
                  )}
                {(computerDialogPhase === 'line2' ||
                  computerDialogPhase === 'menu' ||
                  (computerDialogPhase === 'line1' &&
                    computerLine1Shown.length >=
                      dialogComputer.terminalTitle.length)) && (
                  <>
                    <br />
                    <br />
                    {computerLine2Shown}
                    {computerDialogPhase === 'line2' &&
                      computerLine2Shown.length <
                        dialogComputer.promptText.length && (
                        <span style={{ opacity: 0.9 }}>▍</span>
                      )}
                  </>
                )}
              </div>
              {computerDialogPhase === 'menu' && (
                <div
                  className="mt-4 flex gap-8"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '11px',
                  }}
                >
                  <span style={{ color: PK.text }}>
                    {computerMenuYes ? '▶ ' : '  '}
                    YES
                  </span>
                  <span style={{ color: PK.text }}>
                    {!computerMenuYes ? '▶ ' : '  '}NO
                  </span>
                </div>
              )}
              <div
                className="mt-3"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '8px',
                  color: PK.textMuted,
                }}
              >
                ENTER / SPACE: ADVANCE · ← → : SELECT · B OR ESC: CANCEL
              </div>
            </div>
          ) : !dialogNpc ? (
            <div
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '12px',
                lineHeight: 1.8,
                color: PK.text,
              }}
            >
              1-ON-1 POKé MART
              <br />
              <span style={{ fontSize: '10px' }}>
                APPROACH A TEAM MEMBER OR TERMINAL AND PRESS ENTER.
              </span>
            </div>
          ) : (
            <div>
              <div
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '12px',
                  lineHeight: 1.7,
                  color: PK.text,
                  minHeight: '3.5em',
                }}
              >
                {line1Shown}
                {dialogPhase === 'line1' &&
                  line1Shown.length < line1Full.length && (
                    <span style={{ opacity: 0.9 }}>▍</span>
                  )}
              </div>
              {dialogPhase === 'menu' && (
                <div
                  className="mt-4 flex gap-8"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '11px',
                  }}
                >
                  <span style={{ color: PK.text }}>
                    {menuYes ? '▶ ' : '  '}
                    YES
                  </span>
                  <span style={{ color: PK.text }}>
                    {!menuYes ? '▶ ' : '  '}NO
                  </span>
                </div>
              )}
              <div
                className="mt-3"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '8px',
                  color: PK.textMuted,
                }}
              >
                ENTER / SPACE: ADVANCE · ← → : SELECT · B OR ESC CLOSES BRIEF
              </div>
            </div>
          )}
        </DialogBox>
      </div>

      {showBrief && (
        <BriefViewer
          briefs={getBriefsForRecordId(briefRecordId)}
          aeName={briefAeName || 'AE'}
          onClose={() => {
            setShowBrief(false);
            setBriefRecordId(null);
            setBriefAeName('');
          }}
        />
      )}

      {openBrowser && openBrowser.key === 'source-records' && (
        <SourceRecordsReview
          station={openBrowser}
          table={sourceRecordsTable}
          records={sourceRecordsRecords}
          onClose={() => setOpenBrowser(null)}
        />
      )}
    </div>
  );
}

initializeBlock({ interface: () => <PokeMartInterface /> });
