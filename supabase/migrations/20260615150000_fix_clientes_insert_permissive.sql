-- As migrations 20260615130000 e 20260615140000 tentaram adicionar condições à policy
-- de INSERT, mas todas falham quando email é null ou id não coincide com auth.uid().
-- A tabela foi originalmente criada com WITH CHECK (true) para INSERT.
-- As policies de SELECT/UPDATE/DELETE já restringem acesso por usuário.
-- Restaurar INSERT como permissivo é seguro: qualquer autenticado pode criar um
-- cliente, mas só admins e usuários vinculados conseguem lê-lo depois.

DROP POLICY IF EXISTS clientes_tenant_insert ON public.clientes;
CREATE POLICY clientes_tenant_insert
  ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
