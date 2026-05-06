CREATE OR REPLACE FUNCTION public.check_and_deduct_credits()
RETURNS TRIGGER AS $$
DECLARE
    v_cliente_role text;
    v_saldo numeric;
    v_cost numeric;
    v_cliente_id uuid;
BEGIN
    
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_cliente_id := NEW.cliente_id;
    
    
    SELECT role INTO v_cliente_role FROM public.users WHERE id = auth.uid();
    
    
    IF v_cliente_role IN ('cliente', 'admin') THEN
        
        SELECT saldo_creditos INTO v_saldo FROM public.clientes WHERE id = v_cliente_id;
        
        
        v_cost := COALESCE(NEW.valor_entrega, 0);
        
        
        IF v_cost > 0 THEN
             
             
             IF v_cliente_role = 'cliente' AND (v_saldo IS NULL OR v_saldo < v_cost) THEN
                 RAISE EXCEPTION 'Saldo insuficiente. Seu saldo atual é R$ %. O valor da entrega é R$ %. Por favor, recarregue seus créditos.', COALESCE(v_saldo, 0), v_cost;
             END IF;
             
             
             IF v_saldo IS NULL THEN v_saldo := 0; END IF;

             
             UPDATE public.clientes 
             SET saldo_creditos = v_saldo - v_cost 
             WHERE id = v_cliente_id;
             
             
             INSERT INTO public.creditos_clientes (cliente_id, valor, tipo, descricao, saldo_anterior, saldo_novo, created_by)
             VALUES (v_cliente_id, v_cost, 'uso', 'Entrega (Pedido manual)', v_saldo, v_saldo - v_cost, auth.uid());

             
             NEW.deducted_amount := v_cost;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;