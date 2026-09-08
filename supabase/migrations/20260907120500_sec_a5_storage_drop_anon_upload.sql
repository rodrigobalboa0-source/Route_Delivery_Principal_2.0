-- ============================================================================
-- SEGURANÇA A5 — Storage: remover upload anônimo no bucket `images`
--
-- Antes: policy "Anon Upload" ... FOR INSERT TO anon WITH CHECK (bucket_id='images')
-- => qualquer pessoa não autenticada subia arquivos pro seu domínio (hospedar
--    malware/phishing, encher o disco).
--
-- Depois: só `authenticated` sobe (as duas telas de auto-cadastro fazem signUp
-- ANTES de subir imagem, então a sessão já é autenticada nesse ponto).
--
-- NÃO resolvido aqui (ver SEGURANCA-RUNBOOK.md, A5):
--   * bucket continua `public=true` => fotos de CNH/comprovante são legíveis por
--     URL. Migrar para URLs assinadas é um projeto à parte.
--   * limite de MIME/type e quota total de disco.
-- ============================================================================

drop policy if exists "Anon Upload" on storage.objects;

-- Garante que o upload autenticado existe (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated Upload'
  ) then
    create policy "Authenticated Upload" on storage.objects
      for insert to authenticated with check ( bucket_id = 'images' );
  end if;
end $$;
