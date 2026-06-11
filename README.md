# Budget 2026

Application de suivi budgétaire pour deux utilisateurs (Joris & Ophélie), construite avec Next.js 15, Supabase, des composants style shadcn/ui, Zustand et Recharts.

## Démarrer

```bash
npm install
npm run dev
```

L'app tourne sur [http://localhost:3000](http://localhost:3000).

## Configuration Supabase

Les variables sont dans `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

Important : dans le dashboard Supabase → Authentication → URL Configuration, ajouter l'URL de l'app (par ex. `http://localhost:3000/**` et l'URL de prod) aux **Redirect URLs**, sinon le lien magique ne redirigera pas vers `/dashboard`.

Seules les adresses listées dans `src/lib/supabase.ts` (`ALLOWED_EMAILS`) peuvent demander un lien de connexion.

## Pages

- `/auth` — connexion par lien magique (whitelist)
- `/dashboard` — KPI, revenus, dépenses cumulées, répartition par catégorie
- `/transactions` — liste filtrable, ajout via le bouton +, suppression de ses propres lignes
- `/subscriptions` — abonnements actifs/suspendus, totaux mensuels et annuels
- `/budget` — enveloppes (charges fixes, loisirs, épargne, imprévus) + suggestion de virement
- `/settings` — profil, export CSV, déconnexion

## Build

```bash
npm run build
npm start
```
