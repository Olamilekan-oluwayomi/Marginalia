-- Profiles are read and updated with the browser's authenticated client.
-- Restrict each user to their own row while preserving the auth trigger's
-- SECURITY DEFINER insert on sign-up.

alter table public.profiles enable row level security;

grant select, update on table public.profiles to authenticated;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
