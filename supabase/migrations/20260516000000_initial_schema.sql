-- SBL Companion — initial schema
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/hyrvnuzqbmvyyxhpzyss/sql/new

-- ─── Profiles ─────────────────────────────────────────────────────────────────
-- Stores user profile + all config-level data as JSONB
create table if not exists profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  gender          text,
  training_age    text,
  days_per_week   int,
  session_length  int,
  equipment       text,
  body_fat        float,
  goal            text,
  weight          float,
  height          float,
  age             int,
  activity_level  text,
  diet_type       text,
  name            text,
  username        text,
  -- JSONB blobs for complex config
  current_program         jsonb,
  food_sections           jsonb,
  exercise_progress       jsonb,
  best_est_1rms           jsonb,
  custom_programs         jsonb,
  saved_meals             jsonb,
  completed_session_count int default 0,
  dismissed_checkin_week  text,
  updated_at              timestamptz default now()
);

-- ─── Workout logs ─────────────────────────────────────────────────────────────
create table if not exists workout_logs (
  id         text primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  date       text not null,
  day_index  int  not null,
  sets       jsonb not null default '{}',
  created_at timestamptz default now()
);

-- ─── Food logs (one row per user per day) ─────────────────────────────────────
create table if not exists food_logs (
  id         text primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  date       text not null,
  meals      jsonb not null default '[]',
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- ─── Morning weights ──────────────────────────────────────────────────────────
create table if not exists morning_weights (
  id         text primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  date       text not null,
  weight     float not null,
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- ─── Weekly check-ins ─────────────────────────────────────────────────────────
create table if not exists check_ins (
  id         text primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  week       text not null,
  date       text not null,
  data       jsonb not null default '{}',
  created_at timestamptz default now(),
  unique(user_id, week)
);

-- ─── Progress entries ─────────────────────────────────────────────────────────
create table if not exists progress_entries (
  id         text primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  date       text not null,
  data       jsonb not null default '{}',
  created_at timestamptz default now()
);

-- ─── Hydration logs ───────────────────────────────────────────────────────────
create table if not exists hydration_logs (
  id           text primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  date         text not null,
  glasses      int  not null,
  goal_glasses int  not null default 12,
  created_at   timestamptz default now(),
  unique(user_id, date)
);

-- ─── Coach message history ────────────────────────────────────────────────────
create table if not exists coach_messages (
  id         text primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  role       text not null,
  content    text not null,
  created_at timestamptz default now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table profiles        enable row level security;
alter table workout_logs    enable row level security;
alter table food_logs       enable row level security;
alter table morning_weights enable row level security;
alter table check_ins       enable row level security;
alter table progress_entries enable row level security;
alter table hydration_logs  enable row level security;
alter table coach_messages  enable row level security;

-- Each user can only access their own rows
create policy "own_profile"         on profiles         for all using (auth.uid() = id);
create policy "own_workout_logs"    on workout_logs     for all using (auth.uid() = user_id);
create policy "own_food_logs"       on food_logs        for all using (auth.uid() = user_id);
create policy "own_morning_weights" on morning_weights   for all using (auth.uid() = user_id);
create policy "own_check_ins"       on check_ins        for all using (auth.uid() = user_id);
create policy "own_progress"        on progress_entries for all using (auth.uid() = user_id);
create policy "own_hydration"       on hydration_logs   for all using (auth.uid() = user_id);
create policy "own_coach_messages"  on coach_messages   for all using (auth.uid() = user_id);
