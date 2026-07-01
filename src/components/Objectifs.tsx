'use client';

import { useState, useEffect } from 'react';
import type { PAPAction, ActionAxe, StoredStatut } from '@/types';

interface Props { magasinNom: string; }

// ── Long-term vision ─────────────────────────────────────────────────────────

interface VisionData {
  valeur1: string;
  valeur2: string;
  valeur3: string;
  capCommercial: string;
  caAnnuelCible: number;
}

const DEFAULT_VISION: VisionData = { valeur1: '', valeur2: '', valeur3: '', capCommercial: '', caAnnuelCible: 0 };
const VISION_KEY = (nom: string) => `vision_longterme_${nom}`;

function loadVision(magasinNom: string): VisionData {
  if (!magasinNom) return DEFAULT_VISION;
  try {
    // Try new key first
    const s = localStorage.getItem(VISION_KEY(magasinNom));
    if (s) return { ...DEFAULT_VISION, ...JSON.parse(s) as Partial<VisionData> };
    // Migrate from old key
    const old = localStorage.getItem(`vision_${magasinNom}`);
    if (old) {
      const parsed = { ...DEFAULT_VISION, ...JSON.parse(old) as Partial<VisionData> };
      localStorage.setItem(VISION_KEY(magasinNom), JSON.stringify(parsed));
      return parsed;
    }
    return DEFAULT_VISION;
  } catch { return DEFAULT_VISION; }
}

function persistVision(magasinNom: string, v: VisionData) {
  if (!magasinNom) return;
  localStorage.setItem(VISION_KEY(magasinNom), JSON.stringify(v));
}

