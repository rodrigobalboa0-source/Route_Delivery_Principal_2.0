-- Permite que um usuário autenticado crie seu próprio registro em clientes
-- quando o id do novo registro = auth.uid() (auto-cadastro de comércio).
-- A política anterior bloqueava porque user_can_access_cliente retorna false
-- para registros ainda não existentes no banco.

DROP POLICY IF EXISTS clientes_tenant_insert ON public.clientes;
CREATE POLICY clientes_tenant_insert
  ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_cliente(public.clientes.id)
    OR public.clientes.id = auth.uid()
  );
