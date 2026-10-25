# SHA-175 — registre n8n workflows/exécutions : schéma et lecture (PR04)

**Périmètre** : schéma additif sur le projet officiel ATLAS Supabase, route GET Atlas et planificateur hors ligne. **Pas de connexion fournisseur, de synchroniseur actif, de payload ni d'exécution.**

## Deux tables

- \`public.atlas_automation_workflows\` : identité Atlas UUID, workspace/instance n8n, \`remote_workflow_id\` n8n opaque, nom borné, état distant nullable, horodatages et état de synchronisation \`unverified/observed/missing\`. La base refuse toute association à une instance autre que \`engine_key='n8n'\` avec une FK composite et un index unique additionnel sur le registre Engine. Un même ID distant peut exister dans deux tenants distincts, sans confusion.
- \`public.atlas_automation_executions\` : identité, workflow Atlas et instance associés **dans le même workspace**, ID distant, statut, horodatages et **mission facultative**. \`atlas_engine_runs.mission_id\` reste NOT NULL. Les nouvelles exécutions n'activent aucun worker ni automatisation.
- Chaque table a RLS activée, \`SELECT\` seulement pour \`authenticated\` via \`private.is_workspace_member(workspace_id)\`. \`anon\` n'a aucun grant; \`authenticated\` n'a aucun INSERT/UPDATE/DELETE. Seul \`service_role\` a les mutations possibles sur ces métadonnées. Les tables sont dans \`public\`, pas dans \`private\`, mais ne contiennent ni credentials, ni nodes, ni execution raw data.
- Idempotence structurelle via contrainte \`unique(workspace_id,instance_id,remote_workflow_id)\` et \`unique(workspace_id,instance_id,remote_execution_id)\`. Le worker futur utilisera un upsert autorisé uniquement si l'identité et la source sont vérifiées; aucune supposition de capacité live.

## API accessible depuis Mes Apps

\`GET /api/apps/n8n/workflows?workspaceId=<UUID>[&instanceId=<UUID>]\` : vérification Supabase Auth + membership avec le contrôle commun \`requireEngineWorkspace\`; sélection de 50 métadonnées maximum du workspace, filtre d'instance facultatif validé contre \`atlas_engine_instances\` avec \`engine_key='n8n'\`. Réponse toujours \`providerConnected:false\`, \`liveSyncEnabled:false\`; aucune lecture réseau n8n. \`source=atlas-registry\` décrit ce que le lecteur voit effectivement. Le contrôle BFF complète et ne remplace pas RLS.

La fonction \`planN8nWorkflowSync\` projette une page de métadonnées du client read-only PR02 en **draft non persistable**, rejette credentials/nœuds/champs arbitraires, doublons et ID corrompus, ne conclut jamais à la suppression de workflows pour une page partielle. Elle n'insère rien en base. Une synchronisation **réellement persistée** demandera un worker privé, des états de pagination exhaustifs, une identité provider vérifiée, la sécurité egress et des règles tenant. C'est un prochain changement distinct.

## Validation et mise en production SQL

- Nouvelle migration versionnée \`supabase/migrations/20261025114500_atlas_n8n_automation_registry.sql\`, uniquement additive : crée deux tables, un index sur les instances, des indexes métier, contraintes et policies RLS.
- CI \`n8n-automation-postgres\` exécute la migration en PostgreSQL 17 jetable avec \`tests/sql/engine-foundation-fixture.sql\` et \`tests/sql/n8n-automation-registry-checks.sql\` : deux tenants, IDs distants identiques, mauvais provider, FK composite, grants, lecture RLS, refus écriture, missions facultatives.
- Ne jamais exécuter les **tests fixtures** sur le projet réel. Pour la base réelle : examiner historique et préconditions, appliquer uniquement le texte de migration SQL via \`apply_migration\`, puis vérifier tables/RLS/grants/0 ligne et conseillers sécurité. Si une version différente est générée par Supabase, synchroniser le nom du fichier GitHub avec l'historique de la base avant merge.
- Pas de modification des credentials ou outbox, pas de connexion n8n, pas de déploiement Next.js et pas de backfill. Le SQL en prod ne publie **pas** automatiquement la UI des PR #57-59.

## Dépendances et suite

PR01 [SHA-172](https://linear.app/shadoron/issue/SHA-172), PR02 [SHA-173](https://linear.app/shadoron/issue/SHA-173), PR03 [SHA-174](https://linear.app/shadoron/issue/SHA-174); suivis de [SHA-176](https://linear.app/shadoron/issue/SHA-176) et [SHA-177](https://linear.app/shadoron/issue/SHA-177) pour l'identité/workers/webhooks. Les PR restent empilées et brouillon tant que la chaîne n'est pas revue et fusionnée.
