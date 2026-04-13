export interface DecideurAction {
  titre: string;
  qui: string;
  quoi: string;
  quand: string;
  combien: string;
  kpi_cible: string;
  famille: string;
}

export interface MissionMois {
  action: string;
  deadline: string;
  statut: "à faire" | "en cours" | "retard";
}

export interface TimelineItem {
  mois: string;
  actions: string[];
  gain_cumule: number;
}

export interface DecideurResult {
  nouvelles_actions: DecideurAction[];
  missions_mois: MissionMois[];
  actions_obsoletes: string[];
  timeline: TimelineItem[];
}

export async function callDecideur(data: {
  alertes: unknown[];
  actions_existantes: unknown[];
  visites_passees?: unknown[];
}): Promise<DecideurResult> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "decideur", data }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result as DecideurResult;
}
