-- Tempo (segundos) que o sistema espera juntando pedidos antes de montar a rota
-- automática da loja (roteirização por tempo). Ex.: 30s para agrupar N pedidos.
alter table public.clientes add column if not exists roteirizacao_tempo_segundos integer not null default 30;
