# Journal du matin (WORLD RADAR) — ATLAS HQ

Statut : **PR brouillon, non déployée.** Lecture seule côté MausBot ; l’état lu/terminé vit dans Supabase.

## Parcours
`/journal` (lien « Journal » dans la navigation) → `GET /api/engines/mausbot/journal?workspaceId=…` → édition triée par thème
(IA & outils, Commerce & logistique, Guinée, Afrique, Monde / géopolitique, Économie / marchés), cartes avec couverture,
lecture plein écran, « Marquer lu » / « Marquer terminé », progression X/Y.

## Composants
| Fichier | Rôle |
|---|---|
| `packages/engines/mausbot/src/journal.mjs` | Parseur pur : JSON d’édition (strict) + repli Markdown `## Thème — Titre`, normalisation des thèmes |
| `packages/engines/mausbot/src/journal-images.mjs` | Couverture : `image_url` → `og:image` de la source (fetch SSRF-safe) → provider d’illustration → placeholder thématique |
| `packages/engines/mausbot/src/journal-source.mjs` | Source (env serveur uniquement, GET, bearer non sérialisable), fixture de démo, validation de l’état |
| `src/app/api/engines/mausbot/journal/route.ts` | GET owner-only, `Cache-Control: private, max-age=60` |
| `src/app/api/engines/mausbot/journal/state/route.ts` | POST owner-only → upsert `feed_item_state` (jamais MausBot) |
| `supabase/migrations/20261025220000_atlas_feed_item_state.sql` | Table + RLS owner-only — **non appliquée** |

## Schéma JSON d’édition (`world_radar_<date>_<edition>.json`)
```json
{"edition_id":"2026-10-25_matin","generated_at":"ISO-8601","items":[{
  "id":"[A-Za-z0-9._:-]{1,120}","topic":"ia|commerce|guinee|afrique|monde|geopolitique|economie|tech",
  "title":"…","summary":"…","why_it_matters":"…|null","certainty":"elevee|moyenne|faible","status":"confirme|rapporte|a_verifier",
  "source_url":"https://…","source_name":"…","extra_sources":[{"url":"https://…","name":"…"}],
  "image_url":"og:image ou null","published_at":"ISO-8601|null","author_bot":"Turing"}]}
```
Règles : enveloppe invalide → erreur `JOURNAL_EDITION_INVALID` ; items au thème inconnu, sans id/titre, ou en double → ignorés ;
URLs non http(s) ou avec identifiants → supprimées ; max 200 items lus, 40 affichés ; textes tronqués.

Repli Markdown (`world_radar_final_AAAA-MM-JJ.md`) : découpage sur `## <Thème> — <Titre>`, rubriques `Faits` (résumé),
`Statut/certitude`, `Intérêt`, `Source(s)` (liens). Pas d’image dans le .md → og:image de la source.

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

## Images
- SSRF : http(s) seulement, ports 80/443, pas d’identifiants, refus localhost/`.local`/`.internal`, résolution DNS et refus
  de toute adresse privée/loopback/link-local/CGNAT/ULA/mappée, redirections manuelles revalidées (max 3), timeout 4 s,
  HTML ≤ 1 Mo, image ≤ 5 Mo, content-type `image/(jpeg|png|webp|gif|avif)`. Limite connue : fenêtre de DNS rebinding entre
  la vérification et la connexion (atténuable avec un agent HTTP à IP épinglée).
- Illustration générée : interface `ImageProvider.generate({title,category,summary})`. ATLAS n’a pas de générateur configuré
  → `stubImageProvider` (null) → couverture typographique thématique **marquée « Illustration générée »**. Aucune clé en dur.
- Stockage prévu (non créé) : bucket Supabase **privé** `journal-covers/<edition_id>/<item_id>.webp` (copie réduite WebP),
  servi par URL signées courtes (ex. 1 h) générées côté serveur ; usage interne uniquement, nom et lien du média toujours affichés.
  Aujourd’hui : cache mémoire 6 h par instance, l’image est chargée depuis l’URL du média (`referrerPolicy=no-referrer`).

## Étapes restantes
1. Valider puis poser la route Caddy GET (ou le mini-endpoint gw.js) — ne pas le faire sans OK.
2. Appliquer la migration `feed_item_state` en prod Supabase après revue (sinon le journal s’affiche sans suivi lu/terminé).
3. Définir `ATLAS_MAUSBOT_JOURNAL_URL` sur Vercel, puis un seul preview vérifié (quota, cf. AGENTS.md).
4. Consigne de format JSON à MORGANS : envoyée par ailleurs.
5. Optionnel : provider d’image réel, bucket privé + URL signées, épinglage IP anti-rebinding, historique des éditions.
