# ATLAS HQ — Instructions communes aux agents de développement

**Portée : tout le dépôt ATLAS HQ, y compris ses sous-dossiers.**
Tout agent qui lit les instructions du dépôt doit appliquer les règles ci-dessous avant de modifier, pousser, fusionner ou déployer du code. Ce fichier est la référence commune.

## PRIORITÉ : quota Vercel et discipline de publication

L'équipe Vercel partage un quota de déploiements. Un simple \`git push\` sur une branche suivie peut déclencher automatiquement **un déploiement Preview**, même si personne n'a cliqué sur « Deploy ». Un merge vers la branche de production peut déclencher **un déploiement Production**. Les déploiements manuels et redéploiements comptent également.

1. **Regrouper le travail AVANT les pushes.** Faire les corrections, tests et petites retouches dans le même lot. Ne pas pousser un commit différent pour chaque erreur de lint, message, CSS, documentation ou test.
2. **Vérifier avant de pousser.** Utiliser les outils disponibles pour exécuter/revoir \`npm test\`, \`npm run typecheck\`, \`npm run lint\`, \`npm run build\` (ou les contrôles ciblés adaptés) avant de multiplier les commits distants. Les checks CI ne remplacent pas la préparation locale.
3. **Limiter les previews.** Viser **un seul aperçu Vercel vérifié par fonctionnalité ou lot cohérent**, après les tests, plutôt qu'un aperçu après chaque petite modification. Une exception est possible si un test indispensable échoue ou sur demande explicite de l'utilisateur; expliquer alors la consommation.
4. **Ne pas multiplier les déploiements explicites.** Ne pas appeler \`create_deployment\`, \`redeploy\`, \`forceNew\`, \`vercel deploy\` ou déclencher de nouveaux builds tant qu'un preview automatique vérifiable existe et suffit. Ne pas relancer en boucle en cas d'erreur.
5. **Ne pas considérer une fusion comme une publication.** Avant d'annoncer la production, contrôler le SHA du déploiement, l'état Vercel \`READY\`, l'assignation au domaine officiel et les routes concernées. Distinguer *code prêt*, *preview* et *production*.
6. **En cas de limite 402 / \`api-deployments-free-per-day\` : arrêter les tentatives.** Conserver le travail testé dans GitHub, signaler la limite et attendre son rétablissement ou une décision explicite de l'utilisateur. Ne pas contourner les quotas, ni changer la facturation, les permissions ou le plan sans autorisation.
7. **Documentation et modifications mineures : éviter un build inutile.** Examiner la configuration Vercel des *Ignored Build Steps* / règles Git avant de proposer un réglage, puis le valider avec l'utilisateur. **Ce document est une politique pour les agents, pas un mécanisme automatique de blocage Vercel.**
8. **Coordination.** Plusieurs agents peuvent travailler en parallèle : éviter les pushes concurrents, vérifier la tête de la branche avant de mettre à jour une référence et privilégier une revue groupée. Ne pas écraser les commits d'autres agents.

### Checklist avant une livraison

- [ ] Changements regroupés dans un lot cohérent, sans commits de correction inutiles.
- [ ] Tests + lint + typecheck + build vérifiés autant que possible avant le push.
- [ ] Existe-t-il déjà un Preview du SHA visé ? Le réutiliser au lieu d'en créer un.
- [ ] Production explicitement demandée et migrations/autorisations prêtes ?
- [ ] SHA, \`READY\`, domaine officiel et parcours réel vérifiés après publication.

### Portée et honnêteté

- **Les instructions d'un dépôt ne sont visibles qu'aux agents qui ouvrent ce dépôt et lisent ses consignes.** Elles ne sont pas une mémoire globale de tous les agents externes.
- La politique n'empêche pas à elle seule Vercel de créer automatiquement des previews lors des pushes GitHub. Le filtrage automatique éventuel nécessite une configuration Vercel distincte, revue et autorisée.
- En cas de conflit avec une consigne explicite de sécurité ou avec les instructions de plus haute priorité, appliquer la consigne prioritaire.

*Instruction instituée pour limiter les previews et préserver les déploiements de production d'ATLAS HQ.*
