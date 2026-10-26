# Journal — tranche backend, migration NON appliquée

Base exacte : 7bb3bfcb08d587cd4d4ce636626703ed58750b2e. Branche locale feat/journal-fullscreen-reading. Aucune PR distincte, aucun push, merge, déploiement, accès Browser ou appel à une base réelle. Brief /srv/shadoron/docs/brief-atlas-journal-design-lecture-tony.md lu intégralement.

## Contrat pour la tranche UI

POST /api/engines/mausbot/journal/progress (application/json, 8192 octets maximum) :

```json
{"workspaceId":"11111111-1111-4111-8111-111111111111","batchId":"22222222-2222-4222-8222-222222222222","events":[{"editionId":"edition-1","itemId":"item-1","deltaSeconds":30,"position":0.25}]}
```

1..20 éléments distincts, delta entier 0..120, somme du lot <=120, position 0..1 à deux décimales. Identifiant de lot UUID stable conservé dans la file hors-ligne et réutilisé tel quel au retry. Ne jamais réutiliser batchId pour d'autres mesures. Pas d'identité utilisateur, date client, article, URL ou métadonnées appareil acceptés. Canonisation des événements; contrôle requireJournalOwner puis RPC avec le client de session. Ne pas envoyer si le lecteur ne satisfait pas les règles d'activité du brief (tracker hors de cette tranche).

GET /api/engines/mausbot/journal/summary?workspaceId=UUID : requireJournalOwner, résumé courant des dernières éditions MORGANS + grok-bot (max 40 items chacune), non-lus, lus/total/%, répartition des comptes par catégorie/producteur, secondes/minutes aujourd'hui et sept jours UTC inclusifs. Les temps portent sur toutes les éditions lues durant la fenêtre, pas seulement les éditions courantes. Le plafond de 10000 lignes de sessions est explicite : au-delà erreur, jamais total tronqué présenté comme complet.

Migration absente : POST 503 JOURNAL_PROGRESS_MIGRATION_REQUIRED; GET summary conserve les comptes/statuts mais progressAvailable=false, temps=null et warning explicite. Autres erreurs refusées, non masquées comme une absence de migration. Route statut existante inchangée. GET journal expose secondsRead, lastPosition et firstReadAt quand présents, utilise select('*') pour rester compatible avant migration. Correction de la clé de jointure des états : JSON.stringify([edition_id,item_id]), comme journalItemKey, au lieu de la concaténation avec deux-points.

## SQL proposé, jamais exécuté ici

Migration 20261026070000_atlas_journal_reading_progress.sql : seule table existante altérée = feed_item_state. Ajouts first_read_at, seconds_read (plafond cumulé 86400/item), last_position. Nouvelles tables : sessions journalières et reçus de lots journal_progress_batches. RLS sur les deux; SELECT sessions limité à propriétaire du workspace + user_id auth. Aucun droit client d'écriture sur compteurs/sessions/reçus. Les droits de colonnes préservent l'upsert de statut existant.

RPC SECURITY DEFINER volontaire pour écrire atomiquement dans le ledger privé sans offrir un accès DML au client. search_path vide, auth.uid obligatoire, membership owner verrouillée FOR SHARE, item vérifié dans le workspace, validation SQL indépendante stricte, EXECUTE seulement authenticated. Aucun paramètre user_id. Fonction publique avec contrôle explicite (ne pas supposer que RLS s'applique au definer). Les policies feed sont réécrites avec (select auth.uid()) et WITH CHECK owner complet.

Clé du reçu = user/workspace/batch UUID. INSERT ON CONFLICT sérialise les retries concurrents; contenu canonique différent => erreur 22023, aucun ajout. Reçu et compteurs partagent une transaction, donc rollback ensemble en cas d'échec. Ordre stable edition/item pour les verrous de lignes entre lots chevauchants. L'addition des sessions utilise le delta réellement admis sous le plafond cumulé; status done conservé, new devient read. La position est celle du dernier lot traité; pas de séquence appareil ni ordre événementiel cross-device dans cette tranche. Un ancien lot distinct rejoué tard peut déplacer la position en arrière. Jour = réception serveur UTC : un lot hors-ligne reçu le lendemain compte ce lendemain.

Les reçus ne sont pas purgés automatiquement : une purge casserait la déduplication des anciens retries. La limite de 120s borne une requête, pas le débit d'un client qui inventerait de nouveaux UUID. Un rate-limit/quotas/retention négociée et des tests adverses restent nécessaires avant exposition étendue. L'appartenance/identité et les bornes ne prouvent pas que l'utilisateur a réellement lu.

Rollback dans supabase/rollbacks/ : livré comme script séparé NON appliqué (hors dossier migrations pour éviter application automatique). Supprime fonction/tables/colonnes nouvelles et restitue exactement les policies d'origine; perte des temps et reçus, files de progression à vider. Les statuts existants sont conservés. Le SQL échoue si les nouveaux objets existent déjà : ne pas masquer une divergence de schéma avec IF NOT EXISTS. CLI Supabase absent : fichier versionné manuellement, aucune installation.

## Contrôles réellement exécutés

- node --test tests/journal-progress.test.mjs tests/journal-quality.test.mjs tests/mausbot-journal.test.mjs : 21/21, dont 7 nouveaux tests. Validateur, agrégats, ranking, service RPC simulé, summary simulé (scopes et migration absente), contrat de routes lu statiquement. Les mocks ne prouvent pas l'exécution SQL ou des requêtes HTTP réelles.
- Tentative initiale incluant tests/journal-reader.test.mjs : impossible à charger car paquet typescript absent. Non corrigé en installant des dépendances.
- npm run typecheck : tsc introuvable. npm run lint : eslint introuvable. Aucun build VPS.
- git diff --check : OK.
- Ni psql ni supabase CLI installés : migration/rollback, RLS, privilèges, conflits concurrentiels SQL et compatibilité effective de l'upsert ne sont PAS testés en PostgreSQL. Aucun test SQL réel, CI ou déploiement revendiqué.

Avant application : tests PostgreSQL jetables owner/non-owner/anon, nouveau/rejeu/rejeu divergent simultané, lots chevauchants, erreur au milieu => rollback total, plafonds, préservation done et first_read_at, upsert statut avec GRANT colonnes, rollback complet. Faire vérifier SECURITY DEFINER et privilèges par revue. SHADORON applique seulement après revue et OK Paul.

## Sources officielles consultées

- https://supabase.com/changelog.md (lu via curl après refus content-type par outil web; changements pertinents : expositions API/grants et PostgreSQL).
- https://supabase.com/docs/guides/database/postgres/row-level-security (auth.uid, policies et droits distincts).
- https://supabase.com/docs/guides/database/functions (invoker/definer, search_path et EXECUTE).

Aucun producteur, ingestion, relais journal-publish, schéma v1 ou table éditions/items/audit/checks modifié. Les tables éditions/items sont uniquement lues pour summary/vérification d'identifiants. Aucun nouveau secret ou coût.
