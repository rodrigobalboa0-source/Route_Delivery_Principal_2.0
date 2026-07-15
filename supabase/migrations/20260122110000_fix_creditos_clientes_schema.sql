
-- Fix creditos_clientes schema if it was created by older migration
DO $$
BEGIN
    -- Add tipo if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creditos_clientes' AND column_name = 'tipo') THEN
        ALTER TABLE public.creditos_clientes ADD COLUMN tipo text CHECK (tipo IN ('compra', 'uso', 'ajuste', 'estorno'));
    END IF;

    -- Add descricao if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creditos_clientes' AND column_name = 'descricao') THEN
        ALTER TABLE public.creditos_clientes ADD COLUMN descricao text;
    END IF;

    -- Add saldo_anterior if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creditos_clientes' AND column_name = 'saldo_anterior') THEN
        ALTER TABLE public.creditos_clientes ADD COLUMN saldo_anterior numeric(10,2) DEFAULT 0;
    END IF;

    -- Add saldo_novo if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creditos_clientes' AND column_name = 'saldo_novo') THEN
        ALTER TABLE public.creditos_clientes ADD COLUMN saldo_novo numeric(10,2) DEFAULT 0;
    END IF;

    -- Add created_by if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creditos_clientes' AND column_name = 'created_by') THEN
        ALTER TABLE public.creditos_clientes ADD COLUMN created_by uuid REFERENCES auth.users(id);
    END IF;

    -- Map old 'motivo' to 'descricao' if 'descricao' is empty and 'motivo' exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creditos_clientes' AND column_name = 'motivo') THEN
         UPDATE public.creditos_clientes SET descricao = motivo WHERE descricao IS NULL;
    END IF;

END $$;

-- Create RPC for safe credit addition
CREATE OR REPLACE FUNCTION public.admin_add_credit(
    p_cliente_id uuid,
    p_valor numeric,
    p_motivo text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_saldo_atual numeric;
    v_saldo_novo numeric;
BEGIN
    -- Check if admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Apenas administradores podem adicionar créditos.';
    END IF;

    -- Get current balance
    SELECT saldo_creditos INTO v_saldo_atual FROM public.clientes WHERE id = p_cliente_id;
    
    IF v_saldo_atual IS NULL THEN
        v_saldo_atual := 0;
    END IF;

    v_saldo_novo := v_saldo_atual + p_valor;

    -- Update balance
    UPDATE public.clientes 
    SET saldo_creditos = v_saldo_novo 
    WHERE id = p_cliente_id;

    -- Log transaction
    INSERT INTO public.creditos_clientes (
        cliente_id,
        valor,
        tipo,
        descricao,
        saldo_anterior,
        saldo_novo,
        created_by
    ) VALUES (
        p_cliente_id,
        p_valor,
        'ajuste', -- using 'ajuste' for manual admin addition
        p_motivo,
        v_saldo_atual,
        v_saldo_novo,
        auth.uid()
    );

    RETURN json_build_object(
        'success', true,
        'new_balance', v_saldo_novo
    );
END;
$$;
