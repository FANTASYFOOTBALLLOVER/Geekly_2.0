-- ============================================================
-- Roster Lease — Database Schema
-- Run this in the Supabase SQL Editor before running any import scripts.
-- ============================================================

-- Players: current QB/RB/WR/TE pool, pulled from Sleeper
create table if not exists players (
  sleeper_id   text primary key,
  gsis_id      text unique,              -- filled in later by importIdCrosswalk.js
  full_name    text not null,
  first_name   text,
  last_name    text,
  position     text not null check (position in ('QB','RB','WR','TE')),
  team         text,
  status       text,
  years_exp    int,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists idx_players_gsis_id on players(gsis_id);
create index if not exists idx_players_position on players(position);
create index if not exists idx_players_team on players(team);

-- Weekly stats: historical (nflverse) + live (Sleeper polling), one row per player/week/season
create table if not exists weekly_stats (
  id                bigserial primary key,
  gsis_id           text references players(gsis_id),
  sleeper_id        text references players(sleeper_id),
  season            int not null,
  week              int not null,
  season_type       text default 'REG',
  team              text,
  opponent_team     text,
  completions       int,
  attempts          int,
  passing_yards     numeric,
  passing_tds       int,
  interceptions     int,
  rushing_attempts  int,
  rushing_yards     numeric,
  rushing_tds       int,
  receptions        int,
  targets           int,
  receiving_yards   numeric,
  receiving_tds     int,
  fumbles_lost      int,
  updated_at        timestamptz default now(),
  unique (gsis_id, season, week, season_type)
);

create index if not exists idx_weekly_stats_player_season on weekly_stats(gsis_id, season, week);

-- Bye weeks: you enter these manually each season
create table if not exists bye_weeks (
  team    text not null,
  season  int not null,
  week    int not null,
  primary key (team, season)
);

-- Signings: the core game mechanic — a user signs a player for N active weeks
create table if not exists signings (
  id                bigserial primary key,
  user_id           uuid references auth.users(id) not null,
  sleeper_id        text references players(sleeper_id) not null,
  season            int not null,
  start_week        int not null,
  weeks_requested   int not null,     -- how many *active* (non-bye) weeks they signed for
  end_week          int,              -- computed once bye weeks are factored in
  status            text default 'active' check (status in ('active','expired','dropped')),
  created_at        timestamptz default now()
);

create index if not exists idx_signings_user on signings(user_id);
create index if not exists idx_signings_player on signings(sleeper_id);

-- ============================================================
-- Your own scoring engine — no external site's projections or points.
-- Raw stat counts go in (from you, for projections; from Sleeper's live
-- stats, for actuals). Fantasy points get calculated on the fly from
-- whichever scoring settings a user picks. Change the settings, the
-- rankings recompute — nothing is pre-baked.
-- ============================================================

-- Scoring settings: presets (Full PPR, Half PPR, Standard) plus room for
-- fully custom user-defined scoring
create table if not exists scoring_settings (
  id            bigserial primary key,
  name          text not null unique,
  pass_yd       numeric not null default 0.04,   -- pts per passing yard
  pass_td       numeric not null default 4,
  pass_int      numeric not null default -2,
  rush_yd       numeric not null default 0.1,    -- pts per rushing yard
  rush_td       numeric not null default 6,
  reception     numeric not null default 1,      -- 1 = full PPR, 0.5 = half, 0 = standard
  rec_yd        numeric not null default 0.1,     -- pts per receiving yard
  rec_td        numeric not null default 6,
  fumble_lost   numeric not null default -2,
  created_at    timestamptz default now()
);

insert into scoring_settings (name, reception) values
  ('Full PPR', 1),
  ('Half PPR', 0.5),
  ('Standard', 0)
on conflict (name) do nothing;

-- Turns a raw stat line + a chosen scoring_settings row into fantasy points.
-- Used identically for actual stats and projected stats — same math either way.
create or replace function calculate_fantasy_points(
  passing_yards numeric, passing_tds numeric, interceptions numeric,
  rushing_yards numeric, rushing_tds numeric,
  receptions numeric, receiving_yards numeric, receiving_tds numeric,
  fumbles_lost numeric,
  settings scoring_settings
) returns numeric as $$
  select
    coalesce(passing_yards, 0)   * settings.pass_yd +
    coalesce(passing_tds, 0)     * settings.pass_td +
    coalesce(interceptions, 0)   * settings.pass_int +
    coalesce(rushing_yards, 0)   * settings.rush_yd +
    coalesce(rushing_tds, 0)     * settings.rush_td +
    coalesce(receptions, 0)      * settings.reception +
    coalesce(receiving_yards, 0) * settings.rec_yd +
    coalesce(receiving_tds, 0)   * settings.rec_td +
    coalesce(fumbles_lost, 0)    * settings.fumble_lost
$$ language sql immutable;

-- Projected stats: raw projected stat lines. You (or whatever source you
-- choose) fill this table in — no fantasy-points columns here, because
-- points get calculated from calculate_fantasy_points() at query time.
create table if not exists projected_stats (
  id                bigserial primary key,
  sleeper_id        text references players(sleeper_id) not null,
  gsis_id           text references players(gsis_id),
  season            int not null,
  week              int not null,
  season_type       text default 'REG',
  team              text,
  opponent_team     text,
  completions       numeric,
  attempts          numeric,
  passing_yards     numeric,
  passing_tds       numeric,
  interceptions     numeric,
  rushing_attempts  numeric,
  rushing_yards     numeric,
  rushing_tds       numeric,
  receptions        numeric,
  targets           numeric,
  receiving_yards   numeric,
  receiving_tds     numeric,
  fumbles_lost      numeric,
  updated_at        timestamptz default now(),
  unique (sleeper_id, season, week, season_type)
);

create index if not exists idx_projected_stats_player on projected_stats(sleeper_id, season, week);

-- The core rankings function. Your frontend calls this with whatever
-- scoring settings the user picked (a preset id, or a custom one they just
-- saved), and gets back fully-computed rankings — actual or projected.
create or replace function get_rankings(
  p_season int,
  p_scoring_id bigint,
  p_position text default null,
  p_use_projected boolean default false
) returns table (
  sleeper_id text,
  full_name text,
  player_position text,
  team text,
  fantasy_points numeric
) as $$
begin
  if p_use_projected then
    return query
      select p.sleeper_id, p.full_name, p.position as player_position, p.team,
             sum(calculate_fantasy_points(
               s.passing_yards, s.passing_tds, s.interceptions,
               s.rushing_yards, s.rushing_tds,
               s.receptions, s.receiving_yards, s.receiving_tds,
               s.fumbles_lost, ss
             )) as fantasy_points
      from players p
      join projected_stats s on s.sleeper_id = p.sleeper_id and s.season = p_season
      cross join (select * from scoring_settings where id = p_scoring_id) ss
      where (p_position is null or p.position = p_position)
      group by p.sleeper_id, p.full_name, p.position, p.team
      order by fantasy_points desc;
  else
    return query
      select p.sleeper_id, p.full_name, p.position as player_position, p.team,
             sum(calculate_fantasy_points(
               s.passing_yards, s.passing_tds, s.interceptions,
               s.rushing_yards, s.rushing_tds,
               s.receptions, s.receiving_yards, s.receiving_tds,
               s.fumbles_lost, ss
             )) as fantasy_points
      from players p
      join weekly_stats s on s.sleeper_id = p.sleeper_id and s.season = p_season
      cross join (select * from scoring_settings where id = p_scoring_id) ss
      where (p_position is null or p.position = p_position)
      group by p.sleeper_id, p.full_name, p.position, p.team
      order by fantasy_points desc;
  end if;
end;
$$ language plpgsql stable;

-- ============================================================
-- League settings — every configurable rule for a league lives here.
-- One row per league a user creates. Scoring itself isn't duplicated here —
-- it points at a row in scoring_settings (built earlier), since that
-- already supports fully custom point values per category.
-- ============================================================

create table if not exists leagues (
  id                    bigserial primary key,
  name                  text not null,
  owner_id              uuid references auth.users(id) not null,

  -- Roster construction (bye-week bench slots are unlimited by design —
  -- not a configurable number, so there's no column for it)
  roster_qb             int not null default 1 check (roster_qb >= 0),
  roster_rb             int not null default 2 check (roster_rb >= 0),
  roster_wr             int not null default 3 check (roster_wr >= 0),
  roster_te             int not null default 1 check (roster_te >= 0),
  roster_bench          int not null default 1 check (roster_bench >= 0),

  -- Scoring profile (point values themselves live in scoring_settings)
  scoring_settings_id   bigint references scoring_settings(id) not null default 1,

  -- Season structure
  season_weeks          int not null default 17 check (season_weeks between 1 and 18),
  max_weeks_signed       int not null default 17 check (max_weeks_signed between 1 and season_weeks),

  -- Weekly rules
  bonus_win_top_half     boolean not null default true,
  bid_weeks_visible      boolean not null default true,
  interest_rate_per_week numeric not null default 0.04 check (interest_rate_per_week >= 0),
  ir_voids_contract      boolean not null default true,
  max_one_week_contracts int not null default 3 check (max_one_week_contracts >= 0),
  max_two_week_contracts int not null default 3 check (max_two_week_contracts >= 0),
  cap_rollover_pct       numeric not null default 0 check (cap_rollover_pct between 0 and 100),
  salary_cap             numeric not null default 300 check (salary_cap >= 10),
  players_per_auction    int not null default 1 check (players_per_auction >= 1),

  -- Relegation system (top-level toggle; tier detail lives in league_tiers)
  relegation_enabled               boolean not null default true,
  shared_player_pool_across_tiers  boolean not null default true,

  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_leagues_owner on leagues(owner_id);

-- Relegation tiers: one row per tier (tier_number 1 = top). Only meaningful
-- when the parent league has relegation_enabled = true. Cap, team count,
-- and promote/relegate counts are stored per tier rather than computed, so
-- you're not locked into any particular halving formula.
create table if not exists league_tiers (
  id             bigserial primary key,
  league_id      bigint references leagues(id) not null,
  tier_number    int not null check (tier_number >= 1),
  num_teams      int not null check (num_teams between 4 and 16),
  salary_cap     numeric not null check (salary_cap >= 10),
  promote_count  int not null check (promote_count between 1 and 5),
  relegate_count int not null check (relegate_count between 1 and 5),
  check (promote_count = relegate_count),
  unique (league_id, tier_number)
);

create index if not exists idx_league_tiers_league on league_tiers(league_id);

-- Weekly auction scheduling — settable week to week rather than fixed for
-- the whole season. Store the exact scheduled datetime; validate the
-- Tue 9am-Thu noon window in application code, where you have the
-- league's timezone context.
create table if not exists league_auction_schedule (
  id           bigserial primary key,
  league_id    bigint references leagues(id) not null,
  season       int not null,
  week         int not null,
  scheduled_at timestamptz not null,
  unique (league_id, season, week)
);

create index if not exists idx_auction_schedule_league on league_auction_schedule(league_id, season, week);

-- Signings now belong to a specific league
alter table signings add column if not exists league_id bigint references leagues(id);

-- Turn on Realtime so the frontend gets pushed updates the moment new raw
-- stats land — a TD updates weekly_stats, Realtime pushes it, the frontend
-- re-renders points using whatever scoring settings that user has selected.
alter publication supabase_realtime add table weekly_stats;
alter publication supabase_realtime add table projected_stats;

-- ============================================================
-- Row Level Security
-- Your import scripts use the service_role key, which always bypasses RLS,
-- so none of this affects them. This only controls what your actual website
-- (using the public/anon key in the browser) is allowed to see or touch.
-- ============================================================

alter table players enable row level security;
alter table weekly_stats enable row level security;
alter table projected_stats enable row level security;
alter table scoring_settings enable row level security;
alter table bye_weeks enable row level security;
alter table signings enable row level security;
alter table leagues enable row level security;
alter table league_tiers enable row level security;
alter table league_auction_schedule enable row level security;

-- Public, read-only data: anyone visiting the site can read these
create policy "public can read players" on players
  for select using (true);

create policy "public can read weekly_stats" on weekly_stats
  for select using (true);

create policy "public can read projected_stats" on projected_stats
  for select using (true);

create policy "public can read scoring_settings" on scoring_settings
  for select using (true);

create policy "public can read bye_weeks" on bye_weeks
  for select using (true);

-- Signings are private: a user can only see and manage their own
create policy "users can read own signings" on signings
  for select using (auth.uid() = user_id);

create policy "users can insert own signings" on signings
  for insert with check (auth.uid() = user_id);

create policy "users can update own signings" on signings
  for update using (auth.uid() = user_id);

create policy "users can delete own signings" on signings
  for delete using (auth.uid() = user_id);

-- Leagues: anyone can browse league settings (so people can see what
-- they're joining), but only the owner can create/edit/delete their own
create policy "public can read leagues" on leagues
  for select using (true);

create policy "owner can insert leagues" on leagues
  for insert with check (auth.uid() = owner_id);

create policy "owner can update own leagues" on leagues
  for update using (auth.uid() = owner_id);

create policy "owner can delete own leagues" on leagues
  for delete using (auth.uid() = owner_id);

-- League tiers and auction schedule follow the same pattern, gated through
-- whichever league they belong to
create policy "public can read league_tiers" on league_tiers
  for select using (true);

create policy "owner can manage own league_tiers" on league_tiers
  for all using (
    auth.uid() = (select owner_id from leagues where leagues.id = league_tiers.league_id)
  );

create policy "public can read auction_schedule" on league_auction_schedule
  for select using (true);

create policy "owner can manage own auction_schedule" on league_auction_schedule
  for all using (
    auth.uid() = (select owner_id from leagues where leagues.id = league_auction_schedule.league_id)
  );

-- ============================================================
-- Teams — one per user per league. Holds the team name and a link to their
-- logo image (the actual image file lives in Supabase Storage, not here —
-- this column just stores the public URL pointing at it).
-- ============================================================

create table if not exists teams (
  id          bigserial primary key,
  league_id   bigint references leagues(id) not null,
  owner_id    uuid references auth.users(id) not null,
  team_name   text not null default 'My Team',
  logo_url    text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (league_id, owner_id)
);

create index if not exists idx_teams_league on teams(league_id);
create index if not exists idx_teams_owner on teams(owner_id);

-- Signings now belong to a team, not just a raw user + league pairing
alter table signings add column if not exists team_id bigint references teams(id);

alter table teams enable row level security;

create policy "public can read teams" on teams
  for select using (true);

create policy "owner can insert own team" on teams
  for insert with check (auth.uid() = owner_id);

create policy "owner can update own team" on teams
  for update using (auth.uid() = owner_id);

create policy "owner can delete own team" on teams
  for delete using (auth.uid() = owner_id);

alter publication supabase_realtime add table teams;

-- ============================================================
-- Storage bucket for team logos. Files get uploaded under a path like
-- {user_id}/logo.png — the policies below use that folder structure to
-- enforce that people can only upload/replace/delete their OWN logo, while
-- anyone can view any logo (they're meant to be public-facing).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('team-logos', 'team-logos', true)
on conflict (id) do nothing;

create policy "public can view team logos" on storage.objects
  for select using (bucket_id = 'team-logos');

create policy "owner can upload own team logo" on storage.objects
  for insert with check (
    bucket_id = 'team-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "owner can update own team logo" on storage.objects
  for update using (
    bucket_id = 'team-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "owner can delete own team logo" on storage.objects
  for delete using (
    bucket_id = 'team-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- Signing logic — the core "sign a player for N weeks" mechanic.
-- Interest formula: total_cost = base_value * (1 + interest_rate * weeks)
-- e.g. $10 value, 4 weeks, 4% => 10 * (1 + 0.04*4) = $11.60
-- ============================================================

alter table signings add column if not exists base_value numeric;
alter table signings add column if not exists interest_rate_applied numeric;
alter table signings add column if not exists total_cost numeric;
alter table signings add column if not exists void_reason text;

create index if not exists idx_signings_league_player_active
  on signings(league_id, sleeper_id, season, status);
create index if not exists idx_signings_team_season_active
  on signings(team_id, season, status);

-- Pure cost math, kept as its own function so it's reusable and testable
-- on its own (e.g. previewing a cost before actually signing).
create or replace function calculate_contract_cost(
  p_base_value numeric, p_weeks_requested int, p_interest_rate numeric
) returns numeric as $$
  select p_base_value * (1 + p_interest_rate * p_weeks_requested);
$$ language sql immutable;

-- Walks forward week by week from start_week, skipping the team's bye
-- week, until it's counted p_weeks_requested active weeks — returns the
-- real calendar week the contract ends on.
create or replace function compute_contract_end_week(
  p_team text, p_season int, p_start_week int, p_weeks_requested int
) returns int as $$
declare
  v_week    int := p_start_week;
  v_counted int := 0;
  v_bye     int;
begin
  select week into v_bye from bye_weeks where team = p_team and season = p_season;

  loop
    if v_bye is null or v_week <> v_bye then
      v_counted := v_counted + 1;
    end if;

    if v_counted >= p_weeks_requested then
      return v_week;
    end if;

    v_week := v_week + 1;
  end loop;
end;
$$ language plpgsql stable;

-- The main entry point your frontend calls to sign a player. Runs as
-- SECURITY DEFINER so it can check league-wide signing conflicts (is this
-- player already taken by another team?) that normal RLS wouldn't let a
-- regular user query directly — while still verifying the caller actually
-- owns the team they're signing for, and only ever inserting under their
-- own user_id.
create or replace function sign_player(
  p_team_id bigint,
  p_sleeper_id text,
  p_season int,
  p_start_week int,
  p_weeks_requested int,
  p_base_value numeric
) returns signings as $$
declare
  v_team            teams;
  v_league          leagues;
  v_player          players;
  v_total_cost      numeric;
  v_end_week        int;
  v_one_week_count  int;
  v_two_week_count  int;
  v_team_committed  numeric;
  v_already_signed  int;
  v_new_signing     signings;
begin
  select * into v_team from teams where id = p_team_id;
  if v_team is null then
    raise exception 'Team not found';
  end if;
  if v_team.owner_id <> auth.uid() then
    raise exception 'You do not own this team';
  end if;

  select * into v_league from leagues where id = v_team.league_id;
  select * into v_player from players where sleeper_id = p_sleeper_id;
  if v_player is null then
    raise exception 'Player not found';
  end if;

  if p_weeks_requested < 1 or p_weeks_requested > v_league.max_weeks_signed then
    raise exception 'Weeks requested must be between 1 and %', v_league.max_weeks_signed;
  end if;

  -- No two teams in the same league can hold the same player at once
  select count(*) into v_already_signed
  from signings
  where league_id = v_league.id and sleeper_id = p_sleeper_id
    and season = p_season and status = 'active';
  if v_already_signed > 0 then
    raise exception 'This player is already signed in this league';
  end if;

  -- One-week / two-week contract caps, per team
  if p_weeks_requested = 1 then
    select count(*) into v_one_week_count from signings
      where team_id = p_team_id and season = p_season
        and weeks_requested = 1 and status = 'active';
    if v_one_week_count >= v_league.max_one_week_contracts then
      raise exception 'Limit of % one-week contracts reached', v_league.max_one_week_contracts;
    end if;
  elsif p_weeks_requested = 2 then
    select count(*) into v_two_week_count from signings
      where team_id = p_team_id and season = p_season
        and weeks_requested = 2 and status = 'active';
    if v_two_week_count >= v_league.max_two_week_contracts then
      raise exception 'Limit of % two-week contracts reached', v_league.max_two_week_contracts;
    end if;
  end if;

  v_total_cost := calculate_contract_cost(p_base_value, p_weeks_requested, v_league.interest_rate_per_week);

  select coalesce(sum(total_cost), 0) into v_team_committed
  from signings where team_id = p_team_id and season = p_season and status = 'active';

  if v_team_committed + v_total_cost > v_league.salary_cap then
    raise exception 'Exceeds salary cap ($% remaining)', v_league.salary_cap - v_team_committed;
  end if;

  v_end_week := compute_contract_end_week(v_player.team, p_season, p_start_week, p_weeks_requested);

  insert into signings (
    user_id, team_id, league_id, sleeper_id, season, start_week,
    weeks_requested, end_week, base_value, interest_rate_applied, total_cost, status
  ) values (
    auth.uid(), p_team_id, v_league.id, p_sleeper_id, p_season, p_start_week,
    p_weeks_requested, v_end_week, p_base_value, v_league.interest_rate_per_week, v_total_cost, 'active'
  )
  returning * into v_new_signing;

  return v_new_signing;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function sign_player to authenticated;

-- ============================================================
-- Full schedule — real game-by-game matchups, pulled from nflverse (the
-- same trusted source as your player stats). Bye weeks get computed from
-- this rather than entered by hand: a team's bye is just whichever week
-- it has no game in.
-- ============================================================

create table if not exists games (
  id          bigserial primary key,
  game_id     text unique not null,
  season      int not null,
  week        int not null,
  season_type text not null default 'REG',   -- REG, POST, or PRE
  game_date   date,
  game_time   text,
  home_team   text not null,
  away_team   text not null,
  created_at  timestamptz default now()
);

create index if not exists idx_games_season_week on games(season, week);
create index if not exists idx_games_teams on games(home_team, away_team);

alter table games enable row level security;

create policy "public can read games" on games
  for select using (true);

-- Recomputes bye_weeks for a season from the real schedule in `games`.
-- Safe to re-run any time the schedule changes (e.g. after a flex/move).
create or replace function populate_bye_weeks(p_season int) returns void as $$
begin
  delete from bye_weeks where season = p_season;

  insert into bye_weeks (team, season, week)
  select t.team, p_season, w.week
  from (
    select distinct home_team as team from games where season = p_season and season_type = 'REG'
    union
    select distinct away_team from games where season = p_season and season_type = 'REG'
  ) t
  cross join (
    select distinct week from games where season = p_season and season_type = 'REG'
  ) w
  where not exists (
    select 1 from games g
    where g.season = p_season and g.season_type = 'REG' and g.week = w.week
      and (g.home_team = t.team or g.away_team = t.team)
  );
end;
$$ language plpgsql;

-- Powers a player profile's schedule display: one row per week, with the
-- opponent formatted the way fantasy sites usually show it — plain
-- abbreviation for a home game ('WAS'), '@' prefix for an away game
-- ('@TEN'), or 'BYE' for the player's bye week.
create or replace function get_player_schedule(p_sleeper_id text, p_season int)
returns table (week int, opponent text) as $$
declare
  v_team text;
begin
  select team into v_team from players where sleeper_id = p_sleeper_id;
  if v_team is null then
    raise exception 'Player not found';
  end if;

  return query
    select w.week,
      coalesce(
        (select case when g.home_team = v_team then g.away_team else '@' || g.home_team end
         from games g
         where g.season = p_season and g.season_type = 'REG' and g.week = w.week
           and (g.home_team = v_team or g.away_team = v_team)
         limit 1),
        'BYE'
      ) as opponent
    from (select distinct week from games where season = p_season and season_type = 'REG') w
    order by w.week;
end;
$$ language plpgsql stable;

-- ============================================================
-- Season projections — full-season totals, ONE row per player per season.
-- This is the real source of truth for projections (not a weekly split).
-- Because it's one row per player, you can edit it directly and easily in
-- Supabase's Table Editor — click a cell, change the number, done. No
-- script needed for one-off fixes.
-- ============================================================

create table if not exists season_projections (
  id                bigserial primary key,
  sleeper_id        text references players(sleeper_id) not null,
  gsis_id           text references players(gsis_id),
  season            int not null,
  completions       numeric,
  attempts          numeric,
  passing_yards     numeric,
  passing_tds       numeric,
  interceptions     numeric,
  rushing_attempts  numeric,
  rushing_yards     numeric,
  rushing_tds       numeric,
  receptions        numeric,
  targets           numeric,
  receiving_yards   numeric,
  receiving_tds     numeric,
  fumbles_lost      numeric,
  updated_at        timestamptz default now(),
  unique (sleeper_id, season)
);

create index if not exists idx_season_projections_player on season_projections(sleeper_id, season);

alter table season_projections enable row level security;

create policy "public can read season_projections" on season_projections
  for select using (true);

-- get_rankings now reads projections from season_projections directly
-- (one row per player — no summing needed) instead of projected_stats.
create or replace function get_rankings(
  p_season int,
  p_scoring_id bigint,
  p_position text default null,
  p_use_projected boolean default false
) returns table (
  sleeper_id text,
  full_name text,
  player_position text,
  team text,
  fantasy_points numeric
) as $$
begin
  if p_use_projected then
    return query
      select p.sleeper_id, p.full_name, p.position as player_position, p.team,
             calculate_fantasy_points(
               s.passing_yards, s.passing_tds, s.interceptions,
               s.rushing_yards, s.rushing_tds,
               s.receptions, s.receiving_yards, s.receiving_tds,
               s.fumbles_lost, ss
             ) as fantasy_points
      from players p
      join season_projections s on s.sleeper_id = p.sleeper_id and s.season = p_season
      cross join (select * from scoring_settings where id = p_scoring_id) ss
      where (p_position is null or p.position = p_position)
      order by fantasy_points desc;
  else
    return query
      select p.sleeper_id, p.full_name, p.position as player_position, p.team,
             sum(calculate_fantasy_points(
               s.passing_yards, s.passing_tds, s.interceptions,
               s.rushing_yards, s.rushing_tds,
               s.receptions, s.receiving_yards, s.receiving_tds,
               s.fumbles_lost, ss
             )) as fantasy_points
      from players p
      join weekly_stats s on s.sleeper_id = p.sleeper_id and s.season = p_season
      cross join (select * from scoring_settings where id = p_scoring_id) ss
      where (p_position is null or p.position = p_position)
      group by p.sleeper_id, p.full_name, p.position, p.team
      order by fantasy_points desc;
  end if;
end;
$$ language plpgsql stable;

-- ============================================================
-- Draft/auction values — a fixed cap % per player (your sliding scale),
-- independent of any one league's actual cap size. get_draft_board()
-- multiplies that % by whatever a specific league's salary_cap is set to,
-- so the same underlying values work for every league regardless of cap.
-- ============================================================

create table if not exists player_cap_values (
  sleeper_id  text primary key references players(sleeper_id),
  rank        int,
  cap_percent numeric not null,
  updated_at  timestamptz default now()
);

create index if not exists idx_player_cap_values_rank on player_cap_values(rank);

alter table player_cap_values enable row level security;

create policy "public can read player_cap_values" on player_cap_values
  for select using (true);

-- What the draft room actually calls: give it a league, get back every
-- player with their dollar value for THAT league's cap, in draft order.
create or replace function get_draft_board(p_league_id bigint)
returns table (
  sleeper_id text,
  full_name text,
  player_position text,
  team text,
  rank int,
  cap_percent numeric,
  dollar_value numeric
) as $$
declare
  v_cap numeric;
begin
  select salary_cap into v_cap from leagues where id = p_league_id;
  if v_cap is null then
    raise exception 'League not found';
  end if;

  return query
    select p.sleeper_id, p.full_name, p.position as player_position, p.team,
           c.rank, c.cap_percent,
           round(v_cap * c.cap_percent / 100, 2) as dollar_value
    from player_cap_values c
    join players p on p.sleeper_id = c.sleeper_id
    order by c.cap_percent desc, c.rank asc nulls last;
end;
$$ language plpgsql stable;

-- ============================================================
-- User profiles & auth support
-- Supabase Auth (auth.users) handles email/password and Google OAuth
-- natively. This adds what it doesn't: unique usernames, login-by-
-- username-or-email, and the random avatar seed assigned at signup.
-- ============================================================

create table if not exists profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique,
  avatar_bg_color text,
  avatar_style    int,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table profiles enable row level security;

create policy "public can read profiles" on profiles
  for select using (true);

create policy "users can update own profile" on profiles
  for update using (auth.uid() = id);

-- Fires the moment someone signs up (email or Google) — creates their
-- profile row immediately with a random avatar and no username yet.
-- The username gets set afterward via claim_username(), matching the
-- "create username after email/Google step" flow.
create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, avatar_bg_color, avatar_style)
  values (
    new.id,
    '#' || substr(md5(random()::text), 1, 6),
    (floor(random() * 8) + 1)::int
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Frontend calls this while the user is typing, for live "username taken"
-- feedback before they even submit.
create or replace function check_username_available(p_username text) returns boolean as $$
  select not exists (select 1 from profiles where username = p_username);
$$ language sql stable security definer set search_path = public;

grant execute on function check_username_available to anon, authenticated;

-- Actually claims the username once they submit. Runs as the logged-in
-- user (auth.uid()), so nobody can set someone else's profile.
create or replace function claim_username(p_username text) returns void as $$
begin
  if length(p_username) < 3 then
    raise exception 'Username must be at least 3 characters';
  end if;

  update profiles set username = p_username, updated_at = now()
  where id = auth.uid();

exception
  when unique_violation then
    raise exception 'That username is already taken';
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function claim_username to authenticated;

-- The login box accepts either a username or an email. Frontend calls
-- this FIRST to resolve whatever was typed into a real email, then hands
-- that to Supabase's normal signInWithPassword(). If nothing matches,
-- returns null — frontend shows the generic "email or password are
-- incorrect" message either way, so this never reveals which part failed.
create or replace function get_email_for_login(p_identifier text) returns text as $$
declare
  v_email text;
begin
  if p_identifier ilike '%@%' then
    return p_identifier;
  end if;

  select u.email into v_email
  from profiles pr
  join auth.users u on u.id = pr.id
  where pr.username = p_identifier;

  return v_email;
end;
$$ language plpgsql stable security definer set search_path = public;

grant execute on function get_email_for_login to anon;

-- Powers the homepage rankings widget. Default 10 for the small preview;
-- call with a bigger limit (or count of your full list) for the expanded
-- "click to see everything" view — same function either way.
create or replace function get_top_rankings(p_limit int default 10)
returns table (
  rank int,
  full_name text,
  player_position text,
  team text,
  cap_percent numeric
) as $$
  select c.rank, p.full_name, p.position as player_position, p.team, c.cap_percent
  from player_cap_values c
  join players p on p.sleeper_id = c.sleeper_id
  where c.rank is not null
  order by c.rank asc
  limit p_limit;
$$ language sql stable;

grant execute on function get_top_rankings to anon, authenticated;