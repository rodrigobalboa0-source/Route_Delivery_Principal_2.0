-- Cria o schema "realtime" que o container supabase/realtime espera encontrar
-- para bootstrapar suas próprias tabelas/funções internas (list_changes, subscription, apply_rls/WALRUS)
-- na primeira conexão com o tenant. Sem esse schema, o Realtime entra em loop de
-- retry na migração interna e cada tentativa falha deixando uma conexão aberta
-- ("SELECT 1" / application_name=realtime_connect), causando vazamento de conexões no Postgres.
-- SQL espelhado exatamente do bootstrap oficial em supabase/postgres
-- (migrations/db/migrations/20211118015519_create-realtime-schema.sql e
-- 20211122051245_update-realtime-permissions.sql).

CREATE SCHEMA IF NOT EXISTS realtime AUTHORIZATION supabase_admin;

GRANT USAGE ON SCHEMA realtime TO supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA realtime TO supabase_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA realtime TO supabase_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA realtime TO supabase_admin;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO supabase_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO supabase_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON ROUTINES TO supabase_admin;
