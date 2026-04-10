import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * POST /api/seed
 * Body: { magasinId: string }
 *
 * Injecte des données démo cohérentes : 2 M€ CA / 40% marge / phase maturité.
 * Retourne un diagnostic complet de ce qui a été inséré ou non.
 */
export async function POST(req: NextRequest) {
  const { magasinId } = await req.json();
  if (!magasinId) {
    return NextResponse.json({ error: "magasinId requis" }, { status: 400 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://bgreukjqujstgzulgabz.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncmV1a2pxdWpzdGd6dWxnYWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDY0NDAsImV4cCI6MjA4OTkyMjQ0MH0.TuiB0xveQ27QWIn_bEW74m3E1heVc4yKY7DQzhZoasY"
  );

  // ── 1. Récupère tous les indicateurs ───────────────────────────
  const { data: indicateurs, error: indErr } = await sb
    .from("indicateurs")
    .select("id, nom, unite, direction, categorie");

  if (indErr) {
    return NextResponse.json(
      { error: "Impossible de lire les indicateurs : " + indErr.message },
      { status: 500 }
    );
  }

  const allInds = (indicateurs ?? []) as {
    id: string;
    nom: string;
    unite: string | null;
    direction: string;
    categorie: string;
  }[];

  // ── 2. Valeurs cibles pour le scénario 2M€ CA / 40% marge ─────
  //   Pattern (regex) → valeur
  //   Conçu pour déclencher des alertes instructives en phase maturité
  const TARGETS: { pattern: RegExp; value: number }[] = [
    // KPIs financiers
    { pattern: /gmroi/i,                      value: 2.8   },
    { pattern: /marge.*(nette|brute)|taux.*marge/i, value: 40   },
    { pattern: /ebe|résultat.*exploit/i,       value: 6     },
    { pattern: /masse.*sal|salaire.*masse/i,   value: 16    },
    { pattern: /ca.*etp|ca.*colla|chiffre.*etp/i, value: 235000 },
    { pattern: /ca.*mensuel|ca\s+mensuel|chiffre.*mensuel/i, value: 167000 },
    { pattern: /chiffre.*affaires|ca\s+annuel/i, value: 2000000 },

    // KPIs stock / rotation
    { pattern: /stock\s*âg|vieux\s*stock/i,    value: 18    },
    { pattern: /délai.*vente|vente.*délai/i,    value: 38    },
    { pattern: /valeur.*stock|stock.*valeur/i,  value: 290000 },

    // KPIs commerciaux
    { pattern: /tlac|achat.*complémentaire|vente.*complement/i, value: 1.2 },
    { pattern: /gamme.*tél|téléphon.*gamme/i,  value: 68    },
    { pattern: /taux.*achat.*ext|achat.*externe/i, value: 18 },
    { pattern: /écart.*cote|cote.*écart/i,     value: 5     },

    // KPIs qualité / retours
    { pattern: /taux.*retour|retour.*taux/i,   value: 7     },
    { pattern: /picea|batterie.*picea/i,        value: 1     },
    { pattern: /certifi|authentifi/i,           value: 1     },
    { pattern: /tuile.*répar|répar.*tuile/i,    value: 1     },
    { pattern: /marketplace|tuile.*market/i,    value: 1     },

    // KPIs e-réputation
    { pattern: /note.*google|google.*note|avis.*google/i, value: 4.1 },
    { pattern: /nps|net.*promo/i,              value: 58    },

    // Non-négociables (outils actifs = 1)
    { pattern: /module.*étiquette/i,           value: 1     },
    { pattern: /module.*démarque/i,            value: 1     },
    { pattern: /droit.*erreur|sor.*30/i,       value: 1     },
    { pattern: /garantie.*2.*ans|2.*ans.*garantie/i, value: 1 },
    { pattern: /envoi.*bilan|bilan.*envoi/i,   value: 1     },
    { pattern: /participation.*réseau/i,        value: 1     },
    { pattern: /panier.*moyen|moyen.*panier/i, value: 95    },
    { pattern: /démarque|shrinkage/i,          value: 3.2   },
  ];

  const DATE = new Date().toISOString().split("T")[0];

  type UpsertRow = {
    magasin_id: string;
    indicateur_id: string;
    valeur: number;
    date_saisie: string;
  };

  const toUpsert: UpsertRow[] = [];
  const matched: string[] = [];
  const unmatched: string[] = allInds.map(i => i.nom);

  for (const ind of allInds) {
    for (const target of TARGETS) {
      if (target.pattern.test(ind.nom)) {
        toUpsert.push({
          magasin_id: magasinId,
          indicateur_id: ind.id,
          valeur: target.value,
          date_saisie: DATE,
        });
        matched.push(ind.nom);
        const idx = unmatched.indexOf(ind.nom);
        if (idx > -1) unmatched.splice(idx, 1);
        break;
      }
    }
  }

  // ── 3. Upsert des valeurs ──────────────────────────────────────
  let valInserted = 0;
  if (toUpsert.length > 0) {
    const { error: upsertErr } = await sb
      .from("valeurs")
      .upsert(toUpsert, { onConflict: "magasin_id,indicateur_id,date_saisie" });

    if (upsertErr) {
      return NextResponse.json(
        {
          error: "Erreur upsert valeurs : " + upsertErr.message,
          matched,
          unmatched,
        },
        { status: 500 }
      );
    }
    valInserted = toUpsert.length;
  }

  // ── 4. Phase maturité ─────────────────────────────────────────
  await sb
    .from("magasins")
    .update({ phase_vie: "maturite" })
    .eq("id", magasinId);

  // ── 5. Visite + PAP ───────────────────────────────────────────
  // Vérifie si une visite existe déjà pour aujourd'hui
  const { data: existingVisit } = await sb
    .from("visites")
    .select("id")
    .eq("magasin_id", magasinId)
    .eq("date_visite", DATE)
    .limit(1);

  let visiteId: string | null =
    existingVisit && existingVisit.length > 0 ? existingVisit[0].id : null;

  if (!visiteId) {
    const { data: newVisit, error: visiteErr } = await sb
      .from("visites")
      .insert({
        magasin_id: magasinId,
        date_visite: DATE,
        consultant: "Consultant EasyCash",
        franchise: "Franchisé démo",
        constats:
          "Visite diagnostic — données démo 2 M€ CA / 40% marge. " +
          "GMROI à 2.8 (cible maturité > 3.5). Stock âgé 18% (cible < 10%). " +
          "TLAC à 1.2 (cible 1.8). Taux retour 7% (cible < 5%). Note Google 4.1 (cible > 4.5).",
        score_global: 58,
      })
      .select("id")
      .single();

    if (visiteErr) {
      // Essaie sans les champs optionnels
      const { data: simpleVisit } = await sb
        .from("visites")
        .insert({
          magasin_id: magasinId,
          date_visite: DATE,
        })
        .select("id")
        .single();
      visiteId = simpleVisit?.id ?? null;
    } else {
      visiteId = newVisit?.id ?? null;
    }
  }

  // ── 6. Actions PAP réalistes ──────────────────────────────────
  let papInserted = 0;

  if (visiteId) {
    // Supprime les actions existantes pour cette visite
    await sb.from("plans_action").delete().eq("visite_id", visiteId);

    const today = new Date();
    const d = (daysOffset: number) => {
      const dt = new Date(today);
      dt.setDate(dt.getDate() + daysOffset);
      return dt.toISOString().split("T")[0];
    };

    // Tentative avec priorité P1/P2/P3 (format DB)
    const papRows = [
      {
        visite_id: visiteId,
        magasin_id: magasinId,
        priorite: "P1",
        constat:
          "Stock âgé à 18% (cible maturité < 10%) — ~52 000€ de cash immobilisé",
        action:
          "Identifier les 20 références > 45j et lancer démarque progressive -15% J+45 / -30% J+60",
        responsable: "Responsable magasin",
        echeance: d(14),
        statut: "En cours",
        kpi_cible: "Stock âgé",
      },
      {
        visite_id: visiteId,
        magasin_id: magasinId,
        priorite: "P1",
        constat:
          "TLAC à 1.2 (cible 1.8) — manque à gagner ~18 000€/an en marge accessoires",
        action:
          "Challenge vendeurs 3 semaines : 1 accessoire par vente. Afficher TLAC individuel chaque matin.",
        responsable: "Manager",
        echeance: d(7),
        statut: "À faire",
        kpi_cible: "TLAC",
      },
      {
        visite_id: visiteId,
        magasin_id: magasinId,
        priorite: "P1",
        constat:
          "Taux retour 7% (cible < 5%) — Picea actif mais process incomplet > 150€",
        action:
          "Contrôle Picea systématique sur 100% des téléphones > 150€. Former l'équipe sur les 3 nouvelles catégories.",
        responsable: "Toute l'équipe",
        echeance: d(10),
        statut: "À faire",
        kpi_cible: "Taux de retour",
      },
      {
        visite_id: visiteId,
        magasin_id: magasinId,
        priorite: "P2",
        constat:
          "Note Google 4.1/5 (cible maturité > 4.5) — 23 avis sans réponse",
        action:
          "Répondre à tous les avis < 24h. Former l'équipe à demander un avis après chaque client satisfait.",
        responsable: "Responsable",
        echeance: d(30),
        statut: "À faire",
        kpi_cible: "Note Google",
      },
      {
        visite_id: visiteId,
        magasin_id: magasinId,
        priorite: "P2",
        constat:
          "GMROI à 2.8 (cible > 3.5) — conséquence directe stock âgé + délai vente",
        action:
          "Règle : aucun achat en gamme déjà en stock > 30j. Tableau de bord rotation hebdomadaire.",
        responsable: "Manager",
        echeance: d(45),
        statut: "À faire",
        kpi_cible: "GMROI",
      },
      {
        visite_id: visiteId,
        magasin_id: magasinId,
        priorite: "P2",
        constat:
          "Masse salariale 16% (cible < 15%) — plannings non optimisés vs flux clients",
        action:
          "Analyser flux client heure/heure sur 2 semaines. Revoir plannings pour concentrer ETP aux heures de pointe.",
        responsable: "Responsable",
        echeance: d(60),
        statut: "À faire",
        kpi_cible: "Masse salariale",
      },
    ];

    const { data: papData, error: papErr } = await sb
      .from("plans_action")
      .insert(papRows)
      .select("id");

    if (papErr) {
      // Retry sans visite_id (maybe nullable)
      const rowsWithoutVisiteId = papRows.map(({ visite_id: _v, ...r }) => r);
      const { data: papData2, error: papErr2 } = await sb
        .from("plans_action")
        .insert(rowsWithoutVisiteId)
        .select("id");
      papInserted = papData2?.length ?? 0;
      if (papErr2) {
        // Log mais ne bloque pas
        console.error("PAP insert error:", papErr2.message);
      }
    } else {
      papInserted = papData?.length ?? 0;
    }
  }

  return NextResponse.json({
    ok: true,
    message:
      `✓ ${valInserted} KPIs injectés${papInserted > 0 ? ` + ${papInserted} actions PAP` : ""} — phase → Maturité.` +
      (valInserted === 0
        ? " ⚠ Aucun indicateur matché — allez dans Paramétrage > Indicateurs pour vérifier les noms."
        : ""),
    valInserted,
    papInserted,
    matched,
    unmatchedCount: unmatched.length,
    // Debug: liste les indicateurs non matchés pour aider au diagnostic
    unmatched: unmatched.slice(0, 20),
  });
}
