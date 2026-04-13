"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Navigation, TabId } from "@/components/layout/Navigation";

// Screens
import { VerdictScreen }          from "@/components/screens/VerdictScreen";
import { KPIsGPSScreen }          from "@/components/screens/KPIsGPSScreen";
import { SaisieScreen }           from "@/components/screens/SaisieScreen";
import { DiagnosticScreen }       from "@/components/screens/DiagnosticScreen";
import { DiagnosticExpressScreen } from "@/components/screens/DiagnosticExpressScreen";
import { ImportScreen }           from "@/components/screens/ImportScreen";
import { ComparatifScreen }       from "@/components/screens/ComparatifScreen";
import { BalanceEconomiqueScreen } from "@/components/screens/BalanceEconomiqueScreen";
import { SimulateurScreen }       from "@/components/screens/SimulateurScreen";
import { CHVACVScreen }           from "@/components/screens/CHVACVScreen";
import { PAPScreen }              from "@/components/screens/PAPScreen";
import { PlanActionScreen }       from "@/components/screens/PlanActionScreen";
import { CompetencesISEORScreen } from "@/components/screens/CompetencesISEORScreen";
import { CarnetDeBordScreen }     from "@/components/screens/CarnetDeBordScreen";
import { ChecklistScreen }         from "@/components/screens/ChecklistScreen";
import { JournalVisiteScreen }    from "@/components/screens/JournalVisiteScreen";
import { ParametrageScreen }      from "@/components/screens/ParametrageScreen";
import { ExportCRScreen }         from "@/components/screens/ExportCRScreen";
import { MaJourneeScreen }        from "@/components/screens/MaJourneeScreen";
import { AvisClientsScreen }      from "@/components/screens/AvisClientsScreen";
import { VictoiresScreen }        from "@/components/screens/VictoiresScreen";
import { AssistantWidget }        from "@/components/AssistantWidget";
import { SpiralIndicator }        from "@/components/SpiralIndicator";
import type { Magasin } from "@/types";

