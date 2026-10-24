# ATLAS HQ — Handoff inter-workers / Release evidence
Date de vérification : **24 octobre 2026**. Ce document décrit ce qui est *dans le code* et ce qui est *effectivement en production*, sans les confondre.

## 1. Lire en premier
- [Règles communes aux agents](../../AGENTS.md) — limiter pushes et previews Vercel, ne jamais relancer 402 en boucle.
- [Projet Linear ATLAS](https://linear.app/shadoron/project/atlas-hq-v0-fonctionnelle-a3866a7ccc6b) — historique, responsables et critères d'acceptation.
- [Dossier de relais Linear](https://linear.app/shadoron/document/atlas-hq-relais-operationnel-chief-github-v2-24-oct-2026-72a0cb97e5a6) — note opérationnelle cross-workers ; ticket de production [SHA-118](https://linear.app/shadoron/issue/SHA-118/atlas-deployer-chief-command-deck-github-v2-en-production-vercel-402), Chief LLM futur [SHA-119](https://linear.app/shadoron/issue/SHA-119/atlas-chief-v2-modele-ia-memoire-des-chats-et-actions-avec-approbation).

## 2. Preuves de publication au 24/10/2026

| Couche | État vérifié |
| --- | --- |
| GitHub main (source de vérité code) | Commit applicatif **832dce23e471e364b1936626e5c6a6fe2cbe046f** ; [PR intégrée #29](https://github.com/DIALLO575/atlas-hq/pull/29) fusionnée |
| CI du commit 832dce2 | Deux checks réussis pour la PR #29 et GitHub Actions main **success** |
| Preview fonctionnelle de la branche d'intégration | Commit 674f2b5 (code combiné), **READY**, \`/chief\` et \`/apps/github\` HTTP 200 : https://atlas-hq-preview-fzlfu8o95-diallo8.vercel.app |
| Production Vercel officielle | https://atlas-hq-preview.vercel.app : deployment **READY mais ancien SHA db3152e478bf40762e9269f2ac4ef5f047bf7b1d** |
| Blocker | API Vercel 402 \`api-deployments-free-per-day\` ; le nouveau Chief et GitHub V2 ne sont **pas encore sur l'URL officielle** |

**Ne PAS annoncer la publication des deux refontes en production avant vérification d'un déploiement de SHA 832dce2 (ou descendant contrôlé), READY et lié au domaine officiel.** Fusion GitHub ≠ production Vercel. La preview en HTTP 200 ne remplace pas un parcours authentifié de bout en bout.

Les PR d'origine [#22](https://github.com/DIALLO575/atlas-hq/pull/22) et [#27](https://github.com/DIALLO575/atlas-hq/pull/27) sont **fermées comme remplacées**, non mergées individuellement. Ne pas les rouvrir pour une double publication.

## 3. Ce qui fonctionne dans le code

| Surface | Code & fonctionnement | Limite / preuve restant à produire |
| --- | --- | --- |
| Workspaces | Supabase Auth, membership RLS, rôles owner/admin/member | Vérifier les parcours multi-workspace et la session de recette |
| Missions | \`src/app/missions\` ; création, statuts, demande de validation | Activité réelle inexistante tant qu'aucune mission n'est créée ; validations admin |
| Inbox | \`src/app/inbox\` ; décisions issues des missions, RPC transactionnelle et RLS | Pas de messagerie externe ou notifications automatiques |
| Mes Apps | Catalogue rapide sans lectures bloquantes ; lien \`Piloter\` vers \`/apps/github\` | Les cartes non raccordées ne représentent pas de vrais connecteurs |
| GitHub V2 | \`src/components/github-control-center.tsx\`, \`src/app/api/apps/github/route.ts\` : installations vérifiées, dépôts, PR, diff des fichiers, erreurs et recherches ; grant \`selected\` **ou** \`all\` | Lecture seulement ; ni merge/review, ni agents/automations ; vérifier en session réelle les accès au fournisseur |
| Chief Command Deck | \`src/app/chief/page.tsx\`, \`src/components/chief-command-deck.tsx\`, \`src/lib/chief/briefing.ts\`, \`src/app/api/chief/route.ts\` : conversation guidée, cartes Missions/Inbox, graphiques de répartition, contexte GitHub | **Pas de moteur LLM**, streaming ou persistance conversationnelle ; pas d'exécution d'agent ni de writeback |
| Navigation | Next.js Link, prefetch, progress bar et skeletons | Mesurer UX en session authentifiée, mobile et réseau lent |

La « conversation » Chief n'est qu'un **classifieur de commandes de briefing alimentées par les données réelles** du workspace. Toute question non prise en charge explique les capacités actuelles. Les chiffres des cartes ne doivent jamais être inventés. Le graphique est une répartition **actuelle** des statuts, pas une série historique ; les compteurs sont bornés aux 200 dernières missions/reviews visibles.

Les appels GitHub restent au serveur, et les jetons d'installation/clefs GitHub App ne sont pas transmis au navigateur. Une installation persistée dans Supabase ne démontre pas qu'une lecture GitHub fournisseur aboutit dans une session réelle.

## 4. Instantané base officielle (lecture seule, 24/10/2026)
- **1 workspace**
- **0 mission**
- **0 review Inbox**
- **1 installation GitHub**
- **1 dépôt GitHub autorisé**

Cet instantané remplace la mention historique des « 0 installation GitHub » dans les anciens rapports du 23 octobre. Il ne contient ni nom de compte, ni identifiant d'utilisateur, ni secret, et n'est pas un test d'autorisation live.

## 5. Next actions pour les autres workers

### P0 — [SHA-118](https://linear.app/shadoron/issue/SHA-118/atlas-deployer-chief-command-deck-github-v2-en-production-vercel-402) (Vercel)
1. Avant tout nouveau déploiement : contrôler \`main\`, statut du quota, les derniers déploiements et les checks; ne pas réessayer tant que 402 persiste.
2. Une seule tentative de publication de la version testée quand le quota est disponible. Éviter de redéployer la preview ou de créer des commits vides.
3. Contrôler commit SHA, READY, alias **atlas-hq-preview.vercel.app**, puis tests authentifiés de \`/chief\`, \`/apps/github\`, \`/missions\`, \`/inbox\`.
4. Conserver preuve de rollback, ne pas déclarer « livrée » avant parcours réel.

### P0 — intégration GitHub réelle et sécurité
- [SHA-102](https://linear.app/shadoron/issue/SHA-102/05-developper-le-connecteur-produit-github-complet), [SHA-103](https://linear.app/shadoron/issue/SHA-103/06-construire-la-fiche-pr-github-et-son-resourceref-reel), [SHA-113](https://linear.app/shadoron/issue/SHA-113/052-implementer-linstallation-github-app-multi-tenant), [SHA-114](https://linear.app/shadoron/issue/SHA-114/053-implementer-les-lectures-github-et-le-contexte-pr-minimal), [SHA-116](https://linear.app/shadoron/issue/SHA-116/055-prouver-le-connecteur-github-en-sandbox-multi-tenant).
- Prouver une lecture PR et diff autorisées, la négation cross-workspace / dépôt interdit, \`selected\`/\`all\`, révocation et erreurs, sans secrets dans les logs.
- Webhooks durables, retries/queue et scénario sandbox GO/NO-GO **ne sont pas implicitement validés** par l'interface V2.

### P1 — Chief complet — [SHA-119](https://linear.app/shadoron/issue/SHA-119/atlas-chief-v2-modele-ia-memoire-des-chats-et-actions-avec-approbation)
- Choisir fournisseur/modèle, streaming, stockage chats RLS par workspace, outils schématisés et journal d'activité.
- Toute action d'écriture requiert preview explicite + approbation humaine et contrôle serveur.
- Journal événementiel nécessaire avant d'afficher de vraies tendances dans le temps.

## 6. Discipline de contribution
Éviter les commits correctifs poussés en chaîne : Vercel peut créer automatiquement une preview pour chaque push. Un lot testé, un push cohérent, une preview maximum; stopper sur erreur 402. Les instructions de \`AGENTS.md\` prévalent pour les agents de développement.
