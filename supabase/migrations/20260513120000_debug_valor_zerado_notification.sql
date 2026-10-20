-- Migration de DEBUG neutralizada ao migrar para o Supabase proprio:
-- criava get_entrega_comissao_debug() e a view v_debug_valor_zerado,
-- ambas referenciando a coluna inexistente nova_entrega.valor_entregador.
-- Como e apenas ferramenta de analise (nao faz parte do sistema), foi
-- transformada em no-op para permitir aplicar as migrations num banco limpo.
SELECT 1;
