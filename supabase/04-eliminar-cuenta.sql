-- =====================================================================
--  Raciel Chirino Academy — paso 4: que cada alumno pueda eliminar su cuenta
--  Supabase → SQL Editor → New query → pega todo → Run
-- =====================================================================

-- El alumno puede borrar sus propios comprobantes (la app lo hace antes de borrar la cuenta)
drop policy if exists "comprobantes: borrar propios" on storage.objects;
create policy "comprobantes: borrar propios" on storage.objects for delete to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);

-- Borra la cuenta de quien la llama. Sus pagos, inscripciones y avance se borran en cascada.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  if public.is_admin() then raise exception 'La cuenta de la administradora no se puede eliminar desde la app'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
