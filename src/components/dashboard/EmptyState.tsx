"use client";

export function EmptyState() {
  return (
    <div
      className="rounded-xl p-10 border text-center"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div
        className="text-[18px] font-semibold mb-3"
        style={{ color: "var(--accent)" }}
      >
        Cockpit prêt — aucune donnée saisie
      </div>
      <div className="text-[14px] leading-8" style={{ color: "var(--textMuted)" }}>
        Saisissez vos valeurs dans{" "}
        <strong style={{ color: "var(--accent)" }}>◈ KPIs détail</strong>
        {" "}ou importez via{" "}
        <strong style={{ color: "var(--accent)" }}>⬆ Import</strong>
        <br />
        Le score se calcule dès la première valeur saisie.
      </div>
    </div>
  );
}
