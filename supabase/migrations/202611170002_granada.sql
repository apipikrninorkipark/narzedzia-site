create table public.workspace_granada_prices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.workspace_granada_prices enable row level security;
revoke all on public.workspace_granada_prices from anon, authenticated;
grant all on public.workspace_granada_prices to service_role;
