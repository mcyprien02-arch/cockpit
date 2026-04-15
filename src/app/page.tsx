'use client';

import { useState, useEffect } from 'react';
import Dashboard from '@/components/Dashboard';
import PlanAction from '@/components/PlanAction';
import Simulateur from '@/components/Simulateur';
import Competences from '@/components/Competences';
import VisiteCR from '@/components/VisiteCR';
import AssistantIA from '@/components/AssistantIA';
import type { MagasinData, PAPAction } from '@/types';
import { DEFAULT_DATA } from '@/types';

const TABS = [
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'plan',         label: "Plan d'Action" },
  { id: 'simulateur',   label: 'Simulateur' },
  { id: 'competences',  label: 'Compétences' },
  { id: 'visite',       label: 'Visite CR' },
  { id: 'assistant',    label: 'Assistant IA' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function App() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [data, setData] = useState<MagasinData>(DEFAULT_DATA);
  const [actions, setActions] = useState<PAPAction[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const d = localStorage.getItem('ec_data');
      if (d) setData({ ...DEFAULT_DATA, ...JSON.parse(d) as Partial<MagasinData> });
      const a = localStorage.getItem('ec_actions');
      if (a) setActions(JSON.parse(a) as PAPAction[]);
    } catch {
      // ignore parse errors
    }
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Chargement...</div>
      </div>
    );
  }

  function saveData(d: MagasinData) {
    setData(d);
    localStorage.setItem('ec_data', JSON.stringify(d));
  }

  function saveActions(a: PAPAction[]) {
    setActions(a);
    localStorage.setItem('ec_actions', JSON.stringify(a));
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header + Nav */}
      <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
              >
                E
              </div>
              <div>
                <div className="text-sm font-bold">EasyCash Cockpit</div>
                <div className="text-xs text-gray-400">Outil de pilotage franchise</div>
              </div>
            </div>
            {data.magasin && (
              <div className="hidden md:flex items-center gap-2 text-sm">
                <span className="text-gray-300 font-semibold">{data.magasin}</span>
                <span className="px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-400">{data.phase}</span>
              </div>
            )}
          </div>
          {/* Tabs */}
          <div className="flex overflow-x-auto scrollbar-hide -mb-px">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                  tab === t.id
                    ? 'text-green-400 border-green-400'
                    : 'text-gray-400 border-transparent hover:text-gray-200 hover:border-gray-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'dashboard'   && <Dashboard   data={data} onSave={saveData} actions={actions} />}
        {tab === 'plan'        && <PlanAction   data={data} actions={actions} onSave={saveActions} />}
        {tab === 'simulateur'  && <Simulateur />}
        {tab === 'competences' && <Competences />}
        {tab === 'visite'      && <VisiteCR     data={data} actions={actions} />}
        {tab === 'assistant'   && <AssistantIA  data={data} />}
      </main>
    </div>
  );
}