/** Exported helper for AssistantIA — reads vision + monthly objectives from localStorage */
export function getVisionContext(magasinNom: string): string {
  if (typeof window === 'undefined' || !magasinNom) return '';
  try {
    const parts: string[] = [];

    // Objectifs personnels (source unique : Histoire du magasin)
    const hs = localStorage.getItem(`histoire_${magasinNom}`);
    if (hs) {
      const h = JSON.parse(hs) as { objectifsPerso?: string };
      if (h.objectifsPerso?.trim()) parts.push(`Objectifs personnels du franchisé : ${h.objectifsPerso}`);
    }

    // Valeurs + cap commercial (depuis Objectifs)
    const vs = localStorage.getItem(VISION_KEY(magasinNom))
            ?? localStorage.getItem(`vision_${magasinNom}`); // fallback old key
    if (vs) {
      const v = JSON.parse(vs) as VisionData;
      const valeurs = [v.valeur1, v.valeur2, v.valeur3].filter(x => x?.trim());
      if (valeurs.length) parts.push(`Valeurs non-négociables : ${valeurs.join(', ')}`);
      if (v.capCommercial?.trim()) parts.push(`Cap commercial annuel : ${v.capCommercial}`);
      if (v.caAnnuelCible > 0) parts.push(`CA annuel cible : ${v.caAnnuelCible.toLocaleString('fr-FR')} €`);
    }

    // Objectifs mensuels (mois courant)
    const currentMonth = new Date().toISOString().slice(0, 7);
    const os = localStorage.getItem(`objectifs_${magasinNom}_${currentMonth}`);
    if (os) {
      const obj = JSON.parse(os) as { familles: Array<{ famille: string; margeCible: number; tauxMarge: number; stockInitial?: number; margeRealisee: number }>; promoRedist: number };
      if (obj.familles?.length) {
        const lines = obj.familles
          .filter(f => f.famille && f.margeCible > 0)
          .map(f => {
            const avanc = f.margeCible > 0 ? Math.round(f.margeRealisee / f.margeCible * 100) : 0;
            const stockCible = f.tauxMarge > 0 ? Math.round(f.margeCible / (f.tauxMarge / 100)) : 0;
            const besoin = stockCible > 0 ? Math.max(0, stockCible - (f.stockInitial ?? 0)) : 0;
            const besoinStr = stockCible > 0 ? ` · besoin sourcing: ${besoin > 0 ? '+' + besoin.toLocaleString('fr-FR') + '€' : 'couvert'}` : '';
            return `  - ${f.famille} : cible ${f.margeCible.toLocaleString('fr-FR')}€ · réalisé ${f.margeRealisee.toLocaleString('fr-FR')}€ (${avanc}%)${besoinStr}`;
          });
        if (lines.length) {
          const totalMarge = obj.familles.reduce((s, f) => s + (f.margeCible || 0), 0);
          const totalCA = obj.familles.reduce((s, f) => f.tauxMarge > 0 ? s + f.margeCible / (f.tauxMarge / 100) : s, 0);
          const tauxPondere = totalCA > 0 ? Math.round((totalMarge / totalCA) * 1000) / 10 : 0;
          const besoinMensuel = obj.familles.reduce((s, f) => {
            const ca = f.tauxMarge > 0 ? f.margeCible / (f.tauxMarge / 100) : 0;
            return s + Math.max(0, ca - (f.stockInitial ?? 0));
          }, 0);
          const sourcing12 = Math.round(besoinMensuel * 12);
          if (tauxPondere > 0) parts.push(`Taux de marge pondéré global (mix familles) : ${tauxPondere}%`);
          if (sourcing12 > 0) parts.push(`Besoin sourcing annualisé (×12 mois) : ${sourcing12.toLocaleString('fr-FR')} €`);
          parts.push(`Objectifs mensuels (${currentMonth}) :\n${lines.join('\n')}`);
        }
      }
    }

    // Active PAP actions with vision link
    const as_ = localStorage.getItem(`ec_actions_${magasinNom}`);
    if (as_) {
      const acts = JSON.parse(as_) as PAPAction[];
      const active = acts.filter(a => a.statut === 'À faire' || a.statut === 'En cours');
      if (active.length > 0) {
        const lines = active.map(a => {
          const date = a.echeance ? ` (échéance : ${new Date(a.echeance).toLocaleDateString('fr-FR')})` : '';
          const lien = a.lienvision?.trim() ? ` — Vision : ${a.lienvision}` : '';
          return `  - ${a.titre}${date} [${a.statut}]${lien}`;
        }).join('\n');
        parts.push(`Actions PAP en cours et leur lien à la vision :\n${lines}`);
      }
    }

    return parts.length ? '\n' + parts.join('\n') : '';
  } catch { return ''; }
}

// ── Objectifs mensuels ───────────────────────────────────────────────────────

interface ObjFamille {
  id: string;
  famille: string;
  margeCible: number;
  tauxMarge: number;
  stockInitial: number;
  margeRealisee: number;
}

interface ObjData {
  familles: ObjFamille[];
  promoRedist: number;
}

const DEFAULT_FAMILLES: Array<{ famille: string; tauxMarge: number }> = [
  { famille: 'Téléphonie',    tauxMarge: 34 },
  { famille: 'Jeux Vidéo',   tauxMarge: 47 },
  { famille: 'Informatique',  tauxMarge: 40 },
  { famille: 'Bijouterie',    tauxMarge: 39 },
  { famille: 'Libre-service', tauxMarge: 76 },
];

function uid() { return Math.random().toString(36).slice(2); }

// ── PAP inline creation ───────────────────────────────────────────────────────
const PAP_AXES: ActionAxe[] = ['Stock', 'Commerce', 'Management', 'Web', 'Transverse'];
const PAP_STATUTS: StoredStatut[] = ['À faire', 'En cours', 'Fait'];
const EMPTY_PAP_FORM: Omit<PAPAction, 'id'> = {
  titre: '', axe: 'Commerce', pilote: '', copilote: '',
  description: '', lienvision: 'Cette action sert ma vision et mes valeurs en...',
  echeance: '', priorite: 1, gain: 0, statut: 'À faire',
};

