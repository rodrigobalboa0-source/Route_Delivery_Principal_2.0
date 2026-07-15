ALTER TABLE public.pedidos
  ADD CONSTRAINT unique_pedidos_cliente_numero UNIQUE (cliente_id, numero);
