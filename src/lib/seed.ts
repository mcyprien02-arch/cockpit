import { getSupabase } from "@/lib/supabase";

/** Inserts Lyon Est demo data from the visit of 17/03/2026.
 *  Safe to call multiple times — uses upsert. */
export async function seedLyonEst(): Promise<{ ok: boolean; message: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabase() as any;

  // 1. Find Lyon Est magasin
  const { data: magasins } = await supabase
    .from("magasins")
    .select("id, nom")
    .ilike("nom", "%lyon est%");

  if (!magasins || magasins.length === 0) {
    return { ok: false, message: "Magasin Lyon Est introuvable." };
  }
  const magasinId = magasins[0].id;

  // 2. Get all indicateurs ids
  const { data: indicateurs } = await supabase
    .from("indicateurs")
    .select("id, nom");

  if (!indicateurs) return { ok: false, message: "Indicateurs introuvables." };

  const findId = (nom: string) => (indicateurs as { id: string; nom: string }[]).find((i) => i.nom === nom)?.id;

  // 3. Values from the CR 17/03/2026
  const DATE = "2026-03-17";
  const rawValues: { nom: string; valeur: number }[] = [
    { nom: "Gamme Téléphonie", valeur: 75 },
    { nom: "Taux d'achat ext. global", valeur: 8.9 },
    { nom: "Délai de vente moyen", valeur: 46 },
    { nom: "Écart cote EP achat", valeur: 8 },
    { nom: "Batterie / Picea", valeur: 0 },
    { nom: "Produits certifiés authentiques", valeur: 0 },
    { nom: "Tuile réparation", valeur: 0 },
    { nom: "Module étiquette", valeur: 1 },
    { nom: "Module démarque", valeur: 1 },
    { nom: "Tuile Marketplace", valeur: 1 },
    { nom: "Droit erreur / SOR30", valeur: 1 },
    { nom: "Garantie 2 ans", valeur: 1 },
    { nom: "Envoi du bilan", valeur: 1 },
    { nom: "Participation vie réseau", valeur: 1 },
  ];

  const toUpsert = rawValues
    .map(({ nom, valeur }) => {
      const indicateur_id = findId(nom);
      if (!indicateur_id) return null;
      return { magasin_id: magasinId, indicateur_id, valeur, date_saisie: DATE };
    })
    .filter(Boolean) as { magasin_id: string; indicateur_id: string; valeur: number; date_saisie: string }[];

  const { error: upsertErr } = await supabase
    .from("valeurs")
    .upsert(toUpsert, { onConflict: "magasin_id,indicateur_id,date_saisie" });

  if (upsertErr) return { ok: false, message: upsertErr.message };

  // 4. Create visit record (ignore if already exists)
  const { data: existingVisit } = await supabase
    .from("visites")
    .select("id")
    .eq("magasin_id", magasinId)
    .eq("date_visite", DATE);

  if (!existingVisit || existingVisit.length === 0) {
    await supabase.from("visites").insert({
      magasin_id: magasinId,
      date_visite: DATE,
      consultant: "Consultant EasyCash",
      franchise: "Eric PRINET",
      constats: "Visite de démarrage. Déploiement Picea non effectué. Sourcing externe à renforcer (8.9% vs cible 20%). Délai de vente élevé (46j). Non-négociables partiellement respectés.",
      score_global: 42,
    });

    // 5. Add initial action plan items
    const { data: visitData } = await supabase
      .from("visites")
      .select("id")
      .eq("magasin_id", magasinId)
      .eq("date_visite", DATE)
      .single();

    if (visitData) {
      await supabase.from("plans_action").insert([
        {
          visite_id: visitData.id,
          magasin_id: magasinId,
          priorite: "P1",
          constat: "Picea non déployé — smartphones non testés à l'achat",
          action: "Activer Picea sur tous les postes et former l'équipe",
          responsable: "Responsable magasin",
          echeance: "2026-04-01",
          statut: "À faire",
          kpi_cible: "Batterie / Picea",
        },
        {
          visite_id: visitData.id,
          magasin_id: magasinId,
          priorite: "P1",
          constat: "Taux d'achat externe à 8.9% — bien en dessous de la cible (20%)",
          action: "Plan sourcing : foires, dépôts, partenariats locaux. Objectif +2% par semaine.",
          responsable: "Toute l'équipe",
          echeance: "2026-04-15",
          statut: "À faire",
          kpi_cible: "Taux d'achat ext. global",
        },
        {
          visite_id: visitData.id,
          magasin_id: magasinId,
          priorite: "P1",
          constat: "Produits certifiés authentiques non activé",
          action: "Créer compte Authentifier.com et former l'équipe",
          responsable: "Responsable magasin",
          echeance: "2026-03-25",
          statut: "À faire",
          kpi_cible: "Produits certifiés authentiques",
        },
        {
          visite_id: visitData.id,
          magasin_id: magasinId,
          priorite: "P2",
          constat: "Délai de vente moyen à 46j (cible 30j)",
          action: "Revoir pricing sur produits > 45j. Déclenchement démarque progressive.",
          responsable: "Responsable magasin",
          echeance: "2026-04-30",
          statut: "À faire",
          kpi_cible: "Délai de vente moyen",
        },
        {
          visite_id: visitData.id,
          magasin_id: magasinId,
          priorite: "P2",
          constat: "Tuile réparation non utilisée",
          action: "Activer tuile réparation et créer les dossiers SAV en cours",
          responsable: "Responsable magasin",
          echeance: "2026-04-01",
          statut: "À faire",
          kpi_cible: "Tuile réparation",
        },
      ]);
    }
  }

  return { ok: true, message: `Données Lyon Est chargées (${toUpsert.length} indicateurs, visite du ${DATE}).` };
}
