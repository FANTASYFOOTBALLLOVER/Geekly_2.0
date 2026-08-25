// Loads full-SEASON projections (one row per player, not per week) from a
// CSV into `season_projections`. Matches players by name, same approach as
// importProjectionsCsv.js.
//
// Usage:
//   node scripts/importSeasonProjectionsCsv.js path/to/generated-projections.csv
//
// Expected CSV columns (header row required, any column can be blank):
//   player_name, team, season, passing_yards, passing_tds, interceptions,
//   rushing_yards, rushing_tds, receptions, receiving_yards, receiving_tds,
//   fumbles_lost

import 'dotenv/config';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { supabase } from '../lib/supabaseClient.js';

function toNum(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
}

async function importSeasonProjectionsCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log('Loading players from Supabase...');
  let players = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data: page, error: pageErr } = await supabase
      .from('players')
      .select('sleeper_id, gsis_id, full_name, team, position')
      .range(from, from + PAGE - 1);
    if (pageErr) throw pageErr;
    players = players.concat(page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Loaded ${players.length} players total.`);

  const byName = new Map();
  for (const p of players) {
    const key = normalizeName(p.full_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(p);
  }

  console.log(`Reading ${filePath}...`);
  const text = fs.readFileSync(filePath, 'utf-8');
  const rows = parse(text, { columns: true, skip_empty_lines: true });
  console.log(`Parsed ${rows.length} rows.`);

  const transformed = [];
  const unmatched = [];

  for (const r of rows) {
    const nameKey = normalizeName(r.player_name || '');
    const candidates = byName.get(nameKey) || [];

    let match = null;
    if (candidates.length === 1) {
      match = candidates[0];
    } else if (candidates.length > 1 && r.team) {
      match = candidates.find((c) => c.team === r.team) || null;
    }

    if (!match) {
      unmatched.push(r.player_name);
      continue;
    }

    // points/ppg columns in the CSV are for your own verification only —
    // they're not stored. calculate_fantasy_points() derives them live
    // from whatever scoring settings are chosen, using the raw stat
    // columns below.
    const position = r.position || match.position;
    const totalYards = toNum(r.total_yards);
    const totalTds = toNum(r.total_tds);

    const row = {
      sleeper_id: match.sleeper_id,
      gsis_id: match.gsis_id,
      season: toNum(r.season),
      receptions: toNum(r.receptions),
      rushing_yards: position === 'RB' ? totalYards : 0,
      rushing_tds: position === 'RB' ? totalTds : 0,
      receiving_yards: position === 'WR' ? totalYards : 0,
      receiving_tds: position === 'WR' ? totalTds : 0,
    };

    transformed.push(row);
  }

  if (unmatched.length > 0) {
    console.warn(`Could not match ${unmatched.length} rows to a player:`);
    unmatched.forEach((n) => console.warn(`  - ${n}`));
  }

  console.log(`Upserting ${transformed.length} matched rows into season_projections...`);
  const CHUNK = 500;
  for (let i = 0; i < transformed.length; i += CHUNK) {
    const chunk = transformed.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('season_projections')
      .upsert(chunk, { onConflict: 'sleeper_id,season' });
    if (error) throw error;
    console.log(`  upserted ${Math.min(i + CHUNK, transformed.length)}/${transformed.length}`);
  }

  console.log('Done.');
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/importSeasonProjectionsCsv.js path/to/file.csv');
  process.exit(1);
}

importSeasonProjectionsCsv(filePath).catch((err) => {
  console.error('importSeasonProjectionsCsv failed:', err);
  process.exit(1);
});