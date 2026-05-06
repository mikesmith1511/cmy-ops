-- CMY Operations Platform — Supabase Schema
-- Run this in Supabase SQL Editor

-- ── HELPERS ──────────────────────────────────────────
create table if not exists helpers (
  id            bigserial primary key,
  name          text not null,
  email         text unique not null,
  phone         text,
  territory     text not null default 'WW',
  password_hash text not null,
  approved      boolean not null default false,
  pay_override  numeric(8,2),
  jobs_done     integer not null default 0,
  invite_code   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── TRAINING MODULES ─────────────────────────────────
create table if not exists training_modules (
  id          bigserial primary key,
  title       text not null,
  description text,
  video_url   text,
  required    boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ── TRAINING COMPLETIONS ─────────────────────────────
create table if not exists training_completions (
  id          bigserial primary key,
  helper_id   bigint not null references helpers(id) on delete cascade,
  module_id   bigint not null references training_modules(id) on delete cascade,
  completed_at timestamptz not null default now(),
  signed_off_at timestamptz,
  signed_off_by text,
  unique(helper_id, module_id)
);

-- ── INVITES ──────────────────────────────────────────
create table if not exists invites (
  id          bigserial primary key,
  code        text unique not null,
  name        text,
  email       text,
  territory   text not null default 'WW',
  used        boolean not null default false,
  used_by     text,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ── JOBS ─────────────────────────────────────────────
create table if not exists jobs (
  id           bigserial primary key,
  setup_date   date,
  event_date   date,
  address      text not null,
  customer     text,
  details      text,
  contact      text,
  territory    text not null default 'WW',
  type         text not null default 'standard', -- standard | pov | custom
  status       text not null default 'pending',  -- pending | claimed | installed | complete
  helper_id    bigint references helpers(id) on delete set null,
  order_num    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── INVENTORY SETS ───────────────────────────────────
create table if not exists inventory_sets (
  id          bigserial primary key,
  name        text not null,
  territory   text not null default 'WW',
  created_at  timestamptz not null default now()
);

-- ── INVENTORY PIECES ─────────────────────────────────
create table if not exists inventory_pieces (
  id          bigserial primary key,
  barcode     text unique not null,
  label       text,
  type        text,
  territory   text not null default 'WW',
  status      text not null default 'in', -- in | out
  set_id      bigint references inventory_sets(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ── INDEXES ──────────────────────────────────────────
create index if not exists idx_jobs_event_date on jobs(event_date);
create index if not exists idx_jobs_territory on jobs(territory);
create index if not exists idx_jobs_status on jobs(status);
create index if not exists idx_jobs_helper on jobs(helper_id);
create index if not exists idx_helpers_email on helpers(email);
create index if not exists idx_invites_code on invites(code);
create index if not exists idx_training_completions_helper on training_completions(helper_id);

-- ── UPDATED_AT TRIGGER ───────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger jobs_updated_at before update on jobs
  for each row execute function update_updated_at();

create trigger helpers_updated_at before update on helpers
  for each row execute function update_updated_at();
