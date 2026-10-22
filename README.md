# ATLAS HQ

ATLAS HQ est le cockpit Web/PWA du Personal Operating System. Cette première fondation propose une interface responsive utilisable sans IA et sans connexion aux services externes.

## Cockpit V0

- Navigation entre Vue d’ensemble, Mes Apps, Agents et Recherche, au clavier comme au tactile.
- Le catalogue et les résultats de recherche utilisent uniquement des exemples d’interface, signalés par « Mode démonstration ». Ils ne décrivent pas l’état réel des comptes.
- La vue Agents explique clairement l’absence de connexion. Les routes secondaires ont des états de chargement et une erreur récupérable.
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
