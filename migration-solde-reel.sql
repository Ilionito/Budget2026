-- Solde réel du compte, saisi/corrigé manuellement (compte bancaire non synchronisé).
-- Stocké par profil : chacun (Joris / Ophélie) a son propre solde réel.
-- À lancer dans Supabase (SQL Editor). Les policies UPDATE existantes sur
-- profiles (propriétaire) couvrent déjà l'édition de ces colonnes.

alter table public.profiles
  add column if not exists real_balance numeric;

-- Date « au … » à laquelle ce solde réel est valable (informatif + base d'une
-- éventuelle évolution future avec les nouvelles transactions).
alter table public.profiles
  add column if not exists real_balance_at date;
