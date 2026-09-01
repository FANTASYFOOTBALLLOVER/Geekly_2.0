// Downloads nflverse's weekly player stats and loads the rows that match players
// already in our `players` table — giving full career history for everyone
// currently in your player pool.
//
// Run this LAST, after importPlayers.js and importIdCrosswalk.js:
//   node scripts/importHistoricalStats.js            # every season 1999 → current
//   node scripts/importHistoricalStats.js 2025       # just one season
//   node scripts/importHistoricalStats.js 2024 2025  # an inclusive range
//
// Source note: nflverse froze the old combined `player_stats/player_stats.csv`
// asset at the 2024 season, which is why 24-25 stats loaded fine and 25-26
// silently came back empty. Current seasons live in the `stats_player` release
// as one file per season, so that's what we pull now. Its column names moved
// too (`interceptions` → `passing_interceptions`, `recent_team` → `team`), so
// every read below accepts either spelling and older seasons keep importing
// exactly as they did before.

import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import { supabase } from '../lib/supabaseClient.js';

const FIRST_SEASON = 1999;
const seasonUrl = (season) =>
  `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;

// The NFL season is named for the calendar year it kicks off in, so anything
// before September still belongs to last year's season.
function latestAvailableSeason() {
  const now = new Date();
  return now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function parseSeasonArgs(argv) {
  const nums = argv.map(Number).filter((n) => Number.isInteger(n) && n >= FIRST_SEASON);
  if (nums.length === 0) {
    const seasons = [];
    for (let s = FIRST_SEASON; s <= latestAvailableSeason(); s++) seasons.push(s);
    return seasons;
  }
  const start = Math.min(...nums);
  const end = Math.max(...nums);
  const seasons = [];
  for (let s = start; s <= end; s++) seasons.push(s);
  return seasons;
}

function toNum(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

// Reads the first column name that actually exists on the row, so one mapping
// covers both the pre-2025 and current nflverse column vocabularies.
function pick(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== '') return row[name];
  }
  return null;
}

async function loadTrackedPlayers() {
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
  return new Map(players.map((p) => [p.gsis_id, p.sleeper_id]));
}

async function importSeason(season, gsisToSleeper) {
  const url = seasonUrl(season);
  const res = await fetch(url);
  if (res.status === 404) {
    console.log(`  ${season}: no file published yet — skipping.`);
    return 0;
  }
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const text = await res.text();

  const rows = parse(text, { columns: true, skip_empty_lines: true });
  const filtered = rows.filter((r) => gsisToSleeper.has(r.player_id));

  const transformed = filtered.map((r) => ({
    gsis_id: r.player_id,
    sleeper_id: gsisToSleeper.get(r.player_id),
    season: toNum(r.season),
    week: toNum(r.week),
    season_type: r.season_type || 'REG',
    team: pick(r, 'team', 'recent_team'),
    opponent_team: pick(r, 'opponent_team'),
    completions: toNum(pick(r, 'completions')),
    attempts: toNum(pick(r, 'attempts')),
    passing_yards: toNum(pick(r, 'passing_yards')),
    passing_tds: toNum(pick(r, 'passing_tds')),
    interceptions: toNum(pick(r, 'passing_interceptions', 'interceptions')),
    rushing_attempts: toNum(pick(r, 'carries', 'rushing_attempts')),
    rushing_yards: toNum(pick(r, 'rushing_yards')),
    rushing_tds: toNum(pick(r, 'rushing_tds')),
    receptions: toNum(pick(r, 'receptions')),
    targets: toNum(pick(r, 'targets')),
    receiving_yards: toNum(pick(r, 'receiving_yards')),
    receiving_tds: toNum(pick(r, 'receiving_tds')),
    fumbles_lost:
      (toNum(pick(r, 'rushing_fumbles_lost')) || 0)
      + (toNum(pick(r, 'receiving_fumbles_lost')) || 0)
      + (toNum(pick(r, 'sack_fumbles_lost')) || 0),
  }));

  // nflverse's source files can contain duplicate rows for the same
  // (gsis_id, season, week, season_type) combination — Postgres's ON CONFLICT
  // DO UPDATE can't touch the same row twice within a single statement, which
  // crashes the whole import partway through. Dedupe by that key first,
  // keeping the last occurrence (later rows in the file are typically the
  // corrected/final version if nflverse re-published a stat line).
  const dedupedMap = new Map();
  for (const row of transformed) {
    dedupedMap.set(`${row.gsis_id}|${row.season}|${row.week}|${row.season_type}`, row);
  }
  const deduped = [...dedupedMap.values()];

  const CHUNK = 500;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const { error } = await supabase
      .from('weekly_stats')
      .upsert(deduped.slice(i, i + CHUNK), { onConflict: 'gsis_id,season,week,season_type' });
    if (error) throw error;
  }

  console.log(`  ${season}: ${deduped.length} rows upserted (of ${rows.length} in the file).`);
  return deduped.length;
}

async function importHistoricalStats() {
  const seasons = parseSeasonArgs(process.argv.slice(2));
  const gsisToSleeper = await loadTrackedPlayers();
  console.log(`Tracking stats for ${gsisToSleeper.size} players.`);
  console.log(`Importing seasons ${seasons[0]}–${seasons[seasons.length - 1]}...`);

  let total = 0;
  for (const season of seasons) {
    total += await importSeason(season, gsisToSleeper);
  }

  console.log(`Done. ${total} weekly stat rows upserted across ${seasons.length} season(s).`);
}

importHistoricalStats().catch((err) => {
  console.error('importHistoricalStats failed:', err);
  process.exit(1);
});
