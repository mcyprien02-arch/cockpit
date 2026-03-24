"use client";

import { Magasin } from "@/types";

interface HeaderProps {
  magasins: Magasin[];
  selectedId: string;
  onSelectMagasin: (id: string) => void;
}

export function Header({ magasins, selectedId, onSelectMagasin }: HeaderProps) {
  return (
    <header
      className="flex items-center justify-between px-6 py-[14px] border-b sticky top-0 z-50 flex-wrap gap-2"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-bg text-base"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--blue))" }}
        >
          E
        </div>
        <span className="text-[17px] font-semibold tracking-tight">EasyCash cockpit</span>
        <span
          className="text-[11px] px-2 py-0.5 rounded ml-1"
          style={{ color: "var(--textDim)", background: "var(--surfaceAlt)" }}
        >
          pro
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={selectedId}
          onChange={(e) => onSelectMagasin(e.target.value)}
          className="px-3 py-[5px] rounded-lg text-[13px] font-medium outline-none cursor-pointer"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surfaceAlt)",
            color: "var(--text)",
            fontFamily: "inherit",
          }}
        >
          {magasins.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom}
            </option>
          ))}
        </select>

        <button
          className="px-4 py-[7px] rounded-lg text-[13px] font-semibold transition-all"
          style={{ background: "var(--surfaceAlt)", color: "var(--text)", border: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--border)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surfaceAlt)")}
          onClick={() => window.print()}
        >
          PDF cockpit
        </button>

        <button
          className="px-4 py-[7px] rounded-lg text-[13px] font-semibold transition-all"
          style={{ background: "var(--accent)", color: "var(--bg)", border: "none" }}
        >
          Générer CR visite
        </button>
      </div>
    </header>
  );
}
