CREATE OR REPLACE FUNCTION public.check_and_deduct_credits()
RETURNS TRIGGER AS $$
DECLARE
    v_user_role text;
    v_saldo numeric;
    v_cost numeric;
    v_cliente_id uuid;
    v_is_admin boolean;
BEGIN
    -- Only check if the user is authenticated
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_cliente_id := NEW.cliente_id;
    
    -- Get user role
    SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
    
    -- Check if admin
    v_is_admin := (v_user_role = 'admin');

    -- Apply logic if user is 'cliente' OR 'admin'
    IF v_user_role = 'cliente' OR v_is_admin THEN
        
        -- Get current balance of the CLIENT
        SELECT saldo_creditos INTO v_saldo FROM public.clientes WHERE id = v_cliente_id;
        
        -- Get cost (handle nulls)
        v_cost := COALESCE(NEW.valor_entrega, 0);
        
        -- If delivery has a cost
        IF v_cost > 0 THEN
             
             -- If it's the CLIENT creating it, enforce balance check
             IF v_user_role = 'cliente' AND (v_saldo IS NULL OR v_saldo < v_cost) THEN
                 RAISE EXCEPTION 'Saldo insuficiente. Seu saldo atual é R$ %. O valor da entrega é R$ %. Por favor, recarregue seus créditos.', COALESCE(v_saldo, 0), v_cost;
             END IF;
             
             -- Initialize saldo if null
             IF v_saldo IS NULL THEN v_saldo := 0; END IF;

             -- Deduct credits (Allow negative if admin)
             UPDATE public.clientes 
             SET saldo_creditos = v_saldo - v_cost 
             WHERE id = v_cliente_id;
             
             -- Log transaction
             INSERT INTO public.creditos_clientes (cliente_id, valor, tipo, descricao, saldo_anterior, saldo_novo, created_by)
             VALUES (v_cliente_id, v_cost, 'uso', 'Entrega (Pedido manual)', v_saldo, v_saldo - v_cost, auth.uid());

             -- Mark the amount deducted on the record
             NEW.deducted_amount := v_cost;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
