CREATE TABLE IF NOT EXISTS public.delivery_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    delivery_id uuid REFERENCES public.nova_entrega(id) ON DELETE CASCADE,
    action text NOT NULL,
    description text,
    old_data jsonb,
    new_data jsonb,
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all logs" ON public.delivery_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'operador'))
    );

CREATE POLICY "Admins can insert logs" ON public.delivery_logs
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'operador'))
    );