# SHA-177 / PR06 — Webhook n8n, HMAC, reçus et état d'exécution (sandbox offline)

## État véritable

La PR prépare un **protocole applicatif Atlas** pour les callbacks n8n. Aucune instance réelle n8n, URL de webhook, clé HMAC, activation de l'API, Webhook Trigger, Wait/resume, worker actif ni fonctionnalité navigateur n'est livrée. La preuve sandbox E2E attendue par SHA-177 n'est PAS atteinte. \`n8nReleasePermission\` de SHA-176 reste HTTP 423 pour read/write/execute fournisseur, MAUSBOT inchangé. La PR demeure DRAFT.

La documentation du **Webhook Trigger** n8n permet la configuration de l'authentification côté workflow; **n8n ne signe pas universellement tous ses callbacks avec l'HMAC Atlas**. Pour produire un callback compatible, un workflow/relay **explicitement déployé et autorisé** devra préparer l'enveloppe, la signer côté serveur avec un secret propre à l'instance, puis appeler un futur BFF Atlas protégé. Aucun simple ACK n'est une preuve d'exécution complète.

### Chemin prévu (non branché)

\`Atlas authenticated request → validated workspace/instance/workflow → exact immutable intent + independent approval → SAME existing Atlas durable outbox → provider-owned preconfigured webhook path → n8n (202 ACK) → signed callback / polling REST → private receipts + execution CAS → status Atlas\`.

Dans la PR, seuls les deux planificateurs offline existent. Aucune URL fournisseur ne vient du client; aucun retry réseau n'est autorisé par une réponse 202, 5xx, 429 ou un timeout incertain. Un timeout peut survenir **après** l'effet métier; ne jamais réexécuter automatiquement. Une future réconciliation REST \`includeData=false\` devra vérifier le workflow et l'exécution contre le registre et les droits.

## Format versionné ATLAS de callback

Protocole exact **proposé** (pas un protocole natif universel n8n) :
- Corps JSON \`{version:1,workspaceId,instanceId,executionId,remoteExecutionId,status,occurredAt}\` ; champs supplémentaires interdits. Payload, node results, secrets, tokens et URLs refusés. Max 4096 octets.
- En-têtes à mapper dans le futur BFF : \`X-Atlas-Timestamp\` (Unix secondes), \`X-Atlas-Nonce\` (alphanum + tirets/underscore 24–96 caractères), \`X-Atlas-Key-Id\` (identifiant de clé non secret), \`X-Atlas-Signature\` (SHA-256 HMAC en hex). **Les doublons d'en-têtes et formats ambigus seront rejetés au niveau HTTP avant extraction.**
- Chaîne à signer : \`atlas-n8n-callback-v1\\n{timestamp}\\n{nonce}\\n{keyId}\\n{sha256(raw_bytes)}\`. Signature par HMAC-SHA256 avec **secret de 32 octets minimum**, comparaison constante. Horodatage dans ±300 secondes de l'heure serveur.
- Le client de validation reçoit uniquement la clé serveur déjà résolue pour la paire workspace/instance et \`keyId\`. Son \`verifiedMac:true\` signifie uniquement que le MAC sur les octets est valide; **ce n'est pas une autorisation de modifier un statut**. Une rotation peut provisionner un nouvel ID de clé; le traitement des clés précédentes et la fenêtre d'acceptation nécessitent un vrai credential store, non inclus.
- Le résultat du vérificateur est strictement limité aux métadonnées, avec \`canPersist:false\`, \`canApply:false\`, \`canDispatch:false\`.

## Base Supabase et idempotence

Migration SQL additionnelle \`atlas_n8n_callback_receipts\` : \`event_version\` non négative sur les exécutions n8n, contrainte unique composite \`(workspace_id,instance_id,id)\`, table privée \`private.atlas_automation_callback_receipts\` dont la clé unique \`(workspace_id,instance_id,nonce)\` empêche les doublons **dans une transaction**. FK composite vérifiant que toute receipt appartient à la même instance/workspace que l'exécution. RLS ON, aucun grant \`anon\` / \`authenticated\`, seuls \`service_role\` SELECT/INSERT, aucune réponse brute persistée. La table des receipts est distincte car \`private.atlas_engine_event_receipts\` impose un run Atlas avec mission; **pas de second worker**.

Le module de transition pure distingue \`propose\`, \`duplicate-state\`, \`late-event\`, \`terminal-conflict\`; il ne modifie jamais Supabase. L'implémentation future doit, **dans une transaction unique avec SERIALIZATION appropriée** : revalider droits/instance/revocation/source signée, insérer le nonce ou reconnaître le doublon (unique), verrouiller execution/workspace/instance/remote ID, appliquer un \`UPDATE ... WHERE event_version=<expected>\`, enregistrer audit, rollback si course, et ne jamais effectuer un effet fournisseur à nouveau pour dédupliquer un callback.

Les tests PostgreSQL 17 jetables couvrent doublon dans un tenant, même nonce dans deux tenants, FK cross-tenant, refus lecture/écriture client, CAS stale/initial; le code Node teste HMAC, durée, rotation négative, signature altérée, payload illégal, ordre d'événements, timeout après effet et blocage release.

## Points de contrôle avant le premier véritable webhook

SHA-176 garde n8n SQL offline même pour service_role : le futur connecteur devra faire l'objet d'une nouvelle migration explicite pour lever la contrainte après tests Auth réels et worker commun validé. Aucune URL brute, nonce, clé, jeton ni payload privé n'est loggué; un agent MCP ne peut pas contourner approval ou idempotence. Ne pas créer de backend d'exécution n8n parallèle à \`packages/engine-core/src/outbox-worker.mjs\` de PR54 (non fusionné).

L'E2E sandbox réel requis par SHA-177 (n8n Webhook Trigger, Wait/resume, 202, callback, worker simultané, permission révoquée, rotation des clés) reste **à réaliser** après autorisation et infrastructure. Les tables privées elles-mêmes ne suffisent pas à garantir exactement une fois l'effet externe; un timeout externe est intrinsèquement ambigu sans preuve/réconciliation.

Docs à vérifier sur l'instance de sandbox : https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/ et https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/ .
