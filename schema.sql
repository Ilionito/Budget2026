-- ============================================================================
-- Budget 2026 — Schéma complet de la base Supabase (schema public)
-- ----------------------------------------------------------------------------
-- À exécuter dans Supabase → SQL Editor sur un projet VIERGE pour recréer
-- toute la base à l'identique (tables, contraintes, index, RLS, policies,
-- fonction + trigger de création de profil).
--
-- Ordre : extensions → fonctions → tables → contraintes → index → RLS →
--         policies → triggers.
--
-- NOTE : ce script crée la STRUCTURE. Les données ne sont pas incluses.
--        Penser à (ré)insérer les catégories par défaut (table `categories`),
--        sinon les listes déroulantes de catégories seront vides. Les profils
--        (Joris / Ophélie) sont créés automatiquement par le trigger
--        `on_auth_user_created` à la première connexion.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";   -- uuid_generate_v4()
create extension if not exists "pgcrypto";     -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- 1) Fonctions (incluant les fonctions de trigger)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    case
      when new.email = 'hillion.joris00@gmail.com' then 'Joris'
      when new.email = 'ophelie.bo73@gmail.com' then 'Ophélie'
      else split_part(new.email, '@', 1)
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

-- ----------------------------------------------------------------------------
-- 2) Tables
-- ----------------------------------------------------------------------------
CREATE TABLE public.budget (
  id bigint NOT NULL,
  mois integer NOT NULL,
  categorie text NOT NULL,
  ligne text NOT NULL,
  prevu numeric DEFAULT 0,
  ophelie numeric DEFAULT 0,
  joris numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.budget_line_overrides (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  budget_line_id uuid,
  month integer NOT NULL,
  year integer NOT NULL,
  amount_target numeric(10,2) NOT NULL
);

CREATE TABLE public.budget_lines (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  label text NOT NULL,
  category_id uuid,
  amount_target numeric(10,2) NOT NULL DEFAULT 0,
  recurrence text DEFAULT 'monthly'::text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  owner_id uuid,
  start_date date
);

CREATE TABLE public.budgets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  month integer NOT NULL,
  year integer NOT NULL,
  envelope text NOT NULL,
  amount_target numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  label text NOT NULL,
  icon text NOT NULL,
  color text NOT NULL,
  is_default boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.ledger_entries (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  label text NOT NULL,
  amount numeric(10,2) NOT NULL,
  type text NOT NULL DEFAULT 'expense'::text,
  is_checked boolean DEFAULT false,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  category_id uuid,
  transaction_id uuid,
  subscription_id uuid,
  monthly_income_id uuid
);

CREATE TABLE public.monthly_income (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  date date,
  gross_amount numeric(10,2) DEFAULT 0,
  net_transferred numeric(10,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.personal_budget_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category_id uuid NOT NULL,
  amount_target numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  display_name text NOT NULL,
  avatar_color text DEFAULT '#6366f1'::text,
  created_at timestamp with time zone DEFAULT now(),
  theme jsonb,
  real_balance numeric,
  real_balance_at date
);

CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  amount numeric(10,2) NOT NULL,
  frequency text DEFAULT 'monthly'::text,
  category_id uuid,
  next_date date,
  is_active boolean DEFAULT true,
  is_private boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  materialized_until date,
  is_shared boolean NOT NULL DEFAULT false
);

CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  label text NOT NULL,
  category_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE,
  is_private boolean DEFAULT false,
  is_recurring boolean DEFAULT false,
  subscription_id uuid,
  note text,
  created_at timestamp with time zone DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3) Contraintes (PK / FK / UNIQUE / CHECK)
-- ----------------------------------------------------------------------------
ALTER TABLE budget ADD CONSTRAINT budget_pkey PRIMARY KEY (id);

ALTER TABLE budget_line_overrides ADD CONSTRAINT budget_line_overrides_budget_line_id_month_year_key UNIQUE (budget_line_id, month, year);
ALTER TABLE budget_line_overrides ADD CONSTRAINT budget_line_overrides_pkey PRIMARY KEY (id);
ALTER TABLE budget_line_overrides ADD CONSTRAINT budget_line_overrides_budget_line_id_fkey FOREIGN KEY (budget_line_id) REFERENCES budget_lines(id) ON DELETE CASCADE;

ALTER TABLE budget_lines ADD CONSTRAINT budget_lines_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE budget_lines ADD CONSTRAINT budget_lines_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE budget_lines ADD CONSTRAINT budget_lines_pkey PRIMARY KEY (id);
ALTER TABLE budget_lines ADD CONSTRAINT budget_lines_recurrence_check CHECK ((recurrence = ANY (ARRAY['monthly'::text, 'bimonthly'::text, 'quarterly'::text, 'every_4'::text, 'every_5'::text, 'biannual'::text, 'every_7'::text, 'every_8'::text, 'every_9'::text, 'every_10'::text, 'every_11'::text, 'annual'::text, 'once'::text])));
ALTER TABLE budget_lines ADD CONSTRAINT budget_lines_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);

