-- Jamify base schema
-- This file is the first step toward persistent song and arrangement storage.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  title text not null,
  artist text,
  source_url text,
  raw_chords jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.jams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  song_id uuid references public.songs(id) on delete cascade,
  name text not null default 'Untitled Jam',
  bpm integer not null default 120,
  beats_per_bar integer not null default 4,
  arrangement jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid references public.jams(id) on delete cascade,
  name text not null,
  instrument text not null,
  volume real not null default 1.0,
  muted boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.progressions (
  id uuid primary key default gen_random_uuid(),
  track_id uuid references public.tracks(id) on delete cascade,
  sequence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_songs_user_id on public.songs(user_id);
create index if not exists idx_jams_user_id on public.jams(user_id);
create index if not exists idx_tracks_jam_id on public.tracks(jam_id);
create index if not exists idx_progressions_track_id on public.progressions(track_id);

alter table public.users enable row level security;
alter table public.songs enable row level security;
alter table public.jams enable row level security;
alter table public.tracks enable row level security;
alter table public.progressions enable row level security;

create policy "Users can view their own profile" on public.users
  for select using (auth.uid() = id);

create policy "Users can insert their own profile" on public.users
  for insert with check (auth.uid() = id);

create policy "Users can update their own profile" on public.users
  for update using (auth.uid() = id);

create policy "Users can view their own songs" on public.songs
  for select using (auth.uid() = user_id);

create policy "Users can insert their own songs" on public.songs
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own songs" on public.songs
  for update using (auth.uid() = user_id);

create policy "Users can view their own jams" on public.jams
  for select using (auth.uid() = user_id);

create policy "Users can insert their own jams" on public.jams
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own jams" on public.jams
  for update using (auth.uid() = user_id);

create policy "Users can view their own tracks" on public.tracks
  for select using (exists (
    select 1 from public.jams j where j.id = jam_id and j.user_id = auth.uid()
  ));

create policy "Users can insert their own tracks" on public.tracks
  for insert with check (exists (
    select 1 from public.jams j where j.id = jam_id and j.user_id = auth.uid()
  ));

create policy "Users can update their own tracks" on public.tracks
  for update using (exists (
    select 1 from public.jams j where j.id = jam_id and j.user_id = auth.uid()
  ));

create policy "Users can view their own progressions" on public.progressions
  for select using (exists (
    select 1
    from public.tracks t
    join public.jams j on j.id = t.jam_id
    where t.id = track_id and j.user_id = auth.uid()
  ));

create policy "Users can insert their own progressions" on public.progressions
  for insert with check (exists (
    select 1
    from public.tracks t
    join public.jams j on j.id = t.jam_id
    where t.id = track_id and j.user_id = auth.uid()
  ));

create policy "Users can update their own progressions" on public.progressions
  for update using (exists (
    select 1
    from public.tracks t
    join public.jams j on j.id = t.jam_id
    where t.id = track_id and j.user_id = auth.uid()
  ));
