# SHA-196 · B2 — panneau /missions

## Livré
Panneau Missions mobile/desktop avec bulles, transitions, points animés seulement après un envoi effectivement accepté. Le libellé reste « En attente de réponse réelle » et ne simule jamais une phrase d'assistant. Animations et défilement doux désactivés par prefers-reduced-motion.

Raccourcis Explique, Résume, Fais une fiche : préremplissent le champ, sans appel réseau.

Historique par objet : GET /api/agent/thread accepte (workspaceId,pageKey=missions,objectId) pour retrouver un fil existant dans agent_threads. Le serveur contrôle owner, entité, mission et workspace. Le fil de la page et chaque mission sont distincts ; aucune migration.

Polling : single-flight 2000 ms pendant un tour accepté (90 s maximum), 15000 ms en dehors. Arrêt total et AbortController à visibilitychange hidden, et quand le panneau ferme ; reprise sans rafale au retour. Les erreurs de lecture déclenchent un backoff 15, 30 puis 60 s. Les lectures passent toujours par les routes serveur et le garde-fou existant.

Route POST /api/agent/interrupt : origine, JSON, rôle propriétaire et fil vérifiés. Réponse 423 MAUSBOT_DURABLE_APPROVAL_REQUIRED, aucun appel au fournisseur. Le bouton ne déclare jamais une interruption réussie si le serveur a refusé.

mutationsEnabled:false reste inchangé. Aucune clé ou token transmis au navigateur.

## Mesure et limites
L'interface mesure le délai de performance.now() immédiatement après décodage d'une réponse HTTP contenant un nouveau message réel à la première frame suivant le rendu React via requestAnimationFrame. Elle l'affiche localement en ms seulement lorsqu'un message réel arrive. Les coûts réseau et génération ne font pas partie de cette mesure.

Le seuil <300 ms et l'affichage au format 375 px nécessitent une recette dans un navigateur authentifié exécutant le vrai B2. Sans cela, ni capture de la PR ni valeur de production ne doivent être inventées. Les tests Node valident la programmation du polling, la reprise des fils et l'absence d'envois bloqués ; le build, la CI et le scan de secrets valident le reste.

Limite B1 inchangée : les API MausBot de conversation sont bloquées jusqu'à B3 et aucun fil neuf ne peut être créé par ce panneau. Historique des messages distants limité à la fenêtre des 30 derniers messages.

Aucun merge, déploiement, migration, modification des pages Journal/Lecture ou du service worker.
