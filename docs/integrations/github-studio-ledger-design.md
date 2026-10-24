# GitHub Studio — journal durable et idempotence (proposition M0.2)

**Document de conception, pas une migration exécutée.** Le SQL de discussion est dans `docs/integrations/github-studio-ledger-proposal.sql`.

## Objectifs
Une intention `repository.create` possède un UUID d'idempotence, le contexte acteur/workspace/installation et une empreinte SHA-256 des paramètres normalisés. Le serveur doit enregistrer et verrouiller l'intention *avant* le POST GitHub. Ce composant ne doit jamais créer deux dépôts à cause d'un double clic, d'un retry automatique ou d'un timeout du fournisseur.

## Transitions proposées
`prepared → dispatching → provider_confirmed → succeeded`
- En cas de réponse GitHub perdue ou incohérente : `dispatching → reconciliation_required`.
- Si le dépôt existe mais reste inaccessible à l'installation : `provider_confirmed → reconciliation_required`.
- `reconciliation_required → succeeded` uniquement après vérification explicite du dépôt GitHub et liaison autorisée au workspace.
- Échec sûr possible **avant** dispatch depuis `prepared → failed`; après dispatch on ne rejoue pas le POST et on ne déclare jamais un échec définitif simplement après un timeout.

## Opération serveur future
1. Contrôle Supabase `auth.getUser`, rôle owner/admin courant, session valide, Origin, installation vérifiée côté serveur et permission GitHub effective.
2. Enregistrer `(workspace_id, actor_id, idempotency_key, digest)` dans une transaction et garder une seule opération active; une même clé avec digest différent retourne `409`.
3. Transition atomique en DB `prepared → dispatching` avec CAS et audit append-only; seul gagnant peut envoyer un POST GitHub.
4. Appel fournisseur et retour d'identifiants confirmés **sans secrets**. Si réponse incertaine: conserver `reconciliation_required` et enquêter, sans nouvelle création.
5. Interroger les autorisations GitHub réelles et l'ID numérique du dépôt après création. Pour une installation `selected`, ne pas croire que le nouveau dépôt est autorisé tant qu'il n'est pas visible et lié côté serveur.
6. Transaction DB pour marquer lien autorisé et statut `succeeded` puis réponse UI. Réconciliation idempotente, jamais suppression automatique pour compenser un échec DB.

## Contraintes
- Ne pas s'appuyer sur des INSERT/UPDATE `service_role` client; only server.
- Preuves Supabase PostgreSQL jetable, CAS concurrent, RLS cross-workspace, invitation/revocation et audits avant toute migration officielle.
- GitHub Studio reste **preview-only** à ce stade. Ne pas exposer route execute en attendant le GO.
- S'appuyer sur [SHA-154](https://linear.app/shadoron/issue/SHA-154), [SHA-155](https://linear.app/shadoron/issue/SHA-155) et [SHA-162](https://linear.app/shadoron/issue/SHA-162).
