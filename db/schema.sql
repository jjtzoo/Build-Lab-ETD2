-- Planned persistence model. Keep engine state immutable per run.
create table if not exists tower (
  id text primary key,
  name text not null unique,
  type text not null,
  recipe jsonb not null,
  catalog jsonb not null,
  active boolean not null default true
);

create table if not exists mechanic_record (
  id text primary key,
  tower_id text references tower(id),
  version integer not null,
  confidence text not null,
  payload jsonb not null,
  source_refs jsonb not null default '[]'::jsonb
);

create table if not exists engine_run (
  id uuid primary key,
  engine_version text not null,
  input jsonb not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists scenario (
  id uuid primary key,
  name text not null,
  baseline jsonb not null,
  current_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
