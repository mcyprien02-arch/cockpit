"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

// ─── Checklist Manager EasyCash ───────────────────────────────
const CHECKLIST_MANAGER: { categorie: string; icon: string; taches: string[] }[] = [
  {
    categorie: "Sécurité",
    icon: "🔒",
    taches: [
      "Tour contrôle ext/int",
      "Comptage coffre",
      "Comptage caisses",
      "Contrôle sécurité",
      "Tour fermeture",
      "Flux financiers",
      "Extinction matériels",
    ],
  },
  {
    categorie: "Gestion",
    icon: "📋",
    taches: [
      "Lecture mails",
      "Notifications intranet",
      "Analyse résultats",
      "Pointage heures",
      "Traiter les Z",
      "Traiter rebuts",
    ],
  },
  {
    categorie: "Management",
    icon: "👥",
    taches: [
      "Planification journée",
      "Tour magasin",
      "Préparation briefing",
      "Suivi collaborateurs",
      "Contrôle tenues",
    ],
  },
  {
    categorie: "Commerce",
    icon: "💰",
    taches: [
      "Ouverture Dashboard",
      "PLV",
      "Appel stock ciblé",
      "Journal achats",
      "Journal ventes",
    ],
  },
  {
    categorie: "Clients",
    icon: "🤝",
    taches: [
      "Accueil premiers clients",
      "Gestion retours",
      "Accompagnement derniers clients",
    ],
  },
];

interface CheckItem {
  categorie: string;
  tache: string;
  fait: boolean;
}

