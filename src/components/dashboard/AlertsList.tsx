"use client";

import { ValeurAvecIndicateur } from "@/types";

interface AlertsListProps {
  items: ValeurAvecIndicateur[];
}

export function AlertsList({ items }: AlertsListProps) {
  const p1 = items.filter((i) => i.status === "dg").sort((a, b) => b.poids - a.poids);
  const p2 = items.filter((i) => i.status === "wn").sort((a, b) => b.poids - a.poids);

  return (
    <div
      className="rounded-xl p-4 border"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="text-[13px] font-semibold mb-3" style={{ color: "var(--text)" }}>
        Actions prioritaires
      </div>

      {p1.length === 0 && p2.length === 0 ? (
        <div
          className="py-6 text-center text-[13px]"
          style={{ color: "var(--textMuted)" }}
        >
          Aucune alerte — tout est OK 🎉
        </div>
      ) : (
        <div className="space-y-0">
          {p1.slice(0, 8).map((item) => (
            <AlertRow key={item.indicateur_id} item={item} priority="P1" />
          ))}
          {p2.slice(0, 6).map((item) => (
            <AlertRow key={item.indicateur_id} item={item} priority="P2" />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRow({
  item,
  priority,
}: {
  item: ValeurAvecIndicateur;
  priority: "P1" | "P2";
}) {
  const pColor = priority === "P1" ? "var(--danger)" : "var(--warn)";
  const pDim = priority === "P1" ? "var(--dangerDim)" : "var(--warnDim)";

  return (
    <div
      className="flex items-start gap-3 py-2.5 border-b"
      style={{ borderColor: "var(--border)" }}
    >
      <span
        className="text-[10px] font-bold px-2 py-0.5 rounded mt-0.5 shrink-0"
        style={{ color: pColor, background: pDim }}
      >
        {priority}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-medium" style={{ color: "var(--text)" }}>
            {item.indicateur_nom}
          </span>
          <span className="text-[11px]" style={{ color: pColor }}>
            {item.valeur}
            {item.unite} / seuil {item.seuil_ok}
            {item.unite}
          </span>
        </div>
        {item.action_defaut && (
          <div className="text-[11px] mt-0.5" style={{ color: "var(--textMuted)" }}>
            → {item.action_defaut}
          </div>
        )}
      </div>
      <span
        className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
        style={{ color: "var(--textDim)", background: "var(--surfaceAlt)" }}
      >
        ×{item.poids}
      </span>
    </div>
  );
}
