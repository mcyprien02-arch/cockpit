"use client";

import { useState } from "react";

// ─── Réseau médianes (valeurs hardcodées, remplaçables par API) ─
export const MEDIANES_RESEAU: Record<string, { valeur: number; label: string; unite: string }> = {
  "rotation_stock":     { valeur: 52,    label: "Rotation stock",   unite: "j" },
  "taux_stock_age":     { valeur: 18,    label: "Stock âgé",        unite: "%" },
  "marge_brute":        { valeur: 31,    label: "Marge brute",      unite: "%" },
  "chiffre_affaires":   { valeur: 85000, label: "CA mensuel",       unite: "€" },
  "tresorerie":         { valeur: 15000, label: "Trésorerie",       unite: "€" },
  "prix_moyen_achat":   { valeur: 28,    label: "Prix moyen achat", unite: "€" },
  "gmroi":              { valeur: 3.84,  label: "GMROI",            unite: "" },
  "taux_marge_nette":   { valeur: 38.5,  label: "Taux marge nette", unite: "%" },
  "masse_salariale":    { valeur: 15,    label: "Masse salariale",  unite: "%" },
  "note_google":        { valeur: 4.5,   label: "Note Google",      unite: "/5" },
};

// ─── Find matching benchmark key ─────────────────────────────
export function findBenchmarkKey(kpiNom: string): string | null {
  const n = kpiNom.toLowerCase();
  if (n.includes("stock âg") || n.includes("stock age")) return "taux_stock_age";
  if (n.includes("gmroi")) return "gmroi";
  if (n.includes("marge") && n.includes("nette")) return "taux_marge_nette";
  if (n.includes("marge")) return "marge_brute";
  if (n.includes("ca mensuel") || n.includes("chiffre d")) return "chiffre_affaires";
  if (n.includes("trésor")) return "tresorerie";
  if (n.includes("masse salar")) return "masse_salariale";
  if (n.includes("note google") || n.includes("google")) return "note_google";
  if (n.includes("délai de vente") || n.includes("rotation")) return "rotation_stock";
  if (n.includes("prix moyen") && n.includes("achat")) return "prix_moyen_achat";
  return null;
}

// ─── BenchmarkBadge ───────────────────────────────────────────
interface BenchmarkBadgeProps {
  kpiNom: string;
  valeur: number | null;
  direction?: "up" | "down"; // up = plus = mieux, down = moins = mieux
}

export function BenchmarkBadge({ kpiNom, valeur, direction = "up" }: BenchmarkBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (valeur === null || valeur === undefined) return null;

  const key = findBenchmarkKey(kpiNom);
  if (!key) return null;

  const bench = MEDIANES_RESEAU[key];
  const ratio = valeur / bench.valeur;
  const isBetter = direction === "up" ? ratio >= 1.1 : ratio <= 0.9;
  const isAverage = Math.abs(ratio - 1) <= 0.1;
  const isWorse = direction === "up" ? ratio < 0.9 : ratio > 1.1;

  const config = isBetter
    ? { icon: "✓", text: "Au-dessus de la médiane",  color: "#00d4aa" }
    : isAverage
      ? { icon: "→", text: "Dans la moyenne réseau",  color: "#8b8fa3" }
      : { icon: "↓", text: "En dessous de la médiane", color: "#ffb347" };

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(v => !v)}
        className="text-[10px] font-semibold flex items-center gap-1 mt-1"
        style={{
          color: config.color,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
        }}
      >
        <span>{config.icon}</span>
        <span>{config.text}</span>
      </button>

      {showTooltip && (
        <div
          className="absolute bottom-full left-0 mb-1 z-50 rounded-lg px-3 py-2 text-[11px] whitespace-nowrap shadow-xl"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            minWidth: "220px",
          }}
        >
          <div className="font-semibold mb-0.5" style={{ color: config.color }}>
            Médiane réseau : {bench.valeur.toLocaleString("fr-FR")}{bench.unite}
          </div>
          <div style={{ color: "var(--textMuted)" }}>
            Calculée sur l'ensemble du réseau Easycash.
          </div>
        </div>
      )}
    </div>
  );
}
