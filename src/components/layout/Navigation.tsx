"use client";

// ─── Types ────────────────────────────────────────────────────
export type TabId =
  | "verdict"
  | "kpis_gps" | "saisie" | "balance" | "chvacv"
  | "pap" | "competences" | "export" | "config";

export type AppMode = "consultant" | "franchisé";

// ─── Tab groups ───────────────────────────────────────────────
const MAIN_TABS: { id: string; label: string; icon: string }[] = [
  { id: "verdict",   label: "Verdict",   icon: "⚡" },
  { id: "decisions", label: "Décisions", icon: "💰" },
  { id: "actions",   label: "Actions",   icon: "🎯" },
];

export const SUB_TABS: Record<string, { id: TabId; label: string }[]> = {
  decisions: [
    { id: "kpis_gps",  label: "KPIs priorités" },
    { id: "saisie",    label: "Saisir KPIs" },
    { id: "balance",   label: "Balance éco." },
    { id: "chvacv",    label: "CHVACV" },
  ],
  actions: [
    { id: "pap",         label: "Plan d'action" },
    { id: "competences", label: "Compétences" },
    { id: "export",      label: "Export CR" },
    { id: "config",      label: "Paramétrage" },
  ],
};

export function getTabGroup(tab: TabId): string {
  if (tab === "verdict") return "verdict";
  if (["kpis_gps", "saisie", "balance", "chvacv"].includes(tab)) return "decisions";
  if (["pap", "competences", "export", "config"].includes(tab)) return "actions";
  return "verdict";
}

// ─── Navigation ───────────────────────────────────────────────
interface NavigationProps {
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
  mode: AppMode;
}

export function Navigation({ activeTab, onTabChange, mode }: NavigationProps) {
  const currentGroup = getTabGroup(activeTab);
  const subTabs = SUB_TABS[currentGroup] ?? [];

  const franchiseMainTabs = ["verdict", "actions"];
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
