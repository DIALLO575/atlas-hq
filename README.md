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

## Connexion et workspaces

- Les six sections du cockpit et les routes transversales passent par `proxy.ts`; sans session vérifiée, l’utilisateur revient à `/login`.
- Connexion par e-mail/mot de passe et déconnexion utilisent Supabase Auth et des cookies `@supabase/ssr`. Le proxy rafraîchit la session et vérifie les claims avant le rendu protégé.
- Configurez uniquement `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` depuis `.env.example`. Une clé `service_role` ou `sb_secret` ne doit jamais être utilisée côté client ni ajoutée à un `NEXT_PUBLIC_*`.
- En absence de configuration, la page de connexion expose un état explicite et aucun écran protégé n’est rendu. Les erreurs de connexion restent génériques et n’exposent pas les réponses Auth.
- Le sélecteur de workspace utilise le contrat typé de `src/lib/workspaces/contract.ts`. L’inspection du projet Supabase `ovzmmsxqfifneqqgnrzd` a trouvé `atlas_connections`, `atlas_provider_objects` et `atlas_sync_cursors`, mais aucune table de workspace ou de membership. L’adaptateur retourne donc « indisponible » sans inventer de workspace ni appeler un endpoint inexistant. Il attend un contrat backend avec liste et sélection filtrées pour l’utilisateur courant.
- Les pages HTML authentifiées ne sont pas stockées dans le service worker et aucun contenu protégé n’est montré hors ligne. Seuls le manifeste, l’icône et les assets statiques sont mis en cache.

### Critères d’acceptation

1. Les routes Accueil, Workspaces, Missions, Agents & Équipes, Mes Apps et Inbox redirigent vers la connexion sans session valide.
2. Une session valide permet l’accès, affiche l’état du compte, renouvelle les cookies via SSR et permet la déconnexion.
3. Les états chargement, configuration absente, erreur d’identifiants, aucun workspace et contrat workspace indisponible sont accessibles et explicites.
4. Aucun secret privilégié ne figure dans le code client, l’exemple d’environnement ou les tests.
5. Le changement de workspace s’active seulement quand le contrat backend retourne plusieurs workspaces autorisés.

## PWA

Le manifeste est dans `public/manifest.webmanifest`, l’icône dans `public/icon.svg` et le service worker dans `public/sw.js`. Celui-ci est enregistré en production et met en cache seulement des ressources statiques publiques; les pages authentifiées exigent toujours une réponse réseau. Le navigateur contrôle la disponibilité du bouton d’installation.

## Structure

- `src/app` : routes App Router, métadonnées et styles globaux.
- `src/components` : navigation responsive et composants de présentation.
- `public` : ressources PWA statiques.

## Sécurité et périmètre

Aucun secret, client Supabase ou donnée opérationnelle n’est inclus. Les fichiers `.env*` sont ignorés par Git; `.env.example` ne contient qu’un réglage public indicatif. Chaque plateforme connectée restera sa propre source de vérité. Aucune intégration backend n’est activée dans cette fondation.