function loadPAPActions(magasinNom: string): PAPAction[] {
  try {
    const s = localStorage.getItem(`ec_actions_${magasinNom}`);
    return s ? JSON.parse(s) as PAPAction[] : [];
  } catch { return []; }
}

function savePAPActions(magasinNom: string, actions: PAPAction[]) {
  if (!magasinNom) return;
  localStorage.setItem(`ec_actions_${magasinNom}`, JSON.stringify(actions));
}

function defaultRows(): ObjFamille[] {
  return DEFAULT_FAMILLES.map(f => ({ id: uid(), famille: f.famille, tauxMarge: f.tauxMarge, margeCible: 0, stockInitial: 0, margeRealisee: 0 }));
}

export default function Objectifs({ magasinNom }: Props) {
  const today = new Date();
  const defaultMonth = today.toISOString().slice(0, 7);

  // Vision state
  const [vision, setVision] = useState<VisionData>(DEFAULT_VISION);

  // PAP modal state
  const [showPAPModal, setShowPAPModal] = useState(false);
  const [papForm, setPapForm] = useState<Omit<PAPAction, 'id'>>(EMPTY_PAP_FORM);

  // Objectifs state
  const [month, setMonth] = useState(defaultMonth);
  const [promoRedist, setPromoRedist] = useState(30);
  const [familles, setFamilles] = useState<ObjFamille[]>(defaultRows());

  // PAP actions for cohérence panel
  const [papActions, setPapActions] = useState<PAPAction[]>([]);

  // Load vision + PAP when magasin changes
  useEffect(() => {
    if (!magasinNom) return;
    setVision(loadVision(magasinNom));
    try {
      const s = localStorage.getItem(`ec_actions_${magasinNom}`);
      setPapActions(s ? JSON.parse(s) as PAPAction[] : []);
    } catch { setPapActions([]); }
  }, [magasinNom]);

  // Load objectifs when month or magasin changes
  useEffect(() => {
    try {
      const key = `objectifs_${magasinNom}_${month}`;
      const s = localStorage.getItem(key);
      if (s) {
        const parsed = JSON.parse(s) as ObjData;
        setFamilles((parsed.familles ?? defaultRows()).map(f => ({ ...f, stockInitial: f.stockInitial ?? 0 })));
        setPromoRedist(parsed.promoRedist ?? 30);
      } else {
        setFamilles(defaultRows());
        setPromoRedist(30);
      }
    } catch {
      setFamilles(defaultRows());
    }
  }, [month, magasinNom]);

  // Vision handlers
  function updateVision(field: keyof VisionData, value: string | number) {
    const next = { ...vision, [field]: value };
    setVision(next);
    persistVision(magasinNom, next);
  }

  // PAP creation from vision
  function openPAPModal() {
    setPapForm({ ...EMPTY_PAP_FORM });
    setShowPAPModal(true);
  }

  function createPAPAction() {
    if (!papForm.titre.trim()) return;
    const current = loadPAPActions(magasinNom);
    const next = [...current, { ...papForm, id: uid() }];
    savePAPActions(magasinNom, next);
    setPapActions(next);
    setShowPAPModal(false);
    setPapForm(EMPTY_PAP_FORM);
  }

  // Objectifs handlers
  function saveObj(f: ObjFamille[], p: number) {
    const key = `objectifs_${magasinNom}_${month}`;
    localStorage.setItem(key, JSON.stringify({ familles: f, promoRedist: p } as ObjData));
  }

  function updateFamille(id: string, field: keyof ObjFamille, value: string | number) {
    const next = familles.map(f => f.id === id ? { ...f, [field]: value } : f);
    setFamilles(next);
    saveObj(next, promoRedist);
  }

  function addFamille() {
    const next = [...familles, { id: uid(), famille: '', tauxMarge: 40, margeCible: 0, stockInitial: 0, margeRealisee: 0 }];
    setFamilles(next);
    saveObj(next, promoRedist);
  }

  function delFamille(id: string) {
    const next = familles.filter(f => f.id !== id);
    setFamilles(next);
    saveObj(next, promoRedist);
  }

  function updatePromo(p: number) {
    setPromoRedist(p);
    saveObj(familles, p);
  }

  function stockNecessaire(f: ObjFamille): number {
    if (f.tauxMarge <= 0 || f.margeCible <= 0) return 0;
    return Math.round(f.margeCible / (f.tauxMarge / 100));
  }

  function besoinSourcing(f: ObjFamille): number {
    const cible = stockNecessaire(f);
    return Math.max(0, cible - (f.stockInitial || 0));
  }

  function avancement(f: ObjFamille): number {
    if (f.margeCible <= 0) return 0;
    return Math.round((f.margeRealisee / f.margeCible) * 100);
  }

  function budgetPromo(f: ObjFamille): number {
    return Math.max(0, Math.round((f.margeRealisee - f.margeCible) * promoRedist / 100));
  }

  const totalCible = familles.reduce((s, f) => s + (f.margeCible || 0), 0);
  const totalRealisee = familles.reduce((s, f) => s + (f.margeRealisee || 0), 0);
  const totalAvancement = totalCible > 0 ? Math.round((totalRealisee / totalCible) * 100) : 0;
  const totalBudgetPromo = familles.reduce((s, f) => s + budgetPromo(f), 0);

  // Taux de marge pondéré = Σmarge / ΣCA_cible (pondéré par volume CA)
  const totalCAcible = familles.reduce((s, f) => s + stockNecessaire(f), 0);
  const tauxMargePondere = totalCAcible > 0 ? Math.round((totalCible / totalCAcible) * 1000) / 10 : 0;

  // Besoin sourcing mensuel global
  const besoinSourcingMensuel = familles.reduce((s, f) => s + besoinSourcing(f), 0);

  // Synthèse annuelle (si CA annuel cible renseigné)
  const caAnnuel = vision.caAnnuelCible || 0;
  const margeAnnuelleProjetee = caAnnuel > 0 && tauxMargePondere > 0
    ? Math.round(caAnnuel * tauxMargePondere / 100)
    : 0;
  const besoinSourcingAnnuel = Math.round(besoinSourcingMensuel * 12);

  const statusMsg = totalCible === 0 ? null
    : totalAvancement >= 90
      ? { msg: 'Objectif quasiment atteint — budget promo disponible !', cls: 'bg-green-50 border-green-300 text-green-700', icon: '🟢' }
      : totalAvancement >= 50
        ? { msg: 'En bonne voie — continuez l\'effort', cls: 'bg-orange-50 border-orange-200 text-orange-600', icon: '🟠' }
        : { msg: 'En retard — relancez les ventes et le sourcing', cls: 'bg-red-50 border-red-200 text-red-700', icon: '🔴' };

  const ic = 'bg-white border border-[#E0E0E0] rounded-md px-2 py-1.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#E30613]';
  const tasCls = 'w-full bg-white border border-[#E0E0E0] rounded-lg px-3 py-2.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613] resize-none';
  const inputModal = 'w-full bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] mt-1 focus:outline-none focus:border-[#E30613]';

  const activeActions = papActions.filter(a => a.statut === 'À faire' || a.statut === 'En cours');

  return (
    <div className="space-y-6">

      {/* ── SECTION 1 : OBJECTIFS LONG TERME ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5 space-y-5">
        <div className="border-b border-[#F0F0F0] pb-4">
          <h2 className="text-lg font-bold text-[#1A1A1A]">🌟 Objectifs long terme</h2>
          <p className="text-xs text-[#6B7280] mt-0.5">Mon cap stratégique sur 3 ans — {magasinNom || 'Magasin'}</p>
        </div>

        {/* 3 valeurs */}
        <div>
          <label className="text-sm font-semibold text-[#1A1A1A] block mb-1.5">
            💎 Mes 3 valeurs non-négociables pour mon équipe
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(['valeur1', 'valeur2', 'valeur3'] as const).map((k, i) => (
              <input
                key={k}
                value={vision[k]}
                onChange={e => updateVision(k, e.target.value)}
                className="bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
                placeholder={`Valeur ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* CA annuel cible */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <div>
            <label className="text-sm font-semibold text-[#1A1A1A] block mb-1.5">
              💰 CA annuel cible (€)
            </label>
            <input
              type="number"
              value={vision.caAnnuelCible || ''}
              onChange={e => updateVision('caAnnuelCible', parseFloat(e.target.value) || 0)}
              className="w-full bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
              placeholder="Ex : 1 200 000"
            />
          </div>
          <div className="text-xs text-[#6B7280] leading-relaxed pb-2">
            Utilisé pour calibrer la marge annuelle projetée et le besoin sourcing global.
          </div>
        </div>

        {/* Cap commercial annuel */}
        <div>
          <label className="text-sm font-semibold text-[#1A1A1A] block mb-1.5">
            🚀 Mon cap commercial pour l&apos;année
          </label>
          <textarea
            value={vision.capCommercial}
            onChange={e => updateVision('capCommercial', e.target.value)}
            rows={2}
            className={tasCls}
            placeholder="Écrivez votre cap commercial"
          />
        </div>

        {/* ── Traduire en actions ─────────────────────────────────────────── */}
        <div className="border-t border-[#F0F0F0] pt-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-sm font-bold text-[#1A1A1A]">🎯 Comment je traduis ma vision en actions concrètes</h3>
            <button
              onClick={openPAPModal}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#E30613] hover:bg-[#B8050F] text-white transition-colors"
            >
              + Créer une action liée à ma vision
            </button>
          </div>

          {activeActions.length === 0 ? (
            <p className="text-sm text-[#6B7280] italic">
              Aucune action active. Cliquez sur le bouton ci-dessus pour créer votre première action liée à votre vision.
            </p>
          ) : (
            <div className="space-y-2.5">
              {activeActions.map(a => (
                <div key={a.id} className="border-l-2 border-[#E30613] pl-3 py-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-[#1A1A1A]">{a.titre}</span>
                    {a.echeance && (
                      <span className="text-xs text-[#6B7280]">— {new Date(a.echeance).toLocaleDateString('fr-FR')}</span>
                    )}
                    <span className="text-xs text-[#9CA3AF]">[{a.statut}]</span>
                  </div>
                  {a.lienvision?.trim() ? (
                    <p className="text-xs italic text-[#6B7280] mt-0.5">🎯 {a.lienvision}</p>
                  ) : (
                    <p className="text-xs italic text-[#E30613] mt-0.5">🎯 Lien à votre vision non précisé — à compléter dans le PAP.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 2 : OBJECTIFS MENSUELS ─────────────────────────────────── */}
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#1A1A1A]">📅 Objectifs mensuels</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">Mes objectifs de marge pour le mois en cours — {magasinNom || 'Magasin'}</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#6B7280]">Mois</label>
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className={ic}
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-[#6B7280]">Redistrib. promo</label>
              <input
                type="number"
                value={promoRedist || ''}
                onChange={e => updatePromo(parseFloat(e.target.value) || 0)}
                className={`${ic} w-16 text-center`}
                placeholder="30"
              />
              <span className="text-xs text-[#6B7280]">%</span>
            </div>
          </div>
        </div>

        {/* Status message */}
        {statusMsg && (
          <div className={`rounded-xl px-4 py-3 border font-semibold text-sm ${statusMsg.cls}`}>
            {statusMsg.icon} {statusMsg.msg}
            {totalAvancement > 0 && ` — ${totalAvancement}% réalisé`}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#F5F5F5] border-b border-[#E0E0E0]">
                  <th className="text-left px-3 py-2.5 font-semibold text-[#6B7280]">Famille</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Marge cible (€)</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Taux marge (%)</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Stock initial (€)</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Stock cible (€)</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Besoin sourcing NET</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Marge réalisée (€)</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Avancement</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Budget promo (€)</th>
                  <th className="px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E0E0]">
                {familles.map(f => {
                  const stockCible = stockNecessaire(f);
                  const besoin = besoinSourcing(f);
                  const avanc = avancement(f);
                  const promo = budgetPromo(f);
                  return (
                    <tr key={f.id} className="hover:bg-[#FAFAFA]">
                      <td className="px-3 py-2">
                        <input
                          value={f.famille}
                          onChange={e => updateFamille(f.id, 'famille', e.target.value)}
                          className={`${ic} w-32`}
                          placeholder="Famille"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={f.margeCible || ''}
                          onChange={e => updateFamille(f.id, 'margeCible', parseFloat(e.target.value) || 0)}
                          className={`${ic} w-24 text-right`}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={f.tauxMarge || ''}
                          onChange={e => updateFamille(f.id, 'tauxMarge', parseFloat(e.target.value) || 0)}
                          className={`${ic} w-16 text-right`}
                          placeholder="40"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={f.stockInitial || ''}
                          onChange={e => updateFamille(f.id, 'stockInitial', parseFloat(e.target.value) || 0)}
                          className={`${ic} w-24 text-right`}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-[#1A1A1A]">
                        {stockCible > 0 ? stockCible.toLocaleString('fr-FR') + ' €' : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-semibold ${
                          besoin === 0 && stockCible > 0 ? 'text-green-600'
                          : besoin > 0 ? 'text-orange-600'
                          : 'text-[#9CA3AF]'
                        }`}>
                          {stockCible > 0 ? (besoin > 0 ? `+${besoin.toLocaleString('fr-FR')} €` : '✓ Couvert') : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={f.margeRealisee || ''}
                          onChange={e => updateFamille(f.id, 'margeRealisee', parseFloat(e.target.value) || 0)}
                          className={`${ic} w-24 text-right`}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-bold ${
                          avanc >= 90 ? 'text-green-600'
                          : avanc >= 50 ? 'text-orange-500'
                          : avanc > 0 ? 'text-red-600'
                          : 'text-[#9CA3AF]'
                        }`}>
                          {f.margeCible > 0 ? `${avanc}%` : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-semibold ${promo > 0 ? 'text-green-600' : 'text-[#9CA3AF]'}`}>
                          {promo > 0 ? `+${promo.toLocaleString('fr-FR')} €` : '—'}
                        </span>
                      </td>
                      <td className="px-2 py-2 flex items-center gap-1">
                        {f.margeCible > 0 && avanc < 80 && (
                          <button onClick={() => {
                            const current = loadPAPActions(magasinNom);
                            const e = new Date(); e.setDate(e.getDate() + 14);
                            const action: PAPAction = { id: String(Date.now()), titre: `Objectifs — Booster la famille ${f.famille} (${avanc}% objectif)`, axe: 'Commerce' as ActionAxe, pilote: 'Franchisé', copilote: '', description: `Avancement ${avanc}% sur la cible de marge ${f.margeCible.toLocaleString('fr-FR')}€. Besoin sourcing NET : ${besoin > 0 ? besoin.toLocaleString('fr-FR') + ' €' : 'couvert'}. Accélérer le sourcing et les ventes sur cette famille.`, echeance: e.toISOString().slice(0, 10), priorite: avanc < 50 ? 1 : 2, gain: Math.round(f.margeCible - f.margeRealisee), statut: 'À faire' as StoredStatut };
                            savePAPActions(magasinNom, [...current, action]);
                          }} className="text-[10px] text-white bg-[#E30613] hover:bg-red-700 rounded-full px-2 py-0.5 whitespace-nowrap transition-colors">+ PAP</button>
                        )}
                        <button onClick={() => delFamille(f.id)} className="text-[#9CA3AF] hover:text-red-600 transition-colors">🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-[#E0E0E0]">
            <button onClick={addFamille} className="text-xs text-[#E30613] hover:text-[#B8050F] font-medium transition-colors">
              + Ajouter une famille
            </button>
          </div>
        </div>

        {/* Recap */}
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4">
          <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-4">Récapitulatif du mois</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-xl font-black text-[#1A1A1A]">{totalCible.toLocaleString('fr-FR')} €</div>
              <div className="text-xs text-[#6B7280] mt-0.5">Total marge cible</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-black text-[#1A1A1A]">{totalRealisee.toLocaleString('fr-FR')} €</div>
              <div className="text-xs text-[#6B7280] mt-0.5">Total marge réalisée</div>
            </div>
            <div className="text-center">
              <div className={`text-xl font-black ${
                totalAvancement >= 90 ? 'text-green-600'
                : totalAvancement >= 50 ? 'text-orange-500'
                : totalAvancement > 0 ? 'text-red-600'
                : 'text-[#9CA3AF]'
              }`}>
                {totalCible > 0 ? `${totalAvancement}%` : '—'}
              </div>
              <div className="text-xs text-[#6B7280] mt-0.5">Avancement global</div>
            </div>
            <div className="text-center">
              <div className={`text-xl font-black ${totalBudgetPromo > 0 ? 'text-green-600' : 'text-[#9CA3AF]'}`}>
                {totalBudgetPromo > 0 ? `+${totalBudgetPromo.toLocaleString('fr-FR')} €` : '—'}
              </div>
              <div className="text-xs text-[#6B7280] mt-0.5">Budget promo libéré</div>
            </div>
          </div>
          {totalBudgetPromo > 0 && (
            <p className="text-xs text-[#6B7280] mt-3 border-t border-[#E0E0E0] pt-3">
              Budget promo = (Marge réalisée − Marge cible) × {promoRedist}% pour les familles en dépassement d&apos;objectif
            </p>
          )}
        </div>

        {/* Annual synthesis */}
        {(tauxMargePondere > 0 || besoinSourcingAnnuel > 0 || caAnnuel > 0) && (
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4">
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-4">Synthèse annuelle</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className={`text-xl font-black ${tauxMargePondere > 0 ? 'text-[#1A1A1A]' : 'text-[#9CA3AF]'}`}>
                  {tauxMargePondere > 0 ? `${tauxMargePondere}%` : '—'}
                </div>
                <div className="text-xs text-[#6B7280] mt-0.5">Taux marge pondéré</div>
              </div>
              <div className="text-center">
                <div className={`text-xl font-black ${caAnnuel > 0 ? 'text-[#1A1A1A]' : 'text-[#9CA3AF]'}`}>
                  {caAnnuel > 0 ? `${caAnnuel.toLocaleString('fr-FR')} €` : '—'}
                </div>
                <div className="text-xs text-[#6B7280] mt-0.5">CA annuel cible</div>
              </div>
              <div className="text-center">
                <div className={`text-xl font-black ${margeAnnuelleProjetee > 0 ? 'text-green-600' : 'text-[#9CA3AF]'}`}>
                  {margeAnnuelleProjetee > 0 ? `${margeAnnuelleProjetee.toLocaleString('fr-FR')} €` : '—'}
                </div>
                <div className="text-xs text-[#6B7280] mt-0.5">Marge annuelle projetée</div>
              </div>
              <div className="text-center">
                <div className={`text-xl font-black ${besoinSourcingAnnuel > 0 ? 'text-orange-600' : 'text-[#9CA3AF]'}`}>
                  {besoinSourcingAnnuel > 0 ? `+${besoinSourcingAnnuel.toLocaleString('fr-FR')} €` : '—'}
                </div>
                <div className="text-xs text-[#6B7280] mt-0.5">Sourcing NET annualisé</div>
              </div>
            </div>
            <p className="text-[10px] text-[#9CA3AF] italic mt-3 border-t border-[#E0E0E0] pt-3">
              Taux marge pondéré = marge cible totale / CA cible total (mix familles du mois). Sourcing NET annualisé = besoin mensuel × 12.
              {margeAnnuelleProjetee > 0 && ` Marge annuelle = CA annuel cible × taux pondéré (${tauxMargePondere}%).`}
            </p>
          </div>
        )}
      </div>

      {/* ── PAP CREATION MODAL ─────────────────────────────────────────────── */}
      {showPAPModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#E0E0E0]">
              <h3 className="text-sm font-bold text-[#1A1A1A]">🎯 Nouvelle action — liée à ma vision</h3>
              <button onClick={() => setShowPAPModal(false)} className="text-[#9CA3AF] hover:text-[#1A1A1A] text-lg leading-none transition-colors">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#6B7280]">Titre de l&apos;action *</label>
                <input
                  value={papForm.titre}
                  onChange={e => setPapForm(f => ({ ...f, titre: e.target.value }))}
                  className={inputModal}
                  placeholder="Titre de l'action"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#6B7280]">Axe</label>
                  <select value={papForm.axe} onChange={e => setPapForm(f => ({ ...f, axe: e.target.value as ActionAxe }))} className={inputModal}>
                    {PAP_AXES.map(ax => <option key={ax} value={ax}>{ax}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#6B7280]">Priorité</label>
                  <select value={papForm.priorite} onChange={e => setPapForm(f => ({ ...f, priorite: Number(e.target.value) as 1|2|3 }))} className={inputModal}>
                    <option value={1}>P1 — Urgente</option>
                    <option value={2}>P2 — Importante</option>
                    <option value={3}>P3 — Standard</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#6B7280]">Pilote</label>
                  <input value={papForm.pilote} onChange={e => setPapForm(f => ({ ...f, pilote: e.target.value }))} className={inputModal} placeholder="Responsable" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#6B7280]">Échéance</label>
                  <input type="date" value={papForm.echeance} onChange={e => setPapForm(f => ({ ...f, echeance: e.target.value }))} className={inputModal} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#6B7280]">Statut</label>
                  <select value={papForm.statut} onChange={e => setPapForm(f => ({ ...f, statut: e.target.value as StoredStatut }))} className={inputModal}>
                    {PAP_STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#6B7280]">Gain estimé (€)</label>
                  <input type="number" value={papForm.gain || ''} onChange={e => setPapForm(f => ({ ...f, gain: parseFloat(e.target.value) || 0 }))} className={inputModal} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#E30613]">🎯 Lien avec ma vision</label>
                <textarea
                  value={papForm.lienvision ?? ''}
                  onChange={e => setPapForm(f => ({ ...f, lienvision: e.target.value.slice(0, 200) }))}
                  rows={3} maxLength={200}
                  className={`${inputModal} resize-none`}
                />
                <div className="text-right text-xs text-[#9CA3AF] mt-0.5">{(papForm.lienvision ?? '').length}/200</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#6B7280]">Description</label>
                <textarea value={papForm.description} onChange={e => setPapForm(f => ({ ...f, description: e.target.value }))} rows={2} className={`${inputModal} resize-none`} placeholder="Détails de l'action..." />
              </div>
            </div>
            <div className="flex gap-2 justify-end px-5 pb-5">
              <button onClick={() => setShowPAPModal(false)} className="text-xs px-4 py-2 rounded-lg bg-white border border-[#E0E0E0] hover:bg-[#F5F5F5] text-[#6B7280] transition-colors">Annuler</button>
              <button onClick={createPAPAction} disabled={!papForm.titre.trim()} className="text-xs px-4 py-2 rounded-lg bg-[#E30613] hover:bg-[#B8050F] text-white font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Créer l&apos;action</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
