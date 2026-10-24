# ATLAS HQ

> **Agents de développement :** lisez [AGENTS.md](AGENTS.md) avant de pousser ou déployer. La règle de quota Vercel impose de regrouper les corrections et de limiter les previews automatiques.

ATLAS HQ est le cockpit Web/PWA du Personal Operating System. Le projet contient désormais des pages réelles appuyées sur Supabase et un connecteur GitHub en lecture seule, ainsi qu'un cockpit Chief à réponses guidées (sans LLM connecté). **Attention : le dernier code mergé sur main peut ne pas être encore publié sur Vercel.** Voir le [relais des workers](docs/operations/worker-handoff-2026-10-24.md).

## Moteurs IA — M0 dans main, runtime encore désactivé

Le contrat MAUSBOT / Engines, l'Espace Moteurs, les tests et le registre
d'instances offline ont été fusionnés dans main via
[PR #33](https://github.com/DIALLO575/atlas-hq/pull/33), commit
ab21fcfbfeb6ef75bc6147cd80b7137ae22be301. CI du commit fusionné :
[GitHub Actions](https://github.com/DIALLO575/atlas-hq/actions/runs/40114818208)
(tous les jobs réussis).

**Sept migrations Supabase Engines sont appliquées** :
20261024161305 (9 tables RLS), 20261024163943 (clé/version d'outbox),
20261024182928 (empreinte immuable), 20261024193128 (Inbox lecture seule)
20261024193537 (privilèges internes privés) et 20261024200020
(décision humaine atomique + audit), puis 20261024205621
(leases privés, fencing, backoff et dead-letter pour futur worker).
La page `/engines/approvals` possède désormais une consultation et des
boutons **Approuver / Refuser**. Le POST passe par une RPC à session
active, contrôle du rôle, verrouillage de l'approval et du run et audit
atomique. C'est un parcours **codé et testé sur PostgreSQL jetable** ;
les tests E2E sous deux vraies sessions Supabase Auth et le déploiement Web
restent à réaliser. Une décision ne lance aucun moteur (`canDispatch:false`).
La vérification de la base en direct confirme 0 instance, 0 run, 0 approbation.

Le catalogue recense 20 outils MCP mock-testés et 128 entrées natives
(24 lectures simulées, 42 plans de mutations non exécutables, 5 plans
binaires sans I/O, 57 contrats source-only). Les deux catalogues
peuvent se recouper. **Aucun runtime MAUSBOT n'a été connecté et les
mutations restent bloquées HTTP 423.** Fusion GitHub n'est pas déploiement
Vercel/Netlify : l'état de production doit être vérifié séparément.

Voir le [bilan de livraison M0](docs/operations/atlas-engine-m0-main-release-2026-10-24.md),
le [contrat Engines](docs/architecture/engine-hub.md) et la
[persistance Supabase](docs/architecture/engine-persistence.md).
Le suivi restant est dans Linear SHA-126 à SHA-133, surtout SHA-132
(KMS, approbations, worker) et SHA-133 (tests/certification). SHA-105
connexion réelle demeure bloqué.

## ATLAS actuel — surfaces et réalité des données

- Accueil, Workspaces, Missions, Agents & Équipes, Mes Apps, Inbox et Chief sont accessibles via le shell Next.js responsive, avec navigation préchargée, barre de progression et squelettes de chargement.
- **Workspaces** : Supabase Auth, rôles et règles RLS réels. **Missions / Inbox** : création, statuts et décisions transactionnelles réels sur des tables Supabase dédiées; pas de faux résultats lorsqu'aucune mission n'existe.
- **Mes Apps** : catalogue d'applications ; le lien `Piloter` GitHub ouvre le Control Center. Les autres cartes ne garantissent aucune connexion fournisseur.
- **GitHub Control Center V2** : installation autorisée `selected` ou `all`, lecture de dépôts et de PR, inspection des fichiers/diffs, aucune écriture GitHub. Un accès GitHub réellement opérationnel exige l'installation et les permissions fournisseur vérifiées.
- **Chief Command Deck** : cockpit conversationnel à réponses **guidées**, métriques et graphiques de répartition fondés sur les données du workspace; historique temporaire. **Aucun modèle LLM libre / agent autonome n'est connecté**.
- Les zones non raccordées (certains agents, recherche transverse, automatisations) doivent rester des états honnêtes, jamais des données fictives présentées comme réelles.
- Suivi de livraison GitHub vs Vercel, limitations et prochaines actions : [relais inter-workers](docs/operations/worker-handoff-2026-10-24.md).

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

Aucun secret privilégié ne doit apparaître dans le code client ; les fichiers `.env*` sont ignorés par Git. Supabase Auth, workspaces, Missions/Inbox et l'API GitHub App sont déjà présents côté serveur ; chaque plateforme externe reste la source de vérité de ses propres données. Les droits sont vérifiés par workspace et les capacités non implémentées ne doivent pas être simulées.

### Workspace roles and migration order

Within a workspace, an `owner` or `admin` may add a different authenticated user as `member` or `admin`; this includes an admin nominating another admin in that same workspace. Membership writes are authorized against the target workspace, so an admin cannot write membership to another workspace, and neither admins nor owners can grant `owner` through the membership table. Owner membership is created only by the workspace insert trigger from the server-verified `created_by` value. A person may participate in several workspaces only through a separate membership authorized for each one.

Keep the Supabase migration sequence as versioned: `20261023071054_auth_workspaces_rls.sql` is recorded on the official project's migration history and explicitly enables RLS on both new tables; `20261023072200_fail_closed_rls_auto_enable.sql` replaces the historical auto-enable handler without swallowing errors (applied by MCP as official version `20261023112332`); `20261023073700_limit_workspace_update_columns.sql` revokes table-level UPDATE and grants only `name` and `updated_at` (applied by MCP as official version `20261023112337`). Do not edit or reorder a migration already applied to the official database. The SQL regression test checks this privilege matrix, owner immutability, admin nomination, cross-workspace denial, and propagation of an injected RLS auto-enable failure.


## Connecteur Notion — socle Supabase (24/10/2026)

Les quatre migrations sécurisées Notion sont enregistrées sur le projet Supabase officiel, versions `20261024140402`, `20261024140414`, `20261024140418` et `20261024140422`. Le code reste conditionné à une configuration OAuth serveur, et les accès aux pages doivent être vérifiés sur un workspace Notion de test. Voir [la note de mise à jour](docs/operations/notion-supabase-main-release-2026-10-24.md) et [le contrat d'intégration](docs/integrations/notion-integration-contract.md). Fusion GitHub, disponibilité Vercel et authentification fournisseur sont trois statuts distincts.
