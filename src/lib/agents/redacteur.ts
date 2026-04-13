export async function callRedacteurCR(data: {
  magasin: string;
  date: string;
  consultant: string;
  constats: string;
  kpis_alertes: unknown[];
  actions_pap: unknown[];
}): Promise<string> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "redacteur_cr", data }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return typeof json.result === "string" ? json.result : JSON.stringify(json.result);
}

export async function callAssistant(data: {
  question: string;
  kpis: unknown[];
  alertes: unknown[];
  pap: unknown[];
}): Promise<string> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "assistant", data }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return typeof json.result === "string" ? json.result : JSON.stringify(json.result);
}
