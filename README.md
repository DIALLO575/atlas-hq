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

## Connecteur Engine — GitHub et Linear

La page « Mes Apps » présente une maquette intégrable des deux connecteurs prioritaires. Elle reprend les états du contrat serveur (`connected`, `reauthorization_required`, `disconnected`, `error`) et les capacités (`enabled`, `disabled`, `unknown`), mais n’affiche ici que l’état démonstration non connecté : aucune route HTTP, authentification OAuth, permission vérifiée, synchronisation ou ressource réelle n’est encore raccordée. Les actions mutatives restent désactivées; une création d’issue devra être approuvée à partir d’un aperçu serveur.

Critères d’acceptation de cet incrément :

- GitHub et Linear ont chacun une vue de capacités explicitement « À vérifier » sans preuve fournisseur.
- Le compte, le workspace/dépôt, l’état d’accès, la fraîcheur et les incidents restent explicitement indisponibles ou inconnus tant que le serveur ne les fournit pas.
- Les états sans connexion, sans ressource et sans approbation sont visibles; l’état erreur récupérable de route et l’état de chargement restent gérés par les fichiers `loading.tsx` et `error.tsx` existants.
- La navigation du catalogue est utilisable au clavier; la page s’adapte au mobile et au thème sombre.
- Aucune clé, permission ou donnée d’activité opérationnelle n’est envoyée ou simulée côté client.

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
