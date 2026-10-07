-- Corgi Ads schema. Run in the Supabase SQL editor.
-- This is the contract between the agent (writes) and the dashboard (reads).

create table if not exists competitor_ads (
  id          bigint generated always as identity primary key,
  scraped_at  timestamptz not null default now(),
  brand       text not null,
  platform    text not null default 'instagram',
  ad_text     text,
  media_url   text,
  likes       int,
  comments    int,
  analysis    jsonb            -- agent's read: hook, format, offer, why it works
);

create table if not exists creatives (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  hook        text,
  format      text,            -- image | video | carousel
  body        text,            -- primary ad copy
  headline    text,
  media_url   text,
  inspired_by bigint[] ,       -- competitor_ads.id values
  meta_ad_id  text,            -- set once launched
  status      text not null default 'draft'  -- draft | launched | paused
);

create table if not exists ad_snapshots (
  id            bigint generated always as identity primary key,
  captured_at   timestamptz not null default now(),
  ad_id         text not null,
  ad_name       text,
  adset_id      text,
  spend         numeric(10,2),
  impressions   int,
  reach         int,
  clicks        int,
  ctr           numeric(6,3),  -- percent
  cpc           numeric(10,2),
  cpm           numeric(10,2),
  purchase_roas numeric(10,2),
  raw           jsonb
);
create index if not exists ad_snapshots_ad_time on ad_snapshots (ad_id, captured_at desc);

create table if not exists recommendations (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  ad_id       text,
  adset_id    text,
  action      text not null,   -- pause | scale | hold
  reason      text not null,
  payload     jsonb,           -- e.g. {"daily_budget": 1200}
  status      text not null default 'proposed',  -- proposed | approved | applied | rejected
  applied_at  timestamptz
);

-- Dashboard reads with the anon key. Hackathon only: open read, no public write.
alter table competitor_ads  enable row level security;
alter table creatives       enable row level security;
alter table ad_snapshots    enable row level security;
alter table recommendations enable row level security;
create policy "public read" on competitor_ads  for select using (true);
create policy "public read" on creatives       for select using (true);
create policy "public read" on ad_snapshots    for select using (true);
create policy "public read" on recommendations for select using (true);
