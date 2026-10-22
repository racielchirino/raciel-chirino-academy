-- =====================================================================
--  Raciel Chirino Academy — paso 5: precios para Venezuela y para el resto del mundo
--  Supabase → SQL Editor → New query → pega todo → Run
-- =====================================================================
-- Precio internacional de cada curso (si queda vacío, se usa el de Venezuela)
alter table public.courses add column if not exists price_intl numeric;
-- Datos de pago para alumnos fuera de Venezuela (solo USD)
alter table public.settings add column if not exists bank_intl text not null default '';
-- Cada pago guarda desde qué región se hizo
alter table public.requests add column if not exists region text not null default 've' check (region in ('ve','intl'));
notify pgrst, 'reload schema';
