-- =====================================================================
--  Raciel Chirino Academy — paso 2: proteger los enlaces de los videos
--  Supabase → SQL Editor → New query → pega todo → Run
-- =====================================================================

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
