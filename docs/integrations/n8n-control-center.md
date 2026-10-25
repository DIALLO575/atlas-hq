# n8n dans Mes Apps et Moteurs — SHA-174 (PR03)

## Livrable
La navigation Atlas contient une fiche n8n dans le catalogue statique, une page de contrôle pour les workspaces de l'utilisateur et un moteur n8n au registre. Ces interfaces ne sont PAS la preuve d'une installation n8n ou d'une connexion live.

## Contrats réutilisés
- Supabase Auth SSR et table workspace_members pour la liste des workspaces autorisés.
- requireEngineWorkspace(workspaceId) réutilisé avant le GET de registre; les colonnes de atlas_engine_instances sont sélectionnées de façon restrictive, filtrées par workspace_id **et** engine_key n8n.
- POST /api/engines/instances réutilisé sans changement : owner/admin uniquement, origin strict, body allowlist, planEngineRegistration strict. L'action de l'UI n'enregistre qu'une instance en état offline et ne manipule pas de credential.
- Engine catalog commun (packages/engine-core/src/catalog.mjs). On ne crée aucun moteur/agent parallèle ni de nouveau schéma Supabase.

## Statuts
- not-configured : aucune configuration serveur complète de l'instance pilote pour ce workspace.
- preconnection : paramètres serveur syntaxiquement valides pour le workspace, mais **pas de connexion réseau** et zéro capacité certifiée en live.
- configuration-error : paramètres présents mais invalides; aucune valeur de secret, d'URL ou d'en-tête n'est renvoyée.
- Une instance atlas_engine_instances enregistrée offline est seulement une métadonnée. Même si le registre DB indiquait connected, le BFF renvoie toujours connected:false tant qu'aucun handshake n'a été certifié.

## REST, MCP et webhooks
Le client REST de SHA-173 existe côté serveur uniquement. Le centre de contrôle de SHA-174 ne l'invoque jamais : la validation de destination DNS de SHA-173 ne protège pas à elle seule contre un rebinding DNS entre le lookup et le socket fetch. Une protection réseau egress épinglée ou équivalente avec preuves et un gate d'activation sont obligatoires AVANT utilisation réelle.

MCP et webhooks restent des contrats catalogués, non des fonctions opérationnelles. Les deux transports de registre http/mcp sont compatibles avec les contraintes SQL existantes; le webhook est un type de capacité produit et ne peut pas être arbitrairement inséré comme transport SQL.

## Tests et permissions
- GET /api/apps/n8n/status?workspaceId=UUID nécessite session Supabase + membership du workspace. Pas de routes POST n8n arbitraires.
- Les lectures SQL sont filtrées par workspace et engine_key, sous RLS; réponse limitée à 20 lignes, projection sans secrets ni données de workflows.
- Écran uniquement peuplé depuis les workspaces réellement accessibles. Un membre a lecture seule; owner/admin peut demander l'enregistrement d'une instance offline via le BFF existant.
- Pas de stockage de token, URL externe, refresh OAuth, import workflow, sync worker, création de run ou de migration prod.
- Des tests Node statiques et de contrats couvrent l'isolation des surfaces et l'enregistrement offline. Une vraie preuve RLS E2E Auth est reportée à la certification du connecteur.

## Étapes
SHA-175 : modèle workflow/exec metadata et sync lecture seule après revue des permissions, migration et isolation cross-tenant.
SHA-176/177 : identité, outbox, approbation, egress contrôlé et véritable connexion sandbox.

Le pictogramme n8n est un symbole **original générique de workflow**, non le logo officiel du fournisseur; sa présence ne constitue pas une affiliation.