// ─── Store selector ───────────────────────────────────────────
function StoreSelector({ magasins, selectedId, onChange }: {
  magasins: Magasin[]; selectedId: string; onChange: (id: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={selectedId}
        onChange={e => onChange(e.target.value)}
        className="appearance-none rounded-xl px-4 py-2.5 pr-10 text-[13px] font-semibold border cursor-pointer"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)", fontFamily: "inherit" }}
      >
        {magasins.map(m => (
          <option key={m.id} value={m.id} style={{ background: "var(--surface)" }}>{m.nom}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: "var(--textDim)" }}>▼</span>
    </div>
  );
}

// ─── App Header ───────────────────────────────────────────────
function AppHeader({ magasins, selectedId, onSelect, activeTab }: {
  magasins: Magasin[]; selectedId: string; onSelect: (id: string) => void; activeTab: TabId;
}) {
  const noStore: TabId[] = ["config"];
  return (
    <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between px-6 py-3 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-bold"
            style={{ background: "linear-gradient(135deg, #ff4d6a, #c0392b)", color: "#fff" }}>E</div>
          <div>
            <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>EasyCash Cockpit</div>
            <div className="text-[10px]" style={{ color: "var(--textDim)" }}>GPS de décision franchise</div>
          </div>
        </div>
        {!noStore.includes(activeTab) && magasins.length > 0 && (
          <StoreSelector magasins={magasins} selectedId={selectedId} onChange={onSelect} />
        )}
      </div>
    </header>
  );
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [magasins, setMagasins]     = useState<Magasin[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeTab, setActiveTab]   = useState<TabId>("cockpit");
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    supabase.from("magasins").select("id, nom, ville, franchise").order("nom").then(({ data, error }) => {
      if (error) { setError("Impossible de charger les magasins : " + error.message); }
      else {
        const rows = (data ?? []) as Magasin[];
        setMagasins(rows);
        if (rows.length > 0) setSelectedId(rows[0].id);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    try {
      const savedTab = localStorage.getItem("active_tab") as TabId | null;
      if (savedTab) setActiveTab(savedTab);
    } catch { /* ignore */ }
  }, []);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    try { localStorage.setItem("active_tab", tab); } catch { /* ignore */ }
  };

  const selectedMagasin = magasins.find(m => m.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <div className="h-14 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
        <div className="h-12 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
        <div className="px-6 py-6 max-w-[1600px] mx-auto space-y-4">
          <div className="h-64 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const noStoreNeeded: TabId[] = ["config"];
  const noStore = !selectedId && !noStoreNeeded.includes(activeTab);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader magasins={magasins} selectedId={selectedId} onSelect={setSelectedId} activeTab={activeTab} />
      <Navigation activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="px-6 py-5 max-w-[1600px] mx-auto">
        {error && (
          <div className="rounded-xl p-4 mb-4 text-[13px] font-medium"
            style={{ background: "#ff4d6a12", color: "var(--danger)", border: "1px solid #ff4d6a30" }}>
            ⚠ {error}
          </div>
        )}

        {(activeTab === "cockpit" || activeTab === "kpis_gps") && selectedId && (
          <div className="mb-4">
            <SpiralIndicator magasinId={selectedId} onOpenSimulateur={() => handleTabChange("simulateur")} />
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            {noStore ? (
              <div className="text-center py-16" style={{ color: "var(--textMuted)" }}>
                <div className="text-[40px] mb-3">🏪</div>
                <div className="text-[14px]">Aucun magasin trouvé. Ajoutez-en un dans Paramétrage.</div>
                <button onClick={() => handleTabChange("config")} className="mt-4 rounded-xl px-5 py-2 text-[13px] font-semibold"
                  style={{ background: "var(--accent)", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  Aller dans Paramétrage →
                </button>
              </div>
            ) : (
              <>
                {activeTab === "journee"          && selectedId && <MaJourneeScreen magasinId={selectedId} />}
                {activeTab === "avis_clients"     && selectedId && <AvisClientsScreen magasinId={selectedId} />}
                {activeTab === "victoires"        && selectedId && <VictoiresScreen magasinId={selectedId} />}
                {activeTab === "checklist"        && selectedId && <ChecklistScreen magasinId={selectedId} />}
                {activeTab === "cockpit"          && selectedId && <VerdictScreen magasinId={selectedId} onNavigate={tab => handleTabChange(tab as TabId)} mode="consultant" />}
                {activeTab === "kpis_gps"         && selectedId && <KPIsGPSScreen magasinId={selectedId} onNavigate={tab => handleTabChange(tab as TabId)} />}
                {activeTab === "saisie"           && selectedId && <SaisieScreen magasinId={selectedId} />}
                {activeTab === "diagnostic"       && selectedId && <DiagnosticScreen magasinId={selectedId} magasin={selectedMagasin} />}
                {activeTab === "diagnostic_express" && <DiagnosticExpressScreen />}
                {activeTab === "import"           && selectedId && <ImportScreen magasinId={selectedId} magasin={selectedMagasin} onNavigate={tab => handleTabChange(tab as TabId)} />}
                {activeTab === "comparatif"       && selectedId && <ComparatifScreen />}
                {activeTab === "balance"          && selectedId && <BalanceEconomiqueScreen magasinId={selectedId} magasin={selectedMagasin} />}
                {activeTab === "simulateur"       && selectedId && <SimulateurScreen magasinId={selectedId} />}
                {activeTab === "chvacv"           && selectedId && <CHVACVScreen magasinId={selectedId} magasin={selectedMagasin} />}
                {activeTab === "pap"              && selectedId && <PAPScreen magasinId={selectedId} />}
                {activeTab === "plan"             && selectedId && <PlanActionScreen magasinId={selectedId} />}
                {activeTab === "competences"      && selectedId && <CompetencesISEORScreen magasinId={selectedId} />}
                {activeTab === "carnet"           && selectedId && <CarnetDeBordScreen magasinId={selectedId} />}
                {activeTab === "journal_visite"   && selectedId && <JournalVisiteScreen magasinId={selectedId} magasinNom={selectedMagasin?.nom} />}
                {activeTab === "config"           && <ParametrageScreen />}
                {activeTab === "export"           && selectedId && <ExportCRScreen magasinId={selectedId} magasinNom={selectedMagasin?.nom} />}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {selectedId && !["config"].includes(activeTab) && (
        <AssistantWidget magasinId={selectedId} />
      )}
    </div>
  );
}
