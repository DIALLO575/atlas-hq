# SHA-185 — Lot A révisé, tranche locale

Base main distante vérifiée par git ls-remote : 9d64498dceb6d80e0c126854bc02e0bbcae4f1f0.
Branche dédiée : feat/sha185-ui-config-poc. Le précédent commit 65d2526 est préservé sur sa branche; il n’est pas repris dans ce POC.

Route ajoutée : /ui-studio. Démonstration Missions avec données fictives publiques uniquement. Deux réglages énumérés, densité et accent; aucun HTML, CSS ou JavaScript libre. Chaque modification passe par parseConfig. Référence immuable, aperçu indépendant, historique borné à 50 versions, restauration dans le brouillon. Aucun appel réseau ni stockage partagé ajouté. Aucune modification des missions ou préférences réelles.

La version de référence est celle du POC, pas la configuration active d’un workspace. L’historique est en mémoire React par instance de page : il est perdu au rechargement. Le POC ne constitue donc pas encore une persistance/version active par workspace. Aucune autorisation serveur n’est revendiquée : cette page ne lit aucune donnée métier. Les tests d’indépendance d’historique ne prouvent pas une isolation multi-utilisateur serveur.

Vérifications exécutées : node --test tests/ui-studio-config.test.mjs : 5/5, git diff --check : OK. Typecheck : tsc absent, lint : eslint absent (node_modules non installé). Aucun build ni installation exécuté. Rendu React, interaction navigateur, accessibilité et compilation Next non vérifiés. Aucune preview provisionnée; aucun coût nouveau, push, PR, déploiement ou migration.

Suite nécessaire : dépendances de développement dans un environnement autorisé, contrôle type/lint, recette navigateur de /ui-studio; puis persistance serveur avec clé workspace/page/utilisateur, membership vérifiée, rôle pour activation, contrôle de concurrence, audit et tests croisés de deux membres/workspaces. Réutiliser le même validateur serveur; ne pas accepter une identité fournie par le client comme autorisation. Aucun stockage navigateur partagé n’est proposé comme remplacement de cette frontière serveur.
