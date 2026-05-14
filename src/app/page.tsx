'use client';

import { useState, useEffect } from 'react';
import type { MagasinData, PAPAction } from '@/types';
import { DEFAULT_DATA } from '@/types';
import Dashboard from '@/components/Dashboard';
import Diagnostic from '@/components/Diagnostic';
import PlanAction from '@/components/PlanAction';
import Objectifs from '@/components/Objectifs';
import CouvertureGamme from '@/components/CouvertureGamme';
import Simulateur from '@/components/Simulateur';
import Competences from '@/components/Competences';
import Comparatif from '@/components/Comparatif';
import VisiteCR from '@/components/VisiteCR';
import AssistantIA from '@/components/AssistantIA';
import Routines from '@/components/Routines';
import { detectSpiral } from '@/lib/spiral';

const TABS = [
  { id: 'dashboard',   label: 'Dashboard' },
  { id: 'diagnostic',  label: 'Diagnostic' },
  { id: 'plan',        label: "Plan d'Action" },
  { id: 'routines',    label: '🔁 Routines' },
  { id: 'objectifs',   label: '🎯 Objectifs' },
  { id: 'couverture',  label: '🎯 Couverture de gamme' },
  { id: 'simulateur',  label: 'Simulateur' },
  { id: 'competences', label: 'Compétences' },
  { id: 'comparatif',  label: 'Comparatif' },
  { id: 'visite',      label: 'Visite CR' },
  { id: 'assistant',   label: 'Assistant IA' },
] as const;
type TabId = typeof TABS[number]['id'];

function getMagasinsKey() { return 'ec_magasins'; }
function getDataKey(nom: string) { return `ec_data_${nom}`; }
function getActionsKey(nom: string) { return `ec_actions_${nom}`; }

function loadMagasins(): string[] {
  try { const s = localStorage.getItem(getMagasinsKey()); return s ? JSON.parse(s) : []; }
  catch { return []; }
}
function loadData(nom: string): MagasinData {
  try { const s = localStorage.getItem(getDataKey(nom)); return s ? { ...DEFAULT_DATA, ...JSON.parse(s) as Partial<MagasinData> } : DEFAULT_DATA; }
  catch { return DEFAULT_DATA; }
}
function loadActions(nom: string): PAPAction[] {
  try { const s = localStorage.getItem(getActionsKey(nom)); return s ? JSON.parse(s) as PAPAction[] : []; }
  catch { return []; }
}

export default function App() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [magasins, setMagasins] = useState<string[]>([]);
  const [currentNom, setCurrentNom] = useState<string>('');
  const [data, setData] = useState<MagasinData>(DEFAULT_DATA);
  const [actions, setActions] = useState<PAPAction[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mags = loadMagasins();
    setMagasins(mags);
    const saved = localStorage.getItem('ec_current') ?? (mags[0] ?? '');
    setCurrentNom(saved);
    if (saved) { setData(loadData(saved)); setActions(loadActions(saved)); }
    setMounted(true);
  }, []);

  if (!mounted) return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center text-[#6B7280] text-sm">
      Chargement...
    </div>
  );

  function switchMagasin(nom: string) {
    setCurrentNom(nom);
    setData(loadData(nom));
    setActions(loadActions(nom));
    localStorage.setItem('ec_current', nom);
  }

  function saveData(d: MagasinData) {
    setData(d);
    localStorage.setItem(getDataKey(d.nom), JSON.stringify(d));
    if (d.nom && d.nom !== currentNom) {
      const newMags = magasins.includes(d.nom) ? magasins : [...magasins, d.nom];
      setMagasins(newMags);
      localStorage.setItem(getMagasinsKey(), JSON.stringify(newMags));
      setCurrentNom(d.nom);
      localStorage.setItem('ec_current', d.nom);
    }
  }

  function saveActions(a: PAPAction[]) {
    setActions(a);
    if (currentNom) localStorage.setItem(getActionsKey(currentNom), JSON.stringify(a));
  }

  const spiral = data.nom ? detectSpiral(data) : 'none';
  const isCritical = spiral === 'critical';
  const showSpiralBanner = spiral === 'critical' || spiral === 'risk';

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A]">
      {/* Header */}
      <div className="bg-[#E30613] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-xl font-black tracking-widest text-white select-none">EASYCASH</span>
            <div className="flex items-center gap-3">
              {magasins.length > 1 && (
                <select
                  value={currentNom}
                  onChange={e => switchMagasin(e.target.value)}
                  className="bg-white/20 border border-white/30 rounded-md px-3 py-1 text-sm text-white focus:outline-none"
                >
                  {magasins.map(m => <option key={m} value={m} className="text-[#1A1A1A]">{m}</option>)}
                </select>
              )}
              {currentNom
                ? <span className="text-white/80 text-sm font-medium hidden md:block">{currentNom} · {data.phase}</span>
                : <span className="text-white/60 text-sm italic hidden md:block">Cockpit consultant</span>
              }
            </div>
          </div>

          {/* Tabs */}
          <div className="flex overflow-x-auto -mb-px scrollbar-hide">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 flex-shrink-0 transition-colors ${
                  tab === t.id
                    ? 'text-white border-white'
                    : 'text-white/60 border-transparent hover:text-white/90'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Spiral banner */}
      {showSpiralBanner && (
        <div className={`${isCritical ? 'bg-[#E30613]' : 'bg-orange-600'} text-white px-4 py-2.5 text-center`}>
          <span className="font-bold text-sm">
            {isCritical
              ? '⚠️ SPIRALE DÉTECTÉE — Déstockage prioritaire avant tout nouvel achat'
              : '⚠ Vigilance spirale — Stock âgé élevé + marge sous pression'}
          </span>
        </div>
      )}

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-5">
        {tab === 'dashboard'   && <Dashboard   data={data} onSave={saveData} actions={actions} onNavigate={(t) => setTab(t as TabId)} />}
        {tab === 'diagnostic'  && <Diagnostic  data={data} />}
        {tab === 'plan'        && <PlanAction   data={data} actions={actions} onSave={saveActions} />}
        {tab === 'routines'    && <Routines        magasinNom={currentNom} />}
        {tab === 'objectifs'   && <Objectifs       magasinNom={currentNom} />}
        {tab === 'couverture'  && <CouvertureGamme magasinNom={currentNom} />}
        {tab === 'simulateur'  && <Simulateur      magasinNom={currentNom} isCriticalSpiral={isCritical} />}
        {tab === 'competences' && <Competences  magasinNom={currentNom} />}
        {tab === 'comparatif'  && <Comparatif   magasins={magasins} />}
        {tab === 'visite'      && <VisiteCR      data={data} actions={actions} />}
        {tab === 'assistant'   && <AssistantIA   data={data} actions={actions} />}
      </main>
    </div>
  );
}
