-- SPORT CHALLENGE – Supabase Datenbank
-- Challenge-Start: 28.09.2026
-- RLS sorgt dafür, dass nur eingeloggte Teilnehmer Daten sehen.
-- Nach dem Anlegen der Tabellen die beiden Benutzer in Supabase Auth anlegen
-- und ihre UUIDs in profiles eintragen.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (name in ('Yannick','Felix')),
  is_admin boolean not null default false
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  sport text not null,
  activity_date date not null,
  duration_min integer check (duration_min is null or duration_min >= 0),
  distance_km numeric(10,2) check (distance_km is null or distance_km >= 0),
  created_at timestamptz not null default now()
);

create table if not exists penalties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  week_start date not null,
  amount numeric(10,2) not null default 15.00,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, week_start)
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(10,2) not null check (amount > 0),
  spent_at date not null default current_date,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table activities enable row level security;
alter table penalties enable row level security;
alter table expenses enable row level security;

create or replace function is_participant()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from profiles where id=auth.uid()); $$;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from profiles where id=auth.uid() and is_admin=true); $$;

drop policy if exists "participants read profiles" on profiles;
create policy "participants read profiles" on profiles for select using (is_participant());

drop policy if exists "users read own activities" on activities;
create policy "users read own activities" on activities for select using (user_id=auth.uid());
drop policy if exists "users insert own activities" on activities;
create policy "users insert own activities" on activities for insert with check (user_id=auth.uid());
drop policy if exists "users update own activities" on activities;
create policy "users update own activities" on activities for update using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "users delete own activities" on activities;
create policy "users delete own activities" on activities for delete using (user_id=auth.uid());

drop policy if exists "participants read penalties" on penalties;
create policy "participants read penalties" on penalties for select using (is_participant());
drop policy if exists "admins manage penalties" on penalties;
create policy "admins manage penalties" on penalties for all using (is_admin()) with check (is_admin());

drop policy if exists "participants read expenses" on expenses;
create policy "participants read expenses" on expenses for select using (is_participant());
drop policy if exists "admins manage expenses" on expenses;
create policy "admins manage expenses" on expenses for all using (is_admin()) with check (is_admin());

-- Automatische Neuberechnung:
-- Für jede abgeschlossene Woche wird aus den tatsächlichen Aktivitäten
-- ermittelt, wie viele Strikes bis dahin entstanden sind.
-- Eine fällige 15-Euro-Zahlung wird als Penalty für die jeweilige Woche gespeichert.
-- Beim späteren Nachtragen einer Einheit wird eine nicht mehr benötigte
-- Penalty automatisch gelöscht. Dadurch sinkt auch der Kassenstand wieder,
-- sofern die Zahlung noch nicht als bezahlt markiert war.
--
-- Die Funktion erhält die "paid"-Information bestehender Penalties.
create or replace function recalculate_penalties_for_user(p_user uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare
  ws date;
  week_count integer;
  strikes integer := 0;
  needed boolean;
  existing_paid boolean;
  start_date date := date '2026-09-28';
  end_date date := date_trunc('week', current_date)::date - 1;
begin
  if not exists(select 1 from profiles where id=p_user) then return; end if;

  for ws in
    select generate_series(start_date, end_date, interval '7 days')::date
  loop
    select count(*) into week_count
    from activities
    where user_id=p_user
      and activity_date >= ws
      and activity_date < ws + 7;

    -- Nur abgeschlossene Wochen werden abgerechnet.
    needed := greatest(0, 3 - week_count) > 0;
    strikes := strikes + greatest(0, 3 - week_count);

    if strikes >= 3 then
      if exists(select 1 from penalties where user_id=p_user and week_start=ws) then
        -- Bestehende Penalty bleibt bestehen, insbesondere paid.
        null;
      else
        insert into penalties(user_id,week_start,amount)
        values(p_user,ws,15.00)
        on conflict (user_id,week_start) do nothing;
      end if;
      strikes := strikes - 3;
    else
      delete from penalties where user_id=p_user and week_start=ws;
    end if;
  end loop;
end;
$$;

create or replace function recalculate_all_penalties()
returns void language plpgsql security definer set search_path=public
as $$
declare p uuid;
begin
  for p in select id from profiles loop
    perform recalculate_penalties_for_user(p);
  end loop;
end;
$$;

create or replace function trg_recalc_penalties()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  perform recalculate_penalties_for_user(coalesce(new.user_id, old.user_id));
  return coalesce(new,old);
end;
$$;

drop trigger if exists activities_recalc_penalties on activities;
create trigger activities_recalc_penalties
after insert or update or delete on activities
for each row execute function trg_recalc_penalties();

-- Beim ersten Einrichten einmal manuell ausführen:
select recalculate_all_penalties();
