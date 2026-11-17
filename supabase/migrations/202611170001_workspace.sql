create extension if not exists pgcrypto with schema extensions;

create table public.workspace_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.workspace_access (
  singleton boolean primary key default true check (singleton),
  pin_hash text,
  failed_attempts integer not null default 0,
  blocked_until timestamptz,
  changed_at timestamptz
);
insert into public.workspace_access(singleton) values (true);
create table public.workspace_sessions (
  token_hash text primary key,
  expires_at timestamptz not null
);
create table public.workspace_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  dimensions jsonb not null,
  created_at timestamptz not null default now()
);

-- These tables are accessed only by the Edge Function with its server key.
alter table public.workspace_admins enable row level security;
alter table public.workspace_access enable row level security;
alter table public.workspace_sessions enable row level security;
alter table public.workspace_projects enable row level security;
revoke all on public.workspace_admins, public.workspace_access,
  public.workspace_sessions, public.workspace_projects from anon, authenticated;
grant all on public.workspace_admins, public.workspace_access,
  public.workspace_sessions, public.workspace_projects to service_role;

-- Lock the singleton row so parallel login attempts cannot bypass the limit.
create function public.workspace_login(p_pin text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.workspace_access%rowtype; expiry timestamptz;
begin
  select * into s from public.workspace_access where singleton for update;
  if s.pin_hash is null then return jsonb_build_object('status', 'unconfigured'); end if;
  if s.blocked_until > now() then
    return jsonb_build_object('status', 'blocked');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' or extensions.crypt(p_pin, s.pin_hash) <> s.pin_hash then
    update public.workspace_access set
      failed_attempts = case when failed_attempts >= 4 then 0 else failed_attempts + 1 end,
      blocked_until = case when failed_attempts >= 4 then now() + interval '1 minute' else null end
      where singleton;
    return jsonb_build_object('status', 'invalid');
  end if;
  update public.workspace_access set failed_attempts = 0, blocked_until = null where singleton;
  delete from public.workspace_sessions where expires_at <= now();
  expiry := now() + interval '8 hours';
  insert into public.workspace_sessions values (p_token_hash, expiry);
  return jsonb_build_object('status', 'ok', 'expires_at', expiry);
end;
$$;
create function public.workspace_change_pin(p_pin text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then raise exception 'PIN must have 6 digits'; end if;
  update public.workspace_access set
    pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    failed_attempts = 0, blocked_until = null, changed_at = now() where singleton;
  delete from public.workspace_sessions;
end;
$$;
revoke all on function public.workspace_login(text, text) from public, anon, authenticated;
revoke all on function public.workspace_change_pin(text) from public, anon, authenticated;
grant execute on function public.workspace_login(text, text) to service_role;
grant execute on function public.workspace_change_pin(text) to service_role;
