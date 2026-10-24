# SHA-150 — Inbox des approbations ATLAS

## Livré le 24 octobre 2026

L'Inbox de consultation `/engines/approvals`, son API GET
`/api/engines/approvals?workspaceId=...` et les migrations Supabase
`20261024193128` et `20261024193537` sont codées et appliquées.
**Aucune approbation ou exécution n'est encore possible depuis l'UI.**

La RPC retourne au maximum 50 métadonnées : run_id, instance_id,
mission_id, primitive_id, intent_digest, requested_at, expires_at.
Elle exige auth.uid(), une session existante dans auth.sessions et
non expirée, le rôle owner/admin ACTUEL dans workspace_members,
le même workspace, une demande pending non expirée et un reviewer
différent du demandeur. Le BFF vérifie la session via auth.getUser()
avant d'appeler la fonction SQL. Le contenu des prompts, tokens et
payloads n'est jamais renvoyé.

**Isolation des privilèges :** la RPC `public.atlas_engine_pending_approvals`
est SECURITY INVOKER. La fonction `private.atlas_engine_pending_approvals_internal`
est SECURITY DEFINER, confinée à un schéma non exposé au Data API,
sans SQL dynamique, avec search_path vide et contrôles d'identité
à chaque appel. Le rôle anon ne peut appeler aucune de ces fonctions
et authenticated ne peut pas lire la table private des approbations.
La correction de séparation a supprimé l'avertissement du conseiller
Supabase sur la fonction publique avec privilèges élevés.

**Vérification :** PostgreSQL 17 jetable teste deux tenants, rôle
retiré, session expirée/supprimée/absente, JWT malformé, anti-self-review,
grants et absence d'élévation dans la fonction publique. Supabase connecté
confirme 0 instance, 0 run, 0 approbation, les cinq migrations, permissions
correctes et aucun résultat sans session.

## Reste avant SHA-150 Done

Le contrat offline `packages/engine-core/src/approval-workflow.mjs`
ne dispose toujours pas de pilote SQL privé transactionnel permettant
de demander, approuver ou rejeter. Il faut ajouter la preuve de session
et les verrous au moment de la décision, l'Inbox interactive reviewer,
CSRF, audit, E2E Supabase Auth réel et tests de concurrence.
SHA-149 KMS et SHA-151 worker sont encore requis.

**MAUSBOT write/execute reste hard-blocked (HTTP 423).** Le merge de
code ou l'application de SQL n'est pas un déploiement Web confirmé.
