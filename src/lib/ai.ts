export async function callAI(system: string, message: string): Promise<string> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, message }),
  });
  const data = (await res.json()) as { result?: string; error?: string };
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data.result ?? '';
}

export function parseJSON<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
