# EASYCASH COCKPIT — Cahier des charges technique + Guide de déploiement

## Pour qui est ce document ?

Ce document est destiné à **Cyprien MERCIER**, consultant franchise EasyCash, pour transformer son cockpit HTML local en web app hébergée. Il peut être donné tel quel à Claude Code ou à un développeur pour construire le projet.

---

## 1. CONTEXTE MÉTIER

Cyprien est consultant franchise pour le réseau EasyCash (occasion retail). Il pilote 5+ magasins franchisés et a besoin d'un outil de diagnostic et de décision pour ses visites terrain.

**Workflow actuel :**
1. Avant la visite : collecte manuelle des données depuis l'intranet EasyCash
2. Pendant la visite : analyse avec le franchisé, ajustement des seuils
3. Après la visite : rédaction du CR Word, plan d'action, suivi entre deux visites

**Problèmes à résoudre :**
- Double saisie des données (intranet → outil)
- Rédaction chronophage des CR de visite
- Pas de suivi du plan d'action entre deux visites
- Pas d'historique des scores pour mesurer la progression

---

## 2. ARCHITECTURE TECHNIQUE

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  React App  │────▶│   Supabase   │◀────│  Power BI   │
│  (Vercel)   │     │ (PostgreSQL) │     │ (optionnel) │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │
       ▼                    ▼
  ┌─────────┐        ┌──────────┐
  │ Export   │        │ API Rest │
  │ CR Word  │        │ (auto)   │
  └─────────┘        └──────────┘
```

- **Frontend** : React + Tailwind CSS + Recharts (graphiques) + docx.js (export Word)
- **Backend** : Supabase (PostgreSQL + Auth + API auto-générée)
- **Hébergement** : Vercel (gratuit)
- **Coût** : Supabase Free (suffisant pour démarrer) ou Pro à 25$/mois

---

## 3. FONCTIONNALITÉS PAR ÉCRAN

### 3.1 Dashboard / Cockpit (page d'accueil)
- Sélecteur de magasin en haut
- Score santé global (jauge dégradée)
- Cartes par catégorie avec score % + nb alertes
- Graphique radar par catégorie
- Graphique barres valeurs vs seuils
- Barres empilées OK/Vigilance/Action par catégorie
- Liste des actions prioritaires P1/P2
- **NOUVEAU** : Courbe d'évolution du score sur les dernières visites

### 3.2 KPIs Détail
- Cartes par catégorie avec saisie inline
- Indicateur de statut (vert/orange/rouge)
- Seuil OK et Vigilance affichés
- Action recommandée si hors seuil
- **NOUVEAU** : Historique de chaque KPI (sparkline)

### 3.3 Paramétrage
- Tableau des indicateurs avec ▲▼ réordonnement
- Catégorie modifiable (dropdown + nouvelle)
- Seuils OK/Vigilance éditables
- Poids (1-5)
- Action par défaut
- Ajouter / Supprimer

### 3.4 Import
- Upload Excel (parser format intranet EasyCash)
- Copier-coller depuis page web intranet
- Matching automatique par nom d'indicateur

### 3.5 Checklist quotidienne
- 5 catégories : Sécurité, Gestion, Management, Commerce, Clients
- 27 tâches avec cases à cocher
- Progression en % avec jauge
- Sauvegarde par magasin + date

### 3.6 Grille Temps
- Tableau : Catégorie / Activité / Nature (GC/RD/GF/PS/PD) / Passages / Temps
- Tout éditable + ajout/suppression de lignes
- Graphique donut répartition des natures
- Diagnostic automatique (PS+PD < 40% = alerte)

### 3.7 Décisions
- Bloc Synthèse de visite : date, consultant, constats, signature
- Score + alertes P1/P2 automatiques
- Bouton "Générer CR visite" → export Word

### 3.8 Plan d'action
- Tableau : N° / Priorité / Constat / Action / Responsable / Échéance / Statut
- Bouton "Auto-remplir depuis alertes"
- Notes prochain rendez-vous
- **NOUVEAU** : Le franchisé peut mettre à jour le statut via un lien partagé

### 3.9 Comparatif multi-magasins (NOUVEAU)
- Vue côte à côte de tous les magasins
- Score global par magasin
- Heatmap des KPIs par magasin
- Identification des patterns communs

### 3.10 Historique (NOUVEAU)
- Courbe d'évolution du score par magasin
- Historique des visites avec constats
- Suivi des plans d'action dans le temps

---

## 4. SCHÉMA DE BASE DE DONNÉES

Voir le fichier `EASYCASH_SUPABASE_SCHEMA.sql` fourni séparément.

**Tables principales :**
- `magasins` : les points de vente
- `indicateurs` : les 57 KPIs avec seuils et catégories
- `valeurs` : données saisies (magasin × indicateur × date)
- `visites` : synthèse de chaque visite
- `plans_action` : actions avec suivi
- `checklist` : tâches quotidiennes
- `grille_temps` : analyse du temps par visite

**Vues pré-calculées :**
- `v_dernieres_valeurs` : dernière valeur de chaque KPI par magasin
- `v_actions_ouvertes` : plans d'action non terminés
- `v_derniere_visite` : dernière visite par magasin

---

## 5. GUIDE DE DÉPLOIEMENT PAS À PAS

### Étape 1 : Créer le compte Supabase (5 min)

1. Aller sur https://supabase.com
2. Cliquer "Start your project" → se connecter avec GitHub ou email
3. Cliquer "New project"
4. Nom : `easycash-cockpit`
5. Mot de passe base de données : noter quelque part de sûr
6. Région : West EU (Frankfurt)
7. Attendre 2 minutes que le projet se crée

### Étape 2 : Créer les tables (2 min)

1. Dans Supabase, aller dans "SQL Editor" (icône à gauche)
2. Cliquer "New query"
3. Copier-coller le contenu du fichier `EASYCASH_SUPABASE_SCHEMA.sql`
4. Cliquer "Run" (bouton vert)
5. Vérifier : aller dans "Table Editor" → vous devez voir les 7 tables + les 57 indicateurs + les 4 magasins

### Étape 3 : Récupérer les clés Supabase (1 min)

1. Aller dans "Settings" → "API"
2. Copier :
   - **Project URL** : `https://xxxxx.supabase.co`
   - **anon public key** : `eyJhbGciOiJIUzI...` (la clé longue)
