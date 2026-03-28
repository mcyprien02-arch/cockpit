"use client";

export type TabId =
  | "cockpit"
  | "diagnostic"
  | "kpis"
  | "plan"
  | "comparatif"
  | "visite"
  | "pap"
  | "competences"
  | "import"
  | "balance"
  | "config";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "cockpit",      label: "Le Verdict",       icon: "⚡" },
  { id: "diagnostic",   label: "Diagnostic",        icon: "🔬" },
  { id: "kpis",         label: "KPIs",              icon: "📊" },
  { id: "plan",         label: "Plan d'action",     icon: "🎯" },
  { id: "comparatif",   label: "Comparatif",        icon: "🏆" },
  { id: "visite",       label: "Visite & CR",       icon: "📋" },
  { id: "pap",          label: "PAP",               icon: "🚀" },
  { id: "competences",  label: "Compétences ISEOR", icon: "🧠" },
  { id: "import",       label: "Import",            icon: "📥" },
  { id: "balance",      label: "Balance Éco.",      icon: "⚖️" },
  { id: "config",       label: "Paramétrage",       icon: "⚙️" },
];

interface NavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  return (
    <nav
      className="border-b overflow-x-auto"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="flex max-w-[1600px] mx-auto px-4">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex items-center gap-1.5 px-4 py-3.5 text-[12px] font-semibold border-b-2 transition-all whitespace-nowrap shrink-0"
              style={{
                borderBottomColor: isActive ? "var(--accent)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--textMuted)",
                background: isActive ? "#00d4aa08" : "transparent",
                fontFamily: "inherit",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <span className="text-[14px]">{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
