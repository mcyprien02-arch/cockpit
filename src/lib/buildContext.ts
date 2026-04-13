import { supabase } from "@/lib/supabase";

export interface KPISnapshot {
  nom: string;
  valeur: number;
  unite: string | null;
  status: "ok" | "wn" | "dg";
  categorie: string;
}

export interface MagasinContext {
  magasinNom: string;
  phase: string;
  kpis: KPISnapshot[];
  topAlertes: KPISnapshot[];
  pap: { action: string; priorite: string; statut: string; echeance?: string }[];
}

function getStatus(
  v: number,
  dir: string,
  seuil_ok: number | null,
  seuil_vig: number | null,
): "ok" | "wn" | "dg" {
  if (seuil_ok == null || seuil_vig == null) return "wn";
  if (dir === "up") {
    if (v >= seuil_ok) return "ok";
    if (v >= seuil_vig) return "wn";
    return "dg";
  } else {
    if (v <= seuil_ok) return "ok";
    if (v <= seuil_vig) return "wn";
    return "dg";
  }
}

export async function buildMagasinContext(magasinId: string): Promise<MagasinContext> {
  const [{ data: mag }, { data: vals }, { data: pap }] = await Promise.all([
    supabase.from("magasins").select("nom, phase_vie").eq("id", magasinId).single(),
    supabase.from("v_dernieres_valeurs").select("*").eq("magasin_id", magasinId),
    supabase
      .from("plans_action")
      .select("action, priorite, statut, echeance")
      .eq("magasin_id", magasinId)
      .neq("statut", "Fait")
      .order("priorite")
      .limit(8),
  ]);

  const kpis: KPISnapshot[] = ((vals ?? []) as any[]).map((r) => ({
    nom: r.indicateur_nom,
    valeur: r.valeur,
    unite: r.unite,
    categorie: r.categorie,
    status: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
  }));

  const topAlertes = kpis.filter((k) => k.status === "dg").slice(0, 5);

  return {
    magasinNom: (mag as any)?.nom ?? "Magasin",
    phase: (mag as any)?.phase_vie ?? "maturite",
    kpis,
    topAlertes,
    pap: (pap ?? []) as any[],
  };
}
