-- A migration 20260314120000 substituiu a policy de INSERT por user_can_access_cliente(),
-- que verifica se o registro JÁ EXISTE na tabela — impossível para um INSERT novo.
-- A policy original permitia inserção quando o email do usuário logado bate com
-- o email do registro sendo criado (auto-cadastro de comércio/cliente).
-- Esta migration restaura esse comportamento, mantendo os casos admin e id-match.

DROP POLICY IF EXISTS clientes_tenant_insert ON public.clientes;
CREATE POLICY clientes_tenant_insert
  ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_cliente(public.clientes.id)
    OR public.clientes.id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.email IS NOT NULL
        AND public.clientes.email IS NOT NULL
        AND lower(trim(u.email)) = lower(trim(public.clientes.email))
    )
  );
