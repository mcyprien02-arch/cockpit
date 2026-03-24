"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { supabase } from "@/lib/supabase";

const NATURES = [
  { code: "GC", label: "Gestion Commerciale", color: "#00d4aa" },
  { code: "RD", label: "Relation & Développement", color: "#4da6ff" },
  { code: "GF", label: "Gestion Financière", color: "#a78bfa" },
  { code: "PS", label: "Pilotage & Stratégie", color: "#ffb347" },
  { code: "PD", label: "Personnel & Développement", color: "#f472b6" },
] as const;

const DEFAULT_ACTIVITES: { categorie: string; activite: string }[] = [
  { categorie: "Matin", activite: "Tour du magasin + briefing équipe" },
  { categorie: "Matin", activite: "Traitement des achats / rachat" },
  { categorie: "Matin", activite: "Mise à jour des prix" },
  { categorie: "Après-midi", activite: "Suivi des ventes du jour" },
  { categorie: "Après-midi", activite: "Gestion des réseaux sociaux" },
  { categorie: "Après-midi", activite: "Traitement des SAV" },
  { categorie: "Fin de journée", activite: "Clôture caisse" },
  { categorie: "Fin de journée", activite: "Envoi du bilan" },
  { categorie: "Fin de journée", activite: "Préparation J+1" },
];

interface GrilleRow {
  id?: string;
  categorie: string;
  activite: string;
  nature: string;
  passages: number;
  temps_minutes: number;
}

