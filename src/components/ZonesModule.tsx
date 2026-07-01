'use client';
import { useState, useEffect } from 'react';

interface Props { moduleKey: string; }

function TextZone({ storageKey, label, placeholder }: { storageKey: string; label: string; placeholder: string }) {
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
    <div className="border border-[#E0E0E0] rounded-xl px-4 py-3 space-y-2 bg-white">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-[#374151]">{label}</p>
        {saved && <span className="text-[10px] text-green-600 font-semibold">Enregistré</span>}
      </div>
      <textarea
        className="w-full text-sm text-[#1A1A1A] bg-[#F9FAFB] border border-[#E0E0E0] rounded-lg px-3 py-2.5 min-h-[80px] resize-y focus:outline-none focus:border-[#9CA3AF] placeholder:text-[#D1D5DB]"
        placeholder={placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={e => save(e.target.value)}
      />
    </div>
  );
}

export default function ZonesModule({ moduleKey }: Props) {
  return (
    <div className="space-y-3">
      <TextZone
        storageKey={`commentaires_${moduleKey}`}
        label="Commentaires"
        placeholder="Retours des collègues consultants…"
      />
      <TextZone
        storageKey={`vision_${moduleKey}`}
        label="Ma vision"
        placeholder="Vision ou intention pour ce module…"
      />
    </div>
  );
}
