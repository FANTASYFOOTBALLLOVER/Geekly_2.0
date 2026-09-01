# SQL migrations

The live-draft RPCs and most of the league logic were written straight into the
Supabase project rather than into `schema.sql`, so this folder is where anything
new gets checked in. Run each file once, in order, in the Supabase SQL Editor.
Every file is idempotent — re-running one is safe.

| Order | File | What it adds |
| --- | --- | --- |
| 1 | `../draft-end-session.sql` | `draft_end_session`, plus the `draft_sessions.ended_at` stamp the draft room needs to time its 30-minute wrap-up |
| 2 | `2026-09-01-geekly-upgrades.sql` | Free agency and dead cap, leave/delete league, end-of-season promotion & relegation, cross-league player stock, and the relegation on/off toggle |

## What the September 2026 migration expects to already exist

It builds on tables and functions the app is already using: `leagues`, `teams`,
`signings`, `players`, `player_cap_values`, `move_team_tier`,
`get_league_standings` and `compute_contract_end_week`. Nothing existing is
dropped or replaced — every function it defines is new, so applying it cannot
change behaviour that already works.

## After running it

`node scripts/importHistoricalStats.js 2025` backfills the 25-26 season, which
never loaded because nflverse froze the old combined stats file at 2024.
