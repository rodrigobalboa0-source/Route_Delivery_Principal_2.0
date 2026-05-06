-- Add deducted_amount column to track how much was deducted
ALTER TABLE public.nova_entrega 
ADD COLUMN IF NOT EXISTS deducted_amount numeric DEFAULT 0;

-- Drop the old AFTER INSERT trigger
DROP TRIGGER IF EXISTS trg_check_credits_after_insert ON public.nova_entrega;

-- Update the deduction function to be used BEFORE INSERT and track deducted amount
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

             -- Mark the amount deducted on the record
             NEW.deducted_amount := v_cost;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create the trigger as BEFORE INSERT
DROP TRIGGER IF EXISTS trg_check_credits_before_insert ON public.nova_entrega;
CREATE TRIGGER trg_check_credits_before_insert
BEFORE INSERT ON public.nova_entrega
FOR EACH ROW
EXECUTE FUNCTION public.check_and_deduct_credits();


-- Function to handle refunds on Cancellation or Deletion
CREATE OR REPLACE FUNCTION public.check_and_refund_credits()
RETURNS TRIGGER AS $$
DECLARE
    v_amount_to_refund numeric := 0;
    v_cliente_id uuid;
    v_saldo_atual numeric;
    v_saldo_novo numeric;
BEGIN
    -- Determine if we should refund
    IF (TG_OP = 'DELETE') THEN
        -- Do not refund if the order was completed (service provided)
        IF OLD.status IN ('entregue', 'finalizada') THEN
            v_amount_to_refund := 0;
        ELSE
            v_amount_to_refund := OLD.deducted_amount;
        END IF;
        v_cliente_id := OLD.cliente_id;
        
    ELSIF (TG_OP = 'UPDATE') THEN
        -- If cancelling a completed order, do not refund
        IF OLD.status IN ('entregue', 'finalizada') THEN
             v_amount_to_refund := 0;
        -- If status changing to cancelled
        ELSIF (NEW.status = 'cancelada' AND OLD.status != 'cancelada') THEN
            v_amount_to_refund := OLD.deducted_amount;
            v_cliente_id := OLD.cliente_id;
            
            -- Prevent future refunds by zeroing out deducted_amount
            NEW.deducted_amount := 0;
        END IF;
    END IF;

    -- Only refund if there was a positive deduction
    IF v_amount_to_refund > 0 THEN
        -- Get current balance for logging
        SELECT saldo_creditos INTO v_saldo_atual FROM public.clientes WHERE id = v_cliente_id;
        IF v_saldo_atual IS NULL THEN v_saldo_atual := 0; END IF;
        
        v_saldo_novo := v_saldo_atual + v_amount_to_refund;

        -- Refund credits
        UPDATE public.clientes 
        SET saldo_creditos = v_saldo_novo
        WHERE id = v_cliente_id;

        -- Log transaction
        INSERT INTO public.creditos_clientes (cliente_id, valor, tipo, descricao, saldo_anterior, saldo_novo, created_by)
        VALUES (v_cliente_id, v_amount_to_refund, 'estorno', 'Reembolso (Entrega cancelada)', v_saldo_atual, v_saldo_novo, auth.uid());
    END IF;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for Refund on Status Change
DROP TRIGGER IF EXISTS trg_refund_credits_on_update ON public.nova_entrega;
CREATE TRIGGER trg_refund_credits_on_update
BEFORE UPDATE ON public.nova_entrega
FOR EACH ROW
EXECUTE FUNCTION public.check_and_refund_credits();

-- Trigger for Refund on Delete
DROP TRIGGER IF EXISTS trg_refund_credits_on_delete ON public.nova_entrega;
CREATE TRIGGER trg_refund_credits_on_delete
BEFORE DELETE ON public.nova_entrega
FOR EACH ROW
EXECUTE FUNCTION public.check_and_refund_credits();

-- Backfill: Set deducted_amount = valor_entrega for existing active orders
UPDATE public.nova_entrega
SET deducted_amount = valor_entrega
WHERE (deducted_amount IS NULL OR deducted_amount = 0)
  AND valor_entrega > 0 
  AND status NOT IN ('cancelada', 'entregue', 'finalizada');

-- One-off fix for RECENTLY cancelled orders that were missed (within last 24h)
DO $$
DECLARE
    r RECORD;
    v_refunded boolean;
    v_saldo_atual numeric;
    v_saldo_novo numeric;
BEGIN
    FOR r IN 
        SELECT * FROM public.nova_entrega 
        WHERE status = 'cancelada' 
        AND valor_entrega > 0
        AND updated_at > (NOW() - INTERVAL '48 hours') -- Look back 48h to be safe
    LOOP
        -- Check if already refunded in creditos_clientes
        -- We look for an 'estorno' for this client created after the delivery update
        SELECT EXISTS (
            SELECT 1 FROM public.creditos_clientes 
            WHERE cliente_id = r.cliente_id 
            AND tipo = 'estorno' 
            AND created_at >= (r.updated_at - INTERVAL '1 minute') -- Tolerance
            AND valor = r.valor_entrega
        ) INTO v_refunded;

        IF NOT v_refunded THEN
             -- Get current balance
             SELECT saldo_creditos INTO v_saldo_atual FROM public.clientes WHERE id = r.cliente_id;
             IF v_saldo_atual IS NULL THEN v_saldo_atual := 0; END IF;
             
             v_saldo_novo := v_saldo_atual + r.valor_entrega;

             -- Refund
             UPDATE public.clientes 
             SET saldo_creditos = v_saldo_novo 
             WHERE id = r.cliente_id;
             
             INSERT INTO public.creditos_clientes (cliente_id, valor, tipo, descricao, saldo_anterior, saldo_novo, created_by)
             VALUES (r.cliente_id, r.valor_entrega, 'estorno', 'Reembolso Retroativo (Fix)', v_saldo_atual, v_saldo_novo, NULL);
             
             RAISE NOTICE 'Refunded % for delivery %', r.valor_entrega, r.id;
        END IF;
    END LOOP;
END $$;
