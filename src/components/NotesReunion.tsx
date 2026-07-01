'use client';
import { useState, useEffect } from 'react';

interface Props {
  moduleKey: string;
}

export default function NotesReunion({ moduleKey }: Props) {
  const storageKey = `notes_reunion_${moduleKey}`;
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
    <div className="border-2 border-[#E0E0E0] rounded-xl px-4 py-3 space-y-2 bg-white hover:border-[#D1D5DB] transition-colors">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-[#374151]">📋 Notes consultants</p>
        {saved && <span className="text-[10px] text-green-600 font-semibold">Enregistré</span>}
      </div>
      <textarea
        className="w-full text-sm text-[#1A1A1A] bg-[#F9FAFB] border border-[#E0E0E0] rounded-lg px-3 py-2.5 min-h-[80px] resize-y focus:outline-none focus:border-[#9CA3AF] placeholder:text-[#D1D5DB]"
        placeholder="Prenez vos notes ici…"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={e => save(e.target.value)}
      />
    </div>
  );
}
