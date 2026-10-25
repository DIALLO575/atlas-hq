> **Dernier état vérifié — 25 octobre 2026 : tous les lots Notion développés sont fusionnés dans `main` au commit [`b4da3a7f3871bb5b50c6b03ca6f92b018f6a3d2e`](https://github.com/DIALLO575/atlas-hq/commit/b4da3a7f3871bb5b50c6b03ca6f92b018f6a3d2e).** Les PR Notion [#32](https://github.com/DIALLO575/atlas-hq/pull/32), [#36](https://github.com/DIALLO575/atlas-hq/pull/36), [#72](https://github.com/DIALLO575/atlas-hq/pull/72), [#73](https://github.com/DIALLO575/atlas-hq/pull/73), [#80](https://github.com/DIALLO575/atlas-hq/pull/80) et [#82](https://github.com/DIALLO575/atlas-hq/pull/82) ont été fusionnées. Les anciennes PR #34/#35 ont été **fermées sans fusion individuelle** car leurs apports ont été consolidés dans #36. **Zéro PR Notion ouverte** au dernier contrôle. GitHub Actions `main` [40215066964](https://github.com/DIALLO575/atlas-hq/actions/runs/40215066964) : **6/6 jobs réussis** ; avant PR #82, 725/725 tests locaux, lint, typecheck, build réussis ; 9/9 tests dédiés mobile. **La disponibilité Vercel de ce SHA final n'est pas démontrée** : le listing observé ne contenait aucun déploiement READY de `b4da3a7f` (il montrait un READY de la PR candidate `ad0268c55...`, qui ne prouve pas l'alias production). **Aucun OAuth réel ATLAS ↔ Notion ni recette W1/W2/mobile authentifiée**, toujours **NO-GO fournisseur SHA-134**. Les paragraphes anciens ci-dessous documentent les étapes passées et ne remplacent pas ce statut.

> **Mise à jour post-fusion — 25 octobre 2026 :** [PR #72](https://github.com/DIALLO575/atlas-hq/pull/72) **fusionnée dans `main`** au commit [`3bec14be978a37989d2fb1e36a3018990d96b452`](https://github.com/DIALLO575/atlas-hq/commit/3bec14be978a37989d2fb1e36a3018990d96b452). **CI GitHub de PR : 5/5 jobs réussis** (run [40210335758](https://github.com/DIALLO575/atlas-hq/actions/runs/40210335758)) ; 596/596 tests applicatifs, TypeScript/lint/build et audit production à zéro vulnérabilité à la revue locale. La version est **intégrée dans `main`, mais son déploiement Vercel n'est pas confirmé** (contrôle Vercel rouge, lien de limitation de build) ; **aucun test OAuth ATLAS/Notion réel**. Pas de GO connexion ou production fournisseur. Le texte plus ancien de ce document décrivait le stade *candidat non fusionné* au début de la journée.

# ATLAS HQ × Notion V2 — état réel, preuve et reste à faire
**Historique et état post-fusion du 25 octobre 2026 · Mission [SHA-182](https://linear.app/shadoron/issue/SHA-182) · NON-GO mise en service avancée**

> **Verdict :** le socle Notion V2 REST **en lecture seule** est largement **développé et validé en code source isolé**. Il n'est **ni fusionné dans `main`, ni déployé, ni vérifié sur une vraie session OAuth ATLAS ↔ Notion**. Ne pas confondre la connexion Notion de ChatGPT, qui a créé la page `ATLAS — TEST`, et le connecteur OAuth d'ATLAS HQ.

## Références exactes

| Élément | Référence et état | Ce que cela prouve |
|---|---|---|
| Dépôt | [DIALLO575/atlas-hq](https://github.com/DIALLO575/atlas-hq) | Source ATLAS |
| `main` observé | `c7ec18e93f44fc32e560ae8b74b7fd6664ce5249` | Intègre Engine Hub / MAUSBOT, mais pas encore le nouveau lot avancé Notion |
| **Candidat complet détaché** | [`b77dbe53d46e92dbc11700acb51b4b0bc0ae2bf1`](https://github.com/DIALLO575/atlas-hq/commit/b77dbe53d46e92dbc11700acb51b4b0bc0ae2bf1) | Parent direct du `main` ci-dessus ; 42 fichiers Notion ajoutés/modifiés, aucune branche/PR/fusion |
| **Arbre Git du code** | `14e12fd7d68b8d81c278714f66ce9033a2718590` | Identique bit pour bit à l'arbre Git de la copie isolée testée |
| QA candidat + Engine Hub | **589/589 tests**, TypeScript, ESLint et build Next.js **réussis** | **Tests locaux**, pas CI GitHub ni preuve fournisseur |
| Vercel | Projet `diallo8/atlas-hq-preview` ; des déploiements `READY` sur d'autres SHAs | **Aucune preuve que le candidat avancé est déployé** |
| Secrets OAuth Vercel | Présence des variables constatée, **valeurs masquées** | Présence ≠ validité du client/secret/redirect ; dernière opération connue : callback `false` pour les futurs builds |
| Supabase | Six migrations V2 appliquées auparavant, selon la note de release et SHADORON | **Ne pas rejouer** ; aucune migration dans les lots candidat |
| Page `ATLAS — TEST` | Créée privée et lue via le connecteur Notion **de ChatGPT** | **Aucune autorisation ou preuve OAuth ATLAS** |

Le dernier refus Vercel `402` concernait une tentative passée ; la capacité à déployer et les éventuels nouveaux déploiements doivent être **revérifiés**, sans supposer un blocage toujours actif.

## Matrice des capacités : implémentées ≠ disponibles

| Fonction | Développement | Limites et validation restantes |
|---|---|---|
| OAuth public REST, état CSRF, coffre des jetons, refresh CAS, révocation, isolation ATLAS | **Base code `main`** | Recette OAuth réelle non exécutée ; [SHA-134](https://linear.app/shadoron/issue/SHA-134) |
| Recherche, pages, blocs | Base REST `main` + candidat | Recherche **par titre**, pas plein texte ; refus d'accès réels à tester |
| Sous-blocs, longues pages, texte riche, mentions, équations, tableaux | **Candidat** [SHA-184](https://linear.app/shadoron/issue/SHA-184) | Pagination et profondeur bornées ; quelques blocs complexes non reproduits |
| Markdown officiel Notion v1 | **Candidat** [SHA-186](https://linear.app/shadoron/issue/SHA-186) | **Aperçu avec perte** ; liens média signés retirés ; Markdown v2 preview non activé |
| Images, PDF, audio, vidéo, fichiers | **Candidat** [SHA-183](https://linear.app/shadoron/issue/SHA-183) | Proxy personnel, origines/MIME bornés, **4 Mo / 8 s** ; pas de gros fichiers ou Office pleinement intégré |
| Databases, data sources, colonnes, statuts, formules et relations, lignes | **Candidat** [SHA-187](https://linear.app/shadoron/issue/SHA-187) | Colonnes max 14, lignes max 12/page ; résultat de formule ou compte de relations, **pas formule brute ni IDs privés** |
| Vues Notion enregistrées (table, board, calendrier, galerie…) | **Candidat** [SHA-188](https://linear.app/shadoron/issue/SHA-188) | Vue liée à la bonne base/source, indicateurs filtres/tris, premier aperçu de 12 résultats filtrés/triés **par Notion** |
| Requêtes temporaires des vues | **Candidat** [SHA-188](https://linear.app/shadoron/issue/SHA-188) | Nettoyage du **cache de requête uniquement** après aperçu, pas de suppression de vue ; comportement fournisseur réel à confirmer |
| Kanban, calendrier, galerie complets et interactifs | **Partiels** | Lien et aperçu de la vue Notion, **pas clone natif fidèle** |
| Gros médias, multipart/Range, prévisualisation Office | **Non complets** | [SHA-140](https://linear.app/shadoron/issue/SHA-140) |
| Commentaires, utilisateurs, emojis, uploads, notes de réunion | **À compléter** | Scopes/plans officiels, tests, et pas d'actions implicites ; [SHA-140](https://linear.app/shadoron/issue/SHA-140) |
| Création, modification, déplacement, suppression de contenu | **Intentionnellement désactivés** | Approbation humaine, contrôles ACL, audit et idempotence ; [SHA-138](https://linear.app/shadoron/issue/SHA-138) |
| Webhooks, MCP, agents, workers | **Hors périmètre de cette recette** | Ne pas activer via le seul connecteur OAuth REST |

### Sécurité conçue dans le candidat
- Lecture via **acteur, workspace et connexion personnels ATLAS**, avec renouvellement contrôlé du jeton.
- UUID/cursors bornés, origine REST Notion fixe, réponses fournisseur **projetées en champs autorisés**.
- Les URL média temporaires signées et tokens n'entrent pas dans le JSON du navigateur ; pas de rendu HTML fournisseur brut ; tailles/temps/MIME limités et erreurs explicites.
- Pas de copie complète de pages ou lignes dans Supabase, pas de lecture massive automatique, pas de mutation Notion.
- Ces garanties sont **testées par mocks/contrats et compilation**, **pas encore éprouvées en conditions réelles** (notamment DNS/SSRF, 403/404 et changement de droits pendant une requête).

## Tests réellement passés

L'assemblage candidat + nouveau `main` Engine Hub a été exécuté dans une copie Git isolée, sans commit de fusion ni mise à jour d'une branche distante. `npm ci --ignore-scripts`, `npm run typecheck`, `npm run lint`, `npm test` (**589 réussis, 0 échec**), `npm run build` (**réussi**). Le `git write-tree` local testé vaut exactement `14e12fd7d68b8d81c278714f66ce9033a2718590`, **le même arbre** que le candidat GitHub `b77dbe53…`.

Ce résultat **ne remplace pas** une CI GitHub sur PR, une revue de code indépendante, un test navigateur/mobile, ou une recette Notion OAuth réelle avec vrais médias et vraies vues.

## Reste à faire — checklist bloquante

- [ ] **P0 / GitHub** : sécuriser une branche/PR de revue sans déclencher de Vercel non autorisé, exécuter CI complète sur le SHA exact (vérifier dérive de `main`), revue auth multi-tenant, SSRF, MIME, cookies, sécurité des vues et caches. [SHA-182](https://linear.app/shadoron/issue/SHA-182), [SHA-183](https://linear.app/shadoron/issue/SHA-183).
- [ ] **P0 / Notion + environnement** : confirmer l'application publique REST, ID/secret/redirect (sans les divulguer), droits lecture, état réel du flag et destination de déploiement ; n'activer le callback **que pour une recette expressément autorisée**. [SHA-134](https://linear.app/shadoron/issue/SHA-134).
- [ ] **P0 / OAuth réel** : consentir à **`ATLAS — TEST` uniquement** dans le workspace voulu, tester une seconde page non partagée, deux acteurs/workspaces ATLAS W1/W2, 403/404, tentative cross-tenant, expiration des tokens, CAS refresh, révocation et déconnexion. [Runbook](notion-sha134-oauth-sandbox-runbook.md).
- [ ] **P0 / contenu réel** : comparer les aperçus des pages longues, Markdown, image/PDF, colonnes, formules, relations, tableaux, listes et vues filtrées/triées avec leur original dans Notion ; contrôler nettoyage `view_query`, UI mobile/accessibilité et non-fuite d'URL signées.
- [ ] **P0 / déploiement** : **une seule livraison coordonnée et autorisée**, seulement quand SHA, CI, configuration et recette sont vérifiés. Ne pas assimiler un déploiement READY d'un autre SHA à la livraison Notion.
- [ ] **P1 / qualité** : médias volumineux/streaming Range, previews Office, Markdown/blocs complexes, couverture des vraies vues Kanban/calendrier/galerie et relations. [SHA-137](https://linear.app/shadoron/issue/SHA-137), [SHA-139](https://linear.app/shadoron/issue/SHA-139), [SHA-140](https://linear.app/shadoron/issue/SHA-140).
- [ ] **P2 / actions** : ne concevoir les écritures et les agents qu'après scopes réels et **plan → diff → approbation explicite → ACL → audit**, sans replay ambigu. [SHA-138](https://linear.app/shadoron/issue/SHA-138).

**Décision actuelle : NO-GO activation/utilisation du connecteur Notion V2 avancé par les utilisateurs.** Le code de lecture est « développé et localement vérifié », **pas** « activé », « provider_verified », « déployé » ni « fonctionnel en production ».

## Références opérationnelles
- Mission de synthèse [SHA-182](https://linear.app/shadoron/issue/SHA-182), lots en revue [SHA-183](https://linear.app/shadoron/issue/SHA-183), [SHA-184](https://linear.app/shadoron/issue/SHA-184), [SHA-186](https://linear.app/shadoron/issue/SHA-186), [SHA-187](https://linear.app/shadoron/issue/SHA-187), [SHA-188](https://linear.app/shadoron/issue/SHA-188).
- [SHA-134 — recette OAuth réelle](https://linear.app/shadoron/issue/SHA-134), [runbook](notion-sha134-oauth-sandbox-runbook.md).
- [Contrat d'intégration](../integrations/notion-integration-contract.md), [politique des capacités](../integrations/notion-capability-policy.md), [historique release V2](notion-v2-main-release-2026-10-25.md).
- SHADORON : checkpoint mission `cp-c2ab69ca-208f-4fba-b8ba-b9a3da3a0c62`, références **sans secrets ni données privées**.

*Ce document est un instantané daté. Avant toute activation, revérifier `main`, Vercel, configuration masquée, consentements, droit de lecture et disponibilités réelles. Ne pas rejouer les six migrations Notion V2 appliquées précédemment.*
