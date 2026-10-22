-- =====================================================================
--  Raciel Chirino Academy — paso 3: historial de la tasa del BCV
--  Supabase → SQL Editor → New query → pega todo → Run
-- =====================================================================
create table if not exists public.tasas (
  fecha date primary key,              -- fecha valor publicada por el BCV
  usd numeric not null check (usd > 0),
  fuente text,
  created_at timestamptz not null default now()
);
alter table public.tasas enable row level security;
-- Cualquiera puede ver las tasas; solo la función del servidor (con la clave secreta) las guarda
drop policy if exists "tasas: leer" on public.tasas;
create policy "tasas: leer" on public.tasas for select using (true);
