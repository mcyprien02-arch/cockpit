"use client";

export type TabId =
  | "cockpit"
  | "kpis"
  | "config"
  | "import"
  | "checklist"
  | "temps"
  | "decisions"
  | "plan"
  | "comparatif"
  | "historique";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "cockpit", label: "Cockpit", icon: "◉" },
  { id: "kpis", label: "KPIs détail", icon: "◈" },
  { id: "config", label: "Paramétrage", icon: "⚙" },
  { id: "import", label: "Import", icon: "⬆" },
  { id: "checklist", label: "Checklist", icon: "☑" },
  { id: "temps", label: "Temps", icon: "◷" },
  { id: "decisions", label: "Décisions", icon: "⚡" },
  { id: "plan", label: "Plan d'action", icon: "📋" },
  { id: "comparatif", label: "Comparatif", icon: "⊞" },
  { id: "historique", label: "Historique", icon: "↗" },
];

interface NavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  return (
    <nav
      className="flex gap-0.5 px-6 py-2 overflow-x-auto"
      style={{ background: "var(--bg)" }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all outline-none"
            style={{
              background: isActive ? "var(--accentDim)" : "transparent",
              color: isActive ? "var(--accent)" : "var(--textMuted)",
              border: "none",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <span className="text-[14px]">{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
