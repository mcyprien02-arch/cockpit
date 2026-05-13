-- ============================================================
-- ACTIVATION RLS — EasyCash Cockpit
-- ============================================================
-- Instructions :
--   1. Ouvrir Supabase > SQL Editor > New query
--   2. Coller ce fichier entier et cliquer "Run"
--   3. Vérifier dans Authentication > Policies que chaque table
--      affiche la policy "authenticated_users_only"
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  )
  LOOP
    -- Activer RLS
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;',
      t
    );

    -- Rendre idempotent (supprimer si déjà existante)
    EXECUTE format(
      'DROP POLICY IF EXISTS "authenticated_users_only" ON public.%I;',
      t
    );

    -- Policy : accès complet aux utilisateurs authentifiés uniquement
    EXECUTE format($$
      CREATE POLICY "authenticated_users_only"
      ON public.%I
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
    $$, t);

  END LOOP;
END $$;

-- Vérification : liste les policies créées
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