export function ChecklistScreen({ magasinId }: { magasinId: string }) {
  const [items, setItems] = useState<CheckItem[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const [openCats, setOpenCats] = useState<Set<string>>(
    () => new Set(CHECKLIST_MANAGER.map(c => c.categorie))
  );

  const load = useCallback(async () => {
    if (!magasinId) return;
    setLoading(true);

    const { data } = await supabase
      .from("checklist")
      .select("tache, fait")
      .eq("magasin_id", magasinId)
      .eq("date_check", date);

    const savedMap: Record<string, boolean> = {};
    (data ?? []).forEach((r: { tache: string; fait: boolean }) => {
      savedMap[r.tache] = r.fait;
    });

    const all: CheckItem[] = CHECKLIST_MANAGER.flatMap(cat =>
      cat.taches.map(t => ({
        categorie: cat.categorie,
        tache: t,
        fait: savedMap[t] ?? false,
      }))
    );

    setItems(all);
    setLoading(false);
  }, [magasinId, date]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (tache: string) => {
    const current = items.find(i => i.tache === tache);
    if (!current) return;
    const newFait = !current.fait;

    setItems(prev => prev.map(i => i.tache === tache ? { ...i, fait: newFait } : i));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("checklist").upsert(
      { magasin_id: magasinId, date_check: date, tache, categorie: null, fait: newFait },
      { onConflict: "magasin_id,date_check,tache" }
    );
  };

  const toggleCat = (cat: string) => {
    setOpenCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const totalDone = items.filter(i => i.fait).length;
  const total = items.length;
  const progress = total > 0 ? Math.round((totalDone / total) * 100) : 0;
  const r = 45;
  const circ = 2 * Math.PI * r;
  const fill = (progress / 100) * circ;
  const progressColor = progress >= 80 ? "#00d4aa" : progress >= 50 ? "#ffb347" : "#ff4d6a";

  const byCategory = CHECKLIST_MANAGER.map(cat => ({
    ...cat,
    items: items.filter(i => i.categorie === cat.categorie),
  }));

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[13px]" style={{ color: "var(--textMuted)" }}>Chargement…</div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-[900px]">

      {/* Header */}
      <div
        className="flex items-center gap-6 p-5 rounded-2xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* Circle progress */}
        <svg width={110} height={110} viewBox="0 0 110 110" className="shrink-0">
          <circle cx={55} cy={55} r={r} fill="none" stroke="#2a2e3a" strokeWidth={8} />
          <circle
            cx={55} cy={55} r={r}
            fill="none"
            stroke={progressColor}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${fill} ${circ}`}
            style={{ transform: "rotate(-90deg)", transformOrigin: "55px 55px", transition: "stroke-dasharray 0.5s ease" }}
          />
          <text x={55} y={52} textAnchor="middle" fill={progressColor} fontSize={22} fontWeight="800" fontFamily="DM Sans">
            {progress}%
          </text>
          <text x={55} y={68} textAnchor="middle" fill="#8b8fa3" fontSize={9} fontFamily="DM Sans">
            {totalDone}/{total}
          </text>
        </svg>

        <div className="flex-1">
          <div className="text-[18px] font-bold mb-1" style={{ color: "var(--text)" }}>Checklist Manager</div>
          <div className="text-[12px] mb-3" style={{ color: "var(--textMuted)" }}>
            {totalDone === total && total > 0
              ? "🎉 Tout est fait — excellente journée !"
              : `${total - totalDone} tâche${total - totalDone > 1 ? "s" : ""} restante${total - totalDone > 1 ? "s" : ""}`
            }
          </div>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-[12px] border"
            style={{
              background: "var(--surfaceAlt)",
              borderColor: "var(--border)",
              color: "var(--text)",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Category summary */}
        <div className="hidden md:flex flex-col gap-1.5">
          {byCategory.map(cat => {
            const done = cat.items.filter(i => i.fait).length;
            const tot = cat.items.length;
            const pct = tot > 0 ? Math.round((done / tot) * 100) : 0;
            return (
              <div key={cat.categorie} className="flex items-center gap-2">
                <span className="text-[14px]">{cat.icon}</span>
                <div className="h-1.5 rounded-full overflow-hidden w-20" style={{ background: "var(--surfaceAlt)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: pct === 100 ? "#00d4aa" : pct >= 50 ? "#ffb347" : "#ff4d6a",
                    }}
                  />
                </div>
                <span className="text-[10px] font-semibold" style={{ color: pct === 100 ? "#00d4aa" : "var(--textDim)" }}>
                  {done}/{tot}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Categories */}
      {byCategory.map(cat => {
        const catDone = cat.items.filter(i => i.fait).length;
        const catTotal = cat.items.length;
        const isOpen = openCats.has(cat.categorie);
        return (
          <div key={cat.categorie} className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            {/* Category header — clickable to collapse */}
            <button
              onClick={() => toggleCat(cat.categorie)}
              className="w-full flex items-center justify-between px-5 py-3 border-b transition-all"
              style={{
                background: catDone === catTotal ? "#00d4aa08" : "var(--surface)",
                borderColor: "var(--border)",
                cursor: "pointer",
                fontFamily: "inherit",
                border: "none",
                borderBottom: `1px solid var(--border)`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[18px]">{cat.icon}</span>
                <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                  {cat.categorie}
                </span>
                {catDone === catTotal && catTotal > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#00d4aa20", color: "#00d4aa" }}>
                    ✓ Complet
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: catDone === catTotal ? "#00d4aa" : "var(--textMuted)" }}
                >
                  {catDone}/{catTotal}
                </span>
                <span className="text-[10px]" style={{ color: "var(--textDim)" }}>
                  {isOpen ? "▲" : "▼"}
                </span>
              </div>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="divide-y overflow-hidden"
                  style={{ borderColor: "var(--border)" }}
                >
                  {cat.items.map(item => (
                    <motion.div
                      key={item.tache}
                      className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:opacity-80 transition-all"
                      style={{ background: item.fait ? "#00d4aa06" : "var(--surfaceAlt)" }}
                      onClick={() => toggle(item.tache)}
                      whileTap={{ scale: 0.98 }}
                    >
                      {/* Checkbox */}
                      <motion.div
                        className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
                        style={{
                          borderColor: item.fait ? "#00d4aa" : "#2a2e3a",
                          background: item.fait ? "#00d4aa" : "transparent",
                        }}
                        animate={{ scale: item.fait ? [1, 1.2, 1] : 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        <AnimatePresence>
                          {item.fait && (
                            <motion.span
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              className="text-[10px] font-bold"
                              style={{ color: "#000" }}
                            >
                              ✓
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.div>

                      <span
                        className="text-[13px]"
                        style={{
                          color: item.fait ? "var(--textDim)" : "var(--text)",
                          textDecoration: item.fait ? "line-through" : "none",
                        }}
                      >
                        {item.tache}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
