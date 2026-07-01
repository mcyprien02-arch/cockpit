'use client';

import { useState, useEffect } from 'react';
import type { PAPAction } from '@/types';
import BenchmarkFinancier from './BenchmarkFinancier';
import Simulateur from './Simulateur';

interface Props {
  magasinNom: string;
  isCriticalSpiral?: boolean;
  onAddAction?: (action: PAPAction) => void;
}

interface CrossAlert {
  masseSalPct: number;
  seuil: number;
  hasFinancialIssue: boolean;
  financialIssues: string[];
}

export default function Financier({ magasinNom, isCriticalSpiral, onAddAction }: Props) {
  const [crossAlert, setCrossAlert] = useState<CrossAlert | null>(null);

  useEffect(() => {
    if (!magasinNom) return;
    try {
      // Read Simulateur data
      const eqRaw = localStorage.getItem(`equipe_${magasinNom}`);
      if (!eqRaw) { setCrossAlert(null); return; }
      const parsed = JSON.parse(eqRaw) as unknown;
      const isArr = Array.isArray(parsed);
      const rows: Array<{ heures: number; salaireHoraire: number }> = isArr
        ? (parsed as Array<{ heures: number; salaireHoraire: number }>)
        : (parsed as { rows: Array<{ heures: number; salaireHoraire: number }> }).rows ?? [];
      const ca: number = isArr ? 0 : (parsed as { caAnnuel?: number }).caAnnuel ?? 0;
      const seuil: number = isArr ? 15 : (parsed as { msSeuilPct?: number }).msSeuilPct ?? 15;
      if (ca <= 0) { setCrossAlert(null); return; }

      const ms = rows.reduce((s, r) => s + r.heures * r.salaireHoraire * 12 * 1.42, 0);
      const msPct = (ms / ca) * 100;

      // Read benchmark data
      const financialIssues: string[] = [];
      const santeRaw = localStorage.getItem(`benchmark_sante_globale_${magasinNom}`);
      if (santeRaw) {
        const sante = JSON.parse(santeRaw) as Record<string, number>;
        if (sante.taux_marge_net && sante.taux_marge_net < 31) financialIssues.push(`marge brute ${sante.taux_marge_net.toFixed(1)}% (< 31%)`);
        if (sante.charges_externes && sante.charges_externes > 14) financialIssues.push(`charges ext. ${sante.charges_externes.toFixed(1)}% (> 14%)`);
        if (sante.ebe && sante.ebe < 4) financialIssues.push(`EBE ${sante.ebe.toFixed(1)}% (< 4%)`);
      }

      if (msPct > seuil) {
        setCrossAlert({ masseSalPct: msPct, seuil, hasFinancialIssue: financialIssues.length > 0, financialIssues });
      } else {
        setCrossAlert(null);
      }
    } catch { setCrossAlert(null); }
  }, [magasinNom]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">💰 Financier</h2>
        <p className="text-sm text-[#6B7280] mt-0.5">Benchmark financier réseau et simulation équipe — votre santé économique en un seul module.</p>
      </div>

      {/* Cross-module alert */}
      {crossAlert && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 space-y-1.5">
          <p className="text-sm font-bold text-red-700">⚠ Alerte financière croisée</p>
          <p className="text-sm text-red-700">
            Masse salariale à <strong>{crossAlert.masseSalPct.toFixed(1)}%</strong> du CA (seuil : {crossAlert.seuil}%)
            {crossAlert.hasFinancialIssue && (
              <> · {crossAlert.financialIssues.join(' · ')}</>
            )}
          </p>
          <p className="text-xs text-red-600">
            Plusieurs indicateurs financiers sont sous pression simultanément — une revue globale charges + personnel est recommandée avant d&apos;agir sur un seul levier.
          </p>
        </div>
      )}

      {/* Benchmark financier */}
      <BenchmarkFinancier magasinNom={magasinNom} onAddAction={onAddAction} />

      {/* Divider */}
      <div className="border-t-2 border-dashed border-[#E0E0E0] pt-2">
        <p className="text-xs text-[#9CA3AF] italic text-center mb-6">— Simulateur équipe —</p>
      </div>

      {/* Simulateur */}
      <Simulateur magasinNom={magasinNom} isCriticalSpiral={isCriticalSpiral} onAddAction={onAddAction} />
    </div>
  );
}