3. Les garder, on en aura besoin pour l'app

### Étape 4 : Installer les outils sur votre PC (10 min)

1. Installer Node.js : https://nodejs.org → télécharger la version LTS → installer
2. Vérifier : ouvrir un terminal (cmd sur Windows) → taper `node --version` → doit afficher un numéro

### Étape 5 : Créer le projet React (5 min)

Dans le terminal :
```bash
npx create-next-app@latest easycash-cockpit
# Répondre : Yes à TypeScript, Yes à Tailwind, Yes à App Router
cd easycash-cockpit
npm install @supabase/supabase-js recharts docx file-saver
```

### Étape 6 : Configurer Supabase dans l'app (2 min)

Créer le fichier `.env.local` à la racine du projet :
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI...
```

### Étape 7 : Coder l'app

C'est là que Claude Code intervient. Donnez-lui ce cahier des charges + le fichier SQL + votre cockpit HTML actuel en disant :

> "Construis-moi cette web app React/Next.js connectée à Supabase en suivant ce cahier des charges. Voici le schéma SQL déjà déployé et le cockpit HTML existant dont tu dois reprendre le design et les fonctionnalités."

### Étape 8 : Déployer sur Vercel (5 min)

1. Créer un compte sur https://vercel.com (gratuit, se connecter avec GitHub)
2. Pousser votre code sur GitHub (Claude Code peut le faire)
3. Dans Vercel : "Import Project" → sélectionner le repo GitHub
4. Ajouter les variables d'environnement (les mêmes que .env.local)
5. Cliquer "Deploy"
6. Votre app est en ligne à `https://easycash-cockpit.vercel.app`

---

## 6. PROMPT POUR CLAUDE CODE

Copiez ce prompt dans Claude Code pour lancer le développement :

```
Je veux construire une web app Next.js + Supabase pour piloter des magasins franchisés EasyCash.

CONTEXTE :
- Je suis consultant franchise, je pilote 5+ magasins
- J'ai un cockpit HTML existant (joint) qui fonctionne mais est limité (localStorage)
- J'ai un schéma Supabase déjà déployé (joint)
- J'ai un cahier des charges complet (joint)

CE QUE JE VEUX :
1. Reprendre le design du cockpit HTML (dark theme, couleurs accent vert/rouge/orange)
2. Connecter à Supabase au lieu du localStorage
3. Ajouter : historique, comparatif multi-magasins, export CR Word
4. Design moderne, graphiques Recharts, responsive mobile

TECH STACK :
- Next.js 14 (App Router)
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- Recharts pour les graphiques
- docx.js pour l'export Word
- Déploiement Vercel

FICHIERS JOINTS :
- EASYCASH_SUPABASE_SCHEMA.sql (schéma de base déployé)
- EASYCASH_COCKPIT.html (cockpit existant à migrer)
- Ce cahier des charges

Commence par la structure du projet et le dashboard principal.
```

---

## 7. COÛT MENSUEL

| Service | Plan | Coût |
|---------|------|------|
| Supabase | Free (500 MB, 50k requêtes/mois) | 0€ |
| Vercel | Free (100 GB bandwidth) | 0€ |
| **Total démarrage** | | **0€/mois** |

Si vous dépassez les limites free :

| Service | Plan | Coût |
|---------|------|------|
| Supabase | Pro (8 GB, illimité) | ~25€/mois |
| Vercel | Pro (optionnel) | ~20€/mois |
| **Total pro** | | **~25-45€/mois** |

---

## 8. ÉVOLUTIONS FUTURES

- **Lien partagé franchisé** : le franchisé accède à son plan d'action en lecture/écriture via un lien sécurisé
- **Notifications** : alerte email quand une action arrive à échéance
- **Import automatique** : si l'intranet EasyCash expose une API, connexion directe
- **App mobile** : React Native ou PWA pour usage en visite
- **Multi-consultants** : si d'autres consultants du réseau veulent utiliser l'outil
- **Benchmark réseau** : intégrer les moyennes réseau pour comparaison automatique
