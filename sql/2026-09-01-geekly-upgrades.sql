-- ============================================================
-- Geekly — September 2026 upgrade migration
--
-- Run this once in the Supabase SQL Editor, after draft-end-session.sql.
-- Everything here is idempotent: re-running it is safe.
--
-- Sections
--   1. Free agency + dead cap
--   2. Leave / delete league
--   3. End-of-season promotion & relegation
--   4. Cross-league player draft stock
--   5. Relegation toggle persistence
-- ============================================================


-- ============================================================
-- 1. Free agency + dead cap
--
-- Any team may sign an unrostered player for a single week at no cost, but
-- only by cutting somebody to make room. A cut contract does not disappear:
-- 80% of what that player would have cost in each remaining week still
-- counts against the team's cap. A $20/17-week deal cut early keeps charging
-- 80% of its (interest-grown) weekly figure right through week 17.
-- ============================================================

alter table signings add column if not exists cut_at_week  int;
alter table signings add column if not exists dead_cap_pct numeric;

-- 'cut' is a fourth resting state alongside the three the table started with.
alter table signings drop constraint if exists signings_status_check;
alter table signings add constraint signings_status_check
  check (status in ('active', 'expired', 'dropped', 'cut'));

create index if not exists idx_signings_team_dead_cap
  on signings(team_id, season, status);


