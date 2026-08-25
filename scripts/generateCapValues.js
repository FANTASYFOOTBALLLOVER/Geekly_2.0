// Assigns a projected cap % to every player in ranked-list.txt, purely
// from their overall rank — no stats, no positions, same value used
// regardless of scoring settings (per current plan: one master ranking
// drives cap value for now, real stat-based projections come later).
//
// Rules:
//   - Rank 1 (Gibbs) = 37.4%
//   - Ranks 1-3 are the only ones above 33%
//   - Nobody after Ja'Marr Chase (rank 5) exceeds 29.5%
//   - Rank 100 = 8.8%
//   - Ranks 101-215 slide from 8.8% down to 0.01%
//   - Rank 216 and below are flat 0.01%
//
// Usage: node scripts/generateCapValues.js

import fs from 'fs';

const RANKED_LIST_PATH = 'ranked-list.txt';
const POSITIONS_PATH = 'positions.csv';
const OUTPUT_PATH = 'cap-values.csv';

// Top 5 are hand-set (ranks 1-3 exceed 33%; ranks 4-5 step down to the
// 29.5% ceiling that everyone after them respects)
const TOP_5 = [37.4, 35.5, 33.8, 32.5, 32.11];

// Segment 1: rank 6-100, decays from 29.5% to exactly 8.8% at rank 100
const SEG1_START = 29.5;
const SEG1_START_RANK = 6;
const SEG1_END_RANK = 100;
const SEG1_END_VALUE = 8.8;
const SEG1_FLOOR = 0.5; // asymptote used only for the decay shape, never reached

// Segment 2: rank 101-215, slides from 8.8% down to exactly 0.01%
const SEG2_START = 8.8;
const SEG2_START_RANK = 101;
const SEG2_END_RANK = 215;
const SEG2_END_VALUE = 0.01;
const SEG2_FLOOR = 0.001; // asymptote used only for the decay shape

// Rank 216+ : flat floor
const FLAT_FLOOR_RANK = 216;
const FLAT_FLOOR_VALUE = 0.01;

function calibratedK(startVal, floorVal, endVal, iTarget) {
  return -Math.log((endVal - floorVal) / (startVal - floorVal)) / iTarget;
}

function normalizeName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function main() {
  const names = fs.readFileSync(RANKED_LIST_PATH, 'utf-8').split('\n').map((n) => n.trim()).filter(Boolean);

  const k1 = calibratedK(SEG1_START, SEG1_FLOOR, SEG1_END_VALUE, SEG1_END_RANK - SEG1_START_RANK);
  const k2 = calibratedK(SEG2_START, SEG2_FLOOR, SEG2_END_VALUE, SEG2_END_RANK - SEG2_START_RANK);

  const rows = names.map((name, idx) => {
    const rank = idx + 1;
    let capPct;

    if (rank <= 5) {
      capPct = TOP_5[rank - 1];
    } else if (rank <= SEG1_END_RANK) {
      const i = rank - SEG1_START_RANK;
      capPct = SEG1_FLOOR + (SEG1_START - SEG1_FLOOR) * Math.exp(-k1 * i);
    } else if (rank <= SEG2_END_RANK) {
      const i = rank - SEG2_START_RANK;
      capPct = SEG2_FLOOR + (SEG2_START - SEG2_FLOOR) * Math.exp(-k2 * i);
    } else {
      capPct = FLAT_FLOOR_VALUE;
    }

    return { rank, name, capPct: Math.round(capPct * 1000) / 1000 };
  });

  // Every player in the database who ISN'T on the ranked list gets 0%
  let unrankedCount = 0;
  if (fs.existsSync(POSITIONS_PATH)) {
    const rankedKeySet = new Set(names.map(normalizeName));
    const posRows = parseSimpleCsv(fs.readFileSync(POSITIONS_PATH, 'utf-8'));
    const seen = new Set();

    for (const r of posRows) {
      const key = normalizeName(r.full_name);
      if (rankedKeySet.has(key) || seen.has(key)) continue;
      seen.add(key);
      rows.push({ rank: null, name: r.full_name, capPct: 0 });
      unrankedCount++;
    }
  } else {
    console.warn(`${POSITIONS_PATH} not found — skipping the "everyone else gets 0%" step.`);
  }

  const csvLines = ['rank,player_name,cap_percent'];
  rows.forEach((r) => csvLines.push(`${r.rank ?? ''},"${r.name}",${r.capPct}`));
  fs.writeFileSync(OUTPUT_PATH, csvLines.join('\n'));

  console.log(`Wrote ${rows.length} cap values to ${OUTPUT_PATH} (${names.length} ranked, ${unrankedCount} unranked at 0%)`);
  console.log(
    `Rank 1: ${rows[0].capPct}%  |  Rank 100: ${rows[99].capPct}%  |  Rank 215: ${rows[214].capPct}%  |  Rank 216: ${rows[215].capPct}%  |  Rank ${names.length}: ${rows[names.length - 1].capPct}%`
  );
}

main();