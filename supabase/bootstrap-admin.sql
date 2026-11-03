-- Run AFTER setup.sql, AFTER this account signs up and confirms its email.
-- This script must run in SQL Editor as the project owner, never in the browser.
-- It assigns a role to an existing user; it does not create a password or account.
begin;
do $admin$
declare admin_id uuid;
begin
 select id into admin_id from auth.users
 where lower(email)='admin@bitesbro.com' and email_confirmed_at is not null;
 if admin_id is null then
  raise exception 'First create admin@bitesbro.com in Authentication > Users (or sign up), confirm its email, then rerun this file. No roles were changed.';
 end if;
 insert into public.user_roles(user_id,role) values(admin_id,'admin')
 on conflict(user_id) do update set role='admin',updated_at=now();
end $admin$;
commit;
