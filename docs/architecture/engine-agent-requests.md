# Création d'agent — demande de revue hors ligne

Cette tranche prépare **un profil d'agent** lié à une mission ATLAS et une instance
MAUSBOT hors ligne. Elle ne crée aucun agent dans le moteur, ne choisit aucun
modèle/outil et ne provisionne aucune équipe. KMS toujours différé.

## État de livraison

Code proposé : formulaire `/agents`, API `/api/engines/agent-requests`, détails
lisibles dans l'Inbox existante et SQL dans
`supabase/proposals/engine-agent-request-v1.sql`.
**Le SQL est une proposition testée en PostgreSQL jetable, pas une migration
appliquée à Supabase.** Le POST échoue proprement tant que la RPC n'est pas installée.
Aucune disponibilité Web ni E2E sur de vraies sessions ne découle du build.

Avant application ultérieure : revue SQL, promotion en migration additive avec
numéro officiel, contrôle du registre/projet cible, sauvegarde/procédure de retour,
conseillers de sécurité et vérifications de privilèges. Ne pas rejouer aveuglément.
Ne pas déployer ce parcours en production avant coordination schéma/API.

## Parcours

1. Owner/admin authentifié sélectionne workspace, instance hors ligne et mission
   planifiée/active ; toutes les options viennent des tables accessibles, pas de démos.
2. Il saisit nom, rôle et description. Aucun token, permission Full, identité d'acteur,
   choix de primitive, modèle ou outil ne peut être ajouté à cette requête.
3. SQL vérifie session actuelle, rôle actuel et ressources du même workspace sous
   verrous. Il fixe `agents.create`, le demandeur `auth.uid()`, l'empreinte SHA-256 du
   profil normalisé JSONB, puis l'empreinte d'intention existante.
4. Run awaiting-approval, demande pending de 15 minutes et audit append-only sont
   créés dans la même transaction. Une panne d'audit annule tout.
5. Un reviewer différent voit nom/rôle/description et l'empreinte exacte avant
   d'utiliser les boutons PR40. La RPC de détails revérifie session/role et exclusion
   de ses propres demandes. Sans profil disponible, approbation bloquée dans l'UI.
6. La décision laisse le moteur verrouillé et le run non autorisé ; aucune outbox.

`requestId` UUID est l'identifiant du run et la clé de rejeu. Le même acteur peut
rejouer la même demande avec cet ID sans second audit. Changer profil, mission,
instance ou workspace sous le même ID est refusé. Le formulaire conserve cet ID
pour une nouvelle tentative sans modification ; il n'est pas persisté après un
rechargement de page. Un nouvel ID est une nouvelle demande, pas une déduplication
sémantique par nom d'agent. Deux requêtes concurrentes avec le même ID sont testées.

## Confidentialité et limites

Le profil proposé est du texte non fiable, affiché via React sans HTML brut.
Il est stocké dans `atlas_engine_runs.request_summary`, visible au demandeur et
aux admins selon RLS existante, et couvert par l'empreinte immuable. Ce champ est
réservé aux métadonnées de profil, jamais à des credentials/secrets. Pas de payload
arbitraire ni de prompt de mission dans cette tranche. SQL refuse toute modification
du résumé après insertion et vérifie son hash.

La RPC publique est SECURITY INVOKER, l'implémentation privilégiée privée est
SECURITY DEFINER avec search_path vide, anon sans EXECUTE. Aucun SELECT client
sur la table privée approvals n'est ajouté. Le BFF utilise le client Supabase
utilisateur, jamais service_role ; le body ne porte pas d'acteur/approbation.

Restent : revue/application du SQL sur cible identifiée, tests vrais comptes/UI,
contrôle de l'état des ressources au moment de la future exécution, intégration
avec worker/contexte/droits/outbox et création MAUSBOT autorisée. Les imports
équipes, canaux et missions exécutables sont des tranches suivantes.

## Vérification

Tests BFF exécutent la route compilée avec stubs des frontières auth/DB : origine,
champs forgés, profils invalides, gate membership, paramètres RPC exacts et erreurs
expurgées. PG17 jetable vérifie digest/résumé immuables, rejeu, cross-tenant,
reviewer distinct, décision PR40 sans dispatch, sessions révoquées/expirées, rôle
retiré, rollback d'audit et concurrence deux connexions. Pas de test live MAUSBOT.