export function GrilleTempsScreen({ magasinId }: { magasinId: string }) {
  const [rows, setRows] = useState<GrilleRow[]>(
    DEFAULT_ACTIVITES.map((a) => ({ ...a, nature: "GC", passages: 0, temps_minutes: 0 }))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const totalByNature = NATURES.map(({ code, label, color }) => ({
    name: code,
    label,
    color,
    value: rows.filter((r) => r.nature === code).reduce((sum, r) => sum + r.temps_minutes, 0),
  })).filter((n) => n.value > 0);

  const totalMin = rows.reduce((sum, r) => sum + r.temps_minutes, 0);

  const update = (idx: number, field: keyof GrilleRow, val: string | number) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { categorie: "Autre", activite: "", nature: "GC", passages: 0, temps_minutes: 0 }]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    // Save as a visite-independent entry using magasin_id + today's date
    // We use a simplified approach: insert/update in grille_temps linked to the latest visite
    const { data: latestVisiteData } = await supabase
      .from("visites")
      .select("id")
      .eq("magasin_id", magasinId)
      .order("date_visite", { ascending: false })
      .limit(1)
      .single();

    const latestVisite = latestVisiteData as { id: string } | null;

    if (latestVisite) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gt = (supabase as any).from("grille_temps");
      await gt.delete().eq("visite_id", latestVisite.id);
      const toInsert = rows
        .filter((r) => r.activite.trim() && r.temps_minutes > 0)
        .map((r) => ({
          visite_id: latestVisite.id,
          categorie: r.categorie,
          activite: r.activite,
          nature: r.nature,
          passages: r.passages,
          temps_minutes: r.temps_minutes,
        }));
      if (toInsert.length > 0) {
        await gt.insert(toInsert);
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Diagnostic
  const diagMessages: string[] = [];
  if (totalMin > 0) {
    NATURES.forEach(({ code, label }) => {
      const pct = Math.round((totalByNature.find((n) => n.name === code)?.value ?? 0) / totalMin * 100);
      if (code === "GC" && pct > 60) diagMessages.push(`⚠️ Trop de temps en ${label} (${pct}%) — déléguer davantage`);
      if (code === "PS" && pct < 10) diagMessages.push(`📌 Peu de temps en ${label} (${pct}%) — réserver du temps stratégique`);
    });
  }

  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[16px] font-bold" style={{ color: "var(--text)" }}>Grille de Temps</div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--textMuted)" }}>
            Total : {h > 0 ? `${h}h` : ""}{m > 0 ? `${m}min` : ""} {totalMin === 0 ? "—" : ""}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={addRow}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold border"
            style={{ borderColor: "var(--border)", color: "var(--textMuted)" }}
          >
            + Ajouter ligne
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            {saved ? "✓ Enregistré" : saving ? "…" : "💾 Enregistrer"}
          </button>
        </div>
      </div>

      {/* Donut + Diagnostic */}
      {totalMin > 0 && (
        <div className="grid gap-5" style={{ gridTemplateColumns: "280px 1fr" }}>
          <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--textMuted)" }}>
              Répartition du temps
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={totalByNature} dataKey="value" cx="50%" cy="50%" outerRadius={80} strokeWidth={0}>
                  {totalByNature.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [`${Math.floor(v / 60)}h${v % 60}min`, ""]}
                  contentStyle={{ background: "#1a1d27", border: "1px solid #2a2e3a", borderRadius: 8, fontSize: 11 }}
                />
                <Legend
                  formatter={(value) => {
                    const n = NATURES.find((x) => x.code === value);
                    return <span style={{ fontSize: 10, color: "var(--textMuted)" }}>{n?.label ?? value}</span>;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textMuted)" }}>
              Diagnostic automatique
            </div>
            {diagMessages.length === 0 ? (
              <div className="text-[12px]" style={{ color: "#00d4aa" }}>✓ Répartition du temps équilibrée</div>
            ) : (
              diagMessages.map((m, i) => (
                <div key={i} className="text-[12px] mb-2" style={{ color: "#ffb347" }}>{m}</div>
              ))
            )}
            {/* Nature breakdown */}
            <div className="mt-4 space-y-2">
              {NATURES.map(({ code, label, color }) => {
                const mins = totalByNature.find((n) => n.name === code)?.value ?? 0;
                const pct = totalMin > 0 ? Math.round((mins / totalMin) * 100) : 0;
                return (
                  <div key={code} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[10px] w-6 font-bold" style={{ color }}>{code}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#2a2e3a" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="text-[10px] w-8 text-right" style={{ color: "var(--textMuted)" }}>{pct}%</span>
                    <span className="text-[10px] w-16 text-right" style={{ color: "var(--textDim)" }}>
                      {Math.floor(mins / 60)}h{String(mins % 60).padStart(2, "0")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
              {["Catégorie", "Activité", "Nature", "Passages", "Temps (min)", ""].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--textMuted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <motion.tr
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="border-b"
                style={{ background: i % 2 === 0 ? "var(--surfaceAlt)" : "var(--surface)", borderColor: "var(--border)" }}
              >
                <td className="px-3 py-2">
                  <input
                    value={row.categorie}
                    onChange={(e) => update(i, "categorie", e.target.value)}
                    className="w-full rounded px-2 py-1 text-[11px] border bg-transparent"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={row.activite}
                    onChange={(e) => update(i, "activite", e.target.value)}
                    className="w-full rounded px-2 py-1 text-[11px] border bg-transparent"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={row.nature}
                    onChange={(e) => update(i, "nature", e.target.value)}
                    className="rounded px-2 py-1 text-[11px] border font-bold"
                    style={{
                      background: "var(--surfaceAlt)",
                      borderColor: NATURES.find((n) => n.code === row.nature)?.color ?? "var(--border)",
                      color: NATURES.find((n) => n.code === row.nature)?.color ?? "var(--text)",
                    }}
                  >
                    {NATURES.map((n) => (
                      <option key={n.code} value={n.code} style={{ background: "var(--surface)", color: n.color }}>
                        {n.code}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={row.passages || ""}
                    onChange={(e) => update(i, "passages", parseInt(e.target.value) || 0)}
                    className="w-16 rounded px-2 py-1 text-[11px] border text-center bg-transparent"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={row.temps_minutes || ""}
                    onChange={(e) => update(i, "temps_minutes", parseInt(e.target.value) || 0)}
                    className="w-20 rounded px-2 py-1 text-[11px] border text-center bg-transparent"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => removeRow(i)} className="text-[12px] hover:opacity-70" style={{ color: "#ff4d6a" }}>✕</button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
