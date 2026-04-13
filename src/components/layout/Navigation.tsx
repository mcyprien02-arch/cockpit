"use client";

// ─── Types ────────────────────────────────────────────────────
export type TabId =
  | "journee" | "avis_clients" | "victoires" | "checklist"
  | "cockpit" | "kpis_gps" | "saisie" | "diagnostic" | "import" | "comparatif" | "diagnostic_express"
  | "balance" | "simulateur" | "chvacv"
  | "pap" | "plan" | "competences" | "carnet"
  | "journal_visite" | "config" | "export";

export type AppMode = "consultant";

// ─── Tab groups ───────────────────────────────────────────────
const MAIN_TABS: { id: string; label: string; icon: string }[] = [
  { id: "journee_grp", label: "Ma journée", icon: "☀️" },
  { id: "verdict_grp", label: "Verdict",    icon: "⚡" },
  { id: "decisions",   label: "Décisions",  icon: "💰" },
  { id: "actions",     label: "Actions",    icon: "🎯" },
  { id: "equipe",      label: "Équipe",     icon: "👥" },
];

export const SUB_TABS: Record<string, { id: TabId; label: string }[]> = {
  journee_grp: [
    { id: "journee",      label: "Rituel du matin" },
    { id: "checklist",    label: "✅ Checklist manager" },
    { id: "avis_clients", label: "Voix du client" },
    { id: "victoires",    label: "Victoires" },
  ],
  verdict_grp: [
    { id: "cockpit",            label: "Tableau de bord" },
    { id: "kpis_gps",           label: "KPIs priorités" },
    { id: "saisie",             label: "Saisir KPIs" },
    { id: "diagnostic",         label: "Analyse Radar" },
    { id: "diagnostic_express", label: "Express (3 min)" },
    { id: "import",             label: "Import" },
    { id: "comparatif",         label: "Comparatif" },
  ],
  decisions: [
    { id: "balance",    label: "Balance Éco." },
    { id: "simulateur", label: "Simulateur Et si ?" },
    { id: "chvacv",     label: "CHVACV" },
  ],
  actions: [
    { id: "pap",         label: "PAP" },
    { id: "plan",        label: "Plan d'action" },
    { id: "competences", label: "Compétences" },
    { id: "carnet",      label: "Carnet de bord" },
  ],
  equipe: [
    { id: "journal_visite", label: "Journal animateur" },
    { id: "config",         label: "Paramétrage" },
  ],
};

export function getTabGroup(tab: TabId): string {
  if (["journee", "avis_clients", "victoires", "checklist"].includes(tab)) return "journee_grp";
  if (["cockpit", "kpis_gps", "saisie", "diagnostic", "import", "comparatif", "diagnostic_express"].includes(tab)) return "verdict_grp";
  if (["balance", "simulateur", "chvacv"].includes(tab)) return "decisions";
  if (["pap", "plan", "competences", "carnet"].includes(tab)) return "actions";
  if (["journal_visite", "config", "export"].includes(tab)) return "equipe";
  return "verdict_grp";
}

// ─── Navigation ───────────────────────────────────────────────
interface NavigationProps {
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
  mode?: AppMode;
}

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const currentGroup = getTabGroup(activeTab);
  const subTabs = SUB_TABS[currentGroup] ?? [];

  return (
    <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center max-w-[1600px] mx-auto px-4 overflow-x-auto">
        {MAIN_TABS.map(tab => {
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

// ─── ModeSwitcher — stub (mode supprimé, gardé pour compatibilité) ─
export function ModeSwitcher(_props: { mode?: AppMode; onChange?: (m: AppMode) => void }) {
  return null;
}
