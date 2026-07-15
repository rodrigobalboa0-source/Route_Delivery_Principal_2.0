
-- Function to check and deduct credits for 'cliente' role
CREATE OR REPLACE FUNCTION public.check_and_deduct_credits()
RETURNS TRIGGER AS $$
DECLARE
    v_cliente_role text;
    v_saldo numeric;
    v_cost numeric;
    v_cliente_id uuid;
BEGIN
    -- Only check if the user is authenticated
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_cliente_id := NEW.cliente_id;
    
    -- Check the role of the current user
    SELECT role INTO v_cliente_role FROM public.users WHERE id = auth.uid();
    
    -- Apply logic only for 'cliente' role (Commerce)
    IF v_cliente_role = 'cliente' THEN
        -- Get current balance
        SELECT saldo_creditos INTO v_saldo FROM public.clientes WHERE id = v_cliente_id;
        
        -- Get cost (handle nulls)
        v_cost := COALESCE(NEW.valor_entrega, 0);
        
        -- If delivery has a cost
        IF v_cost > 0 THEN
             -- Check sufficiency
             IF v_saldo IS NULL OR v_saldo < v_cost THEN
                 RAISE EXCEPTION 'Saldo insuficiente. Seu saldo atual é R$ %. O valor da entrega é R$ %. Por favor, recarregue seus créditos.', COALESCE(v_saldo, 0), v_cost;
             END IF;
             
             -- Deduct credits
             UPDATE public.clientes 
             SET saldo_creditos = saldo_creditos - v_cost 
             WHERE id = v_cliente_id;
             
             -- Log transaction
             INSERT INTO public.creditos_clientes (cliente_id, valor, tipo, descricao, saldo_anterior, saldo_novo, created_by)
             VALUES (v_cliente_id, v_cost, 'uso', 'Entrega (Pedido manual)', v_saldo, v_saldo - v_cost, auth.uid());
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to allow clean re-run
DROP TRIGGER IF EXISTS trg_check_credits_after_insert ON public.nova_entrega;

-- Create Trigger
CREATE TRIGGER trg_check_credits_after_insert
AFTER INSERT ON public.nova_entrega
FOR EACH ROW
EXECUTE FUNCTION public.check_and_deduct_credits();
