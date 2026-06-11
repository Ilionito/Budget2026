alter table public.budget_lines
  add column if not exists owner_id uuid
  references public.profiles(id) on delete cascade;

create index if not exists budget_lines_owner_id_idx
  on public.budget_lines (owner_id);
