create extension if not exists pg_cron;

-- Ajuste a url/Authorization abaixo para o ambiente de destino antes de
-- aplicar esta migration (ex: http://kong:8000/functions/v1/ifood-sync
-- no self-hosted, com o ANON_KEY real desse ambiente).
select cron.schedule(
  'ifood-sync-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url:='SUBSTITUA_PELA_URL_DO_AMBIENTE/functions/v1/ifood-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUBSTITUA_PELO_ANON_KEY_DO_AMBIENTE"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;

  select pg_sleep(30);

  select net.http_post(
    url:='SUBSTITUA_PELA_URL_DO_AMBIENTE/functions/v1/ifood-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUBSTITUA_PELO_ANON_KEY_DO_AMBIENTE"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
