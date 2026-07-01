'use client';
import { useState, useEffect } from 'react';

interface Props {
  moduleKey: string;
  magasinNom: string;
}

export default function CommentaireConsultant({ moduleKey, magasinNom }: Props) {
  const storageKey = `commentaires_${moduleKey}_${magasinNom}`;
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try { setText(localStorage.getItem(storageKey) ?? ''); } catch {}
  }, [storageKey]);

  function save(val: string) {
    try { localStorage.setItem(storageKey, val); } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="border border-[#E0E0E0] rounded-xl px-4 py-3 space-y-1.5 bg-[#FAFAFA]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#6B7280]">📝 Commentaires consultant</p>
        {saved && <span className="text-[10px] text-green-600 font-medium">Enregistré</span>}
      </div>
      <textarea
        className="w-full text-xs text-[#374151] bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 min-h-[60px] resize-y focus:outline-none focus:border-[#9CA3AF] placeholder:text-[#D1D5DB]"
        placeholder="Notes internes du consultant — jamais transmises à l'IA ni utilisées dans les calculs…"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={e => save(e.target.value)}
      />
    </div>
  );
}
