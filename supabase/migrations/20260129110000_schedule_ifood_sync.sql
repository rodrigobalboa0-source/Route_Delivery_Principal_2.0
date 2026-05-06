create extension if not exists pg_cron;

select cron.schedule(
  'ifood-sync-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://mtanrihprbgrrtgwcyia.supabase.co/functions/v1/ifood-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10YW5yaWhwcmJncnJ0Z3djeWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMzU2OTIsImV4cCI6MjA3ODYxMTY5Mn0.5YbuhWG41iI5FJA8IfELbYV5eblz3l-tlG2OScIi8jY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;

  select pg_sleep(30);

  select net.http_post(
    url:='https://mtanrihprbgrrtgwcyia.supabase.co/functions/v1/ifood-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10YW5yaWhwcmJncnJ0Z3djeWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMzU2OTIsImV4cCI6MjA3ODYxMTY5Mn0.5YbuhWG41iI5FJA8IfELbYV5eblz3l-tlG2OScIi8jY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
