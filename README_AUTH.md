# Authentification EasyCash Cockpit

## 3 actions manuelles à faire dans Supabase

### 1. Remplacer la clé API dans `.env.local`

1. Aller sur [supabase.com](https://supabase.com) > votre projet `bgreukjqujstgzulgabz`
2. **Settings** > **API** > copier la valeur **anon / public** sous "Project API keys"
3. Ouvrir `.env.local` à la racine du projet et remplacer `PLACEHOLDER_A_REMPLACER` :
   ```
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
   ```

---

### 2. Créer les comptes franchisés

1. Aller dans **Authentication** > **Users** > bouton **Add user** > **Create new user**
2. Saisir l'e-mail et le mot de passe du franchisé
3. Répéter pour chaque franchisé
4. L'e-mail saisi sera l'identifiant de connexion sur l'app

---

### 3. Activer la sécurité RLS sur les tables

1. Aller dans **SQL Editor** > **New query**
2. Copier-coller le contenu de `supabase/migrations/enable_rls.sql`
3. Cliquer **Run**
4. Vérifier dans **Authentication** > **Policies** que chaque table affiche la policy `authenticated_users_only`

---

## Lancer l'app en local

```bash
npm run dev
# Ouvre http://localhost:3000
# La page /login s'affiche — entrez les identifiants créés dans Supabase
```

> **Note** : Si `NEXT_PUBLIC_SUPABASE_ANON_KEY` n'est pas encore remplacée, la connexion échouera avec "Identifiant ou mot de passe incorrect". Remplacez la clé en premier.
