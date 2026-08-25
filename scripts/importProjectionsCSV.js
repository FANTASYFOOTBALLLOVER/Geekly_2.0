// Loads your own projections from a local CSV file into `projected_stats`.
// Matches players by name (and team, if given, to break ties) since your
// spreadsheet won't have Sleeper's internal player IDs.
//
// Usage:
//   node scripts/importProjectionsCsv.js path/to/projections.csv
//
// Expected CSV columns (header row required, any column can be blank):
//   player_name, team, season, week, passing_yards, passing_tds,
//   interceptions, rushing_yards, rushing_tds, receptions,
//   receiving_yards, receiving_tds, fumbles_lost

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

async function importProjectionsCsv(filePath) {
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
      .select('sleeper_id, full_name, team')
      .range(from, from + PAGE - 1);
    if (pageErr) throw pageErr;
    players = players.concat(page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Loaded ${players.length} players total.`);

  // name -> list of {sleeper_id, team}, since names aren't always unique
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

    transformed.push({
      sleeper_id: match.sleeper_id,
      season: toNum(r.season),
      week: toNum(r.week),
      season_type: 'REG',
      passing_yards: toNum(r.passing_yards),
      passing_tds: toNum(r.passing_tds),
      interceptions: toNum(r.interceptions),
      rushing_yards: toNum(r.rushing_yards),
      rushing_tds: toNum(r.rushing_tds),
      receptions: toNum(r.receptions),
      receiving_yards: toNum(r.receiving_yards),
      receiving_tds: toNum(r.receiving_tds),
      fumbles_lost: toNum(r.fumbles_lost),
    });
  }

  if (unmatched.length > 0) {
    console.warn(`Could not match ${unmatched.length} rows to a player:`);
    unmatched.forEach((n) => console.warn(`  - ${n}`));
  }

  console.log(`Upserting ${transformed.length} matched rows into projected_stats...`);
  const CHUNK = 500;
  for (let i = 0; i < transformed.length; i += CHUNK) {
    const chunk = transformed.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('projected_stats')
      .upsert(chunk, { onConflict: 'sleeper_id,season,week,season_type' });
    if (error) throw error;
    console.log(`  upserted ${Math.min(i + CHUNK, transformed.length)}/${transformed.length}`);
  }

  console.log('Done.');
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/importProjectionsCsv.js path/to/projections.csv');
  process.exit(1);
}

importProjectionsCsv(filePath).catch((err) => {
  console.error('importProjectionsCsv failed:', err);
  process.exit(1);
});