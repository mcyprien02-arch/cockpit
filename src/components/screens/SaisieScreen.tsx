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

// ─── Network benchmarks ────────────────────────────────────────
const BENCHMARKS: Record<string, { value: number | string; unit: string }> = {
  "ca / m²": { value: 7700, unit: "€/m²" },
  "panier moyen": { value: 97.5, unit: "€" },
  "taux de transformation": { value: 25.4, unit: "%" },
  "taux marge nette": { value: 38.5, unit: "%" },
  "masse salariale": { value: 15, unit: "%" },
  "ebe": { value: 8, unit: "%" },
  "démarque": { value: 3, unit: "%" },
  "stock âgé": { value: 30, unit: "%" },
  "note google": { value: 4.5, unit: "/5" },
  "nps": { value: 72, unit: "" },
  "sav": { value: 10, unit: "%" },
  "gmroi": { value: 3.84, unit: "" },
  "ca par collaborateur": { value: 20000, unit: "€/mois" },
};
function getBenchmark(nom: string) {
  const n = nom.toLowerCase();
  const key = Object.keys(BENCHMARKS).find(k => n.includes(k));
  return key ? BENCHMARKS[key] : null;
}

// ─── VPD Calculator ────────────────────────────────────────────
function VPDCalculator({ onClose }: { onClose: () => void }) {
  const questions = [
    "Famille majeure ?",
    "Nouveauté ?",
    "Top vente ?",
    "Forte rotation ?",
    "Concurrence sur le rachat ?",
  ];
  const [answers, setAnswers] = useState<boolean[]>(Array(5).fill(false));
  const score = answers.filter(Boolean).length;
  const result = score >= 4 ? "V" : score >= 2 ? "P" : "D";
  const resultLabels: Record<string, { label: string; color: string; desc: string }> = {
    V: { label: "Valorisé", color: "#00d4aa", desc: "Marger davantage, produit recherché" },
    P: { label: "Prudent", color: "#ffb347", desc: "Prix marché, juste équilibre" },
    D: { label: "Déstockage", color: "#ff4d6a", desc: "Prix agressif, écouler rapidement" },
  };
  const r = resultLabels[result];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
        onClick={e => e.stopPropagation()}
        className="rounded-2xl p-6 w-full max-w-sm space-y-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>Aide VPD — Positionnement Prix</div>
          <button onClick={onClose} style={{ color: "var(--textMuted)" }}>✕</button>
        </div>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}>
              <span className="text-[12px]" style={{ color: "var(--text)" }}>{q}</span>
              <button
                onClick={() => setAnswers(prev => { const n = [...prev]; n[i] = !n[i]; return n; })}
                className="text-[11px] font-bold px-3 py-1 rounded-lg transition-all"
                style={{ background: answers[i] ? "#00d4aa22" : "var(--surface)", color: answers[i] ? "#00d4aa" : "var(--textMuted)", border: `1px solid ${answers[i] ? "#00d4aa40" : "var(--border)"}` }}
              >
                {answers[i] ? "Oui" : "Non"}
              </button>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-4 text-center" style={{ background: `${r.color}15`, border: `1px solid ${r.color}30` }}>
          <div className="text-[32px] font-black mb-1" style={{ color: r.color }}>{result}</div>
          <div className="text-[14px] font-bold" style={{ color: r.color }}>{r.label}</div>
          <div className="text-[11px] mt-1" style={{ color: "var(--textMuted)" }}>{r.desc}</div>
          <div className="text-[10px] mt-2" style={{ color: "var(--textDim)" }}>{score}/5 critères valorisants</div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── GPA Diagnostic Widget ─────────────────────────────────────
