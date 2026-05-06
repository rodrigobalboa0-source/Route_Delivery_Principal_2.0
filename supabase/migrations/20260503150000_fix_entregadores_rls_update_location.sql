DROP POLICY IF EXISTS "entregadores_tenant_update" ON public.entregadores;

DROP POLICY IF EXISTS "entregadores_tenant_update_location" ON public.entregadores;

CREATE POLICY "entregadores_update_location_authenticated"
ON public.entregadores
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);