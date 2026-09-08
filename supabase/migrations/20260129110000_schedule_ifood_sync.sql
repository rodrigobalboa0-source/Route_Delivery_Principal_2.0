create extension if not exists pg_cron;

-- preencha url/anon key do ambiente antes de aplicar esta migration manualmente
select cron.schedule(
  'ifood-sync-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url:='SUBSTITUA_PELA_URL_DO_AMBIENTE/functions/v1/ifood-sync',
    headers:='{"Content-Type": "application/json", "apikey": "SUBSTITUA_PELO_ANON_KEY_JWT", "Authorization": "Bearer SUBSTITUA_PELO_ANON_KEY_JWT"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;

  select pg_sleep(30);

  select net.http_post(
    url:='SUBSTITUA_PELA_URL_DO_AMBIENTE/functions/v1/ifood-sync',
    headers:='{"Content-Type": "application/json", "apikey": "SUBSTITUA_PELO_ANON_KEY_JWT", "Authorization": "Bearer SUBSTITUA_PELO_ANON_KEY_JWT"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
