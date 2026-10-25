# Journal du matin (WORLD RADAR) — ATLAS HQ

Statut : **PR brouillon, rien d'appliqué ni de déployé.** Migrations non appliquées, aucun workflow n8n créé.

## Architecture (décision de Paul)
```
MausBot (MORGANS & équipe)  ──POST + secret d'en-tête──►  n8n (contrôleur)  ──service role──►  Supabase
  tri, thèmes, dédoublonnage,                              valide le contrat v1,             journal_editions / journal_items
  image réelle ou illustration                             upsert idempotent, upload image    bucket privé journal-covers
                                                                                                   │ RLS owner-only (lecture)
                                                                         ATLAS /journal ◄──────────┘ + URL signées côté serveur
                                                                         (lit, affiche, état lu/terminé → feed_item_state)
```
- **MausBot** fait toute l'intelligence. **n8n** est le seul écrivain (rôle service). **ATLAS** ne fait que lire et afficher,
  et n'écrit que l'état de lecture du propriétaire (`feed_item_state`). ATLAS n'appelle pas MausBot pour le journal.
- **Futur :** Grok Bot pourra remplacer MORGANS comme producteur en postant le même contrat au même webhook
  (`"producer": "grok-bot"`). n8n reste le contrôleur ; rien ne change côté ATLAS (l'en-tête affiche « Grok Bot »).

## Contrat v1 (unique)
Fichier source de vérité : `packages/engines/mausbot/schema/journal-edition.v1.schema.json` (JSON Schema 2020-12,
`additionalProperties: false` partout). Validateur JS équivalent : `validateJournalEdition()` dans
`packages/engines/mausbot/src/journal.mjs` (utilisable dans un nœud Code n8n ; un test vérifie que les deux restent alignés).
```json
{"schema_version":"1","edition_id":"2026-10-25_matin","generated_at":"2026-10-25T13:30:00Z","producer":"morgans",
 "items":[{"id":"ia-1","topic":"ia","title":"…","summary":"…","why_it_matters":"…",
   "certainty":"elevee","status":"confirme","source_url":"https://…","source_name":"Le Monde",
   "extra_sources":[{"url":"https://…","name":"…"}],"published_at":"2026-10-25T08:00:00Z","author_bot":"Turing",
   "cover":{"storage_path":"2026-10-25_matin/ia-1.webp","generated":false,"alt":"…","credit":"AFP","source_name":"Le Monde"}}]}
```
- `topic` ∈ ia, commerce, guinee, afrique, monde, geopolitique, economie, tech → affiché en 6 catégories.
- `certainty` ∈ elevee, moyenne, faible · `status` ∈ confirme, rapporte, a_verifier · 1 à 200 items, ids uniques.
- `cover` requis : objet ou `null`. `storage_path` = `<dossier>/<fichier>.(webp|png|jpg|jpeg)`, relatif au dossier du workspace
  dans le bucket. `generated: true` → ATLAS affiche « Illustration générée » ; sinon `credit · source_name` sur l'image.
- Toute évolution incompatible → `schema_version: "2"` et nouveau fichier de schéma ; ATLAS refuse les versions inconnues
  (`JOURNAL_SCHEMA_UNSUPPORTED`).

## Workflow n8n attendu (à créer plus tard, NON créé)
1. **Webhook** `POST /webhook/world-radar-edition`, JSON (ou multipart si images), authentification par **en-tête dédié**
   `X-Journal-Secret` comparé en temps constant à un secret propre à ce workflow (ni le jeton MausBot, ni la clé service).
   Taille max ~2 Mo JSON + 5 Mo par image. Mauvais secret → 401.
2. **Validation** du corps contre le schéma v1 (strict). Échec → **422** avec la liste `errors` (sans écho du contenu).
3. **Images** : pour chaque `cover` non nul, le producteur fournit le fichier (champ multipart nommé `storage_path`, ou
   base64 dans un champ de transport hors contrat retiré avant validation). n8n vérifie type (webp/png/jpeg) et taille, puis
   **upload** vers `journal-covers/<workspace_id>/<storage_path>` avec `upsert: true`. Fichier manquant ou invalide → `cover = null`
   (ou 422 si on veut être strict, à décider).
4. **Upsert idempotent** avec la clé service : `journal_editions` sur `(workspace_id, edition_id)` (avec `payload_sha256`,
   `item_count`), puis `journal_items` sur `(workspace_id, edition_id, item_id)` avec `position` = index. Supprimer les items
   de l'édition absents du nouvel envoi. Même charge renvoyée deux fois → même résultat.
   `workspace_id` vient de la config du workflow, **jamais** du producteur.
5. **Réponse** `200 {"ok":true,"edition_id":…,"items":N}` ; `422` si contrat invalide ; `401` si secret faux ; `5xx` si Supabase
   échoue (le producteur peut réessayer : l'upsert est idempotent).

## Supabase (migrations NON appliquées)
- `20261025221000_atlas_journal_editions.sql` : `journal_editions`, `journal_items` (contraintes = contrat), RLS **lecture
  owner-only**, aucun droit d'écriture pour `authenticated` (seul le rôle service écrit) ; bucket **privé** `journal-covers`
  (5 Mo, webp/png/jpeg) + politique de lecture `storage.objects` limitée au dossier `<workspace_id>/` du propriétaire.
- `20261025220000_atlas_feed_item_state.sql` : état nouveau/lu/terminé par utilisateur, RLS owner-only, clé unique.

## ATLAS
| Fichier | Rôle |
|---|---|
| `packages/engines/mausbot/schema/journal-edition.v1.schema.json` | Contrat versionné |
| `packages/engines/mausbot/src/journal.mjs` | Validateur strict, normalisation (thèmes, cover), mapping des lignes, repli Markdown |
| `packages/engines/mausbot/src/journal-source.mjs` | Lecture Supabase (dernière édition), URL signées 1 h, fixture de démo |
| `src/app/api/engines/mausbot/journal/route.ts` | GET owner-only, `no-store` |
| `src/app/api/engines/mausbot/journal/state/route.ts` | POST owner-only → `feed_item_state` |
| `src/app/journal/page.tsx`, `src/components/morning-journal.tsx` | UI magazine |

- Les URL signées sont créées **côté serveur** avec la session du propriétaire (la RLS storage s'applique) ; le navigateur ne
  reçoit que ces URL Supabase courtes, jamais une URL externe non vérifiée. Pas de cover → placeholder neutre.
- `ATLAS_MAUSBOT_JOURNAL_DEMO=true` sert la fixture, **jamais** si `VERCEL_ENV` ou `NODE_ENV` = production.
- Le repli Markdown (`parseJournalMarkdown`) reste disponible pour n8n/outils mais n'est plus utilisé par la route.

## Service journal étendu : futur `journal-mcp` (spécifié, NON créé)
Contrats versionnés : `packages/engines/mausbot/schema/journal-mcp.v1.schema.json` (entrée/sortie JSON Schema de chaque outil,
`additionalProperties: false`, erreurs `{ok:false, code, status, errors[]}`). Réservé au journal ; aucun autre workflow.

| Outil | Entrée | Sortie / règles |
|---|---|---|
| `publish_edition` | `{edition}` au contrat v1 strict | 200 `{ok, edition_id, items, checks}` ; **422** `CONTRACT_INVALID` + liste `errors` ; 401 producteur non autorisé. Upsert idempotent, audit `publish` |
| `get_edition` | `{edition: "latest" \| id}` | édition v1 complète ou 404 |
| `search_items` | `topic?`, `from?`/`to?` (date), `q?` (mot-clé titre/résumé), `source_name?`, `limit` ≤ 50 | liste légère `{edition_id, id, topic, title, source_name, source_url, published_at}` |
| `set_item_state` | `{edition_id, item_id, state: read\|done\|reopen}` | `reopen` → `new` ; écrit `feed_item_state` + audit `state` |
| `correct_item` | `{edition_id, item_id, reason, changes:{title?, summary?, topic?, cover?}}` | audit `correct` avec `before`/`after` ; renvoie `audit_id` |
| `edition_status` | `{edition: "latest" \| id}` | `{complete, counts{items, withoutCover}, checks[]}` |

**Producteurs autorisés :** `morgans`, `grok-bot`, chacun avec **sa propre clé** (secret d'en-tête distinct, stocké dans les
identifiants n8n/MCP, jamais dans le dépôt). La clé détermine le producteur : un `producer` du corps différent de celui de la clé
→ 401. Révocation d'un producteur sans toucher l'autre. Lecture (`get_edition`, `search_items`, `edition_status`) et
`set_item_state`/`correct_item` : propriétaire du workspace uniquement.

### Contrôles qualité automatiques
Fonction pure `checkEdition(edition, {previousItems, expectedBy, receivedAt})` (`packages/engines/mausbot/src/journal-quality.mjs`),
réutilisable par n8n (nœud Code), le futur MCP et les tests. Résultats écrits dans `journal_edition_checks` :
- `contract_invalid` (error) — écart au contrat v1 ;
- `missing_source` (error) — source principale absente ou URL invalide ;
- `duplicate_in_edition` (warning) — même URL normalisée ou même titre normalisé dans l'édition ;
- `duplicate_across_editions` (info) — déjà publié dans une édition précédente ;
- `missing_cover` (warning) — article sans image ;
- `edition_late` (warning si arrivée tardive ; **error** via `checkEditionMissing()` si aucune édition à l'heure attendue —
  à brancher sur un cron n8n du journal, NON créé).

Politique : toute `error` → 422 (rien publié) ; `warning`/`info` → publié et signalé dans `edition_status`.

### Audit
Migration NON appliquée `20261025223000_atlas_journal_audit.sql` : `journal_audit` (acteur morgans|grok-bot|owner|n8n,
action publish|correct|state, edition_id, item_id, before/after JSON, reason, at) et `journal_edition_checks` (edition_id,
item_id, check, severity, detail, at). RLS lecture owner-only, aucune écriture pour `authenticated` : rôle service uniquement.

## Étapes restantes
1. Revoir puis appliquer les deux migrations (prod Supabase) — OK de Paul requis.
2. Créer le workflow n8n ci-dessus (+ secret d'en-tête dédié, clé service dans les identifiants n8n) — OK requis.
3. Consigne MORGANS : poster le contrat v1 au webhook n8n avec les images (envoyée/à mettre à jour par ailleurs).
4. Un seul preview Vercel vérifié (quota, cf. AGENTS.md), puis merge sur décision.
5. Appliquer `20261025223000_atlas_journal_audit.sql`, puis construire `journal-mcp` selon le contrat ci-dessus.
6. Futur : Grok Bot producteur (`producer: "grok-bot"`), même webhook.
