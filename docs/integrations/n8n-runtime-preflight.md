# SHA-176 — Verrou opérationnel n8n, preuve identité et worker commun (PR05)

**État** : PR en brouillon, migration SQL additive défensive sous tests. Ce document ne certifie **aucun** moteur n8n live, secret provisionné, agent, client MCP ou worker applicatif opérationnel.

## Les frontières existantes à réutiliser

L'Atlas Engine Hub comporte déjà :
- \`packages/engine-core/src/approval-workflow.mjs\` : demandes/revues par acteur session et intention, la validation doit se terminer par une approbation SQL persistée et non un booléen client.
- \`packages/engine-core/src/credential-lifecycle.mjs\` et \`vault.mjs\` : API injectée/crypto offline; KMS différé avec décision SHA-149.
- \`private.atlas_engine_approvals\`, \`private.atlas_engine_outbox\`, lease/fencing et audit : SQL appliqué sur le projet Atlas. Ils sont **liés à \`atlas_engine_runs\` et à une mission non nulle**.
- La branche Engine Hub de [PR54](https://github.com/DIALLO575/atlas-hq/pull/54) contient un **worker simulé testé** mais non fusionné, non déployé et sans identité SQL privée opérationnelle. [PR55](https://github.com/DIALLO575/atlas-hq/pull/55) a un contexte mission/agent simulé/SQL; elle reste non fusionnée. N'importer aucun code de ces PR avant revue/rebase; ne pas créer un second worker pour n8n.

**Écart structurel bloquant** : les exécutions automatiques n8n de SHA-175 ont \`mission_id\` facultatif. L'outbox Engine actuelle exige un \`atlas_engine_runs\` lié à une mission obligatoire. **Aucune insertion/dispatch vers cette outbox ne peut être prétendue possible pour une exécution autonome**. La future PR06 doit définir un pont dûment migré/testé, ou un chemin de run missionné explicite. Pas de mission fictive.

## Ce que PR05 implémente

1. \`n8nReleaseState\` et \`n8nReleasePermission\` dans les release gates Engine **communes**. Les trois modes I/O fournisseur read/write/execute retournent tous HTTP 423, quel que soit l'environnement; les lectures du registre Supabase Auth/RLS continuent de fonctionner séparément. MAUSBOT 423 inchangé.
2. \`createN8nRuntimePreflight\` (module Node server-only injecté, non relié à un endpoint) vérifie **une authentification serveur**, la session active en stockage, le rôle actuel, le lien espace/instance provider \`n8n\`, les workflows Atlas ↔ remote IDs, les grants de capacité issus d'un dépôt serveur et la fraîcheur \`observed\` des workflows visés par une future mutation. Les membres ne peuvent pas préparer write/execute. Refuse tous champs intrusifs : actor, approved, token, URL, tool ou transport choisi arbitrairement. **Même avec toutes les preuves mock fournies**, retourne \`canDispatch:false\`, \`canEnqueue:false\` et \`providerIoEnabled:false\`; aucune autorisation durable, ni approbation, ni idempotency DB n'est revendiquée.
3. La configuration API key de l'adaptateur REST existant devient non énumérable pour limiter les fuites accidentelles via \`JSON.stringify\` ou spread. Il reste IMPÉRATIF de ne jamais transmettre l'objet de configuration au navigateur ou à un journal de debug \`showHidden\`. Un processus Node compromis pourrait toujours le lire.
4. Nouvelle migration \`atlas_n8n_runtime_offline_gate\` : contrainte SQL \`engine_key <> 'n8n' OR connection_state='offline'\`. Ainsi un propriétaire du client *ou un service_role* ne peut pas activer n8n par modification accidentelle de l'état de l'instance. Une future **migration explicite** sera nécessaire avant toute connexion réelle, après approval/worker/egress/tenancy validés. Aucune contrainte MAUSBOT modifiée.

## Tests obligatoires

- Node : attaques sur forme input, sessions révoquées, mauvais workspace/engine/workflow, faux rôle ou grant, mauvais scope, clé idempotency/empreinte absentes, workflow désactivé ou non observé, aucun dispatch en cas de replay et absence de secret dans projections.
- PG17 isolé : ajouter migration après SHA-175, valider qu'un propriétaire **ou un worker service_role** ne peut passer n8n à \`read-only\` ou \`connected\`; vérifier que MAUSBOT suit les mêmes règles antérieures.
- Supabase officiel : **après CI positive et autorisation du propriétaire pour DDL prod**, appliquer uniquement la migration additive et vérifier la contrainte, l'historique, RLS des tables, 0 mutation des instances n8n et l'absence de nouvelle alerte de sécurité.
- CI complète : npm test/typecheck/lint/build, PG17, audit et Gitleaks.

## Gates restantes SHA-176/177

- Implémenter le vrai dépôt SQL privé qui vérifie \`auth.sessions\` avec identity/intent/grants; ce PR n'en fournit **pas** de runtime.
- Compiler un contrôle n8n version/entitlement/permissions par workflow à partir d'un fournisseur testé, egress DNS-rebinding-safe et isolation sandbox multi-workspace.
- Brancher le secret minimal serveur, la rotation/révocation fournisseur et gestion des 401/403; **aucun vrai token n8n provisionné aujourd'hui**.
- Relier à la **même** file durable Atlas après réconciliation du modèle autonome et approbation humaine immuable. Le worker simulé PR54 n'est pas un service opérationnel.
- E2E de deux acteurs et deux tenants, reviewer différent, session révoquée en course, SIGKILL, retry/replay et kill switch en staging. Maintenir absence d'effet extérieur après timeout inconnu.

**Dépendances** : [SHA-149](https://linear.app/shadoron/issue/SHA-149), [SHA-150](https://linear.app/shadoron/issue/SHA-150), [SHA-151](https://linear.app/shadoron/issue/SHA-151), [SHA-132](https://linear.app/shadoron/issue/SHA-132). Aucune promotion automatique de n8n suite à la seule migration SQL.
