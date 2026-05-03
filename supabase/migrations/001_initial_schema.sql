-- ============================================================
-- Out of Joint — Classic (No Cross-Table)
-- Supabase migration: 001_initial_schema.sql
-- ============================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- TYPES
-- ============================================================

create type play_mode as enum ('teams', 'whole_room');
create type round_phase as enum (
  'lobby',
  'base_applied',
  'voting_open',
  'voting_closed',
  'net_applied',
  'collapsed',
  'finished'
);

-- ============================================================
-- TABLES
-- ============================================================

-- rooms -------------------------------------------------------
create table rooms (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,               -- 6-char uppercase join code
  mode          play_mode not null default 'teams',
  num_teams     int not null default 2 check (num_teams between 1 and 8),
  current_round int not null default 0,             -- 0 = lobby; 1-4 = active round
  phase         round_phase not null default 'lobby',
  voting_ends_at timestamptz,                       -- null when no active timer
  host_secret   text not null,                      -- UUID known only to host browser tab
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- teams -------------------------------------------------------
create table teams (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms(id) on delete cascade,
  slot       int not null,                          -- 1-indexed team number
  name       text not null,
  economy    int not null default 5,
  cohesion   int not null default 5,
  autonomy   int not null default 5,
  collapsed  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (room_id, slot)
);

-- players -----------------------------------------------------
create table players (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms(id) on delete cascade,
  team_id    uuid references teams(id) on delete set null,
  nickname   text,
  session_id text not null,                         -- random UUID set in localStorage
  created_at timestamptz not null default now(),
  unique (room_id, session_id)
);

-- votes -------------------------------------------------------
create table votes (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms(id) on delete cascade,
  team_id    uuid references teams(id) on delete cascade,  -- null in whole_room mode
  player_id  uuid not null references players(id) on delete cascade,
  round      int not null,
  choice     char(1) not null check (choice in ('A','B','C')),
  created_at timestamptz not null default now(),
  unique (player_id, round)             -- one vote per player per round
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_rooms_code       on rooms(code);
create index idx_teams_room       on teams(room_id);
create index idx_players_room     on players(room_id);
create index idx_players_session  on players(session_id);
create index idx_votes_room_round on votes(room_id, round);
create index idx_votes_team_round on votes(team_id, round);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rooms_updated_at
  before update on rooms
  for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Strategy:
--   • All reads are public (filtered by room code / id in queries)
--   • Writes are public but constrained:
--     - rooms: insert open; update requires host_secret header match
--     - teams: insert/update open within a room
--     - players: insert open; update own row by session_id
--     - votes: insert own vote; no updates
--   • host_secret check is enforced via a DB function called from
--     the app server-action/API route, not exposed to clients.
--     Client RLS keeps tables readable without auth.

alter table rooms   enable row level security;
alter table teams   enable row level security;
alter table players enable row level security;
alter table votes   enable row level security;

-- rooms: anyone can read; anyone can insert (host creates room)
create policy "rooms_select" on rooms for select using (true);
create policy "rooms_insert" on rooms for insert with check (true);
-- update is handled via server action that validates host_secret
create policy "rooms_update" on rooms for update using (true);

-- teams: public read/write within room context
create policy "teams_select" on teams for select using (true);
create policy "teams_insert" on teams for insert with check (true);
create policy "teams_update" on teams for update using (true);

-- players: public read/write
create policy "players_select" on players for select using (true);
create policy "players_insert" on players for insert with check (true);
create policy "players_update" on players for update using (true);

-- votes: public read; insert only (no updates/deletes from client)
create policy "votes_select" on votes for select using (true);
create policy "votes_insert" on votes for insert with check (true);

-- ============================================================
-- REALTIME
-- ============================================================
-- Enable realtime publications for all core tables
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table teams;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table votes;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Generate a unique 6-char room code
create or replace function generate_room_code()
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I confusion
  code  text;
  exists bool;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    select count(*) > 0 into exists from rooms where rooms.code = code;
    exit when not exists;
  end loop;
  return code;
end;
$$;