ALTER TABLE budgets ADD CONSTRAINT budgets_month_year_envelope_key UNIQUE (month, year, envelope);
ALTER TABLE budgets ADD CONSTRAINT budgets_envelope_check CHECK ((envelope = ANY (ARRAY['fixed'::text, 'leisure'::text, 'savings'::text, 'unexpected'::text])));
ALTER TABLE budgets ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);

ALTER TABLE categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);

ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_pkey PRIMARY KEY (id);
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_monthly_income_id_fkey FOREIGN KEY (monthly_income_id) REFERENCES monthly_income(id) ON DELETE CASCADE;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])));
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE monthly_income ADD CONSTRAINT monthly_income_pkey PRIMARY KEY (id);
ALTER TABLE monthly_income ADD CONSTRAINT monthly_income_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE personal_budget_lines ADD CONSTRAINT personal_budget_lines_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE personal_budget_lines ADD CONSTRAINT personal_budget_lines_pkey PRIMARY KEY (id);
ALTER TABLE personal_budget_lines ADD CONSTRAINT personal_budget_lines_user_id_category_id_key UNIQUE (user_id, category_id);
ALTER TABLE personal_budget_lines ADD CONSTRAINT personal_budget_lines_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_frequency_check CHECK ((frequency = ANY (ARRAY['monthly'::text, 'yearly'::text, 'weekly'::text, 'every_4_weeks'::text])));
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE transactions ADD CONSTRAINT transactions_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES subscriptions(id);

-- ----------------------------------------------------------------------------
-- 4) Index (hors index implicites des contraintes)
-- ----------------------------------------------------------------------------
CREATE INDEX budget_lines_owner_id_idx ON public.budget_lines USING btree (owner_id);
CREATE UNIQUE INDEX categories_label_unique ON public.categories USING btree (lower(TRIM(BOTH FROM label)));
CREATE INDEX ledger_entries_subscription_id_idx ON public.ledger_entries USING btree (subscription_id);

-- ----------------------------------------------------------------------------
-- 5) Row Level Security (activation)
-- ----------------------------------------------------------------------------
ALTER TABLE budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_line_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 6) Policies RLS
-- ----------------------------------------------------------------------------
CREATE POLICY "Accès public" ON budget FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY budget_line_overrides_all ON budget_line_overrides FOR ALL TO public
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY budget_lines_all ON budget_lines FOR ALL TO public
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY budgets_update ON budgets FOR UPDATE TO public
  USING ((auth.role() = 'authenticated'::text));
CREATE POLICY budgets_select ON budgets FOR SELECT TO public
  USING ((auth.role() = 'authenticated'::text));
CREATE POLICY budgets_insert ON budgets FOR INSERT TO public
  WITH CHECK ((auth.role() = 'authenticated'::text));

CREATE POLICY categories_select ON categories FOR SELECT TO public
  USING (true);
CREATE POLICY categories_delete ON categories FOR DELETE TO public
  USING ((auth.role() = 'authenticated'::text));
CREATE POLICY categories_update ON categories FOR UPDATE TO public
  USING ((auth.role() = 'authenticated'::text));
CREATE POLICY categories_insert ON categories FOR INSERT TO public
  WITH CHECK ((auth.role() = 'authenticated'::text));

CREATE POLICY ledger_entries_update ON ledger_entries FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY ledger_entries_delete ON ledger_entries FOR DELETE TO authenticated
  USING (true);
CREATE POLICY ledger_entries_select ON ledger_entries FOR SELECT TO authenticated
  USING (true);
CREATE POLICY ledger_entries_insert ON ledger_entries FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY income_delete ON monthly_income FOR DELETE TO public
  USING ((user_id = auth.uid()));
CREATE POLICY income_select ON monthly_income FOR SELECT TO public
  USING ((user_id = auth.uid()));
CREATE POLICY income_update ON monthly_income FOR UPDATE TO public
  USING ((user_id = auth.uid()));
CREATE POLICY income_insert ON monthly_income FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY pbl_delete ON personal_budget_lines FOR DELETE TO authenticated
  USING ((auth.uid() = user_id));
CREATE POLICY pbl_select ON personal_budget_lines FOR SELECT TO authenticated
  USING (true);
CREATE POLICY pbl_insert ON personal_budget_lines FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY pbl_update ON personal_budget_lines FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id));

CREATE POLICY profiles_select ON profiles FOR SELECT TO public
  USING (true);
CREATE POLICY profiles_insert ON profiles FOR INSERT TO public
  WITH CHECK (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE TO public
  USING ((auth.uid() = id));

CREATE POLICY subscriptions_delete ON subscriptions FOR DELETE TO authenticated
  USING (true);
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT TO authenticated
  USING (true);
CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY transactions_delete ON transactions FOR DELETE TO authenticated
  USING (true);
CREATE POLICY transactions_update ON transactions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY transactions_insert ON transactions FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY transactions_select ON transactions FOR SELECT TO authenticated
  USING (true);

-- ----------------------------------------------------------------------------
-- 7) Triggers
-- ----------------------------------------------------------------------------
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
