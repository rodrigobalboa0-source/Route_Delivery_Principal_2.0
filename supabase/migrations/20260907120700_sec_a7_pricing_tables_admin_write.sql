-- ============================================================================
-- SEGURANÇA A7 — escrita em tabelas de preço/comissão/serviço só por admin
--
-- Antes: policies permissivas deixavam QUALQUER usuário autenticado (um
-- entregador recém-cadastrado, por ex.) dar INSERT/UPDATE/DELETE em:
--   modais, precificacoes, preco_espera, preco_dinamico_demanda,
--   preco_dinamico_entregador, servicos_opcionais            (USING(true))
--   tabelas_precos(_faixas), tabelas_comissoes(_faixas)      (auth.role()='authenticated')
-- => manipulação de tabelas de preço/comissão.
--
-- Depois: leitura mantida; escrita só com public.is_admin(). Todas essas
-- tabelas são editadas apenas por telas administrativas.
--
-- OBS: comissoes_entregadores e revisoes_agendamentos NÃO entram aqui — elas
-- ganharam policies de tenant depois (20251203130000) e são gravadas por fluxos
-- do próprio operacional. Tratar no runbook (A7) com acesso ao banco.
-- ============================================================================

do $$
declare
  t text;
  p record;
  tbls text[] := array[
    'modais','precificacoes','preco_espera','preco_dinamico_demanda',
    'preco_dinamico_entregador','servicos_opcionais',
    'tabelas_precos','tabelas_precos_faixas',
    'tabelas_comissoes','tabelas_comissoes_faixas'
  ];
begin
  foreach t in array tbls loop
    if to_regclass('public.'||t) is null then
      raise notice 'A7: tabela public.% não existe, pulando', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Remove qualquer policy de ESCRITA existente (mantém as de SELECT).
    for p in
      select policyname, cmd
      from pg_policies
      where schemaname = 'public' and tablename = t
        and cmd in ('INSERT','UPDATE','DELETE','ALL')
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;

    -- Recria: admin faz tudo.
    execute format('drop policy if exists %I on public.%I', t||'_admin_write', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (public.is_admin())
        with check (public.is_admin())
    $f$, t||'_admin_write', t);

    -- Garante que exista ao menos uma policy de leitura (as originais eram
    -- "select using(true)"; se alguma tabela ficou sem, recria a leitura ampla
    -- para autenticados para não quebrar telas que só listam).
    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename=t and cmd in ('SELECT','ALL')
        and policyname <> t||'_admin_write'
    ) then
      execute format($f$
        create policy %I on public.%I for select to authenticated using (true)
      $f$, t||'_read_authenticated', t);
    end if;
  end loop;
end $$;
