# ATLAS × MausBot — B1 (SHA-194), brouillon non activé

Le module B1 crée des préférences serveur et un panneau pour la page Missions seulement. L'entité est configurée par le propriétaire pour la page ; l'API relit la préférence en base avant de traiter une demande. Si plusieurs entités spécifiques coexistent dans le même workspace, l'API refuse (403). Ce rattachement est une décision du propriétaire, pas une identité vérifiée auprès de MausBot : une revue de ce modèle reste requise avant B3.

Les valeurs de configuration sont journal → MORGANS, * → ROGER, lecture → ROGER. Ce sont des préférences, non des exemples de messages, ni une preuve de connexion. La clé page_key est unique à l'intérieur du workspace, plutôt que globalement ; plusieurs workspaces peuvent avoir des valeurs différentes sans conflit.

Les tables agent_threads et agent_send_receipts sont séparées par workspace et entité. La table des reçus impose l'unicité du send_id par workspace et conserve un digest, jamais un texte de question ni un secret. Le polling lit des messages MausBot réels par identifiant et les projette avec masquage défensif des motifs de tokens connus.

## Verrou explicite

Le code principal impose mutationsEnabled:false et refuse les primitives MausBot write/execute. Or envoyer une question et créer une tâche sont des écritures HTTP. Le gateway vérifie ce verrou AVANT toute création de tâche, tout audit ou envoi. Tant que B3 n'est pas activé et revu, POST /api/agent/ask répond 423 (MAUSBOT_DURABLE_APPROVAL_REQUIRED), jamais avec une réponse inventée.

Les protections préparées mais encore non exercées en production incluent : vérification de session propriétaire, relecture serveur de l'objet mission et des préférences d'entité, inventaire d'agents réels, répartiteur de concurrence et de cooldown, réservation de send_id et journal d'audit existant. Une revue de B3 devra traiter la concurrence lors de la première création de tâche et la réponse réelle du serveur MausBot.

## Conditions de livraison

- PR brouillon issue de main, non mergée ; pas de migration distante ni de déploiement demandé.
- Migration SQL 20261026153500_atlas_agent_page_gateway.sql et rollback destructif correspondant sous supabase/rollbacks.
- Tests Node et fixture PostgreSQL éphémère en CI, avec rollback testé.
- Aucun changement aux pages lecture ou journal ni à public/sw.js.
- Captures desktop/mobile non produites sans environnement navigateur authentifié et autorisé.
