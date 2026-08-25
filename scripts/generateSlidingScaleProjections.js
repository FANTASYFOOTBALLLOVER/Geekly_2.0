// Enforces the rule: within RBs, each player strictly outscores the RB
// ranked below them; same for WRs. Your own anchor players (Gibbs, Bijan,
// CMC, Taylor / Nacua, Chase, JSN, ARSB) keep their exact numbers. Every
// other RB/WR gets a season point total from a smooth decay curve, then
// receptions/yards/TDs are derived using the SAME rec-per-point and
// TD-per-point ratios implied by your anchors — so for every row,
// receptions + yards*0.1 + TDs*6 equals the points total exactly, same as
// your own numbers do.
//
// Output is season totals spread evenly across 17 weeks (a simplification
// — no per-matchup variance — since that's not something a static curve
// can reasonably guess).
//
// Setup:
//   1. In Supabase SQL Editor: select full_name, position from players
//      where position in ('RB','WR');  Export as CSV, save as positions.csv
//      in this project folder.
//   2. node scripts/generateSlidingScaleProjections.js

import fs from 'fs';

function parseSimpleCsv(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i]));
    return row;
  });
}

const SEASON = 2026;
const SEASON_WEEKS = 17;

const RANKED_LIST_PATH = 'ranked-list.txt';
const POSITIONS_PATH = 'positions.csv';
const OUTPUT_PATH = 'generated-projections.csv';

// Your exact numbers, kept as-is
const RB_ANCHORS = {
  'jahmyr gibbs': { rec: 81, yards: 1874, td: 17.8, points: 375.2 },
  'bijan robinson': { rec: 82.4, yards: 2000, td: 14, points: 366.4 },
  'christian mccaffrey': { rec: 89.7, yards: 1671, td: 17.1, points: 359.4 },
  'jonathon taylor': { rec: 59, yards: 1649, td: 16.9, points: 325.3 },
};
const WR_ANCHORS = {
  'puka nacua': { rec: 133, yards: 1713.5, td: 11.9, points: 376.2 },
  "ja'marr chase": { rec: 128, yards: 1672.8, td: 12.1, points: 367.88 },
  'jaxon smith-njigba': { rec: 120, yards: 1519.8, td: 9.8, points: 330.78 },
  'amon ra st brown': { rec: 130, yards: 1345, td: 9.5, points: 321.5 },
};

// Ratios averaged from your anchor numbers — used to derive rec/TD for
// every non-anchor player, with yards then solved exactly so the points
// formula holds.
const RB_REC_PER_PT = 0.218;
const RB_TD_PER_PT = 0.0463;
const WR_REC_PER_PT = 0.367;
const WR_TD_PER_PT = 0.0309;

// Decay curve shape for non-anchor players. Adjust DECAY_RATE if you want
// points to fall off faster (higher) or slower (lower) down the list.
const DECAY_RATE = 3.75;
function decayPoints(startPoints, floorPoints, index, total) {
  return floorPoints + (startPoints - floorPoints) * Math.exp((-DECAY_RATE * index) / total);
}

function normalizeName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[-.]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNormalizedAnchors(rawAnchors) {
  const map = {};
  for (const [key, value] of Object.entries(rawAnchors)) {
    map[normalizeName(key)] = value;
  }
  return map;
}

function deriveStats(points, recPerPt, tdPerPt) {
  const rec = Math.round(points * recPerPt * 10) / 10;
  const td = Math.round(points * tdPerPt * 10) / 10;
  const yards = Math.round((points - rec - td * 6) * 10 * 10) / 10; // solve exactly, 1 decimal
  return { rec, yards, td };
}

