// Pulls REAL, ACTUAL stats for a given week (not projections) from Sleeper
// and upserts raw stat counts into weekly_stats. Fantasy points are never
// stored here — calculate_fantasy_points() computes them at query time from
// whatever scoring settings a user has picked, so the moment this script
// writes a new TD to the table, every ranking view reflects it immediately.
//
// Usage:
//   node scripts/importLiveStats.js              -> uses CURRENT_SEASON/CURRENT_WEEK below
//   node scripts/importLiveStats.js 2026 3        -> explicit season + week
//
// During live game windows, run this on a short interval (e.g. every 30-60
// seconds) via cron, a scheduled task, or a simple setInterval wrapper —
// see the README for a sample loop. Supabase Realtime (already enabled on
// weekly_stats in schema.sql) pushes each change straight to your frontend.

import 'dotenv/config';
import { supabase } from '../lib/supabaseClient.js';

const CURRENT_SEASON = 2026;
const CURRENT_WEEK = 1;
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

function toNum(val) {
  if (val === undefined || val === null) return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

function buildStatsUrl(season, week) {
  const params = new URLSearchParams({ season_type: 'regular' });
  POSITIONS.forEach((pos) => params.append('position[]', pos));
  return `https://api.sleeper.app/stats/nfl/${season}/${week}?${params.toString()}`;
}

async function importLiveStats(season, week) {
  console.log('Loading known players from Supabase...');
  let players = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data: page, error: pageErr } = await supabase
      .from('players')
      .select('sleeper_id, gsis_id')
      .range(from, from + PAGE - 1);
    if (pageErr) throw pageErr;
    players = players.concat(page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Loaded ${players.length} players total.`);

  const knownSleeperIds = new Set(players.map((p) => p.sleeper_id));
  const gsisBySleeperId = new Map(players.map((p) => [p.sleeper_id, p.gsis_id]));

  const url = buildStatsUrl(season, week);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper stats API error: ${res.status}`);
  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];

  const transformed = rows
    .filter((r) => knownSleeperIds.has(String(r.player_id)))
    .map((r) => {
      const s = r.stats || {};
      return {
        sleeper_id: String(r.player_id),
        gsis_id: gsisBySleeperId.get(String(r.player_id)) || null,
        season,
        week,
        season_type: 'REG',
        team: r.team || null,
        opponent_team: r.opponent || null,
        completions: toNum(s.pass_cmp),
        attempts: toNum(s.pass_att),
        passing_yards: toNum(s.pass_yd),
        passing_tds: toNum(s.pass_td),
        interceptions: toNum(s.pass_int),
        rushing_attempts: toNum(s.rush_att),
        rushing_yards: toNum(s.rush_yd),
        rushing_tds: toNum(s.rush_td),
        receptions: toNum(s.rec),
        targets: toNum(s.rec_tgt),
        receiving_yards: toNum(s.rec_yd),
        receiving_tds: toNum(s.rec_td),
        fumbles_lost: toNum(s.fum_lost),
      };
    });

  if (transformed.length === 0) {
    console.log(`No live stats yet for season ${season} week ${week}.`);
    return;
  }

  const { error } = await supabase
    .from('weekly_stats')
    .upsert(transformed, { onConflict: 'gsis_id,season,week,season_type' });
  if (error) throw error;

  console.log(
    `[${new Date().toISOString()}] Upserted ${transformed.length} live stat rows for season ${season} week ${week}.`
  );
}

const [, , seasonArg, weekArg] = process.argv;
const season = seasonArg ? Number(seasonArg) : CURRENT_SEASON;
const week = weekArg ? Number(weekArg) : CURRENT_WEEK;

importLiveStats(season, week).catch((err) => {
  console.error('importLiveStats failed:', err);
  process.exit(1);
});