-- =====================================================================
--  Raciel Chirino Academy — base de datos en Supabase
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO esto → Run
--  Se puede ejecutar una sola vez. La administradora es racielchirino@gmail.com
-- =====================================================================

-- ¿Quien hace la petición es la administradora?
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '') = 'racielchirino@gmail.com'
$$;

-- ---------- Tablas ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  bank text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  banners jsonb not null default '[]'::jsonb
);

create table if not exists public.courses (
  id text primary key,
  title text not null,
  kicker text not null default '',
  sub text not null default '',
  band text not null default 'rosa',
  price numeric not null default 0,
  level text not null default 'Principiante',
  tagline text not null default '',
  active boolean not null default false,
  cover_path text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  title text not null,
  dur text not null default '',
  video_path text,
  video_url text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  course_id text references public.courses(id) on delete set null,
  amount numeric,
  ref text,
  capture_path text,
  status text not null default 'pendiente' check (status in ('pendiente','aprobado','rechazado')),
  created_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create table if not exists public.progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- ---------- Seguridad: cada quien ve solo lo suyo ----------
alter table public.settings    enable row level security;
alter table public.courses     enable row level security;
alter table public.lessons     enable row level security;
alter table public.requests    enable row level security;
alter table public.enrollments enable row level security;
alter table public.progress    enable row level security;

-- Ajustes: todos leen, solo la administradora cambia
create policy "ajustes: leer" on public.settings for select using (true);
create policy "ajustes: admin" on public.settings for all using (public.is_admin()) with check (public.is_admin());

-- Cursos: se ven los activos, los que el alumno compró y todos para la administradora
create policy "cursos: leer" on public.courses for select using (
  active or public.is_admin()
  or exists (select 1 from public.enrollments e where e.course_id = courses.id and e.user_id = auth.uid())
);
create policy "cursos: admin" on public.courses for all using (public.is_admin()) with check (public.is_admin());

-- Lecciones: los títulos son públicos; el video está protegido aparte
create policy "lecciones: leer" on public.lessons for select using (true);
create policy "lecciones: admin" on public.lessons for all using (public.is_admin()) with check (public.is_admin());

-- Comprobantes de pago
create policy "pagos: ver los míos" on public.requests for select using (user_id = auth.uid() or public.is_admin());
create policy "pagos: enviar" on public.requests for insert with check (user_id = auth.uid() and status = 'pendiente');
create policy "pagos: admin revisa" on public.requests for update using (public.is_admin()) with check (public.is_admin());
create policy "pagos: admin borra" on public.requests for delete using (public.is_admin());

-- Inscripciones: solo la administradora activa cursos
create policy "inscripciones: ver" on public.enrollments for select using (user_id = auth.uid() or public.is_admin());
create policy "inscripciones: admin" on public.enrollments for all using (public.is_admin()) with check (public.is_admin());

-- Avance: cada alumno el suyo
create policy "avance: propio" on public.progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Archivos ----------
-- media: portadas y banners (públicos) · videos: privados · captures: comprobantes privados (máx 10 MB)
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('videos', 'videos', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit) values ('captures', 'captures', false, 10485760) on conflict (id) do nothing;

create policy "media: admin" on storage.objects for all to authenticated
  using (bucket_id = 'media' and public.is_admin()) with check (bucket_id = 'media' and public.is_admin());

create policy "videos: admin" on storage.objects for all to authenticated
  using (bucket_id = 'videos' and public.is_admin()) with check (bucket_id = 'videos' and public.is_admin());
-- Los videos se guardan como <curso>/<lección>.mp4; solo los ve quien tiene el curso activo
create policy "videos: alumnos inscritos" on storage.objects for select to authenticated
  using (bucket_id = 'videos' and exists (
    select 1 from public.enrollments e where e.user_id = auth.uid() and e.course_id = (storage.foldername(name))[1]));

-- Los comprobantes se guardan como <usuario>/<pago>.jpg
create policy "comprobantes: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "comprobantes: ver" on storage.objects for select to authenticated
  using (bucket_id = 'captures' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------- Datos iniciales (se editan luego desde el panel) ----------
insert into public.settings (id, bank, whatsapp, email, banners) values (1,
  E'Pago Móvil\nBanco: (escribe tu banco)\nTeléfono: 0414-000.00.00\nCédula: V-00.000.000\n\nZelle\nCorreo: (escribe tu correo Zelle)\nTitular: Raciel Chirino',
  '', 'contacto@racielchirinoacademy.com',
  '["images/escuela-a-empresarios.jpg", "images/creador-de-contenido.jpg"]'::jsonb)
on conflict (id) do nothing;

insert into public.courses (id, title, kicker, sub, band, price, level, tagline, active, cover_path, position) values
  ('instagram', 'Instagram desde cero', 'Instagram', 'desde cero', 'naranja', 30, 'Principiante',
   'Define a quién le hablas, qué publicar cada semana y cómo leer tus métricas para crecer con intención.',
   true, 'images/instagram-desde-cero.jpg', 1),
  ('community', 'Conviértete en Community Manager', 'Community', 'Manager', 'coral', 100, 'Intermedio',
   'Gestiona redes para marcas y clientes: estrategia, tono de voz, contenido, atención a la comunidad, reportes y cómo cotizar tu trabajo.',
   true, 'images/creador-de-contenido.jpg', 2),
  ('edita', 'Edita como un pro', 'Edita', 'como un pro', 'rosa', 30, 'Principiante',
   'Aprende CapCut desde cero: cortes con ritmo, textos animados, subtítulos, transiciones y exportación para cada red.',
   true, null, 3)
on conflict (id) do nothing;

-- Lecciones de ejemplo: se cambian o se borran desde el panel
insert into public.lessons (course_id, title, dur, position)
select v.course_id, v.title, v.dur, v.position from (values
  ('instagram', 'Define tu cliente ideal', '08:10', 1),
  ('instagram', 'Optimiza tu perfil', '07:25', 2),
  ('instagram', 'Pilares de contenido', '10:25', 3),
  ('instagram', 'Calendario editorial de 30 días', '12:00', 4),
  ('instagram', 'Lectura de métricas', '09:40', 5),
  ('community', 'El rol del community manager', '07:30', 1),
  ('community', 'Estrategia de contenido para marcas', '12:15', 2),
  ('community', 'Tono de voz y guía de marca', '11:10', 3),
  ('community', 'Comentarios, mensajes y manejo de crisis', '13:45', 4),
  ('community', 'Reportes mensuales para clientes', '10:20', 5),
  ('community', 'Cómo cotizar tus servicios', '09:55', 6),
  ('edita', 'Conoce la interfaz de CapCut', '06:40', 1),
  ('edita', 'Cortes y ritmo en la línea de tiempo', '11:20', 2),
  ('edita', 'Textos animados y subtítulos automáticos', '09:05', 3),
  ('edita', 'Transiciones y efectos sin exagerar', '08:30', 4),
  ('edita', 'Exportar en 1080p para Reels y TikTok', '05:15', 5)
) as v(course_id, title, dur, position)
where not exists (select 1 from public.lessons);
-- Columna automática que solo dice si la lección ya tiene video
alter table public.lessons add column if not exists has_video boolean
  generated always as (video_url is not null or video_path is not null) stored;

-- Los alumnos ven título y duración de cada lección, pero NO el enlace del video
revoke select on public.lessons from anon, authenticated;
grant select (id, course_id, title, dur, position, created_at, has_video) on public.lessons to anon, authenticated;

-- El enlace solo se entrega a la administradora o a quien tiene el curso activo
create or replace function public.lesson_video(lid uuid)
returns table (video_url text, video_path text)
language sql stable security definer set search_path = public as $$
  select l.video_url, l.video_path
  from public.lessons l
  where l.id = lid
    and (public.is_admin() or exists (
      select 1 from public.enrollments e where e.course_id = l.course_id and e.user_id = auth.uid()));
$$;
revoke execute on function public.lesson_video(uuid) from public, anon;
grant execute on function public.lesson_video(uuid) to authenticated;

-- ---------- Tasa del BCV (paso 3) ----------
create table if not exists public.tasas (
  fecha date primary key,
  usd numeric not null check (usd > 0),
  fuente text,
  created_at timestamptz not null default now()
);
alter table public.tasas enable row level security;
drop policy if exists "tasas: leer" on public.tasas;
create policy "tasas: leer" on public.tasas for select using (true);
