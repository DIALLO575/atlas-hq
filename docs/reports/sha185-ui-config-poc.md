# SHA-185 — capacité de composition pour agent (PR 68)

## Base et cadrage

Main distant revérifié avant édition : c7ec18e93f44fc32e560ae8b74b7fd6664ce5249. Tête de départ PR 68 : ac99b79685d4db346440bc26e29e1ac88ee6e316, CI 40201584683 success. L’ancienne version bf39d5d était un prototype de réglages humains; elle est supersédée ici. Même branche/PR, aucun POC parallèle.

## Outil réellement appelable

`node scripts/ui-builder.mjs` lit des requêtes JSON, une par ligne. Une invocation = une session privée temporaire. Node 22 avec support TypeScript natif (ou Node 24). Opérations :

- `{"operation":"catalog"}` décrit composants, props, contraintes et sources.
- `{"operation":"compose","expectedVersion":0,"composition":{...}}` remplace atomiquement la composition validée; permet ajout, modification et suppression, retourne version, diff et previewPath.
- `{"operation":"restore","expectedVersion":1,"version":0}` crée une nouvelle version depuis une ancienne. Le contrôle expectedVersion refuse les commandes périmées.

Catalogue borné : PageHeading (obligatoire en premier, trois textes de 1..160 caractères) et DemoNotice (facultatif en second, sans props), issus de src/components/page-elements.tsx. Deux composants maximum; identifiants uniques; champs inconnus, pages hors Missions, actions, bindings, HTML et composants code refusés. Les textes passent comme chaînes React, jamais comme HTML ou code exécutable. L’ancien sélecteur humain de densité/couleur est retiré, avec son module devenu inutilisé.

## Scénario exécuté par J.A.R.V.I.S./Codex

Intention de démonstration choisie par cet agent pour illustrer la demande générale : « Sur Missions, prépare une introduction aux prochaines missions et ajoute l’avertissement de démonstration. » Ce n’est pas une citation d’une demande détaillée du Founder.

1. Cet agent a appelé catalog via le CLI et lu les deux composants disponibles.
2. Cet agent a choisi PageHeading, proposé titre/description puis ajouté DemoNotice en JSON via compose.
3. Le CLI a rendu version 1, diff avec un heading modifié et un bloc ajouté, et une URL relative de preview. Puis restore version 0 a rendu version 2 et le diff inverse.
4. Sorties réelles conservées dans docs/reports/sha185/agent-tool-run.ndjson. Ces appels n’ont modifié aucun fichier source. Les sorties ont seulement été enregistrées comme preuve.

Le previewPath retourne vers /ui-studio avec la composition encodée, validée de nouveau côté serveur. Le renderer importe et rend les vrais PageHeading/DemoNotice Atlas, sans générer du TSX. L’humain inspecte référence/proposition, diff et versions et peut restaurer; aucun placement manuel requis. Les données sont fictives, la référence n’est pas une page Missions active. Cette tranche ne modifie pas la route /missions ou ses données métier. La preview partage le shell Atlas mais ne change aucun réglage global; elle n’est pas une sandbox de code libre.

## Preuves et limites

`node --test tests/ui-builder.test.mjs` : tests de frontière CLI en sous-processus (catalogue, composition, suppression, rollback, URL revalidée et fichier page inchangé), rejets du contrat, conflit de version, séparation de deux sessions et copie de snapshots, limite de 50 versions, gate MausBot execute. Ce sont des tests d’intégration d’outil et de contrat, pas une preuve d’agent MausBot intégré. `git diff --check` exécuté. Typecheck/lint locaux non disponibles : node_modules absent; aucun install ni build VPS. La CI de la nouvelle tête et la recette navigateur restent à vérifier.

Blocage précis d’intégration : aucun handler UI Builder dans packages/ ou src/app/api avant ce travail (recherche ui-builder/ui_builder/ui-studio); packages/engine-core/src/release-gates.mjs bloque write/execute, même avec ATLAS_MAUSBOT_RELEASE_STAGE=enabled, code MAUSBOT_DURABLE_APPROVAL_REQUIRED, testé. docs/architecture/engine-hub.md documente ce verrou. Aucun drapeau changé. Un agent disposant de ce checkout et d’un outil terminal peut appeler le CLI (fait ici par Codex); le runtime MausBot ne possède pas encore une capacité UI Builder enregistrée. Aucun interpréteur langage naturel/LLM intégré à la page. Aucun service d’API distant non authentifié n’est ajouté.

Versions en mémoire seulement, historiques CLI et navigateur distincts; perdues à la fermeture/recharge. La composition est visible dans l’URL : données fictives et non sensibles exclusivement, aucune URL de preview ne doit porter des données de workspace. Pas de persistance partagée, d’identité authentifiée, d’audit durable ou d’activation. La séparation de sessions ne prouve pas une autorisation multi-workspace. Le catalogue de deux composants ne couvre pas encore les listes de missions. Aucun rendu navigateur/SSR React inspecté au moment du rapport.

Prochain petit pas : revue de cette frontière et CI, puis transport authentifié workspace/page/acteur + stockage versionné et audit, avec tests de deux utilisateurs/workspaces et refus d’activation hors rôle; ensuite brancher explicitement la capacité à un runtime agent autorisé sans affaiblir les gates existants. Élargir le catalogue aux composants métier Atlas uniquement avec accès aux données déjà contrôlé. Hors catalogue : branche/PR de code distincte.

Aucun merge, achat, crédit, secret prod, migration ou déploiement production.

## Tranche primitives seulement — 25 octobre 15h UTC

Instruction actuelle : aucun Browser, aucune recette visuelle, aucun ajout runtime/persistance. Main revérifié c7ec18e, tête de départ b26a0bd (CI 40202324129 success). Deux défauts corrigés : diff retourné partageait ses blocs avec les versions internes; comparaison des props dépendait de leur ordre. Ajout contrat de commande et union typée des blocs/props; catalogue et référence gelés récursivement; rejet des tableaux creux, objets non simples et clés symboles. Aucun fichier de rendu ou runtime changé dans cette tranche.

Tests ciblés : 11/11. Couvrent frontière CLI, composition/add/remove/restore, validations négatives, snapshots et diff détachés, comparaison indépendante de l’ordre des propriétés, échec atomique sans incrément de version, limite de texte/historique, isolation de sessions, catalogue immuable, CLI malformé/trop volumineux. git diff --check OK. Typecheck/lint locaux toujours indisponibles sans dépendances; aucune installation ni build VPS. CI nouvelle tête à consulter. Les limites de persistance/autorisation et rendu non vérifié restent inchangées.
