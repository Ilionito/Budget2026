-- Plusieurs revenus par mois (libellé + montant + date) au lieu d'un seul.
-- À lancer dans Supabase → SQL Editor. Idempotent : ré-exécutable sans risque.

-- 1) Retirer la contrainte d'unicité (user, mois, année) qui n'autorisait
--    qu'une seule ligne de revenu par mois et par personne.
alter table public.monthly_income
  drop constraint if exists monthly_income_user_id_month_year_key;

-- 2) Le « chiffre d'affaires » (brut) n'est plus utilisé : on le rend optionnel.
--    Les nouvelles lignes stockent le montant dans net_transferred ET gross_amount.
alter table public.monthly_income
  alter column gross_amount drop not null,
  alter column gross_amount set default 0;

-- 3) Date du revenu. Les lignes existantes sont datées au 1er de leur mois.
alter table public.monthly_income
  add column if not exists date date;
update public.monthly_income
  set date = make_date(year, month, 1)
  where date is null;

-- 4) Lien registre -> revenu : une écriture de Compte par revenu, supprimée
--    automatiquement si le revenu est supprimé.
alter table public.ledger_entries
  add column if not exists monthly_income_id uuid
  references public.monthly_income(id) on delete cascade;

-- 5) Migrer le Compte : supprimer les anciennes écritures agrégées
--    « revenu mensuel » non liées, puis en recréer une par revenu existant.
delete from public.ledger_entries
  where note = 'revenu mensuel' and monthly_income_id is null;

insert into public.ledger_entries
  (user_id, date, label, amount, type, note, is_checked, monthly_income_id)
select user_id,
       coalesce(date, make_date(year, month, 1)),
       coalesce(nullif(note, ''), 'Revenu'),
       net_transferred, 'income', 'revenu mensuel', false, id
from public.monthly_income mi
where net_transferred > 0
  and not exists (
    select 1 from public.ledger_entries le
    where le.monthly_income_id = mi.id
  );
