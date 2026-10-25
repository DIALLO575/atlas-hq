# SHA-184 — Pagination des pages et texte riche Notion (source candidate)

## Première livraison code — 25 octobre 2026
- \`GET /api/apps/notion/read?kind=document\` accepte \`cursor\` uniquement dans le périmètre de la connexion personnelle déjà autorisée (auth workspace+acteur à chaque appel). Le serveur transmet le curseur à \`listBlockChildren\` Notion sur **la racine de la page sélectionnée uniquement** et rend \`hasMore\`, \`nextCursor\` (longueur ≤ 2048, pas de contrôles), \`truncated\`. La pagination est déclenchée par bouton explicite ; pas de lecture de toutes les pages en boucle, ni de parcours de pages enfant, ni persistance du contenu.
- \`projectNotionRichText\` conserve les segments texte, mention et équation avec annotations typographiques, et liens HTTPS validés. Les champs fournisseur utilisateurs/emails, objets rich text complets, URL signées et autres champs non autorisés ne sortent jamais. Texte borné à 1 400 caractères et 30 éléments.
- Les blocs \`table\` gardent seulement deux booléens \`has_column_header\` et \`has_row_header\` afin de créer des en-têtes HTML \`th\` accessibles dans le cockpit. Les cellules restent du texte blanclisté. Liens externes ouverts explicitement, pas d'HTML injecté.
- Affichage mobile à vérifier en navigateur lors de la recette. Les sous-blocs sont encore affichés de façon bornée, et un \`truncated\` explicite signale leur contenu partiel. Les curseurs internes de sous-blocs ne sont pas exportés.

## Non inclus
- Pas de synchronisation full-text, diff/round-trip Markdown sans perte, ni endpoint GET markdown v2, ni écriture Notion ; la version Notion-flavored Markdown v2 reste une surface distincte à valider.
- Pas de proof provider live : quota Vercel 402 et OAuth callback OFF. Aucune base de données Supabase ni migration supplémentaire.

Docs fournisseur : https://developers.notion.com/reference/get-block-children et https://developers.notion.com/reference/rich-text
