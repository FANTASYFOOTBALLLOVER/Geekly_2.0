// Downloads nflverse's complete weekly player stats file (every season back to 1999)
// and loads the rows that match players already in our `players` table — giving
// full career history for everyone currently in your player pool.
//
// Run this LAST, after importPlayers.js and importIdCrosswalk.js:
//   node scripts/importHistoricalStats.js
//
// Heads up: the source file covers every NFL player since 1999, so this download
// and parse can take a couple of minutes. That's normal.

import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import { supabase } from '../lib/supabaseClient.js';

const STATS_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv';

function toNum(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

async function importHistoricalStats() {
  console.log('Loading known players (with a matched gsis_id) from Supabase...');
  let players = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data: page, error: pageErr } = await supabase
      .from('players')
      .select('sleeper_id, gsis_id')
      .not('gsis_id', 'is', null)
      .range(from, from + PAGE - 1);
    if (pageErr) throw pageErr;
    players = players.concat(page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Loaded ${players.length} players with a matched gsis_id.`);

  if (players.length === 0) {
    console.error(
      'No players have a gsis_id yet. Run importIdCrosswalk.js first, then re-run this script.'
    );
    process.exit(1);
  }

  const gsisToSleeper = new Map(players.map((p) => [p.gsis_id, p.sleeper_id]));
  console.log(`Tracking stats for ${gsisToSleeper.size} players.`);

  console.log('Downloading nflverse player_stats.csv (this can take a minute or two)...');
  const res = await fetch(STATS_URL);
  if (!res.ok) throw new Error(`Failed to fetch player_stats.csv: ${res.status}`);
  const text = await res.text();

  console.log('Parsing CSV...');
  const rows = parse(text, { columns: true, skip_empty_lines: true });
  console.log(`Parsed ${rows.length} total stat rows across all NFL history.`);

  const filtered = rows.filter((r) => gsisToSleeper.has(r.player_id));
  console.log(`${filtered.length} rows match players in your pool. Transforming...`);

  const transformed = filtered.map((r) => ({
    gsis_id: r.player_id,
    sleeper_id: gsisToSleeper.get(r.player_id),
    season: toNum(r.season),
    week: toNum(r.week),
    season_type: r.season_type || 'REG',
    team: r.team || null,
    opponent_team: r.opponent_team || null,
    completions: toNum(r.completions),
    attempts: toNum(r.attempts),
    passing_yards: toNum(r.passing_yards),
    passing_tds: toNum(r.passing_tds),
    interceptions: toNum(r.interceptions),
    rushing_attempts: toNum(r.carries),
    rushing_yards: toNum(r.rushing_yards),
    rushing_tds: toNum(r.rushing_tds),
    receptions: toNum(r.receptions),
    targets: toNum(r.targets),
    receiving_yards: toNum(r.receiving_yards),
    receiving_tds: toNum(r.receiving_tds),
    fumbles_lost: (toNum(r.rushing_fumbles_lost) || 0) + (toNum(r.receiving_fumbles_lost) || 0),
  }));

  // nflverse's source file can contain duplicate rows for the same
  // (gsis_id, season, week, season_type) combination — Postgres's ON CONFLICT
  // DO UPDATE can't touch the same row twice within a single statement, which
  // crashes the whole import partway through. Dedupe by that key first,
  // keeping the last occurrence (later rows in the file are typically the
  // corrected/final version if nflverse re-published a stat line).
  const dedupedMap = new Map();
  for (const row of transformed) {
    const key = `${row.gsis_id}|${row.season}|${row.week}|${row.season_type}`;
    dedupedMap.set(key, row);
  }
  const deduped = [...dedupedMap.values()];
  const duplicatesRemoved = transformed.length - deduped.length;
  if (duplicatesRemoved > 0) {
    console.log(`Removed ${duplicatesRemoved} duplicate rows (same player/season/week/type appeared more than once in the source file).`);
  }

  console.log('Upserting into weekly_stats...');
  const CHUNK = 500;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('weekly_stats')
      .upsert(chunk, { onConflict: 'gsis_id,season,week,season_type' });
    if (error) throw error;
    console.log(`  upserted ${Math.min(i + CHUNK, deduped.length)}/${deduped.length}`);
  }

  console.log('Done. weekly_stats now has full career history for your player pool.');
}

importHistoricalStats().catch((err) => {
  console.error('importHistoricalStats failed:', err);
  process.exit(1);
});