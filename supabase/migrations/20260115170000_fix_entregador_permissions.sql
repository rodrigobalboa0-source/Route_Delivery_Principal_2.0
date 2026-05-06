DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'pedidos' 
        AND policyname = 'Entregadores podem ver pedidos'
    ) THEN
        CREATE POLICY "Entregadores podem ver pedidos"
        ON public.pedidos
        FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = auth.uid()
                AND u.role = 'entregador'
            )
        );
    END IF;
END
$$;