-- Every player nobody in this league currently holds, richest first — the
-- same ordering and dollar conversion the draft board uses.
create or replace function get_free_agents(p_league_id bigint, p_season int default 2026)
returns table (
  sleeper_id      text,
  full_name       text,
  player_position text,
  team            text,
  rank            int,
  cap_percent     numeric,
  dollar_value    numeric
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
     where not exists (
             select 1 from signings s
              where s.league_id = p_league_id
                and s.season = p_season
                and s.sleeper_id = p.sleeper_id
                and s.status = 'active'
           )
     order by c.cap_percent desc, c.rank asc nulls last;
end;
$$ language plpgsql stable;

grant execute on function get_free_agents to authenticated;


-- Contracts a team has cut but is still paying for.
create or replace function get_team_dead_cap(p_team_id bigint, p_season int default 2026)
returns table (
  signing_id             bigint,
  sleeper_id             text,
  full_name              text,
  player_position        text,
  team                   text,
  start_week             int,
  end_week               int,
  weeks_requested        int,
  base_value             numeric,
  interest_rate_applied  numeric,
  dead_cap_pct           numeric,
  cut_at_week            int
) as $$
  select s.id, s.sleeper_id, p.full_name, p.position, p.team,
         s.start_week, s.end_week, s.weeks_requested,
         s.base_value, s.interest_rate_applied,
         coalesce(s.dead_cap_pct, 0.80), s.cut_at_week
    from signings s
    join players p on p.sleeper_id = s.sleeper_id
   where s.team_id = p_team_id
     and s.season = p_season
     and s.status = 'cut';
$$ language sql stable;

grant execute on function get_team_dead_cap to authenticated;


-- A team's live contracts, each with its signings.id so the roster panel can
-- offer them up as the player to cut. get_team_active_signings does not carry
-- the row id, and the cut has to name one.
create or replace function get_team_contracts(p_team_id bigint, p_season int default 2026)
returns table (
  signing_id            bigint,
  sleeper_id            text,
  full_name             text,
  player_position       text,
  team                  text,
  start_week            int,
  end_week              int,
  weeks_requested       int,
  base_value            numeric,
  interest_rate_applied numeric
) as $$
  select s.id, s.sleeper_id, p.full_name, p.position, p.team,
         s.start_week, s.end_week, s.weeks_requested,
         s.base_value, s.interest_rate_applied
    from signings s
    join players p on p.sleeper_id = s.sleeper_id
   where s.team_id = p_team_id
     and s.season = p_season
     and s.status = 'active'
   order by s.start_week, p.full_name;
$$ language sql stable;

grant execute on function get_team_contracts to authenticated;


-- Would one more player at this position still fit on the team's roster?
-- Dedicated slots fill first, RB/WR/TE spill into FLEX, and anything left
-- over (QBs included) needs a SUPERFLEX or BENCH spot. Mirrors canFitPosition
-- in web/src/draftControls.jsx exactly, so the client and the server can never
-- disagree about whether a signing is legal.
create or replace function team_can_roster_position(
  p_team_id bigint,
  p_season int,
  p_position text,
  p_excluding_signing_id bigint default null
) returns boolean as $$
declare
  v_league    jsonb;
  v_counts    jsonb := '{"QB":0,"RB":0,"WR":0,"TE":0}'::jsonb;
  v_pos       text;
  v_dedicated int;
  v_overflow  int;
  v_flex_need int := 0;
  v_wild_need int := 0;
  v_max       int;
  v_rec       record;
begin
  select to_jsonb(l) into v_league
    from leagues l join teams t on t.league_id = l.id
   where t.id = p_team_id;
  if v_league is null then
    return false;
  end if;

  for v_rec in
    select p.position as pos, count(*)::int as n
      from signings s
      join players p on p.sleeper_id = s.sleeper_id
     where s.team_id = p_team_id
       and s.season = p_season
       and s.status = 'active'
       and (p_excluding_signing_id is null or s.id <> p_excluding_signing_id)
     group by p.position
  loop
    v_counts := jsonb_set(v_counts, array[v_rec.pos], to_jsonb(v_rec.n));
  end loop;

  -- the prospective signing
  v_counts := jsonb_set(
    v_counts, array[p_position],
    to_jsonb(coalesce((v_counts ->> p_position)::int, 0) + 1)
  );

  -- a per-position draft ceiling, when the league sets one
  v_max := (v_league ->> ('max_draft_' || lower(p_position)))::int;
  if v_max is not null and (v_counts ->> p_position)::int > v_max then
    return false;
  end if;

  foreach v_pos in array array['QB', 'RB', 'WR', 'TE'] loop
    v_dedicated := coalesce((v_league ->> ('roster_' || lower(v_pos)))::int, 0);
    v_overflow := greatest(0, coalesce((v_counts ->> v_pos)::int, 0) - v_dedicated);
    if v_pos = 'QB' then
      v_wild_need := v_wild_need + v_overflow;
    else
      v_flex_need := v_flex_need + v_overflow;
    end if;
  end loop;

  return greatest(0, v_flex_need - coalesce((v_league ->> 'roster_flex')::int, 0)) + v_wild_need
         <= coalesce((v_league ->> 'roster_superflex')::int, 0)
          + coalesce((v_league ->> 'roster_bench')::int, 0);
end;
$$ language plpgsql stable security definer set search_path = public;

grant execute on function team_can_roster_position to authenticated;


-- Sign a free agent for one week at no cost, cutting somebody to make room.
-- The cut contract flips to 'cut' and keeps charging 80% of each remaining
-- week against the cap.
create or replace function sign_free_agent(
  p_team_id        bigint,
  p_sleeper_id     text,
  p_cut_signing_id bigint,
  p_week           int,
  p_season         int default 2026
) returns signings as $$
declare
  v_team        teams;
  v_league      leagues;
  v_player      players;
  v_cut         signings;
  v_end_week    int;
  v_new_signing signings;
begin
  select * into v_team from teams where id = p_team_id;
  if v_team is null then
    raise exception 'Team not found';
  end if;
  if v_team.owner_id <> auth.uid() then
    raise exception 'You do not own this team';
  end if;

  select * into v_league from leagues where id = v_team.league_id;
  if p_week < 1 or p_week > v_league.season_weeks then
    raise exception 'Week % is outside this league''s season', p_week;
  end if;

  select * into v_player from players where sleeper_id = p_sleeper_id;
  if v_player is null then
    raise exception 'Player not found';
  end if;

  if exists (
    select 1 from signings
     where league_id = v_league.id and sleeper_id = p_sleeper_id
       and season = p_season and status = 'active'
  ) then
    raise exception 'This player is already signed in this league';
  end if;

  select * into v_cut from signings where id = p_cut_signing_id;
  if v_cut is null or v_cut.team_id <> p_team_id or v_cut.season <> p_season or v_cut.status <> 'active' then
    raise exception 'Pick one of your own active contracts to cut';
  end if;

  if not team_can_roster_position(p_team_id, p_season, v_player.position, p_cut_signing_id) then
    raise exception 'No roster slot left for another %', v_player.position;
  end if;

  update signings
     set status = 'cut',
         cut_at_week = p_week,
         dead_cap_pct = 0.80
   where id = p_cut_signing_id;

  v_end_week := compute_contract_end_week(v_player.team, p_season, p_week, 1);

  insert into signings (
    user_id, team_id, league_id, sleeper_id, season, start_week,
    weeks_requested, end_week, base_value, interest_rate_applied, total_cost, status
  ) values (
    auth.uid(), p_team_id, v_league.id, p_sleeper_id, p_season, p_week,
    1, v_end_week, 0, v_league.interest_rate_per_week, 0, 'active'
  )
  returning * into v_new_signing;

  return v_new_signing;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function sign_free_agent to authenticated;


-- ============================================================
-- 2. Leave / delete league
--
-- Anyone can walk away from a league they are merely a member of. The
-- commissioner can do the same, and can also tear the whole league down.
-- ============================================================

create or replace function leave_league(p_league_id bigint)
returns void as $$
declare
  v_team      teams;
  v_is_owner  boolean;
  v_successor uuid;
begin
  select * into v_team
    from teams
   where league_id = p_league_id and owner_id = auth.uid();
  if v_team is null then
    raise exception 'You are not in this league';
  end if;

  select owner_id = auth.uid() into v_is_owner from leagues where id = p_league_id;

  -- A commissioner walking out hands the league to whoever else is in it; if
  -- there is nobody, there is nothing to hand over and the league should be
  -- deleted instead.
  if v_is_owner then
    select owner_id into v_successor
      from teams
     where league_id = p_league_id and owner_id is not null and owner_id <> auth.uid()
     order by created_at asc
     limit 1;
    if v_successor is null then
      raise exception 'You are the only member left — delete the league instead of leaving it';
    end if;
    update leagues set owner_id = v_successor where id = p_league_id;
  end if;

  delete from signings where team_id = v_team.id;
  delete from teams where id = v_team.id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function leave_league to authenticated;


create or replace function delete_league(p_league_id bigint)
returns void as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from leagues where id = p_league_id;
  if v_owner is null then
    raise exception 'League not found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Only the commissioner can delete this league';
  end if;

  delete from signings where league_id = p_league_id;
  delete from teams where league_id = p_league_id;
  delete from league_tiers where league_id = p_league_id;
  delete from league_auction_schedule where league_id = p_league_id;

  -- Tables added after schema.sql (draft sessions, matchups, ...) are cleared
  -- by name only if they exist, so this runs on any vintage of the database.
  if to_regclass('public.draft_sessions') is not null then
    execute 'delete from draft_sessions where league_id = $1' using p_league_id;
  end if;
  if to_regclass('public.matchups') is not null then
    execute 'delete from matchups where league_id = $1' using p_league_id;
  end if;
  if to_regclass('public.league_matchups') is not null then
    execute 'delete from league_matchups where league_id = $1' using p_league_id;
  end if;

  delete from leagues where id = p_league_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function delete_league to authenticated;


-- ============================================================
-- 3. End-of-season promotion & relegation
--
-- Moves happen for real: the top N of every tier below the first go up, the
-- bottom N of every tier above the last go down, where N is the league's
-- promote_relegate_count. Ranking reuses get_league_standings so this agrees
-- with the standings table people have been reading all season, and each move
-- goes through move_team_tier so tier slot bookkeeping stays in one place.
-- ============================================================

create or replace function apply_end_of_season_relegation(p_league_id bigint, p_season int default 2026)
returns table (team_id bigint, team_name text, from_tier int, to_tier int, movement text) as $$
declare
  v_league     leagues;
  v_tier_count int;
  v_count      int;
  v_tier       int;
  v_rank       int;
  v_total      int;
  v_row        record;
  v_moves      jsonb := '[]'::jsonb;
  v_move       jsonb;
begin
  select * into v_league from leagues where id = p_league_id;
  if v_league is null then
    raise exception 'League not found';
  end if;
  if v_league.owner_id <> auth.uid() then
    raise exception 'Only the commissioner can run promotion and relegation';
  end if;

  v_tier_count := case when v_league.relegation_enabled then greatest(v_league.relegation_tiers, 1) else 1 end;
  if v_tier_count < 2 then
    raise exception 'This league only has one tier — there is nowhere to promote or relegate to';
  end if;

  v_count := greatest(coalesce(v_league.promote_relegate_count, 1), 1);

  -- Work out every move against the untouched standings first, then apply
  -- them, so an early promotion can't reshuffle a later tier's ranking.
  for v_tier in 1..v_tier_count loop
    select count(*) into v_total from get_league_standings(p_league_id, p_season, v_tier);

    v_rank := 0;
    for v_row in
      select s.team_id, s.team_name
        from get_league_standings(p_league_id, p_season, v_tier) s
       order by s.wins desc, s.points_for desc
    loop
      v_rank := v_rank + 1;

      if v_tier > 1 and v_rank <= v_count then
        v_moves := v_moves || jsonb_build_object(
          'team_id', v_row.team_id, 'team_name', v_row.team_name,
          'from_tier', v_tier, 'to_tier', v_tier - 1, 'movement', 'promoted'
        );
      elsif v_tier < v_tier_count and v_rank > v_total - v_count then
        v_moves := v_moves || jsonb_build_object(
          'team_id', v_row.team_id, 'team_name', v_row.team_name,
          'from_tier', v_tier, 'to_tier', v_tier + 1, 'movement', 'relegated'
        );
      end if;
    end loop;
  end loop;

  for v_move in select * from jsonb_array_elements(v_moves) loop
    perform move_team_tier(
      (v_move ->> 'team_id')::bigint,
      case when v_move ->> 'movement' = 'promoted' then 'up' else 'down' end
    );
  end loop;

  return query
    select (m ->> 'team_id')::bigint, m ->> 'team_name',
           (m ->> 'from_tier')::int, (m ->> 'to_tier')::int, m ->> 'movement'
      from jsonb_array_elements(v_moves) m;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function apply_end_of_season_relegation to authenticated;


-- ============================================================
-- 4. Cross-league player draft stock
--
-- Who is going up and who is going down, measured across every league on the
-- site rather than your own. The metric is deliberately plain for now: how
-- many teams anywhere signed this player to start a given week, compared with
-- the week before.
-- ============================================================

create table if not exists player_draft_stock (
  season      int not null,
  week        int not null,
  sleeper_id  text not null references players(sleeper_id),
  draft_count int not null default 0,
  updated_at  timestamptz default now(),
  primary key (season, week, sleeper_id)
);

create index if not exists idx_player_draft_stock_week on player_draft_stock(season, week);

alter table player_draft_stock enable row level security;

drop policy if exists "public can read player_draft_stock" on player_draft_stock;
create policy "public can read player_draft_stock" on player_draft_stock
  for select using (true);


-- Recomputes a season's counts from the signings table. Cheap enough to call
-- when the home page loads; it only ever touches one season.
create or replace function refresh_player_draft_stock(p_season int default 2026)
returns void as $$
begin
  delete from player_draft_stock where season = p_season;

  insert into player_draft_stock (season, week, sleeper_id, draft_count)
  select p_season, s.start_week, s.sleeper_id, count(*)::int
    from signings s
   where s.season = p_season
     and s.start_week is not null
     and s.status in ('active', 'expired', 'cut')
   group by s.start_week, s.sleeper_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function refresh_player_draft_stock to authenticated;


-- The movers for the most recent week that has any signings at all, with the
-- last p_history_weeks of counts attached so the card can draw a line chart.
create or replace function get_player_stock_movers(
  p_season int default 2026,
  p_limit int default 2,
  p_history_weeks int default 6
) returns table (
  sleeper_id      text,
  full_name       text,
  player_position text,
  team            text,
  direction       text,
  week            int,
  this_week       int,
  last_week       int,
  delta           int,
  series          jsonb
) as $$
declare
  v_week  int;
  v_first int;
begin
  select max(pds.week) into v_week from player_draft_stock pds where pds.season = p_season;
  if v_week is null then
    return;
  end if;
  v_first := greatest(1, v_week - p_history_weeks + 1);

  return query
  with counts as (
    select p.sleeper_id, p.full_name, p.position as player_position, p.team,
           coalesce(cur.draft_count, 0) as this_week,
           coalesce(prev.draft_count, 0) as last_week
      from players p
      left join player_draft_stock cur
             on cur.sleeper_id = p.sleeper_id and cur.season = p_season and cur.week = v_week
      left join player_draft_stock prev
             on prev.sleeper_id = p.sleeper_id and prev.season = p_season and prev.week = v_week - 1
     where cur.draft_count is not null or prev.draft_count is not null
  ),
  moved as (
    select c.*, c.this_week - c.last_week as delta from counts c
  ),
  picked as (
    (select m.*, 'up'::text as direction from moved m
      where m.this_week - m.last_week > 0
      order by m.this_week - m.last_week desc, m.this_week desc limit p_limit)
    union all
    (select m.*, 'down'::text as direction from moved m
      where m.this_week - m.last_week < 0
      order by m.this_week - m.last_week asc, m.last_week desc limit p_limit)
  )
  select k.sleeper_id, k.full_name, k.player_position, k.team, k.direction,
         v_week, k.this_week, k.last_week, k.delta,
         (
           select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'count', coalesce(h.draft_count, 0)) order by w.week), '[]'::jsonb)
             from generate_series(v_first, v_week) as w(week)
             left join player_draft_stock h
                    on h.sleeper_id = k.sleeper_id and h.season = p_season and h.week = w.week
         ) as series
    from picked k
   order by k.direction desc, abs(k.delta) desc;
end;
$$ language plpgsql stable;

grant execute on function get_player_stock_movers to authenticated;
grant execute on function get_player_stock_movers to anon;


-- ============================================================
-- 5. Relegation toggle persistence
--
-- update_general_settings writes relegation_tiers but there was nothing
-- writing relegation_enabled, so raising the tier count on a league that
-- started life with relegation off looked like the setting simply refused to
-- save. This is deliberately its own small function rather than a rewrite of
-- update_general_settings, so nothing else about that call changes.
-- ============================================================

create or replace function update_league_relegation_enabled(p_league_id bigint, p_enabled boolean)
returns void as $$
begin
  if not exists (select 1 from leagues where id = p_league_id and owner_id = auth.uid()) then
    raise exception 'Only the commissioner can change this setting';
  end if;
  update leagues set relegation_enabled = p_enabled where id = p_league_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function update_league_relegation_enabled to authenticated;