function main() {
  if (!fs.existsSync(POSITIONS_PATH)) {
    console.error(`Missing ${POSITIONS_PATH}. See the setup instructions at the top of this file.`);
    process.exit(1);
  }

  const rankedNames = fs
    .readFileSync(RANKED_LIST_PATH, 'utf-8')
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean);

  const posRows = parseSimpleCsv(fs.readFileSync(POSITIONS_PATH, 'utf-8'));
  const positionByName = new Map(posRows.map((r) => [normalizeName(r.full_name), r.position]));

  const rbs = [];
  const wrs = [];
  const unmatched = [];

  for (const name of rankedNames) {
    const key = normalizeName(name);
    const pos = positionByName.get(key);
    if (pos === 'RB') rbs.push(name);
    else if (pos === 'WR') wrs.push(name);
    else if (!pos) unmatched.push(name);
    // other positions (QB, TE) are intentionally skipped by this generator
  }

  if (unmatched.length > 0) {
    console.warn(`${unmatched.length} names in ranked-list.txt weren't found in positions.csv:`);
    unmatched.forEach((n) => console.warn(`  - ${n}`));
  }

  function buildPositionRows(orderedNames, rawAnchors, startPoints, floorPoints, recPerPt, tdPerPt) {
    const anchors = buildNormalizedAnchors(rawAnchors);
    const nonAnchorNames = orderedNames.filter((n) => !anchors[normalizeName(n)]);
    const rows = [];

    orderedNames.forEach((name) => {
      const key = normalizeName(name);
      if (anchors[key]) {
        const a = anchors[key];
        rows.push({ name, rec: a.rec, yards: a.yards, td: a.td, points: a.points });
      }
    });

    nonAnchorNames.forEach((name, i) => {
      const points = decayPoints(startPoints, floorPoints, i, nonAnchorNames.length);
      const { rec, yards, td } = deriveStats(points, recPerPt, tdPerPt);
      rows.push({ name, rec, yards, td, points: Math.round(points * 10) / 10 });
    });

    return rows;
  }

  const rbRows = buildPositionRows(rbs, RB_ANCHORS, 320, 0.3, RB_REC_PER_PT, RB_TD_PER_PT);
  const wrRows = buildPositionRows(wrs, WR_ANCHORS, 315, 0.3, WR_REC_PER_PT, WR_TD_PER_PT);

  // Everyone in positions.csv who ISN'T in your ranked list gets a small
  // randomized near-zero projection instead of following the strict order —
  // they're not ranked, so there's no "ahead of/behind" rule to enforce.
  const RANDOM_MAX_POINTS = 3;
  const rankedKeySet = new Set([...rbs, ...wrs].map(normalizeName));
  const unrankedRows = [];

  for (const [key, pos] of positionByName.entries()) {
    if (rankedKeySet.has(key)) continue;
    if (pos !== 'RB' && pos !== 'WR') continue;

    const originalRow = posRows.find((r) => normalizeName(r.full_name) === key);
    const name = originalRow.full_name;
    const points = Math.round(Math.random() * RANDOM_MAX_POINTS * 10) / 10;
    const recPerPt = pos === 'RB' ? RB_REC_PER_PT : WR_REC_PER_PT;
    const tdPerPt = pos === 'RB' ? RB_TD_PER_PT : WR_TD_PER_PT;
    const { rec, yards, td } = deriveStats(points, recPerPt, tdPerPt);
    unrankedRows.push({ name, rec, yards: Math.max(yards, 0), td, points, position: pos });
  }

  const rbNameSet = new Set([...rbs, ...unrankedRows.filter((r) => r.position === 'RB').map((r) => r.name)]);
  const wrNameSet = new Set([...wrs, ...unrankedRows.filter((r) => r.position === 'WR').map((r) => r.name)]);
  const allRows = [...rbRows, ...wrRows, ...unrankedRows];

  const csvLines = [
    'player_name,team,position,season,receptions,total_yards,total_tds,points,ppg',
  ];

  for (const row of allRows) {
    const isRb = rbNameSet.has(row.name);
    const points = row.rec + row.yards * 0.1 + row.td * 6;
    const ppg = points / SEASON_WEEKS;
    csvLines.push(
      [
        `"${row.name}"`,
        '',
        isRb ? 'RB' : 'WR',
        SEASON,
        row.rec.toFixed(2),
        row.yards.toFixed(1),
        row.td.toFixed(2),
        points.toFixed(2),
        ppg.toFixed(2),
      ].join(',')
    );
  }

  fs.writeFileSync(OUTPUT_PATH, csvLines.join('\n'));
  console.log(
    `Wrote ${allRows.length} players (${rbRows.length} ranked RB, ${wrRows.length} ranked WR, ${unrankedRows.length} unranked/randomized) to ${OUTPUT_PATH}`
  );
  console.log('Columns: receptions, total_yards, total_tds, points, ppg — full-season totals.');
}

main();