# SHA-181 / PR10 — ATLAS × n8n : dossier de certification / GO-NO-GO

**Décision au 25 octobre 2026 : NO-GO (sandbox live, édition SaaS et production n8n).**
Ce dossier a une portée **documentaire + tests de refus**, non une autorisation de déploiement. Il ne signe aucune conformité légale et ne supprime pas la protection de PR05. La PR PR10 ne change pas Supabase, n'émet aucun secret et n'exécute aucun workflow.

**Propriétaire de la décision** : Founder / propriétaire du projet ATLAS. Responsable technique des preuves : reviewer indépendant nommé lors de la revue. Aucune signature GO enregistrée dans cette PR.

## 1. Constat vérifié, sources et décalage

Relevé du 25 octobre 2026, conservé sous `docs/integrations/n8n-pr10-evidence-2026-10-25.json`. Le snapshot est un rapport de pointage **qui peut devenir obsolète** ; ne pas le confondre avec une vérification permanente, ni accepter ses champs comme des claims d'autorisation de l'API.

| Preuve | Observation source | Statut |
|---|---|---|
| GitHub `main` | SHA `c7ec18e93f44fc32e560ae8b74b7fd6664ce5249` (Engine Hub MAUSBOT a été fusionné sur `main` depuis le dernier relais) | code présent sur `main`, pas le stack n8n |
| Vercel projet `atlas-hq-preview` / cible **production** | dernier déploiement READY `dpl_8MswntXzx8QU99zPZAJ4NKEyPjxM` rapporte également SHA `c7ec18e9…` | conforme à `main`, **distinct du stack n8n** |
| Stack GitHub n8n | PR #57 → #58 → #59 → #61 → #63 → #65 → #66 → #67 → #69 toutes DRAFT ouvertes; dernier SHA PR09 `954d8c5590a2149c68ca99553202dc499cb4399f` | **non fusionné** |
| CI stack PR09 | [GitHub Actions 40208144247](https://github.com/DIALLO575/atlas-hq/actions/runs/40208144247) SUCCESS, 6/6 jobs : Node, typecheck, lint, build, Gitleaks, audit, PostgreSQL | **tests de code et de schéma**, pas E2E n8n |
| Supabase ATLAS | PG 17.11; migrations `20261025114449` / `20261025120150` / `20261025133921` appliquées | OK pour le schéma en prod |
| Supabase RLS/contraintes | trois tables n8n ont RLS; anon lecture interdite, authenticated écriture interdite; `atlas_n8n_runtime_offline_only` validée | **hard OFFLINE** |
| Supabase état des registres | 0 instances Engine, 0 workflows n8n, 0 exécutions n8n, 0 reçus callback | **pas de connexion ou E2E prouvée** |
| Security Advisor | 20 avis INFO `rls_enabled_no_policy` (dont table callback privée volontairement sans policy) et 1 avertissement `auth_leaked_password_protection` existant | revue sépare les constats intentionnels et le risque Auth |
| n8n sandbox | version fournisseur, URL, clé de test, REST/MCP/webhook et tests multi-tenant **non attestés** | **BLOQUÉ** |

L'ancienne description Linear de SHA-149/150/151 date du moment où les PR Engine Hub étaient en brouillon, mais `main` a avancé : une partie de l'Engine Hub MAUSBOT y a désormais été fusionnée. **Cela ne rend pas automatiquement la file durable et les approbations aptes à exécuter des automatisations n8n sans mission** ; l'écart structurel `atlas_engine_runs.mission_id NOT NULL` versus `atlas_automation_executions.mission_id NULL` reste un blocage à vérifier par un vrai plan d'intégration transactionnelle.

## 2. Décisions séparées

| Périmètre | Statut actuel | Condition minimale |
|---|---|---|
| Développement offline / CI | **TESTABLE** | Node/SQL/CI CI verte, jamais présenté comme une connexion |
| **GO sandbox live** | **NO-GO** | instance n8n isolée, version certifiée, TLS + DNS egress, deux tenants, Webhook/HMAC/MCP REST E2E, identités, rotation/replay, rollback réellement exercé |
| **GO builder/éditeur client SaaS** | **NO-GO** | GO sandbox live **plus** licence commerciale applicable confirmée par n8n et grants par utilisateur, intention approuvée et version du workflow |
| **GO production n8n** | **NO-GO** | tous les éléments précédents, mêmes SHA/artefacts, revue sécurité et incident, sign-off écrite du propriétaire, opération de promotion indépendante |

**Aucune** condition externe ou variable d'environnement de l'utilisateur ne permet à `assessN8nReleaseReadiness` de rendre autre chose que `NO_GO`. La décision écrite indépendante après tests live devra être introduite dans une PR distincte explicitement revue : ce rapport PR10 ne possède **pas** de mécanisme GO.

## 3. Matrice REST / MCP / webhook / licensing

**REST** : vérifier sur la version **déployée** les endpoints REST publics n8n réellement autorisés (`/api/v1/workflows`, `/api/v1/executions`), la pagination, les statuts et limites, les scopes de projet et le comportement 401/403/429/5xx. Le client serveur Atlas de PR02 est read-only et fail-closed; les quotas ne sont pas une preuve de permission.

**MCP instance-level** : ne pas confondre avec **MCP Server Trigger** (un workflow) ou **MCP Client Tool** (n8n client d'Atlas). Avant tout accès, enregistrer la version exacte n8n, le transport/handshake MCP réellement accepté, les outils annoncés et leurs annotations **sans** déduire une autorisation; chaque outil doit être rapproché du rôle utilisateur, du projet, du workflow et du grant Atlas.

**ALERTE IMPORTANTE détectée pendant PR10** : la politique **offline** actuelle de SHA-178 (`packages/engines/n8n/src/mcp-client.mjs`) fixe des planchers **2.12.0** pour plusieurs outils de construction. La documentation officielle n8n indique que la **construction/édition par MCP commence à la version 2.13.0**, tandis que la page produit n8n indique un support MCP général à partir de **2.18.3**. Les outils/flux sont sujets à changements par version : **ne pas promouvoir ni valider les capacités de PR07 à 2.12**, et rapprocher explicitement la matrice des résultats d'une vraie instance compatible avant levée du blocage. La disponibilité d'agents n8n séparés est une autre fonctionnalité distincte et en preview; ne pas inférer qu'un workflow = agent.

Références : [Configuration n8n MCP et limitations](https://docs.n8n.io/connect/connect-to-n8n-mcp-server/), [n8n MCP produit](https://n8n.io/mcp/), [outils MCP](https://docs.n8n.io/connect/connect-to-n8n-mcp-server/mcp-server-tools-reference/). Revalider les versions avant certification.

**Webhook/callback** : un trigger configuré et son ACK 202 n'attestent pas une exécution métier terminée. Le protocole HMAC de PR06 est propre à Atlas et **n'est pas une signature universelle native n8n**. Il faut réellement déployer un workflow/relay isolé produisant le HMAC, prouver horodatage/nonce, nonce atomique en base, version CAS, absence de nouveau dispatch après un timeout incertain, réception tardive et rejeu. Jamais une URL de webhook fournie librement par le navigateur.

**Risque Code/nodes** : audit n8n officiel via CLI `n8n audit` ou endpoint audit autorisé au propriétaire, sécurité des webhook triggers et des nœuds Execute Command/Code/HTTP, modules/code et runner isolé, limites de temps, volume et rétention. Définir denylist/allowlist et restrictions réseau ciblées, SSL/TLS et contrôle des secrets. La simple valeur `NODES_EXCLUDE` n'est pas une garantie exhaustive contre tout appel externe (les autres nœuds peuvent avoir de l'I/O). [Audit n8n](https://docs.n8n.io/hosting/securing/security-audit/).

**Licence — sans licence approuvée** : le [support officiel n8n](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case) indique qu'une édition ou construction de workflows par des **clients externes**, même via API, MCP ou IA, exige une licence commerciale. Le [produit OEM n8n](https://n8n.io/oem/) distingue l'éditeur embarqué côté client (OEM) et l'usage de n8n comme backend (autres conditions payantes). Les formulations commerciales disponibles varient selon le scénario : faire confirmer **par écrit** le cas ATLAS précis (création/édition par agent agissant pour un client, hébergement, prise en charge des comptes clients, intégration de canvas et tarification). Contacts officiels : `license@n8n.io` (interprétation SUL) ou `sales@n8n.io` (commercial). **Ne pas considérer la seule licence Community comme une permission de vendre le builder aux clients.**

## 4. Campagne sandbox requise — tests non réalisés

1. Création d'un environnement **n8n de test isolé** de la production Atlas et de toute infrastructure d'un autre projet, avec un utilisateur propriétaire et deux workspaces Atlas A/B sous deux sessions indépendantes; comptes supplémentaires reviewer et opérateur. Aucun secret prod dans le sandbox.
2. Réconcilier le commit GitHub, migration réelle, build Vercel READY de staging, version runtime de n8n et outils REST/MCP réellement visibles pour les personnes concernées. Noter date, capture expurgée, trace ID, auteur et sortie attendue/réelle de chaque test.
3. Lecture REST/MCP : seul workflow autorisé A visible depuis A, refus de B et utilisateur révoqué. Vérifier sortie minimalement projetée (pas de code/nodes/secrets), aucun outil MCP arbitraire.
4. Écriture sous approbation **indépendante** de l'acteur demandeur, validation d'une version et d'un hash d'intention immuable; déni du double-clic/replay de la même clé idempotence; worker réutilisé et transaction durable tracée, pas de mission fictive.
5. Test webhook sur un workflow sans effet commercial : signature HMAC valide, mauvaise clé, rotation, nonce rejoué, callback tardif et contradictoire; crash avant/après reçu, 2 workers simultanés, dead-letter et reprise avec recoupement de l'effet fournisseur.
6. Erreurs 401, 403, 429, 5xx, timeout après effet, réseau sortant refusé, certificat TLS refusé et DNS changeant (rebinding) : **pas de retry automatique si l'effet est inconnu**, révocation en course vérifiée et kill switch testé.
7. Audit sécurité n8n (nodes risqués, extensions, données d'exécution), gitleaks, quota/rétention, sauvegarde réelle puis **restore sur environnement jetable**. Confirmer les droits SQL avec les vrais rôles et RLS.
8. Écrire le GO/NO-GO signé pour **chaque périmètre**, avec risques résiduels, responsables et date d'expiration. Jamais de promotion prod par simple CI verte.

Les étapes ci-dessus sont un **protocole**, pas un journal de succès. Aucun E2E Auth à deux workspaces ni exécution webhook/MCP live n'a été attesté pendant cette PR. Tous les résultats supposés doivent rester `not-run` jusqu'à la collecte de preuves indépendantes.

## 5. Contrôles de sécurité et acceptation

- **CODE** : la PR #57 à PR09 doit être revue dans l'ordre, fusionnée puis CI main/preview relancée. Le HEAD Vercel prod doit correspondre à l'artefact effectivement autorisé, et non à un ancien SHA.
- **DONNÉES** : pas de backfill aveugle, pas de secret et de payload dans Supabase; RLS/grants intacts. La contrainte `atlas_n8n_runtime_offline_only` reste présente, et **toute levée de verrou exige migration nouvelle revue séparément**.
- **PRODUIT** : Chief sans SHA-119 reste briefing déterministe. Agents et Missions montrent seulement les données du registre RLS, pas de nom ni d'activité simulés. Pas de GO builder client sans licence écrite.
- **EXPLOITATION** : runbook `docs/runbooks/n8n-pr10-rollout-rollback.md`, monitor, alerte, dead-letter, sauvegarde/restore testés, responsables nommés, décision GO/NO-GO archivée.
- **QUALITÉ** : CI Node/typecheck/lint/build/SQL n'est qu'une preuve offline. Le test E2E sur navigateur connecté et le n8n test container/version réelle doivent être ajoutés dans une campagne distincte avant promotion.

**Référence de méthodologie** : [SHA-110](https://linear.app/shadoron/issue/SHA-110) staging/rollback et [SHA-133](https://linear.app/shadoron/issue/SHA-133) prévalidation. Le KMS externe différé par décision Founder **n'est pas à lui seul un blocage**, mais un secret serveur borné, la rotation et les approbations demeurent impératifs.

**Résumé des blocages :** travail de certification live non réalisés, sans sandbox n8n dédié, sans licence externe confirmée, sans E2E Auth fournisseur/worker, sans reviewer indépendant ayant attesté le résultat, sans décision signée. **NO-GO jusqu'à preuves et revue indépendante.**
