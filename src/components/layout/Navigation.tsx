"use client";

export type TabId =
  | "cockpit"
  | "diagnostic"
  | "kpis"
  | "plan"
  | "visite"
  | "simulateur"
  | "assistant"
  | "competences"
  | "config";

export type AppMode = "consultant" | "franchisé";

// kept for compatibility with page.tsx
export const SUB_TABS: Record<string, { id: TabId; label: string }[]> = {};

export function getTabGroup(tab: TabId): string {
  return tab;
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "cockpit",      label: "Dashboard",     icon: "⚡" },
  { id: "diagnostic",   label: "Diagnostic",    icon: "🔬" },
  { id: "kpis",         label: "Saisie",        icon: "📊" },
  { id: "plan",         label: "Plan d'Action", icon: "🎯" },
  { id: "visite",       label: "Visite (CR)",   icon: "📋" },
  { id: "simulateur",   label: "Simulateur",    icon: "📈" },
  { id: "assistant",    label: "Assistant IA",  icon: "🤖" },
  { id: "competences",  label: "Compétences",   icon: "🏆" },
];

interface NavigationProps {
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
  mode: AppMode;
}

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  return (
    <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center max-w-[1600px] mx-auto px-4 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
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
        <div className="ml-auto">
          <button
            onClick={() => onTabChange("config")}
            title="Paramétrage"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              padding: "10px 12px",
              color: activeTab === "config" ? "var(--accent)" : "var(--textMuted)",
            }}
          >
            ⚙
          </button>
        </div>
      </div>
    </div>
  );
}

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
      {modes.map((m) => (
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
