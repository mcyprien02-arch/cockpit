"use client";

import { CategorieScore } from "@/types";
import { scoreColor } from "@/lib/scoring";

interface CategoryCardsProps {
  categories: CategorieScore[];
}

const CAT_ICONS: Record<string, string> = {
  Commercial: "📈",
  Stock: "📦",
  Gamme: "🎮",
  "Fidélité": "❤️",
  Financier: "💰",
  "Qualité": "⭐",
  RH: "👥",
  "Web / E-réputation": "🌐",
  "Non-négociables / Outils": "🔧",
  "Non-négociables / Promesse": "✅",
  "Non-négociables / Réseau": "🔗",
  "Politique commerciale": "📊",
};

export function CategoryCards({ categories }: CategoryCardsProps) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
      {categories.map((cat) => {
        const color = scoreColor(cat.score);
        const icon = CAT_ICONS[cat.name] || "📌";
        return (
          <div
            key={cat.name}
            className="rounded-xl p-4 border transition-all hover:scale-[1.02]"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-lg">{icon}</span>
              <ScoreBadge score={cat.score} color={color} />
            </div>

            <div className="text-[12px] font-semibold mb-2 leading-tight" style={{ color: "var(--text)" }}>
              {cat.name}
            </div>

            {/* Mini bar: ok / wn / dg */}
            <div className="flex h-1.5 rounded-full overflow-hidden gap-px mb-2">
              {cat.ok > 0 && (
                <div
                  className="rounded-full"
                  style={{ width: `${(cat.ok / cat.total) * 100}%`, background: "var(--accent)" }}
                />
              )}
              {cat.wn > 0 && (
                <div
                  className="rounded-full"
                  style={{ width: `${(cat.wn / cat.total) * 100}%`, background: "var(--warn)" }}
                />
              )}
              {cat.dg > 0 && (
                <div
                  className="rounded-full"
                  style={{ width: `${(cat.dg / cat.total) * 100}%`, background: "var(--danger)" }}
                />
              )}
            </div>

            <div className="flex gap-2 text-[10px]" style={{ color: "var(--textMuted)" }}>
              <span style={{ color: "var(--accent)" }}>{cat.ok} OK</span>
              {cat.wn > 0 && <span style={{ color: "var(--warn)" }}>{cat.wn} ⚠</span>}
              {cat.dg > 0 && <span style={{ color: "var(--danger)" }}>{cat.dg} ✗</span>}
              <span className="ml-auto">{cat.total} KPIs</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreBadge({ score, color }: { score: number; color: string }) {
  return (
    <div
      className="text-[13px] font-bold px-2 py-0.5 rounded-md"
      style={{
        color,
        background:
          color === "var(--accent)"
            ? "var(--accentDim)"
            : color === "var(--warn)"
            ? "var(--warnDim)"
            : "var(--dangerDim)",
      }}
    >
      {score}%
    </div>
  );
}
