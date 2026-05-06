ALTER TABLE public.nova_entrega DROP CONSTRAINT IF EXISTS nova_entrega_status_check;

ALTER TABLE public.nova_entrega ADD CONSTRAINT nova_entrega_status_check 
  CHECK (status IN ('criada', 'atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega', 'entregue', 'cancelada'));
