-- Exercise schema: muscle_groups, equipment, exercises, user_exercise_stats

create table if not exists muscle_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  body_region text check (body_region in ('upper','lower','core','full'))
);

create table if not exists equipment (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists exercises (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  slug                        text not null unique,
  primary_muscle_group_id     uuid references muscle_groups(id),
  secondary_muscle_group_ids  uuid[] default '{}',
  equipment_id                uuid references equipment(id),
  movement_type               text check (movement_type in ('compound','isolation','cardio','bodyweight','stretching')),
  force_type                  text check (force_type in ('push','pull','hinge','squat','carry','static')),
  mechanic                    text check (mechanic in ('bilateral','unilateral')),
  instructions                text[],
  tips                        text[],
  primary_muscle_image_url    text,
  secondary_muscle_image_url  text,
  is_custom                   boolean default false,
  created_by                  uuid references auth.users(id),
  is_verified                 boolean default true,
  created_at                  timestamptz default now()
);

create table if not exists user_exercise_stats (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) not null,
  exercise_id      uuid references exercises(id) not null,
  estimated_1rm    numeric,
  best_weight      numeric,
  best_reps        integer,
  best_set_volume  numeric,
  total_sets       integer default 0,
  total_reps       integer default 0,
  times_performed  integer default 0,
  last_performed_at timestamptz,
  updated_at       timestamptz default now(),
  unique(user_id, exercise_id)
);

-- RLS
alter table exercises           enable row level security;
alter table user_exercise_stats enable row level security;

create policy "Anyone can read verified exercises"
  on exercises for select
  using (is_verified = true or created_by = auth.uid());

create policy "Users can create custom exercises"
  on exercises for insert
  with check (created_by = auth.uid() and is_custom = true);

create policy "Users manage own stats"
  on user_exercise_stats for all
  using (user_id = auth.uid());
