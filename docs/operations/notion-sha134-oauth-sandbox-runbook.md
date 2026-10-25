> **Statut consolidé au 25/10/2026 :** le code Notion V2 avancé est candidat **non déployé**. La page « ATLAS — TEST » a été créée via la connexion ChatGPT à Notion, **pas** par ATLAS OAuth. Recette toujours **NON EXÉCUTÉE**. Voir [le bilan réel et la checklist](notion-v2-etat-reel-et-recette-2026-10-25.md).

# SHA-134 — Recette OAuth Notion REST en sandbox (GO/NO-GO)

**Statut : NON EXECUTEE sur Notion.** Ce runbook prépare la recette, il ne vaut pas preuve fournisseur. Périmètre : OAuth REST public, acteur/workspace ATLAS, lecture seule, isolation, refresh CAS, révocation. MCP OAuth, webhooks, workers, écritures et migrations sont exclus.

## Référence immuable et limites

- Base GitHub revue : `DIALLO575/atlas-hq` / `feat/notion-v2-hardening-20261024` / `6c2dd6f0fa68ec59631bf73abd702584afa3578e`. CI #40139093861 verte **sur ce SHA**, pas sur les changements préparés ici.
- Checkpoint SHADORON `checkpoint-e2d6fcf9d2ee2f4cd6ffecd1a5e39111e3159543d4829137baaf5e7729f0a7e8` : six migrations V2 appliquées à Supabase officiel, droits contrôlés, zéro connexion Notion au dernier comptage. Recontrôler l'état en lecture seule avant recette.
- Pas de jetons, codes, `state`, cookies, clés ou réponses fournisseur en GitHub, Linear, SHADORON, screenshots, logs applicatifs ni navigateur. Aucune connexion réelle sans sandbox expressément autorisée. Ne pas déclencher Vercel, push ou merge pour cette préparation.

## Prérequis bloquants (tous à confirmer avant un OAuth réel)

