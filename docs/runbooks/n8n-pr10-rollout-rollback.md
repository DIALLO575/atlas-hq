# ATLAS / n8n — Runbook de qualification, incident et rollback (PR10)

**Statut : préparation uniquement. NO-GO production.** Aucune action automatisée par ce fichier. Opérations à réaliser par un opérateur habilité, sur une sandbox isolée, avec accès à la checklist de sécurité et à l'historique d'audit. **Ne jamais supprimer** une table, une clé, un reçu ou un événement d'audit pour simuler un rollback réussi.

## Phase 0 — Préflight (lecture sans effet)

- Vérifier branche et commit révisés; lire SHA GitHub du commit exact de PR10, HEAD de `main`, état des GitHub Actions et différences des PR empilées.
- Vérifier déploiement Vercel **READY** de l'environnement voulu et son `githubCommitSha`; distinguer production et preview. Ne jamais confondre `npm run build` vert avec une release.
- Supabase : inspecter migrations, RLS/grants et vérifier la contrainte `atlas_n8n_runtime_offline_only` en prod. Toutes les écritures effectuées via service_role nécessitent une justification spécifique; aucune clé service_role ne sort du serveur. Sauvegarde horodatée et restore testés sur DB jetable.
- n8n : isoler le sandbox, figer sa version, son empreinte de conteneur, TLS HTTPS, DNS/egress, restrictions nodes et quotas; provisionner un utilisateur/reviewer de test distinct, jetons serveur **non journalisés** et jeu de workflows sans données réelles.
- Vérifier la licence selon l'usage : backend interne, SaaS client déclenchant seulement des workflows internes, clients pouvant créer/éditer via une interface ou un agent, éditeur OEM intégré. Consigner la réponse écrite de n8n.
- Identifier le propriétaire décisionnel et un reviewer indépendant; valider la date d'expiration des preuves. Sans l'un de ces prérequis : STOP/NO-GO.

## Phase 1 — Qualification sandbox

- Auth : deux workspaces, compte membre/admin/owner, reviewer indépendant, jeton expiré, session révoquée et changement de rôle pendant l'opération. Prouver 401/403 et aucune fuite multi-tenant.
- REST : GET workflow/execution à partir du seul réseau autorisé, pagination correcte, pas de nodes secrets ni raw data; 404/401/403/429/5xx simulés. Vérifier que l'ancien token après rotation échoue.
- MCP : handshake réellement négocié avec une version n8n **certifiée**, outils listés seulement après authentification; refuser tool inconnu, `test_workflow` traité comme execute, create/update/publish sous approbation. Résoudre le plancher PR07 2.12 contre la documentation officielle 2.13/2.18.3 avant tests.
- Webhook : URL interne allowlistée et workflow de test sans effet, HMAC sur octets, timestamp et nonce, clé tournée puis révoquée, replay, callback tardif, double callback contradictoire et version CAS. Un HTTP 202 ne certifie pas une exécution finie.
- Outbox : deux workers concurrents, lease/fencing, redémarrage, **SIGKILL**, dead-letter et reprise. En particulier, **timeout après effet** côté fournisseur : aucun replay aveugle; état inconnu ⇒ réconciliation contrôlée avant nouvelle action.
- Audit : trace intention/acteur/reviewer/tenant/version/reçu/transition, jamais bearer token, HMAC secret ni payload sensible, bornes de logs et rétention. Mesurer latence, disponibilité, erreur et volume.
- Sauvegarde : exporter métadonnées selon plan sécurisé et effectuer **restore sur base jetable**; vérifier intégrité/contraintes/RLS, avec l'instance source inchangée.

## Phase 2 — GO/NO-GO formel

Chaque scénario doit avoir un case ID, opérateur, date, source Git/DB/Vercel/runtime, entrée expurgée, sortie observée et lien de preuve; remplir une colonne PASS/FAIL/NOT_RUN. **Une case NOT_RUN ou FAIL pour un contrôle bloquant = NO-GO.**

- **GO sandbox** : seulement avec connexion n8n dédiée, tous les tests précédents PASS et rollback prouvé. Il n'accorde pas le droit de vendre un éditeur.
- **GO SaaS builder** : GO sandbox + clearance commerciale **écrite** + permissions clients/agents auditables + revue sécurité du champ de l'éditeur.
- **GO production** : GO périmètre spécifique + même artefact certifié, preuve Vercel READY ciblée, migration/fingerprint, alerting, on-call et accord explicite du propriétaire. Promotion prod = opération distincte; jamais déclenchée par PR10.

## Phase 3 — Incident et rollback

1. **Kill switch logique** : arrêter les nouvelles demandes au BFF/outbox autorisé et isoler l'egress vers n8n; conserver l'accès en lecture et l'audit pour la réconciliation. L'actuel gate SQL `atlas_n8n_runtime_offline_only` empêche déjà la connexion; NE PAS le lever comme raccourci.
2. **Suspendre le dispatcher** sans confirmer fictivement les jobs; préserver outbox, receipts HMAC, verrou/fencing, statuts inconnus et journaux append-only. Aucun retry automatique sur un timeout après effet.
3. **Révoquer/rotater** les secrets serveur ou les grants si fuite, invalider sessions machine/acteur, fermer le réseau, vérifier permissions des workspaces. Journaliser l'ID du secret (pas sa valeur).
4. **Vercel** : comparer le dernier commit certifié et la cible READY; si une release a effectivement été faite, restaurer **l'artefact de production précédemment validé** selon la procédure Vercel approuvée avec utilisateur habilité. Un rollback de code ne rollback pas la base ni les effets distants.
5. **Supabase** : conserver migration history et tables de métadonnées/reçus; rollback SQL uniquement via une **nouvelle migration de compensation** évaluée, testée hors prod et appliquée avec contrôle des données. **Ne jamais supprimer** les historiques, receipts et tableaux de bord pour cacher un état partiellement exécuté.
6. **n8n fournisseur** : si un workflow de test a des effets métier, rechercher l'exécution par son ID distant et réconcilier; désactiver uniquement les triggers identifiés pour ce périmètre, pas tout un n8n partagé.
7. **Validation post-incident** : vérifier qu'aucune nouvelle commande ne passe, que la lecture RLS existe, que les receipts/versions restent intacts, que les workers ne font aucun replay, puis incident review et nouvelle décision GO/NO-GO.

**Anti-pièges** : ne pas exposer service_role, ne pas supposer que 429/5xx est sans effet, ne pas donner des credentials n8n à un agent, ne pas restaurer depuis une sauvegarde non testée, ne pas déployer la version branch PR10 sur Vercel production à la place d'un environnement de test.

Exigences de preuve : logs expurgés, checks GitHub/Vercel, sortie de test Auth/RLS deux tenants, chaos SIGKILL et replay, restore réel, décision licence, reviewer externe. Tant que ces preuves manquent : **NO-GO**.
