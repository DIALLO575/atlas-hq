# SHA-180 / PR09 — Chief, Agents, Missions et workflows n8n (lecture uniquement)

**Périmètre livré** : un modèle de lecture `projectN8nCoordination`, une route SSR Supabase Auth/RLS `GET /api/apps/n8n/coordination` et un composant commun pour Chief, Agents et Missions. **Aucune exécution, liaison d’agent ni modèle IA installé.** Statut SHA-119 : backlog. Pas de migration SQL nécessaire.

## Provenance des données et sécurisation

Les tables déjà appliquées par SHA-175 et SHA-177 sont les seules sources :
- `public.atlas_automation_workflows` : IDs internes, instance, nom, état de synchronisation, dernier horodatage vu.
- `public.atlas_automation_executions` : IDs internes, workflow associé, mission facultative, statut et horodatages. **Le flux ne lit jamais** les nodes, prompts, tokens, credentials, graphes, raw outputs, clés HMAC ou reçus du schéma `private`.
- Le contrôle `requireEngineWorkspace(workspaceId)` vérifie la session Supabase Auth et l’appartenance au workspace avant les deux SELECT, tous deux soumis à la RLS Supabase et filtrés explicitement sur `workspace_id`. Si `missionId` est fourni, le SELECT exécutions ajoute aussi `.eq('mission_id', missionId)`. Les listes ont une borne SQL de 51 lignes et affichent au maximum 50 éléments pour indiquer correctement un extrait partiel.
- `projectN8nCoordination` refuse les incohérences tenant, instance, mission, statut, UUID et doublons de données. Il projette uniquement les métadonnées attendues, vérifie les contraintes de forme et garde les compteurs explicitement nommés **« entrées montrées »** ; un registre vide ne prouve pas l’absence de workflows sur le serveur n8n.

## Écrans

- **Chief** : bloc de briefing déterministe existant maintenu, panneau complémentaire n8n affichant les workflows enregistrés et les exécutions visibles. Pas de nouveaux outils LLM, chat libre, mémoire ni writebacks; **SHA-119 n'est pas achevée**.
- **Agents** : sélection d’un workspace parmi les memberships réels (via `readAtlasWorkflow`), carte n8n et mention « agent n8n certifié : non vérifié ». On ne lit pas directement `private.atlas_engine_agent_bindings` pour ne pas confondre des lignes de binding ou des workflows avec une identité agent reconnue. Aucun agent n'est fabriqué, aucun binding n'est écrit.
- **Missions** : carte d’automatisation commune et liens depuis les missions réellement visibles vers un filtre `missionId` dont la correspondance est vérifiée parmi les missions du workspace courant. Les exécutions n8n autonomes sans mission restent représentables lorsque le filtre n’est pas actif ; aucune mission fictive créée, aucun bouton « exécuter » introduit.
- **Mobile** : CSS module réactif, affichage d’état chargement/erreur/aucune entrée; annulation des requêtes concurrentes côté React pour éviter la contamination visuelle après changement de workspace.

## Limitations explicites

Le registre Supabase est toujours vide en production à la dernière inspection connue : les tableaux de bord montreront normalement zéro *entrée enregistrée*, sans supposer qu'il n'existe aucun workflow côté fournisseur. La liste n'est pas un inventaire n8n live. Les compteurs sont des **extraits bornés**, ni un total global ni une statistique d’activité historique.

Le worker partagé, l'approbation, les capacités MCP n8n, le Gateway et les liaisons Engine Agents restent en PR DRAFT. Même un état `observed` dans la base désigne **une ancienne observation déclarée**, non une autorisation actuelle d'exécuter. SHA-176 bloque les activations en SQL et par HTTP 423.

## Vérifications

- Node mock : deux tenants, mission d'un autre workspace, instance incorrecte, exécution autonome, injection de payload/token, projection strictement bornée, compteurs non fabriqués.
- Tests statiques : même composant sur trois routes, appels SSR Auth/RLS, aucun POST fournisseur ni clé secrète; UI filtre mission attesté et affiche Chief non agentique.
- CI GitHub : npm test, typecheck, lint, build, audit et scanners ainsi que les tests PostgreSQL existants.
- À faire après fusion : E2E navigateur Auth à deux workspaces avec vraie RLS et vérification visuelle sur staging, sans production Vercel automatique.

**Aucune migration Supabase PR09** : réutilise exactement les tables appliquées dans PR04/05/06. Si la couverture Agent↔workflow persistante devient nécessaire ultérieurement, elle requiert un schéma/contrat spécifique et une nouvelle revue multi-tenant.
