import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Clé API non configurée. Ajoutez ANTHROPIC_API_KEY dans Vercel > Settings > Environment Variables.' }, { status: 503 });
  }
  try {
    const { system, message } = await req.json();
    if (!system || !message) {
      return NextResponse.json({ error: 'Paramètres manquants (system, message)' }, { status: 400 });
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: system,
        messages: [{ role: 'user', content: message }]
      })
    });
    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: 'Erreur API Anthropic (' + response.status + '): ' + err.substring(0, 200) }, { status: response.status });
    }
    const data = await response.json();
    const text = data.content && data.content[0] ? data.content[0].text : '';
    return NextResponse.json({ result: text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur inconnue' }, { status: 500 });
  }
}
