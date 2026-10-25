# Notion V2 — mobile PWA workspace (SHA-190)

## Objectif

L'espace Notion d'ATLAS ressemble à une **véritable application mobile**, comme l'espace GitHub déjà déployé, mais utilise une **identité Notion neutre** : noir \`#191919\`, blanc \`#fff\`, gris chaud \`#f7f7f5\`, texte secondaire \`#787774\`.

**Périmètre : uniquement \`/apps/notion\`**. Le service worker, le manifeste PWA global, les routes GitHub, l'accueil et le dock ATLAS ne changent pas. Le shell existant est recouvert par la route Notion **seulement sur téléphone (largeur ≤760px)**. À l'écran large, le cockpit utilise la même palette monochrome sans supprimer ses panneaux de productivité.

## Parcours mobile concret

- **Barre supérieure :** flèche Retour à \`/apps\`, pictogramme Notion « N », nom de l'app, accès explicite à la gestion des connexions.
- **Écrans séparés :** \`Explorer\` (bibliothèque/recherche), \`Lecture\` (page enrichie, Markdown sûr, médias, table des données), \`Vues\` (vues Notion réellement accessibles et aperçu fournisseur), \`Accès\` (droits, connexion personnelle, révocation).
- **Transitions :** choisir une page/source ouvre la Lecture ; choisir une vue ouvre Vues ; la navigation inférieure permet de revenir à Explorer. Si aucune base n'est sélectionnée, Vues affiche une explication au lieu d'une fausse vue.
- **Lecture plein écran :** colonnes et sidebar desktop **ne sont plus empilées**. Les longues pages, les médias réels et les tableaux défilent dans l'app, avec défilement horizontal explicitement conservé pour les sources.
- **Confort PWA :** \`100dvh\`, safe area iOS/Android, 4 zones tactiles d'au moins 50px dans la barre basse, espaces pour clavier mobile (\`input:focus\`), hauteur réduite, focus visible, mouvement réduit, évitement des débordements horizontaux.
- **État non connecté :** le texte de mise en attente reste honnête. L'OAuth ATLAS→Notion **n'a toujours pas été validé par une vraie autorisation fournisseur** : aucune ressource inventée.

## Revue et sécurité

L'authentification, les tokens et droits d'accès aux ressources restent côté serveur dans les routes existantes. Pas de modification d'OAuth, de variables Vercel, de Supabase, du manifeste ni du service worker. Aucun faux Kanban/calendrier interactif ni appel de lecture automatique depuis un nouveau dock.

- Tests Node de contrat \`tests/notion-mobile-pwa-workspace.test.mjs\`, typecheck, lint, suite complète, build Next, CI GitHub sur PR.
- **Recette mobile visuelle réelle à faire :** 375px, 390px, 768px et 1440px, safe area, clavier, contenu long, pages/médias, droits 403/404, vraie base/vue, déconnexion, vraie session OAuth autorisée SHA-134.
- **GO fournisseur : non** tant que SHA-134 n'a pas passé le consentement test limité à \`ATLAS — TEST\`, W1/W2, refresh, révocation et les écrans réels.

Références : [SHA-182](https://linear.app/shadoron/issue/SHA-182) (mission), [SHA-189](https://linear.app/shadoron/issue/SHA-189) (design), SHA-190 (mobile), [SHA-134](https://linear.app/shadoron/issue/SHA-134) (recette OAuth).
