ALTER TABLE public.nova_entrega
  ADD COLUMN IF NOT EXISTS solicitar_comprovante boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS agendar_em timestamptz,
  ADD COLUMN IF NOT EXISTS valor_manual boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_entrega numeric,
  ADD COLUMN IF NOT EXISTS tipo_cobranca text CHECK (tipo_cobranca IN ('fatura','avista','pix','cartao')) DEFAULT 'fatura',
  ADD COLUMN IF NOT EXISTS cobrar_destinatario boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS coleta_usa_endereco_cadastro boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS coleta_contato text,
  ADD COLUMN IF NOT EXISTS coleta_telefone text,
  ADD COLUMN IF NOT EXISTS coleta_cep text,
  ADD COLUMN IF NOT EXISTS coleta_endereco_texto text,
  ADD COLUMN IF NOT EXISTS coleta_complemento text,
  ADD COLUMN IF NOT EXISTS coleta_observacoes text,
  ADD COLUMN IF NOT EXISTS entrega_usa_endereco_cadastro boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS entrega_contato text,
  ADD COLUMN IF NOT EXISTS entrega_telefone text,
  ADD COLUMN IF NOT EXISTS entrega_codigo_pedido text,
  ADD COLUMN IF NOT EXISTS entrega_centro_custo text,
  ADD COLUMN IF NOT EXISTS entrega_solicitante text,
  ADD COLUMN IF NOT EXISTS entrega_cep text,
  ADD COLUMN IF NOT EXISTS entrega_endereco_texto text,
  ADD COLUMN IF NOT EXISTS entrega_complemento text,
  ADD COLUMN IF NOT EXISTS entrega_observacoes text,
  ADD COLUMN IF NOT EXISTS retorno boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pontos_adicionais jsonb;

CREATE INDEX IF NOT EXISTS idx_nova_entrega_agendar_em ON public.nova_entrega(agendar_em);
CREATE INDEX IF NOT EXISTS idx_nova_entrega_entrega_codigo ON public.nova_entrega(entrega_codigo_pedido);