1. **Notion** : workspace de test identifiable, propriétaire/témoins et consentement explicite. Intégration **publique REST** dans le Developer Portal, installation scope autorisant cet espace, droit de lecture contenu, redirect exact et autorisation de la connexion. Ne pas utiliser un token interne ni confondre OAuth MCP.
2. **Pages** : P_shared, page de test au titre unique avec blocs inoffensifs, explicitement partagée avec la connexion ; P_private, page connue par l'opérateur mais **non partagée**, y compris par héritage d'un parent. Garder les IDs et le contenu hors tickets publics.
3. **Identités ATLAS** : A owner/admin de W1, B owner/admin de W2 **et non membre de W1**. Pour tester une connexion personnelle dans un workspace partagé, donner aussi temporairement à B le rôle admin de W1, avec autorisation explicite, puis vérifier que la connexion de A reste invisible.
4. **Hébergement** : origine HTTPS de staging accessible, code déployé au **SHA candidat exact**, session ATLAS valide et base staging avec schéma/droits attendus. Pas de déploiement dans ce runbook ; attendre la passe Vercel groupée.
5. **Configuration serveur via gestionnaire de secrets** : `ATLAS_PUBLIC_ORIGIN`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NOTION_OAUTH_CLIENT_ID`, `NOTION_OAUTH_CLIENT_SECRET`, `NOTION_OAUTH_REDIRECT_URI`, `NOTION_OAUTH_STATE_KEY` (>=32 octets), `NOTION_OAUTH_TOKEN_KEY_ID`, `NOTION_OAUTH_TOKEN_KEYS` (keyring AES-256-GCM JSON). `NOTION_OAUTH_CALLBACK_ENABLED=true` **seulement en staging pendant la recette** ; OFF en production. Fournir uniquement une attestation de présence/validation, jamais les valeurs.
6. **Callback exact** : `<ATLAS_PUBLIC_ORIGIN>/api/apps/notion/oauth/callback`. `ATLAS_PUBLIC_ORIGIN` est l'origine HTTPS stricte, sans chemin ni slash final. Les URI configurées dans Notion et ATLAS doivent être identiques. REST Notion-Version `2026-03-11`. Garder workers, webhooks, MCP et budgets optionnels OFF sauf validation spécifique.

## Matrice de recette (consigner heure UTC, acteur, SHA, statut, preuve anonymisée)

| Cas | Geste contrôlé | Attendu |
| --- | --- | --- |
| O1 — consentement | A/W1 POST `/api/apps/notion/connect/start` (form `workspaceId=W1`, Origin HTTPS exact), choisir le workspace Notion et P_shared | 303 Notion, cookie HttpOnly/SameSite=Lax, callback 303 `/apps/notion?notion=connected`; bot ID revalidé via `/v1/users/me`; registre + chiffrés liés à A/W1, jamais renvoyés au navigateur |
| O2 — titre/blocs | A/W1/C GET `/api/apps/notion/read?...&kind=search&query=<titre-test>`; puis `kind=blocks&resourceId=P_shared` | 200; résultat du titre et blocs whitelisted; aucune donnée secrète brute |
| O3 — refus fournisseur | A/W1/C `kind=blocks&resourceId=P_private` | Refus Notion **403 ou 404** et aucun bloc; absence de P_private dans search **ne suffit pas** |
| O4 — cross-workspace | B non membre de W1 lit et déconnecte C de A avec W1 | **403**, C reste intacte |
| O5 — cross-owner | B/W2 avec C de A ; puis B admin de W1 avec C de A (test distinct) | **404** / **404**, jamais les credentials de A, aucun effet de bord |
| O6 — state | Cookie absent/mismatched, signature modifiée, délai >15 min; réutiliser un retour déjà consommé | Retour `notion=invalid-state`, aucun stockage, pas de seconde consommation. Un refus de consentement consomme aussi le state |
| O7 — 401/refresh | Sur **vrai 401 fournisseur** d'une connexion de test autorisée, lancer deux lectures concurrentes | Une seule acquisition SQL CAS, une rotation de **deux tokens** et incrément de version, un seul retry lecture; seconde requête en conflit/attente sans autre rotation |
| O8 — échec de refresh | Sur installation dédiée autorisée uniquement, provoquer un échec/issue ambiguë | Tombstone locale par tentative, reconnexion requise, pas de replay d'ancien refresh token. Mock seul ≠ preuve fournisseur |
| O9 — déconnexion | A/W1/C POST `/api/apps/notion/connect/disconnect` avec Origin exact et form-url-encoded | Révocation locale avant appel distant; `providerRevocation=confirmed` ou `pending`; lectures ultérieures refusées |
| O10 — confidentialité | Examiner journaux/captures et réponses des cas précédents | Aucune fuite de token, code, state, cookie, payload fournisseur; seulement états et erreurs sûrs |

**Attention :** Notion ne garantit pas l'apparition naturelle d'un 401 dans la durée de recette. Si ce cas ne se produit pas, marquer **O7 réel = BLOQUÉ**, même si des tests mock/SQL sont verts. Ne jamais corrompre les jetons officiels ou forcer une révocation non autorisée pour fabriquer la preuve. Le `401` fournisseur peut donner un `409` / `503` côté route publique après échec de refresh.

## Collecte et décision

Consigner pour chaque cas : PASS/FAIL/BLOCKED, SHA exact, acteur anonymisé A/B, W1/W2, heure UTC, statut HTTP, capture redigée et preuve de non-mutation pour les refus. Aucune URL de callback avec query code/state ne doit être enregistrée. Après recette, retirer les partages de test avec l'autorisation du propriétaire et traiter les révocations distantes en attente.

**NO-GO tant que** manque un workspace test autorisé, une app OAuth et des identités test, le callback/domaine candidat READY, une preuve réelle lecture + refus, la vérification cross-tenant, l'anti-rejeu, le refresh/révocation attendus, ou la revue des logs. Une CI verte n'est pas une preuve Notion. La décision GO production exige un acte explicite ultérieur, le bon SHA/alias Vercel READY, un propriétaire de rollback et la distinction preuves réelles vs mocks.

**Rollback sans migration :** `NOTION_OAUTH_CALLBACK_ENABLED=false`, flags/workers OFF, puis examen des accès et éventuelles révocations restantes. **Point d'attention :** la désactivation du callback bloque aussi `loadNotionPersonalConnection` dans la route UI de déconnexion ; prévoir une procédure serveur séparément autorisée pour tombstone/revocation des grants existants. Ne jamais réouvrir RLS ni rejouer les migrations.

Sources : [SHA-134](https://linear.app/shadoron/issue/SHA-134/notion-recette-oauth-reelle-isolation-multi-tenant-et-gono-go), [Notion OAuth REST](https://developers.notion.com/guides/get-started/authorization), [Notion refresh](https://developers.notion.com/reference/refresh-a-token).
