# ATLAS Inbox ↔ MAUSBOT “Needs you” (préconnexion privée)

Sources lues dans `milind-soni/OpenMausBot` (25 octobre 2026):
- `shared/today.ts` : contrat `NeedsYouItem`, six `kind`, fenêtre de 7 jours ;
- `server/routes/today.ts` : `GET /api/needs-you`, filtré pour l'identité du demandeur par MAUSBOT ;
- `server/today.ts` : « only what the person can fix », questions et blocages, certains prompts d'approbation Team Cloud représentés comme questions, **sans API de décision** ;
- `server/ask-routing.ts` : demandes privées dirigées vers une personne, et demandes partagées vers propriétaire/admin ;
- `docs/proactive-routines.md` : le briefing du bot regroupe Needs You, agenda, emails et routines, mais n'est pas le flux brut des approbations ;
- `docs/plans/2026-09-02-goal-mode-v2.md` : les buts de salle ont leur propre cycle ; ne pas mélanger « Goal » et approbations ATLAS.

## Routes et surfaces

- `GET /api/engines/mausbot/needs-you?workspaceId=<UUID>` — uniquement côté serveur, session Supabase vérifiée, accès propriétaire/admin, `mausbotReleasePermission(...,"read")`, identité vérifiée, secret serveur scoped, chemin upstream constant `/api/needs-you`.
- `/inbox` : flux Needs You privé et validations de missions ATLAS distinctes. Aucun appel n'approuve une question MAUSBOT.
- `/` : aperçu de 3 demandes réellement retournées par MAUSBOT, ou état clairement non connecté. Aucun compteur inventé. Actualisation à intervalle modéré (30 secondes) si l'onglet est visible.
- Les actions indiquent la surface pertinente (Agents / Apps / Moteurs), **sans prétendre ouvrir directement le fil** ; l'espace Agents de la PR #74 devra offrir une navigation dans le fil avant activation d'un lien profond.
- Réponse strictement projetée : id, kind, at, botIds, threadId, app, question courte. Aucun objet `place`, `credit`, contenu de configuration, payload de notification, token ou URL upstream n'est exposé.

## Gates préalables – NE PAS activer automatiquement

1. Identifier l'origine HTTPS et l'instance réelle MAUSBOT (SHA-133).
2. Placer les secrets exclusivement dans Vercel, y compris la liaison workspace/instance. Ne jamais coller le token dans Linear, chat, GitHub ou journaux.
3. Autoriser seulement un test d'identité du bearer et vérifier que l'utilisateur représenté par ce bearer est **exactement** la personne à laquelle les demandes sont destinées. La lecture administrative ATLAS n'est pas une preuve suffisante si MAUSBOT est multi-personne / Team Cloud.
4. Sur confirmation documentée de cette liaison, définir `ATLAS_MAUSBOT_NEEDS_YOU_IDENTITY_VERIFIED=true` dans les secrets serveur du bon environnement. Sans cette variable, HTTP 423 et aucun contact au moteur.
5. Gate de lecture `ATLAS_MAUSBOT_RELEASE_STAGE=read-only` uniquement après revue SHA-133. Aucune modification du verrou write/execute (HTTP 423).
6. Refaire la recette d'accès multi-personne avant lecture réelle de questions privées. Le flux est limité à une seule installation/personne v0 : ne pas activer sur Team Cloud multi-identité tant que le mapping serveur par acteur n'existe pas.
7. Recette ergonomique desktop/mobile/PWA et vérification de la Preview sécurisée. L'environnement Preview ne doit pas hériter automatiquement des secrets Production.

**État de livraison :** implémentation testée avec fixtures et gardes de refus ; MAUSBOT réel non connecté. Aucune lecture live ni approbation MAUSBOT réelle attestée ici.
