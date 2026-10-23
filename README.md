# ATLAS HQ

ATLAS HQ est le cockpit Web/PWA du Personal Operating System. L’application utilise Supabase Auth côté serveur et PostgreSQL RLS pour isoler les workspaces et les données.

## Cockpit V0

- Navigation entre Vue d’ensemble, Mes Apps, Agents et Recherche, au clavier comme au tactile.
- Le catalogue et les résultats de recherche utilisent uniquement des exemples d’interface, signalés par « Mode démonstration ». Ils ne décrivent pas l’état réel des comptes.
- La vue Agents explique clairement l’absence de connexion. Les routes secondaires ont des états de chargement et une erreur récupérable.
- Le parcours de connexion/création de compte et le workspace personnel sont actifs après configuration Supabase.
- Les intégrations, l’activité opérationnelle et les connexions externes ne sont pas encore activées.

## Démarrage

Prérequis : Node.js 20.9 ou plus récent et npm.

```bash
npm install
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000). Le build de production se lance avec `npm run build`, puis `npm start`.

Copiez `.env.example` dans `.env.local` et renseignez l’URL de projet Supabase et sa clé publishable (ou la clé anon historique). Ne mettez jamais une clé `service_role` ou une clé secrète dans une variable `NEXT_PUBLIC_*`. Les identifiants doivent aussi être configurés dans l’environnement d’hébergement avant toute prévisualisation fonctionnelle. Supabase Auth doit autoriser l’URL de retour de l’application; si la confirmation e-mail est activée, l’utilisateur confirme son compte avant sa première session.

Les routes métier vérifient l’utilisateur avec `auth.getUser()` côté serveur. L’inscription crée un workspace personnel à la première visite. Chaque workspace a un owner créé par trigger; owners et admins peuvent ajouter des membres ou admins, tandis que seuls les owners peuvent supprimer leur workspace. Les memberships ne peuvent pas s’accorder le rôle owner. Les tables `atlas_connections`, `atlas_provider_objects` et `atlas_sync_cursors` restent limitées au propriétaire de la connexion. L’interface d’invitation et la gestion des rôles ne sont pas encore présentes.

La migration `supabase/migrations/20261023000127_auth_workspaces_rls.sql` crée ces tables, privilèges et policies. Appliquez-la une seule fois au projet Supabase `ovzmmsxqfifneqqgnrzd` après revue. Le schéma `private` héberge les fonctions de policy `SECURITY DEFINER`; seules les fonctions de lecture de membership sont exécutables par `authenticated`.

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

Aucun secret de service ni donnée opérationnelle n’est inclus. Les fichiers `.env*` sont ignorés par Git; `.env.example` ne contient que des valeurs indicatives. Chaque plateforme connectée restera sa propre source de vérité. Les tests Node couvrent les contrats de routes et de policies; la vérification d’isolation multi-utilisateur doit également être exécutée sur le projet Supabase après application de la migration.
