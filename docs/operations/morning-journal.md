# Journal du matin (WORLD RADAR) — ATLAS HQ

Statut : **PR brouillon, non déployée.** Lecture seule côté MausBot ; l’état lu/terminé vit dans Supabase.

**Partage des rôles (décision de Paul) :** toute l’intelligence — tri, thèmes, dédoublonnage, recherche de l’image réelle
de l’article, génération d’illustration — se fait **côté MausBot** (MORGANS et son équipe). ATLAS **récupère et affiche** :
aucun fetch d’article, aucun og:image, aucun générateur d’image, aucun stockage d’image dans ATLAS.

## Parcours
`/journal` (lien « Journal » dans la navigation) → `GET /api/engines/mausbot/journal?workspaceId=…` → édition triée par thème
(IA & outils, Commerce & logistique, Guinée, Afrique, Monde / géopolitique, Économie / marchés), cartes avec couverture,
lecture plein écran, « Marquer lu » / « Marquer terminé », progression X/Y.

## Composants
| Fichier | Rôle |
|---|---|
| `packages/engines/mausbot/src/journal.mjs` | Parseur pur : JSON d’édition (strict) + repli Markdown `## Thème — Titre`, normalisation des thèmes |
| `packages/engines/mausbot/src/journal-source.mjs` | Source (env serveur uniquement, GET, bearer non sérialisable), fixture de démo, validation de l’état |
| `src/app/api/engines/mausbot/journal/route.ts` | GET owner-only, `Cache-Control: private, max-age=60` |
| `src/app/api/engines/mausbot/journal/cover/route.ts` | Proxy image owner-only → MausBot `GET /api/attachments/<file>` (bearer côté serveur) |
| `src/app/api/engines/mausbot/journal/state/route.ts` | POST owner-only → upsert `feed_item_state` (jamais MausBot) |
| `supabase/migrations/20261025220000_atlas_feed_item_state.sql` | Table + RLS owner-only — **non appliquée** |

## Schéma JSON d’édition (`world_radar_<date>_<edition>.json`)
```json
{"edition_id":"2026-10-25_matin","generated_at":"ISO-8601","items":[{
  "id":"[A-Za-z0-9._:-]{1,120}","topic":"ia|commerce|guinee|afrique|monde|geopolitique|economie|tech",
  "title":"…","summary":"…","why_it_matters":"…|null","certainty":"elevee|moyenne|faible","status":"confirme|rapporte|a_verifier",
  "source_url":"https://…","source_name":"…","extra_sources":[{"url":"https://…","name":"…"}],
  "cover":{"file":"radar-ia-1.webp","generated":false,"alt":"…","credit":"Reuters"},"published_at":"ISO-8601|null","author_bot":"Turing"}]}
```
Règles : enveloppe invalide → erreur `JOURNAL_EDITION_INVALID` ; items au thème inconnu, sans id/titre, ou en double → ignorés ;
URLs non http(s) ou avec identifiants → supprimées ; max 200 items lus, 40 affichés ; textes tronqués.

Repli Markdown (`world_radar_final_AAAA-MM-JJ.md`) : découpage sur `## <Thème> — <Titre>`, rubriques `Faits` (résumé),
`Statut/certitude`, `Intérêt`, `Source(s)` (liens). Pas de couverture dans le .md → placeholder neutre.

## Source MausBot : route Caddy GET à créer (NON faite)
Aucune route GET existante du gateway (`/mcp`) ou de l’API MausBot ne sert les fichiers d’espace de travail d’un bot.
Proposition (à valider par Paul, à poser par l’opérateur VPS) :
```caddy
# dans le site mausbot.shadoron.com, avant le reverse_proxy général
@journal {
  method GET
  path /journal/latest
}
handle @journal {
  @noauth not header Authorization "Bearer {env.OMB_JOURNAL_TOKEN}"
  respond @noauth 401
  rewrite * /world_radar_latest.json
  root * /srv/omb-journal          # dossier en lecture seule, rempli par un lien/copie du dernier JSON de MORGANS
  header Cache-Control "private, max-age=60"
  file_server
}
```
Alternative : mini-endpoint dans `/opt/omb-mcp-gw/gw.js` `GET /journal/latest` qui lit le dernier `world_radar_*.json`
(sinon le dernier `world_radar_final_*.md`) du dossier de MORGANS, en lecture seule, avec le même bearer.
Côté ATLAS : `ATLAS_MAUSBOT_JOURNAL_URL=https://mausbot.shadoron.com/journal/latest` (le bearer réutilise `ATLAS_MAUSBOT_TOKEN`
via `resolveMausbotConfig` ; si un jeton dédié est préféré, adapter `resolveJournalSource`). Les gates de lecture MausBot
existants (`mausbotReleasePermission(env,"read")`) s’appliquent. `ATLAS_MAUSBOT_JOURNAL_DEMO=true` sert la fixture hors production.

## Couvertures
- `cover.file` = nom d’une pièce jointe MausBot (`^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.(webp|png|jpg|jpeg|gif)$`, sans `/` ni `..`).
  Toute autre valeur (URL externe, chemin) est ignorée → placeholder neutre.
- Le navigateur charge `/api/engines/mausbot/journal/cover?workspaceId=…&file=…` (owner-only). ATLAS appelle
  `GET <ATLAS_MAUSBOT_URL>/api/attachments/<file>` avec le bearer serveur, accepte seulement `image/(jpeg|png|webp|gif)`,
  ≤ 5 Mo, renvoie `Cache-Control: private, max-age=3600`, `nosniff`, CSP sandbox. Aucune URL externe non vérifiée côté client.
- La route Caddy `/api/attachments/*` actuelle accepte png/jpg/gif/webp : **ajouter `jpeg`** au motif si MORGANS produit des `.jpeg`
  (sinon qu’il nomme ses fichiers `.jpg`).
- `generated: true` → mention « Illustration générée » ; sinon `credit` (nom du média) affiché sur l’image. Source et lien toujours affichés.
- C’est MORGANS qui choisit : image réelle de l’article d’abord, illustration générée sinon.

## Étapes restantes
1. Valider puis poser la route Caddy GET (ou le mini-endpoint gw.js) — ne pas le faire sans OK.
2. Appliquer la migration `feed_item_state` en prod Supabase après revue (sinon le journal s’affiche sans suivi lu/terminé).
3. Définir `ATLAS_MAUSBOT_JOURNAL_URL` sur Vercel, puis un seul preview vérifié (quota, cf. AGENTS.md).
4. Consigne de format JSON à MORGANS : envoyée par ailleurs.
5. Côté MausBot : MORGANS dépose les couvertures comme pièces jointes et remplit `cover`. Ajouter `jpeg` dans Caddy si besoin.
6. Optionnel : historique des éditions.
