-- Fix for potential RLS recursion and performance issues
-- This migration optimizes critical functions and prevents infinite recursion loops
-- by marking helper functions as SECURITY DEFINER and ensuring search_path safety.

-- 1. Optimize is_admin to prevent RLS recursion on public.users
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  -- Returns true if the current user is admin or operador
  -- SECURITY DEFINER ensures this runs without triggering recursive RLS policies on public.users
  RETURN EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'operador')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Optimize check_and_deduct_credits to use is_admin() and be robust
CREATE OR REPLACE FUNCTION public.check_and_deduct_credits()
RETURNS TRIGGER AS $$
DECLARE
    v_saldo numeric;
    v_cost numeric;
    v_cliente_id uuid;
    v_is_admin boolean;
    v_user_role text;
BEGIN
    -- Fail fast if no user
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_cliente_id := NEW.cliente_id;
    
    -- Use the optimized is_admin function
    v_is_admin := public.is_admin();
    
    -- Get user role safely
    SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();

    -- Allow admin to deduct (overdraft) or Client to deduct (if sufficient funds)
    IF v_user_role = 'cliente' OR v_is_admin THEN
        SELECT saldo_creditos INTO v_saldo FROM public.clientes WHERE id = v_cliente_id;
        v_cost := COALESCE(NEW.valor_entrega, 0);

        IF v_cost > 0 THEN
            -- Check balance for clients (Admins bypass this check)
            IF v_user_role = 'cliente' AND (v_saldo IS NULL OR v_saldo < v_cost) THEN
                RAISE EXCEPTION 'Saldo insuficiente. Seu saldo atual é R$ %. O valor da entrega é R$ %. Por favor, recarregue seus créditos.', COALESCE(v_saldo, 0), v_cost;
            END IF;
            
            -- Initialize saldo if null
            IF v_saldo IS NULL THEN v_saldo := 0; END IF;

            -- Deduct amount
            UPDATE public.clientes 
            SET saldo_creditos = v_saldo - v_cost 
            WHERE id = v_cliente_id;

            -- Log transaction
            INSERT INTO public.creditos_clientes (cliente_id, valor, tipo, descricao, saldo_anterior, saldo_novo, created_by)
            VALUES (v_cliente_id, v_cost, 'uso', 'Entrega (Pedido manual)', v_saldo, v_saldo - v_cost, auth.uid());

            -- Store deducted amount for potential refund
            NEW.deducted_amount := v_cost;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Optimize calcular_liberacao_entrega to prevent RLS performance hit on entregadores
CREATE OR REPLACE FUNCTION public.calcular_liberacao_entrega()
RETURNS trigger AS $$
DECLARE
  max_delay integer;
  priority_deliverer_id uuid;
BEGIN
  -- Find the maximum priority delay from online deliverers who have priority search enabled
  SELECT COALESCE(MAX(prioridade_tempo), 0)
  INTO max_delay
  FROM public.entregadores
  WHERE is_online = true AND prioridade_busca = true;

  -- If there is a delay configured
  IF max_delay > 0 THEN
    -- Set the release time to now + delay
    NEW.liberado_em := NOW() + (max_delay || ' seconds')::interval;
  ELSE
    -- Otherwise, release immediately
    NEW.liberado_em := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;