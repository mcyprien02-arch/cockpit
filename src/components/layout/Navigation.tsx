"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────
export type TabId =
  | "cockpit" | "diagnostic" | "kpis" | "plan" | "pap"
  | "balance" | "chvacv" | "competences" | "temps"
  | "visite" | "comparatif" | "import" | "config";

export type AppMode = "consultant" | "franchisé" | "visite";

// ─── Tab groups ───────────────────────────────────────────────
const MAIN_TABS: { id: string; label: string; icon: string }[] = [
  { id: "cockpit",     label: "Verdict",  icon: "⚡" },
  { id: "kpis",        label: "Diagnostic", icon: "📊" },
  { id: "pap",         label: "Actions",  icon: "🎯" },
  { id: "competences", label: "Équipe",   icon: "👥" },
];

export const SUB_TABS: Record<string, { id: TabId; label: string }[]> = {
  kpis:        [{ id: "kpis",        label: "Saisie KPIs" }, { id: "diagnostic", label: "Analyse Radar" }],
  pap:         [{ id: "pap",         label: "PAP" }, { id: "plan",       label: "Plan d'action" }, { id: "balance", label: "Balance Éco." }, { id: "chvacv", label: "CHVACV" }],
  competences: [{ id: "competences", label: "Compétences" }, { id: "temps",      label: "Analyse Temps" }],
};

const PLUS_ITEMS: { id: TabId; label: string; icon: string }[] = [
  { id: "visite",     label: "Visite & CR",  icon: "📋" },
  { id: "comparatif", label: "Comparatif",   icon: "🏆" },
  { id: "import",     label: "Import",       icon: "📥" },
  { id: "config",     label: "Paramétrage",  icon: "⚙️" },
];

export function getTabGroup(tab: TabId): string {
  if (tab === "cockpit") return "cockpit";
  if (tab === "kpis" || tab === "diagnostic") return "kpis";
  if (["pap", "plan", "balance", "chvacv"].includes(tab)) return "pap";
  if (tab === "competences" || tab === "temps") return "competences";
  return "plus";
}

// ─── Navigation ───────────────────────────────────────────────
interface NavigationProps {
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
  mode: AppMode;
}

export function Navigation({ activeTab, onTabChange, mode }: NavigationProps) {
  const [plusOpen, setPlusOpen] = useState(false);
  const plusRef                 = useRef<HTMLDivElement>(null);
  const currentGroup            = getTabGroup(activeTab);
  const subTabs                 = SUB_TABS[currentGroup] ?? [];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) {
        setPlusOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Tabs visible in franchisé mode
  const franchiseMainTabs = ["cockpit", "kpis", "pap"];
  const visibleMain = mode === "franchisé"
    ? MAIN_TABS.filter(t => franchiseMainTabs.includes(t.id))
    : MAIN_TABS;

  return (
    <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      {/* Main nav */}
      <div className="flex items-center max-w-[1600px] mx-auto px-4 overflow-x-auto">
        {visibleMain.map(tab => {
          const isActive = currentGroup === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                // Navigate to first sub-tab or the tab itself
                const subs = SUB_TABS[tab.id];
                onTabChange(subs ? subs[0].id : (tab.id as TabId));
                setPlusOpen(false);
              }}
              className="flex items-center gap-1.5 px-4 py-3.5 text-[12px] font-semibold border-b-2 transition-all whitespace-nowrap shrink-0"
              style={{
                borderBottomColor: isActive ? "var(--accent)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--textMuted)",
                background: isActive ? "#00d4aa08" : "transparent",
                fontFamily: "inherit",
                cursor: "pointer",
                outline: "none",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              }}
            >
              <span className="text-[14px]">{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}

        {/* Plus dropdown */}
        {mode !== "franchisé" && (
          <div ref={plusRef} className="relative ml-1 shrink-0">
            <button
              onClick={() => setPlusOpen(v => !v)}
              className="flex items-center gap-1.5 px-4 py-3.5 text-[12px] font-semibold transition-all whitespace-nowrap"
              style={{
                borderBottom: currentGroup === "plus" ? "2px solid var(--accent)" : "2px solid transparent",
                color: currentGroup === "plus" ? "var(--accent)" : "var(--textMuted)",
                background: currentGroup === "plus" ? "#00d4aa08" : "transparent",
                fontFamily: "inherit",
                cursor: "pointer",
                outline: "none",
                border: "none",
              }}
            >
              ⊕ Plus
              <span className="text-[10px]" style={{ color: "var(--textDim)" }}>{plusOpen ? "▲" : "▼"}</span>
            </button>

            <AnimatePresence>
              {plusOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 rounded-xl border py-1.5 z-50"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                    minWidth: 180,
                  }}
                >
                  {PLUS_ITEMS.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { onTabChange(item.id); setPlusOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-medium transition-colors text-left"
                      style={{
                        background: activeTab === item.id ? "#00d4aa12" : "transparent",
                        color: activeTab === item.id ? "var(--accent)" : "var(--text)",
                        fontFamily: "inherit",
                        cursor: "pointer",
                        border: "none",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surfaceAlt)")}
                      onMouseLeave={e => (e.currentTarget.style.background = activeTab === item.id ? "#00d4aa12" : "transparent")}
                    >
                      <span className="text-[15px]">{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Sub-tab pills */}
      {subTabs.length > 0 && (
        <div
          className="flex items-center gap-2 max-w-[1600px] mx-auto px-4 py-2"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {subTabs.map(sub => {
            const isActive = activeTab === sub.id;
            return (
              <button
                key={sub.id}
                onClick={() => onTabChange(sub.id)}
                className="rounded-full px-3.5 py-1 text-[11px] font-semibold transition-all"
                style={{
                  background: isActive ? "var(--accent)" : "var(--surfaceAlt)",
                  color: isActive ? "#000" : "var(--textMuted)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Mode Switcher ────────────────────────────────────────────
export function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: AppMode;
  onChange: (m: AppMode) => void;
}) {
  const modes: { id: AppMode; label: string }[] = [
    { id: "consultant", label: "Consultant" },
    { id: "franchisé",  label: "Franchisé" },
    { id: "visite",     label: "Visite" },
  ];

  return (
    <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
      {modes.map(m => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className="px-3 py-1.5 text-[11px] font-semibold transition-colors"
          style={{
            background: mode === m.id ? "var(--accent)" : "var(--surface)",
            color: mode === m.id ? "#000" : "var(--textMuted)",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
