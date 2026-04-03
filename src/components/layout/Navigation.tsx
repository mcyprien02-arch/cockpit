"use client";

// ─── Types ────────────────────────────────────────────────────
export type TabId =
  | "cockpit"
  | "kpis" | "diagnostic" | "import" | "comparatif" | "diagnostic_express"
  | "balance" | "simulateur" | "chvacv"
  | "pap" | "plan" | "competences" | "carnet"
  | "temps" | "visite" | "config";

export type AppMode = "consultant" | "franchisé";

// ─── Tab groups ───────────────────────────────────────────────
const MAIN_TABS: { id: string; label: string; icon: string }[] = [
  { id: "cockpit",    label: "Verdict",    icon: "⚡" },
  { id: "diagnostic_grp", label: "Diagnostic", icon: "🔬" },
  { id: "decisions",  label: "Décisions",  icon: "💰" },
  { id: "actions",    label: "Actions",    icon: "🎯" },
  { id: "equipe",     label: "Équipe",     icon: "👥" },
];

export const SUB_TABS: Record<string, { id: TabId; label: string }[]> = {
  diagnostic_grp: [
    { id: "kpis",               label: "Saisie KPIs" },
    { id: "diagnostic",         label: "Analyse Radar" },
    { id: "diagnostic_express", label: "Express (3 min)" },
    { id: "import",             label: "Import" },
    { id: "comparatif",         label: "Comparatif" },
  ],
  decisions: [
    { id: "balance",    label: "Balance Éco." },
    { id: "simulateur", label: "Simulateur" },
    { id: "chvacv",     label: "CHVACV" },
  ],
  actions: [
    { id: "pap",         label: "PAP" },
    { id: "plan",        label: "Plan d'action" },
    { id: "competences", label: "Compétences" },
    { id: "carnet",      label: "Carnet de bord" },
  ],
  equipe: [
    { id: "temps",  label: "Analyse Temps" },
    { id: "visite", label: "Compte-rendu" },
    { id: "config", label: "Paramétrage" },
  ],
};

export function getTabGroup(tab: TabId): string {
  if (tab === "cockpit") return "cockpit";
  if (["kpis", "diagnostic", "import", "comparatif", "diagnostic_express"].includes(tab)) return "diagnostic_grp";
  if (["balance", "simulateur", "chvacv"].includes(tab)) return "decisions";
  if (["pap", "plan", "competences", "carnet"].includes(tab)) return "actions";
  if (["temps", "visite", "config"].includes(tab)) return "equipe";
  return "cockpit";
}

// ─── Navigation ───────────────────────────────────────────────
interface NavigationProps {
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
  mode: AppMode;
}

export function Navigation({ activeTab, onTabChange, mode }: NavigationProps) {
  const currentGroup = getTabGroup(activeTab);
  const subTabs      = SUB_TABS[currentGroup] ?? [];

  // Franchisé mode: only Verdict + Actions
  const franchiseMainTabs = ["cockpit", "actions"];
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
                const subs = SUB_TABS[tab.id];
                onTabChange(subs ? subs[0].id : (tab.id as TabId));
              }}
              className="flex items-center gap-1.5 px-4 py-3.5 text-[12px] font-semibold transition-all whitespace-nowrap shrink-0"
              style={{
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
      </div>

      {/* Sub-tab pills */}
      {subTabs.length > 0 && (
        <div
          className="flex items-center gap-2 max-w-[1600px] mx-auto px-4 py-2 overflow-x-auto"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {subTabs.map(sub => {
            const isActive = activeTab === sub.id;
            return (
              <button
                key={sub.id}
                onClick={() => onTabChange(sub.id)}
                className="rounded-full px-3.5 py-1 text-[11px] font-semibold transition-all whitespace-nowrap shrink-0"
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
