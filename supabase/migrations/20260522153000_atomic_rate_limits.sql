create or replace function public.increment_rate_limit(
  p_bucket_key text,
  p_reset_at timestamptz
)
returns table(hits integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.api_rate_limits(bucket_key, hits, reset_at, updated_at)
  values (p_bucket_key, 1, p_reset_at, now())
  on conflict (bucket_key) do update
    set hits = case
      when public.api_rate_limits.reset_at <= now() then 1
      else public.api_rate_limits.hits + 1
    end,
    reset_at = case
      when public.api_rate_limits.reset_at <= now() then excluded.reset_at
      else public.api_rate_limits.reset_at
    end,
    updated_at = now()
  returning public.api_rate_limits.hits, public.api_rate_limits.reset_at
  into hits, reset_at;

  return next;
end;
$$;

grant execute on function public.increment_rate_limit(text, timestamptz) to service_role;
