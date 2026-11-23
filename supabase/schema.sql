-- Keystrike leaderboard. Applied to the Supabase project as a migration.
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  device text not null check (char_length(device) between 8 and 40),
  name text not null check (char_length(name) between 1 and 12),
  level text not null check (level in ('beginner', 'expert')),
  day date not null,
  score int not null check (score between 0 and 200000),
  dist int not null check (dist between 0 and 20000),
  words int not null,
  accuracy int not null,
  secs real not null,
  created_at timestamptz not null default now(),
  unique (device, level, day)
);
alter table public.scores enable row level security;   -- no policies: the web page cannot touch the table directly

create or replace function public.submit_score(
  p_device text, p_name text, p_level text, p_day date,
  p_score int, p_dist int, p_words int, p_keys int, p_good int, p_secs real)
returns jsonb language plpgsql security definer set search_path = public as $$
declare nm text; today date := (now() at time zone 'utc')::date;
begin
  nm := btrim(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9 _.-]', '', 'g'));
  if char_length(nm) < 1 or char_length(nm) > 12 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if p_level not in ('beginner', 'expert') or p_device is null or char_length(p_device) < 8 or char_length(p_device) > 40 then
    return jsonb_build_object('ok', false, 'error', 'input'); end if;
  if p_day is null or p_day < today - 1 or p_day > today then return jsonb_build_object('ok', false, 'error', 'day'); end if;
  -- Reject impossible runs: ship speed tops out near 27 m/s, a word is 3+ letters, 8 letters at most, combo bonus x3 at most.
  if p_secs is null or p_secs < 5 or p_secs > 3600
     or p_dist < 0 or p_dist > p_secs * 29
     or p_words < 0 or p_words > p_secs * 5 + 2
     or p_keys < 0 or p_keys > p_secs * 16 + 10
     or p_good < p_words * 3 or p_good > p_keys
     or p_score < 0 or p_score > p_words * 360
  then return jsonb_build_object('ok', false, 'error', 'implausible'); end if;
  insert into public.scores (device, name, level, day, score, dist, words, accuracy, secs)
  values (p_device, nm, p_level, p_day, p_score, p_dist, p_words, case when p_keys > 0 then round(p_good * 100.0 / p_keys) else 100 end, p_secs)
  on conflict (device, level, day) do update
    set name = excluded.name, score = excluded.score, dist = excluded.dist, words = excluded.words, accuracy = excluded.accuracy, secs = excluded.secs
    where excluded.score > public.scores.score;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.leaderboard(p_level text, p_period text, p_device text)
returns table(rank bigint, name text, score int, dist int, mine boolean)
language sql security definer stable set search_path = public as $$
  with src as (
    select device, name, score, dist, created_at from public.scores
    where level = p_level and (
      (p_period = 'day' and day = (now() at time zone 'utc')::date) or
      (p_period = 'week' and day >= (now() at time zone 'utc')::date - 6) or
      (p_period = 'all'))
  ), best as (
    select distinct on (device) device, name, score, dist from src order by device, score desc, created_at
  ), ranked as (
    select rank() over (order by score desc, dist desc) as rnk, device, name, score, dist from best
  )
  select rnk, ranked.name, ranked.score, ranked.dist, ranked.device = p_device
  from ranked where rnk <= 10 or ranked.device = p_device order by rnk, ranked.name;
$$;

revoke all on function public.submit_score(text, text, text, date, int, int, int, int, int, real) from public;
revoke all on function public.leaderboard(text, text, text) from public;
grant execute on function public.submit_score(text, text, text, date, int, int, int, int, int, real) to anon, authenticated;
grant execute on function public.leaderboard(text, text, text) to anon, authenticated;
