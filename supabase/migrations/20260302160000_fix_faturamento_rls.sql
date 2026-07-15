CREATE POLICY faturamento_clientes_insert ON public.faturamento_clientes
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY faturamento_clientes_update ON public.faturamento_clientes
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY faturamento_clientes_delete ON public.faturamento_clientes
    FOR DELETE TO authenticated
    USING (public.is_admin());

CREATE POLICY creditos_clientes_insert ON public.creditos_clientes
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY creditos_clientes_update ON public.creditos_clientes
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY creditos_clientes_delete ON public.creditos_clientes
    FOR DELETE TO authenticated
    USING (public.is_admin());