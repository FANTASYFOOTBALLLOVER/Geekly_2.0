-- ============================================================
-- draft_end_session — closes a league's auction out for good.
--
-- Run this in the Supabase SQL Editor once. It is kept separate from
-- schema.sql because it depends on the draft_sessions table, which is
-- created alongside the rest of the live-draft RPCs rather than in
-- schema.sql.
--
-- The draft room works out *when* an auction is finished (every team either
-- has a full roster or has too little cap left this week to sign anybody)
-- because that calculation needs the same bye-week and interest math the
-- board already runs. This function is the other half: it takes that call
-- from a league member and makes it stick for everyone.
-- ============================================================

create or replace function draft_end_session(p_league_id bigint)
returns void as $$
begin
  -- Only someone actually in the league may end its draft.
  if not exists (
    select 1 from teams
     where teams.league_id = p_league_id
       and teams.owner_id = auth.uid()
  ) and not exists (
    select 1 from leagues
     where leagues.id = p_league_id
       and leagues.owner_id = auth.uid()
  ) then
    raise exception 'Not a member of this league';
  end if;

  -- A draft that never started stays pending, and one already ended stays
  -- ended — this only closes out an auction that is genuinely in progress.
  update draft_sessions
     set phase = 'ended'
   where league_id = p_league_id
     and phase not in ('pending', 'ended');
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function draft_end_session to authenticated;
