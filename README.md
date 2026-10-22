# ATLAS HQ

ATLAS HQ est le cockpit Web/PWA du Personal Operating System. Cette première fondation propose une interface responsive utilisable sans IA et sans connexion aux services externes.

## Cockpit V0

- Six destinations : Accueil, Workspaces, Missions, Agents & Équipes, Mes Apps et Inbox.
- Recherche globale, Éléments liés, Chief et Paramètres sont accessibles depuis le shell.
- Sur mobile, une barre rapide donne accès à Accueil, Missions, Inbox et Menu; le menu latéral est un panneau unique.
- Navigation adaptée aux lecteurs d’écran, au clavier et au tactile; thème clair et tokens compatibles avec le mode sombre du système.
- Le catalogue et les résultats de recherche utilisent uniquement des exemples d’interface, signalés par « Mode démonstration ». Ils ne décrivent pas l’état réel des comptes.
- Les espaces sans source connectée affichent des états vides explicites. Les routes secondaires ont des états de chargement et une erreur récupérable.
- Les intégrations, l’activité opérationnelle et les connexions ne sont pas encore activées.

## Démarrage

Prérequis : Node.js 20.9 ou plus récent et npm.

```bash
npm install
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000). Le build de production se lance avec `npm run build`, puis `npm start`.

## Vérifications

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## PWA

Le manifeste est dans `public/manifest.webmanifest`, l’icône dans `public/icon.svg` et le service worker dans `public/sw.js`. Celui-ci est enregistré en production et met en cache l’enveloppe de la page d’accueil pour une consultation ultérieure hors ligne. Le navigateur contrôle la disponibilité du bouton d’installation.

## Structure

- `src/app` : routes App Router, métadonnées et styles globaux.
- `src/components` : navigation responsive et composants de présentation.
- `public` : ressources PWA statiques.

## Sécurité et périmètre

Aucun secret, client Supabase ou donnée opérationnelle n’est inclus. Les fichiers `.env*` sont ignorés par Git; `.env.example` ne contient qu’un réglage public indicatif. Chaque plateforme connectée restera sa propre source de vérité. Aucune intégration backend n’est activée dans cette fondation.

## ATLAS Agent Layer (boundary implementation)

`src/lib/agents` adds the typed Context Resolver and Agent Bridge for the first GitHub pull request scenario. The resolver checks source/resource access, records provenance and freshness, and bounds diff/attachment content. The bridge defines owner-scoped idempotent mission submission, status refresh, and source-to-mission/report relation writes. Contract tests exercise the flow with test doubles.

This repository still has no authenticated API route, durable mission/relation store, configured GitHub connection vault, or documented OpenMausBot mission transport. The default `UnavailableOpenMausBotGateway` returns an explicit error. The implementation therefore does not claim that `@VISION` can be launched from the app or that a real report can be linked yet. See [ADR 0002](architecture/adr/0002-agent-layer.md) for the observed contracts, limits, and activation requirements.
