# ATLAS / Notion V2 — documents, médias et aperçu sécurisé (source candidate)

Base : `b635f4161a4b5d54ae38f52031a463fdb664d301`, chainage après le lot SHA-136 de lecture. **Aucun OAuth réel, aucune migration, aucune mise à jour de main ni déploiement Vercel** ; uniquement code préparé pour revue.

## Contrat d'affichage

- La lecture `GET /api/apps/notion/read?kind=document&workspaceId&connectionId&resourceId` passe par la connexion personnelle ATLAS et collecte un extrait borné (profondeur ≤2, ≤35 blocs, ≤7 requêtes fournisseur, ≤25 blocs par collection). Les sous-pages et pointeurs synchronisés ne sont pas suivis automatiquement.
- La projection `media-content.mjs` renvoie exclusivement du texte nettoyé, le type de bloc, des cellules de tableau, le booléen de case à cocher, liens HTTPS valides et des **descripteurs de médias**. Ni les jetons ni les URL de téléchargement pré-signées Notion ne sont inclus dans JSON.
- Le proxy `GET /api/apps/notion/media?workspaceId&connectionId&blockId` revalide identité/membership/connexion à chaque appel, récupère le bloc courant, récupère la dernière URL de fichier Notion, et ne télécharge que depuis une allowlist stricte de domaines Notion/AWS connus. Aucune URL arbitraire venant du navigateur et aucune redirection suivie.
- Support : images JPEG/PNG/WebP/GIF/AVIF/BMP en affichage ; PDF en consultation ; audio MP3/MP4/OGG/WAV/WebM et vidéo MP4/WebM avec contrôles ; autres fichiers Office/ZIP/TXT avec téléchargement. Les fichiers externes ne sont ouverts que via un lien explicite, pas chargés par iframe invisible. `file_upload` sans URL disponible reste un état non supporté.
- Limite : 4 Mo par requête média, timeout 8 sec ; MIME allowlist par type de bloc ; SVG/HTML/JS et téléchargements douteux jamais servis inline. `Cache-Control: private, no-store`, `Vary: Cookie`, CSP sandbox, CORP same-origin, nosniff. Tout est éphémère, pas de duplication de documents dans Supabase.
- Les URL hébergées par Notion expirent généralement après 1 heure : le proxy actualise le bloc par identifiant et ne les persiste pas. Hébergements différents de l'allowlist : échec fermé + ouverture dans Notion. Grand média : lien Notion d'origine. Pas de streaming multipart ni Range en V1, aperçu des petites vidéos seulement.

## Limitations et validation

Primitives code-only : aucun test réél provider Notion, aucune UI déployée ni CI TypeScript complète sur ce SHA. Vérifier rendu mobile, confidentialité cross-workspace, PDF CSP, limites CDN/redirect et fichier >4 Mo, cookies/SameSite, signatures et renouvellement de jeton OAuth après quota Vercel. Activer seulement après recette autorisée SHA-134.

Références :
- https://developers.notion.com/reference/block
- https://developers.notion.com/reference/file-object
- https://developers.notion.com/reference/retrieve-a-block
