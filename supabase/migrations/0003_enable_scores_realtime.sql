do $$
begin
  alter publication supabase_realtime add table scores;
exception
  when duplicate_object then
    null;
end;
$$;
