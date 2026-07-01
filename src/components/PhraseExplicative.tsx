'use client';
import { useState, useEffect, useRef } from 'react';

interface Props {
  moduleKey: string;
  defaultText: string;
}

export default function PhraseExplicative({ moduleKey, defaultText }: Props) {
  const storageKey = `phrase_expl_${moduleKey}`;
  const [text, setText] = useState(defaultText);
  const [editing, setEditing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) setText(stored);
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    if (editing) taRef.current?.focus();
  }, [editing]);

  function save(val: string) {
    try { localStorage.setItem(storageKey, val); } catch {}
    setEditing(false);
  }

  function reset() {
    setText(defaultText);
    try { localStorage.removeItem(storageKey); } catch {}
    setEditing(false);
  }

  return (
    <div className="bg-white border border-[#E0E0E0] rounded-lg px-3 py-2">
      {editing ? (
        <>
          <textarea
            ref={taRef}
            className="w-full text-xs text-[#6B7280] bg-transparent resize-none focus:outline-none leading-relaxed"
            rows={2}
            value={text}
            onChange={e => setText(e.target.value)}
            onBlur={() => save(text)}
            onKeyDown={e => { if (e.key === 'Escape') { setText(defaultText); setEditing(false); } }}
          />
          <div className="flex gap-3 mt-0.5">
            <button onMouseDown={() => save(text)} className="text-[10px] text-green-700 hover:underline">✓ Valider</button>
            <button onMouseDown={reset} className="text-[10px] text-[#9CA3AF] hover:underline">Réinitialiser</button>
          </div>
        </>
      ) : (
        <p
          className="text-xs text-[#9CA3AF] italic leading-relaxed cursor-text hover:text-[#6B7280] transition-colors select-none"
          onClick={() => setEditing(true)}
          title="Cliquez pour modifier"
        >
          {text}
          <span className="ml-1 not-italic opacity-40">✏</span>
        </p>
      )}
    </div>
  );
}