function GPAWidget({ onClose }: { onClose: () => void }) {
  const sections = [
    { key: "G", label: "Gamme", items: ["Couverture gamme OK ?", "Doublons/triplons ?", "Stock âgé > 30% ?", "Gamme référence respectée ?"] },
    { key: "P", label: "Prix", items: ["Prix alignés EasyPrice ?", "Écart cote EP achat acceptable ?", "Accélérations vieux stock faites ?", "Prix ronds sur promos ?"] },
    { key: "A", label: "Animation", items: ["Bonnes affaires visibles ?", "Nouveautés mises en avant ?", "Réassurance affichée (garantie, paiement) ?", "Appels de stock en place ?"] },
  ];
  const [answers, setAnswers] = useState<boolean[]>(Array(12).fill(false));
  const scores = [0, 4, 8].map(start => answers.slice(start, start + 4).filter(Boolean).length);
  const sColors = ["#6b8fa3", "#ffb347", "#a78bfa"];
  // Mini radar triangle SVG
  const CX = 60; const CY = 55; const R = 40;
  const verts = [0, 1, 2].map(i => {
    const angle = (i / 3) * 2 * Math.PI - Math.PI / 2;
    return { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
  });
  const inner = scores.map((s, i) => {
    const angle = (i / 3) * 2 * Math.PI - Math.PI / 2;
    const frac = s / 4;
    return { x: CX + R * frac * Math.cos(angle), y: CY + R * frac * Math.sin(angle) };
  });
  const outerPath = verts.map((v, i) => `${i === 0 ? "M" : "L"}${v.x},${v.y}`).join(" ") + "Z";
  const innerPath = inner.map((v, i) => `${i === 0 ? "M" : "L"}${v.x},${v.y}`).join(" ") + "Z";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
        onClick={e => e.stopPropagation()}
        className="rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>📊 Diagnostic GPA</div>
          <button onClick={onClose} style={{ color: "var(--textMuted)" }}>✕</button>
        </div>
        <div className="flex items-center gap-6">
          <svg width="120" height="110" viewBox="0 0 120 110">
            <path d={outerPath} fill="none" stroke="var(--border)" strokeWidth="1.5" />
            <path d={innerPath} fill="#a78bfa30" stroke="#a78bfa" strokeWidth="2" />
            {verts.map((v, i) => (
              <text key={i} x={v.x + (v.x > CX ? 6 : v.x < CX ? -6 : 0)} y={v.y + (v.y > CY ? 14 : -4)}
                textAnchor={v.x > CX ? "start" : v.x < CX ? "end" : "middle"}
                fontSize="10" fill={sColors[i]} fontWeight="700">{sections[i].key}</text>
            ))}
          </svg>
          <div className="flex gap-4">
            {scores.map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-[22px] font-bold" style={{ color: sColors[i] }}>{s}/4</div>
                <div className="text-[10px]" style={{ color: "var(--textMuted)" }}>{sections[i].label}</div>
              </div>
            ))}
          </div>
        </div>
        {sections.map((sec, si) => (
          <div key={sec.key}>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: sColors[si] }}>
              {sec.key} — {sec.label}
            </div>
            <div className="space-y-1.5">
              {sec.items.map((q, qi) => {
                const idx = si * 4 + qi;
                return (
                  <div key={qi} className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}>
                    <span className="text-[12px]" style={{ color: "var(--text)" }}>{q}</span>
                    <button
                      onClick={() => setAnswers(prev => { const n = [...prev]; n[idx] = !n[idx]; return n; })}
                      className="text-[11px] font-bold px-3 py-1 rounded-lg ml-3 shrink-0 transition-all"
                      style={{ background: answers[idx] ? "#00d4aa22" : "var(--surface)", color: answers[idx] ? "#00d4aa" : "var(--textMuted)", border: `1px solid ${answers[idx] ? "#00d4aa40" : "var(--border)"}` }}
                    >
                      {answers[idx] ? "✓ Oui" : "Non"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function TrendChip({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  const pct = previous !== 0 ? Math.abs(diff / previous) * 100 : 0;
  if (pct < 1) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#8b8fa322", color: "#8b8fa3" }}>
        → stable
      </span>
    );
  }
  const up = diff > 0;
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: up ? "#00d4aa22" : "#ff4d6a22", color: up ? "#00d4aa" : "#ff4d6a" }}>
      {up ? "↑" : "↓"} {up ? "+" : "-"}{pct.toFixed(1)}%
    </span>
  );
}

export function SaisieScreen({ magasinId }: { magasinId: string }) {
  const [items, setItems] = useState<SaisieItem[]>([]);
  const [prevValues, setPrevValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [saveDate, setSaveDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [showVPD, setShowVPD] = useState(false);
  const [showGPA, setShowGPA] = useState(false);

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

    // Load previous values (second-to-last date)
    const { data: prevDates } = await supabase
      .from("valeurs")
      .select("date_saisie")
      .eq("magasin_id", magasinId)
      .lt("date_saisie", saveDate)
      .order("date_saisie", { ascending: false })
      .limit(1);
    if (prevDates && prevDates.length > 0) {
      const prevDate = (prevDates[0] as { date_saisie: string }).date_saisie;
      const { data: prevData } = await supabase
        .from("valeurs")
        .select("indicateur_id, valeur")
        .eq("magasin_id", magasinId)
        .eq("date_saisie", prevDate);
      const pm: Record<string, number> = {};
      (prevData ?? []).forEach((v: { indicateur_id: string; valeur: number }) => {
        pm[v.indicateur_id] = v.valeur;
      });
      setPrevValues(pm);
    } else {
      setPrevValues({});
    }

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
          <button onClick={() => setShowGPA(true)} className="px-3 py-2 rounded-xl text-[11px] font-semibold border hover:opacity-90"
            style={{ borderColor: "#6b8fa340", color: "#6b8fa3", background: "#6b8fa312" }}>
            📊 GPA
          </button>
          <button onClick={() => setShowVPD(true)} className="px-3 py-2 rounded-xl text-[11px] font-semibold border hover:opacity-90"
            style={{ borderColor: "#a78bfa40", color: "#a78bfa", background: "#a78bfa12" }}>
            🏷 VPD
          </button>
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

      {/* GPA / VPD modals */}
      <AnimatePresence>
        {showGPA && <GPAWidget onClose={() => setShowGPA(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showVPD && <VPDCalculator onClose={() => setShowVPD(false)} />}
      </AnimatePresence>

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
                              {(() => {
                                const bench = getBenchmark(item.indicateur.nom);
                                if (!bench) return null;
                                return <span style={{ color: "#a78bfa80" }}>Réseau: {bench.value}{bench.unit}</span>;
                              })()}
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

                          {/* Trend chip N vs N-1 */}
                          {item.saved !== null && prevValues[item.indicateur.id] !== undefined && (
                            <TrendChip current={item.saved} previous={prevValues[item.indicateur.id]} />
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
