"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { getStatus } from "@/lib/scoring";
import type { Indicateur } from "@/types";

interface SaisieItem {
  indicateur: Indicateur;
  valeur: string;
  saved: number | null;
  status: "ok" | "wn" | "dg" | null;
}

const STATUS_LABELS = { ok: "OK", wn: "Vigilance", dg: "Action" };
const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  ok: { color: "#00d4aa", bg: "#00d4aa18" },
  wn: { color: "#ffb347", bg: "#ffb34718" },
  dg: { color: "#ff4d6a", bg: "#ff4d6a18" },
};

export function SaisieScreen({ magasinId }: { magasinId: string }) {
  const [items, setItems] = useState<SaisieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [saveDate, setSaveDate] = useState(() => new Date().toISOString().split("T")[0]);

  const loadData = useCallback(async () => {
    if (!magasinId) return;
    setLoading(true);

    const [{ data: indData }, { data: valData }] = await Promise.all([
      supabase.from("indicateurs").select("*").order("categorie").order("ordre"),
      supabase.from("valeurs").select("indicateur_id, valeur, date_saisie")
        .eq("magasin_id", magasinId)
        .eq("date_saisie", saveDate),
    ]);

    const savedMap: Record<string, number> = {};
    (valData ?? []).forEach((v: { indicateur_id: string; valeur: number }) => {
      savedMap[v.indicateur_id] = v.valeur;
    });

    const newItems: SaisieItem[] = ((indData ?? []) as Indicateur[]).map((ind) => {
      const savedVal = savedMap[ind.id];
      return {
        indicateur: ind,
        valeur: savedVal !== undefined ? String(savedVal) : "",
        saved: savedVal ?? null,
        status: savedVal !== undefined
          ? getStatus(savedVal, ind.direction, ind.seuil_ok, ind.seuil_vigilance)
          : null,
      };
    });

    setItems(newItems);
    // Open first category with alerts by default
    const firstCat = newItems.find((i) => i.status === "dg")?.indicateur.categorie;
    if (firstCat) setOpenCats({ [firstCat]: true });
    else if (newItems.length > 0) setOpenCats({ [newItems[0].indicateur.categorie]: true });
    setLoading(false);
  }, [magasinId, saveDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleChange = (id: string, raw: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.indicateur.id !== id) return item;
        const num = parseFloat(raw.replace(",", "."));
        const status = isNaN(num)
          ? null
          : getStatus(num, item.indicateur.direction, item.indicateur.seuil_ok, item.indicateur.seuil_vigilance);
        return { ...item, valeur: raw, status };
      })
    );
  };

  const handleSave = async (item: SaisieItem) => {
    const num = parseFloat(item.valeur.replace(",", "."));
    if (isNaN(num)) return;
    const id = item.indicateur.id;
    setSaving((p) => ({ ...p, [id]: true }));

    await (supabase as any).from("valeurs").upsert(
      { magasin_id: magasinId, indicateur_id: id, valeur: num, date_saisie: saveDate },
      { onConflict: "magasin_id,indicateur_id,date_saisie" }
    );

    setSaving((p) => ({ ...p, [id]: false }));
    setSaved((p) => ({ ...p, [id]: true }));
    setItems((prev) =>
      prev.map((i) => (i.indicateur.id === id ? { ...i, saved: num } : i))
    );
    setTimeout(() => setSaved((p) => ({ ...p, [id]: false })), 2000);
  };

  const handleSaveAll = async () => {
    const toSave = items.filter((i) => {
      const num = parseFloat(i.valeur.replace(",", "."));
      return !isNaN(num) && num !== i.saved;
    });
    if (toSave.length === 0) return;

    const upsertData = toSave.map((i) => ({
      magasin_id: magasinId,
      indicateur_id: i.indicateur.id,
      valeur: parseFloat(i.valeur.replace(",", ".")),
      date_saisie: saveDate,
    }));

    await (supabase as any).from("valeurs").upsert(upsertData, { onConflict: "magasin_id,indicateur_id,date_saisie" });

    const ids = new Set(toSave.map((i) => i.indicateur.id));
    setItems((prev) =>
      prev.map((i) =>
        ids.has(i.indicateur.id)
          ? { ...i, saved: parseFloat(i.valeur.replace(",", ".")) }
          : i
      )
    );
  };

  // Group by category
  const byCategory = items.reduce<Record<string, SaisieItem[]>>((acc, item) => {
    const cat = item.indicateur.categorie;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const toggleCat = (cat: string) =>
    setOpenCats((p) => ({ ...p, [cat]: !p[cat] }));

  const catScore = (catItems: SaisieItem[]) => {
    const filled = catItems.filter((i) => i.status !== null);
    if (filled.length === 0) return null;
    const ok = filled.filter((i) => i.status === "ok").length;
    return Math.round((ok / filled.length) * 100);
  };

  const changedCount = items.filter((i) => {
    const num = parseFloat(i.valeur.replace(",", "."));
    return !isNaN(num) && num !== i.saved;
  }).length;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[13px]" style={{ color: "var(--textMuted)" }}>Chargement…</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div>
          <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            Saisie des indicateurs
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--textMuted)" }}>
            {items.filter((i) => i.saved !== null).length} / {items.length} indicateurs renseignés
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px]" style={{ color: "var(--textMuted)" }}>Date de saisie</span>
            <input
              type="date"
              value={saveDate}
              onChange={(e) => setSaveDate(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-[12px] border"
              style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
          {changedCount > 0 && (
            <button
              onClick={handleSaveAll}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              💾 Enregistrer tout ({changedCount})
            </button>
          )}
        </div>
      </div>

      {/* Categories */}
      {Object.entries(byCategory).map(([cat, catItems]) => {
        const isOpen = !!openCats[cat];
        const score = catScore(catItems);
        const dgCount = catItems.filter((i) => i.status === "dg").length;
        const filledCount = catItems.filter((i) => i.valeur !== "").length;

        return (
          <div key={cat} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            {/* Category header */}
            <button
              onClick={() => toggleCat(cat)}
              className="w-full flex items-center justify-between px-5 py-3.5 transition-all hover:opacity-80"
              style={{ background: "var(--surface)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{cat}</span>
                <span className="text-[10px]" style={{ color: "var(--textDim)" }}>
                  {filledCount}/{catItems.length} renseignés
                </span>
                {dgCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#ff4d6a22", color: "#ff4d6a" }}>
                    {dgCount} action
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {score !== null && (
                  <span className="text-[12px] font-bold" style={{ color: score >= 70 ? "#00d4aa" : score >= 45 ? "#ffb347" : "#ff4d6a" }}>
                    {score}%
                  </span>
                )}
                <span style={{ color: "var(--textMuted)" }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {/* KPI inputs */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="grid gap-0 divide-y" style={{ borderTop: "1px solid var(--border)", borderColor: "var(--border)" }}>
                    {catItems.map((item) => {
                      const s = item.status;
                      const sc = s ? STATUS_COLORS[s] : null;
                      const isSaving = saving[item.indicateur.id];
                      const isSaved = saved[item.indicateur.id];
                      const changed = item.valeur !== "" && parseFloat(item.valeur.replace(",", ".")) !== item.saved;

                      return (
                        <div
                          key={item.indicateur.id}
                          className="flex items-center gap-4 px-5 py-3"
                          style={{
                            background: sc ? `${sc.bg}` : "var(--surfaceAlt)",
                            borderColor: "var(--border)",
                          }}
                        >
                          {/* Status dot */}
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: sc?.color ?? "#2a2e3a" }}
                          />

                          {/* Name */}
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium" style={{ color: "var(--text)" }}>
                              {item.indicateur.nom}
                            </div>
                            <div className="text-[10px] mt-0.5 flex gap-3" style={{ color: "var(--textDim)" }}>
                              {item.indicateur.seuil_ok !== null && (
                                <span>✓ OK: {item.indicateur.seuil_ok}{item.indicateur.unite}</span>
                              )}
                              {item.indicateur.seuil_vigilance !== null && (
                                <span>⚠ Vigil.: {item.indicateur.seuil_vigilance}{item.indicateur.unite}</span>
                              )}
                              <span style={{ color: "var(--textDim)" }}>
                                {item.indicateur.direction === "up" ? "↑ plus = mieux" : "↓ moins = mieux"}
                              </span>
                            </div>
                          </div>

                          {/* Action recommandée si alerte */}
                          <AnimatePresence>
                            {s && s !== "ok" && item.indicateur.action_defaut && (
                              <motion.div
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: "auto" }}
                                exit={{ opacity: 0, width: 0 }}
                                className="text-[10px] max-w-[180px] leading-tight"
                                style={{ color: sc?.color }}
                              >
                                → {item.indicateur.action_defaut}
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Status badge */}
                          {s && (
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0"
                              style={{ color: sc!.color, background: sc!.bg }}
                            >
                              {STATUS_LABELS[s]}
                            </span>
                          )}

                          {/* Input */}
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              type="number"
                              value={item.valeur}
                              onChange={(e) => handleChange(item.indicateur.id, e.target.value)}
                              onBlur={() => changed && handleSave(item)}
                              onKeyDown={(e) => e.key === "Enter" && handleSave(item)}
                              placeholder="—"
                              className="w-24 text-right rounded-lg px-3 py-2 text-[14px] font-bold border transition-all focus:outline-none focus:ring-1"
                              style={{
                                background: "var(--bg)",
                                borderColor: sc ? `${sc.color}60` : "var(--border)",
                                color: sc?.color ?? "var(--text)",
                                boxShadow: sc ? `0 0 8px ${sc.color}22` : "none",
                              }}
                            />
                            <span className="text-[11px] w-6" style={{ color: "var(--textDim)" }}>
                              {item.indicateur.unite}
                            </span>
                            {isSaving && (
                              <span className="text-[10px]" style={{ color: "var(--textMuted)" }}>…</span>
                            )}
                            {isSaved && (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                                className="text-[14px]"
                              >✓</motion.span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
