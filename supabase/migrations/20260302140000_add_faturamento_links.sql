ALTER TABLE public.nova_entrega
ADD COLUMN IF NOT EXISTS fatura_cliente_id uuid REFERENCES public.faturamento_clientes(id);

ALTER TABLE public.contas_receber
ADD COLUMN IF NOT EXISTS fatura_id uuid REFERENCES public.faturamento_clientes(id);

CREATE INDEX IF NOT EXISTS idx_nova_entrega_fatura_cliente_id ON public.nova_entrega(fatura_cliente_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_fatura_id ON public.contas_receber(fatura_id);