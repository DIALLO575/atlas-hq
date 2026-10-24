# SHA-135 — Registre durable de références Notion (lot 3)

**Proposition pour revue, jamais une preuve de permissions.**

- Migration source **non appliquée en Supabase officiel** : `20261024160100_atlas_notion_resource_observations.sql`. Elle crée `atlas_notion_resource_observations` avec RLS sans policy navigateur, des RPCs `service_role` uniquement et un trigger de purge sur révocation.
- Les champs conservés sont `connection_id`, `workspace_id`, `user_id`, `notion_workspace_id`, `resource_kind`, `resource_id`, `connection_version`, `source_updated_at` et `observed_at`. **Pas de titre, contenu de page, jeton, résumé ou permission persistée**.
- Un RPC atomique vérifie en base : rôle owner/admin actuel, registre correspondant à une connexion REST Notion active, version exacte du coffre, absence de refresh en cours, puis enregistre les métadonnées. Un `SELECT FOR UPDATE` sérialise l'enregistrement avec le refresh/revoke.
- Un RPC de liste retourne uniquement les références personnelles et encore actives, versionnée, avec limite 1–20 et métadonnées de moins de 30 jours. Un enregistrement **ne constitue jamais une autorisation actuelle** : le routeur doit refaire un appel Notion réel avant chaque action.
- Une révocation (y compris un échec fermé de refresh) purge immédiatement les observations de la connexion. La suppression de membership ATLAS supprime via FK `ON DELETE CASCADE`.
- L'usage par Chief/Missions est **lecture de références minimales** : pas d'accès au contenu par ce nouveau RPC, pas de mutation ni d'agent activé.

**Vérification** : tests SQL jetables multi-tenant, grant, version CAS, refresh, révocation ; puis vérification par CI. Les vraies permissions Notion demandent encore la recette SHA-134.

Voir `docs/integrations/notion-capability-policy.md` et PR #34.
