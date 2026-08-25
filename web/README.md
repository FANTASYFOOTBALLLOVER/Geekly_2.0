# Roster Lease — Data Layer
The name is GEEKLY Fantasy 
## Setup

6. **Run the import scripts, in this exact order:**
   ```
   npm run import:players     # pulls current QB/RB/WR/TE from Sleeper
   npm run import:crosswalk    # links Sleeper IDs to nflverse IDs
   npm run import:stats        # pulls full career stats for those players
   ```

   `import:stats` downloads a large file covering NFL history since 1999 —
   it can take a couple of minutes. That's expected.

7. **Add bye weeks manually** — insert rows into the `bye_weeks` table for
   the current season, e.g.:
   ```sql
   insert into bye_weeks (team, season, week) values ('KC', 2026, 10);
   ```

## What's next

This gives you the full data foundation: current players, historical stats,
and the ID crosswalk needed to keep pulling live stats later. Next pieces to
build on top of this:

- A live-stats poller that hits Sleeper's stats endpoint during game windows
  and writes into `weekly_stats` (Supabase Realtime will auto-push those
  updates to your frontend — no extra work needed there).
- The `signings` logic — the actual "sign a player for N active weeks"
  mechanic, using `bye_weeks` to skip non-counting weeks.