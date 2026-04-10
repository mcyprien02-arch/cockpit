import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * POST /api/seed
 * Body: { magasinId: string }
 *
 * Injects coherent demo data for a store doing 2 M€ CA / 40% margin.
 * Uses realistic KPI values that show some alerts so the diagnostic
 * and phase-aware recommendations are visible.
 */
export async function POST(req: NextRequest) {
  const { magasinId } = await req.json();
  if (!magasinId) return NextResponse.json({ error: "magasinId required" }, { status: 400 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://bgreukjqujstgzulgabz.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncmV1a2pxdWpzdGd6dWxnYWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDY0NDAsImV4cCI6MjA4OTkyMjQ0MH0.TuiB0xveQ27QWIn_bEW74m3E1heVc4yKY7DQzhZoasY"
  );

  // 1. Récupère tous les indicateurs
  const { data: indicateurs, error: indErr } = await sb
    .from("indicateurs")
    .select("id, nom, unite, direction");

  if (indErr || !indicateurs) {
    return NextResponse.json({ error: indErr?.message ?? "Indicateurs introuvables" }, { status: 500 });
  }

  const findId = (nom: string) =>
    (indicateurs as { id: string; nom: string }[]).find(
      (i) => i.nom.toLowerCase().includes(nom.toLowerCase())
    )?.id ?? null;

  /**
   * Contexte : magasin en phase maturité, 2 M€ CA annuel, marge 40 %.
   *
   * Données choisies pour déclencher des alertes instructives :
   *  - GMROI à 2.8  → alerte (cible maturité > 3.5)
   *  - Stock âgé à 18 % → alerte (cible < 10 %)
   *  - Délai de vente à 38 j → alerte (cible < 30 j)
   *  - TLAC à 1.2 → alerte (cible > 1.8)
   *  - Taux retour à 7 % → alerte (cible < 5 %)
   *  - Note Google 4.1 → vigilance (cible > 4.5)
   *  - Masse salariale 16 % → vigilance (cible < 15 %)
   *  - Gamme téléphonie 68 % → ok
   *  - EBE 6 % → vigilance (cible > 8 %)
   *  - Marge brute 40 % → ok
   *  - Picea = 1 (actif)
   */
  const DATE = new Date().toISOString().split("T")[0];

  // Mapping nom partiel → valeur
  const VALUES: Record<string, number> = {
    "GMROI": 2.8,
    "Marge": 40,
    "EBE": 6,
    "Masse sal": 16,
    "CA par ETP": 235000,
    "CA/ETP": 235000,
    "Stock âg": 18,
    "Délai de vente": 38,
    "Gamme Téléphon": 68,
    "TLAC": 1.2,
    "Taux.*retour": 7,
    "Taux de retour": 7,
    "Note Google": 4.1,
    "NPS": 58,
    "Picea": 1,
    "Batterie / Picea": 1,
    "Produits certifiés": 1,
    "Module étiquette": 1,
    "Module démarque": 1,
    "Tuile Marketplace": 1,
    "Tuile réparation": 1,
    "Droit erreur": 1,
    "Garantie 2 ans": 1,
    "Envoi du bilan": 1,
    "Participation vie réseau": 1,
    "Taux d'achat ext": 18,
    "Écart cote": 5,
    "Chiffre d'affaires": 2000000,
  };

  // Construit les upserts
  type UpsertRow = {
    magasin_id: string;
    indicateur_id: string;
    valeur: number;
    date_saisie: string;
  };

  const toUpsert: UpsertRow[] = [];

  for (const ind of indicateurs as { id: string; nom: string }[]) {
    let matched: number | null = null;
    for (const [key, val] of Object.entries(VALUES)) {
      const regex = new RegExp(key, "i");
      if (regex.test(ind.nom)) {
        matched = val;
        break;
      }
    }
    if (matched !== null) {
      toUpsert.push({
        magasin_id: magasinId,
        indicateur_id: ind.id,
        valeur: matched,
        date_saisie: DATE,
      });
    }
  }

  if (toUpsert.length === 0) {
    return NextResponse.json({ error: "Aucun indicateur matché — vérifiez les noms dans la DB" }, { status: 422 });
  }

  const { error: upsertErr } = await sb
    .from("valeurs")
    .upsert(toUpsert, { onConflict: "magasin_id,indicateur_id,date_saisie" });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // 2. Met à jour phase_vie → maturite
  await sb
    .from("magasins")
    .update({ phase_vie: "maturite" })
    .eq("id", magasinId);

  // 3. Crée une visite + actions PAP réalistes
  const { data: existingVisit } = await sb
    .from("visites")
    .select("id")
    .eq("magasin_id", magasinId)
    .eq("date_visite", DATE);

  let visiteId: string | null = null;

  if (!existingVisit || existingVisit.length === 0) {
    const { data: newVisit } = await sb
      .from("visites")
      .insert({
        magasin_id: magasinId,
        date_visite: DATE,
        consultant: "Consultant EasyCash",
        franchise: "Franchisé",
        constats:
          "Visite de diagnostic. GMROI à 2.8 (cible maturité > 3.5). Stock âgé à 18% — principal frein. " +
          "TLAC insuffisant (1.2 vs cible 1.8). Taux de retour à 7% — Picea actif mais process incomplet. " +
          "Note Google à 4.1 — progression possible avec plan avis clients.",
        score_global: 62,
      })
      .select("id")
      .single();
    visiteId = newVisit?.id ?? null;
  } else {
    visiteId = existingVisit[0].id;
  }

  // 4. Actions PAP réalistes
  if (visiteId) {
    // Supprime les actions existantes pour ce magasin/visite pour éviter les doublons
    await sb.from("plans_action").delete().eq("visite_id", visiteId);

    const today = new Date();
    const d = (daysOffset: number) => {
      const dt = new Date(today);
      dt.setDate(dt.getDate() + daysOffset);
      return dt.toISOString().split("T")[0];
    };

    await sb.from("plans_action").insert([
      {
        visite_id: visiteId,
        magasin_id: magasinId,
        priorite: "haute",
        constat:
          "Stock âgé à 18% (cible maturité < 10%) — ~50 000€ de cash immobilisé",
        action:
          "Identifier les 20 références > 45 jours et lancer démarque progressive -15% J+45 / -30% J+60",
        responsable: "Responsable magasin",
        echeance: d(14),
        statut: "En cours",
        kpi_cible: "Stock âgé",
      },
      {
        visite_id: visiteId,
        magasin_id: magasinId,
        priorite: "haute",
        constat:
          "TLAC à 1.2 (cible 1.8) — manque à gagner estimé ~18 000€/an de marge accessoires",
        action:
          "Challenge vendeurs : 1 accessoire systématique par vente. Afficher TLAC individuel chaque matin pendant 3 semaines.",
        responsable: "Manager",
        echeance: d(7),
        statut: "À faire",
        kpi_cible: "TLAC",
      },
      {
        visite_id: visiteId,
        magasin_id: magasinId,
        priorite: "haute",
        constat:
          "Taux de retour à 7% (cible < 5%) — Picea actif mais process incomplet sur les appareils > 150€",
        action:
          "Contrôle systématique Picea sur 100% des téléphones > 150€ à l'achat. Former l'équipe sur les 3 nouvelles catégories.",
        responsable: "Toute l'équipe",
        echeance: d(10),
        statut: "À faire",
        kpi_cible: "Taux de retour",
      },
      {
        visite_id: visiteId,
        magasin_id: magasinId,
        priorite: "normale",
        constat:
          "Note Google 4.1/5 (cible maturité > 4.5) — 23 avis sans réponse depuis 2 mois",
        action:
          "Répondre à tous les avis sous 24h. Former l'équipe à demander un avis après chaque client satisfait. Objectif : +10 avis 5★ ce mois.",
        responsable: "Responsable",
        echeance: d(30),
        statut: "À faire",
        kpi_cible: "Note Google",
      },
      {
        visite_id: visiteId,
        magasin_id: magasinId,
        priorite: "normale",
        constat:
          "GMROI à 2.8 (cible maturité > 3.5) — conséquence directe du stock âgé et du délai de vente",
        action:
          "Revue mensuelle du stock avec règle : aucun achat en gamme déjà stockée > 30j. Créer un tableau de bord rotation hebdomadaire.",
        responsable: "Manager",
        echeance: d(45),
        statut: "À faire",
        kpi_cible: "GMROI",
      },
      {
        visite_id: visiteId,
        magasin_id: magasinId,
        priorite: "normale",
        constat:
          "Masse salariale à 16% (cible < 15%) — plannings non optimisés vs flux de clientèle",
        action:
          "Analyser le flux client heure par heure sur 2 semaines. Revoir les plannings pour concentrer les ETP aux heures de pointe (11h-13h, 17h-19h).",
        responsable: "Responsable",
        echeance: d(60),
        statut: "À faire",
        kpi_cible: "Masse salariale",
      },
    ]);
  }

  return NextResponse.json({
    ok: true,
    message: `${toUpsert.length} indicateurs injectés pour le ${DATE}. Phase → maturité. ${visiteId ? "6 actions PAP créées." : ""}`,
    indicateurs: toUpsert.length,
    visiteId,
  });
}
