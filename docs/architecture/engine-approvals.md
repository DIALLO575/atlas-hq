# SHA-150 — Décisions humaines d'approbation ATLAS

## État au 24 octobre 2026

Une Inbox avec boutons **Approuver / Refuser**, API Next.js et RPC
transactionnelle est développée. La migration `20261024200020`
est réellement appliquée au Supabase ATLAS et versionnée en GitHub.
Le test CI PostgreSQL 17 vérifie le parcours, mais **aucun test E2E
avec un vrai compte reviewer Supabase Auth et une demande réelle**
n'est encore validé. Aucun runtime MAUSBOT n'est connecté.

Les six migrations Engines sont déjà appliquées :
- `20261024161305` fondation RLS,
- `20261024163943` chiffrement et version des clés outbox,
- `20261024182928` empreintes d'intention run/approval immuables,
- `20261024193128` Inbox de lecture et session active,
- `20261024193537` RPC publique SECURITY INVOKER, SQL privé SECURITY DEFINER,
- `20261024200020` décision humaine atomique et audit.

## Processus de décision

L'administrateur authentifié voit uniquement les demandes d'un
workspace dont il possède actuellement les droits owner/admin.
L'Inbox présente run, mission, primitive et empreinte SHA-256 exacte.
Les boutons demandent une confirmation explicite.

`POST /api/engines/approvals` accepte exactement workspaceId,
runId, intentDigest et decision, dans un petit JSON. Il exige une
origine identique au site, le cookie de session Supabase Auth, la
vérification de l'appartenance admin/owner au workspace, puis appelle
`public.atlas_engine_decide_approval` via le client utilisateur.
Aucun token KMS, accès service_role ou identité d'approbateur ne peut
être fourni dans le corps de la demande. Les erreurs SQL privées
sont masquées au navigateur.

La RPC publique est SECURITY INVOKER ; la fonction privée SECURITY
DEFINER (non exposée au Data API) revérifie :
- `auth.uid()` et `auth.jwt().session_id`, session présente
  dans `auth.sessions` et non expirée ;
- droit owner/admin **actuel** et différent du demandeur ;
- même workspace, run et mission, état run éligible, demande
  pending, expiration future ;
- correspondance exacte de l'empreinte SHA-256 run/mission/
  primitive/payload approuvée ;
- verrouillage des lignes session et membership `FOR SHARE`,
  et approbation/run `FOR UPDATE`, avant transition unique.

L'UPDATE de décision et l'INSERT append-only d'audit se font
dans la **même transaction PostgreSQL**. Si le journal échoue,
la décision est annulée. Une deuxième décision est refusée.
Les réponses SQL et Next indiquent toujours `canDispatch:false`.
**Aucune opération outbox, aucun appel MAUSBOT, aucun run autorisé
par cette seule décision.**

## Vérification et limites

Sur PostgreSQL 17 jetable, CI vérifie les refus cross-tenant,
self-review, session expirée/malformée, rôle admin retiré,
empreinte incorrecte, deuxième décision, audit inaccessible
(rollback), décisions approve/reject, aucune nouvelle
outbox, aucune RPC publique privilégiée, aucun accès client
aux tables private.

Sur Supabase connecté : six migrations en historique,
fonction publique invoker + privée definer, grants vérifiés,
0 moteur, 0 run, 0 approbation, 0 élément outbox, 0 audit.
Le conseiller de sécurité ne signale pas de nouvelle RPC
privilégiée exposée. L'accès aux tables private reste deny.

**Reste pour SHA-150 Done :** vérifier de bout en bout un
demandeur et un reviewer Supabase Auth réels en environnement
de staging (sans moteur), vérifier l'UI déployée et les sessions
révoquées en conditions réelles, compléter les tests de
simultanéité multi-processus et un flux contrôlé de création
de demandes. SHA-149 coffre KMS et SHA-151 worker ne sont
pas achevés. MAUSBOT reste hard-blocked HTTP 423.
