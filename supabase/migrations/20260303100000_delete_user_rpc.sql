create or replace function delete_user_by_email_case_insensitive(email_input text)
returns void
language plpgsql
security definer
as $$
begin
  delete from public.users where lower(email) = lower(email_input);
end;
$$;