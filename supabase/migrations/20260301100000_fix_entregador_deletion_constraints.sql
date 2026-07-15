-- Migration to change Foreign Key constraints to ON DELETE CASCADE for entregador deletion

-- 1. Drop existing constraints on acertos_entregadores
ALTER TABLE public.acertos_entregadores
DROP CONSTRAINT IF EXISTS acertos_entregadores_entregador_id_fkey;

-- 2. Add new constraint with ON DELETE CASCADE
ALTER TABLE public.acertos_entregadores
ADD CONSTRAINT acertos_entregadores_entregador_id_fkey
FOREIGN KEY (entregador_id)
REFERENCES public.entregadores(id)
ON DELETE CASCADE;

-- 3. Drop existing constraints on comissoes_entregadores
ALTER TABLE public.comissoes_entregadores
DROP CONSTRAINT IF EXISTS comissoes_entregadores_entregador_id_fkey;

-- 4. Add new constraint with ON DELETE CASCADE
ALTER TABLE public.comissoes_entregadores
ADD CONSTRAINT comissoes_entregadores_entregador_id_fkey
FOREIGN KEY (entregador_id)
REFERENCES public.entregadores(id)
ON DELETE CASCADE;

-- 5. Ensure admin policies for deletion are correct (just in case)
DROP POLICY IF EXISTS "auth can delete entregadores" ON public.entregadores;
DROP POLICY IF EXISTS entregadores_tenant_delete ON public.entregadores;

CREATE POLICY entregadores_tenant_delete ON public.entregadores
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND lower(u.email) = lower(public.entregadores.email)
    )
  );

-- 6. Also ensure public.users deletion is not blocked by common references if any (optional but good safety)
-- Checking references to public.users is complex, but usually safe if no explicit RESTRICTs.
