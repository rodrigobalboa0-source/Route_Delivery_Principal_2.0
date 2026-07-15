
-- Create table for credit requests
CREATE TABLE IF NOT EXISTS public.solicitacoes_credito (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
    valor numeric(10,2) NOT NULL CHECK (valor > 0),
    status text CHECK (status IN ('pendente', 'aprovado', 'rejeitado')) DEFAULT 'pendente',
    comprovante_url text,
    observacao text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.solicitacoes_credito ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "solicitacoes_credito_select_admin" ON public.solicitacoes_credito
    FOR SELECT TO authenticated
    USING (public.is_admin());

CREATE POLICY "solicitacoes_credito_update_admin" ON public.solicitacoes_credito
    FOR UPDATE TO authenticated
    USING (public.is_admin());

CREATE POLICY "solicitacoes_credito_select_own" ON public.solicitacoes_credito
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() 
            AND u.role = 'cliente' 
            AND u.cliente_id = public.solicitacoes_credito.cliente_id
        )
    );

CREATE POLICY "solicitacoes_credito_insert_own" ON public.solicitacoes_credito
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() 
            AND u.role = 'cliente' 
            AND u.cliente_id = public.solicitacoes_credito.cliente_id
        )
    );

-- Trigger to process approved requests
CREATE OR REPLACE FUNCTION public.process_approved_credit_request()
RETURNS TRIGGER AS $$
DECLARE
    v_saldo_atual numeric;
BEGIN
    -- Only process if status changed to 'aprovado'
    IF NEW.status = 'aprovado' AND OLD.status != 'aprovado' THEN
        
        -- Get current balance for logging
        SELECT saldo_creditos INTO v_saldo_atual FROM public.clientes WHERE id = NEW.cliente_id;
        
        -- Update client balance
        UPDATE public.clientes 
        SET saldo_creditos = saldo_creditos + NEW.valor
        WHERE id = NEW.cliente_id;
        
        -- Log transaction in creditos_clientes
        INSERT INTO public.creditos_clientes (
            cliente_id, 
            valor, 
            tipo, 
            descricao, 
            saldo_anterior, 
            saldo_novo, 
            created_by
        ) VALUES (
            NEW.cliente_id,
            NEW.valor,
            'compra',
            'Solicitação Aprovada #' || NEW.id,
            COALESCE(v_saldo_atual, 0),
            COALESCE(v_saldo_atual, 0) + NEW.valor,
            auth.uid()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_process_approved_credit_request
AFTER UPDATE ON public.solicitacoes_credito
FOR EACH ROW
EXECUTE FUNCTION public.process_approved_credit_request();
