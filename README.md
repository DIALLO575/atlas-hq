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
- `workspaces` et `workspace_members` sont versionnés dans `supabase/migrations/20261023071054_auth_workspaces_rls.sql`; les rôles sont `owner`, `admin` et `member`. Les actions serveur de `src/app/workspaces/actions.ts` résolvent la session avec `auth.getUser()`, filtrent les appartenances avec cet identifiant vérifié et revalident toute sélection. Les politiques RLS dérivent l’accès tenant de `auth.uid()`; un identifiant propriétaire envoyé par le client n’est pas utilisé.
- `supabase/migrations/20261023072200_fail_closed_rls_auto_enable.sql` supprime le gestionnaire `WHEN OTHERS` qui journalisait puis avalait les erreurs d’activation RLS. Un échec d’`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` annule maintenant le DDL. Le script `supabase/tests/workspace_rls.sql` contrôle l’isolation de deux utilisateurs, la falsification du propriétaire, les écritures inter-tenant et la protection des nouvelles tables publiques; lancez-le avec `supabase test db` sur une base locale/jetable.
- `supabase/migrations/20261023073700_limit_workspace_update_columns.sql` empêche de changer `created_by` après création. La structure cible `apps/web` et `packages/*`, avec l’ordre de migration exact et les raisons de ne pas déplacer l’application dans cette branche, sont documentés dans `docs/architecture/monorepo-layout.md`.
- Les pages HTML authentifiées ne sont pas stockées dans le service worker et aucun contenu protégé n’est montré hors ligne. Seuls le manifeste, l’icône et les assets statiques sont mis en cache.

### Critères d’acceptation

1. Les routes Accueil, Workspaces, Missions, Agents & Équipes, Mes Apps et Inbox redirigent vers la connexion sans session valide.
2. Une session valide permet l’accès, affiche l’état du compte, renouvelle les cookies via SSR et permet la déconnexion.
3. Les états chargement, configuration absente, erreur d’identifiants, aucun workspace et erreur de requête workspace sont accessibles et explicites.
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

### Workspace roles and migration order

Within a workspace, an `owner` or `admin` may add a different authenticated user as `member` or `admin`; this includes an admin nominating another admin in that same workspace. Membership writes are authorized against the target workspace, so an admin cannot write membership to another workspace, and neither admins nor owners can grant `owner` through the membership table. Owner membership is created only by the workspace insert trigger from the server-verified `created_by` value. A person may participate in several workspaces only through a separate membership authorized for each one.

Keep the Supabase migration sequence as versioned: `20261023071054_auth_workspaces_rls.sql` is already recorded on the official project's migration history and explicitly enables RLS on both new tables; `20261023072200_fail_closed_rls_auto_enable.sql` replaces the historical auto-enable handler without swallowing errors; `20261023073700_limit_workspace_update_columns.sql` revokes table-level UPDATE and grants only `name` and `updated_at`. Do not edit or reorder a migration already applied to the official database. The SQL regression test checks this privilege matrix, owner immutability, admin nomination, cross-workspace denial, and propagation of an injected RLS auto-enable failure.
