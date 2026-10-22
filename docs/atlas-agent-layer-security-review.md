# ATLAS AGENT LAYER — revue sécurité

Date : 2026-10-22. État : exigences proposées, non implémentées.

## Verdict

**NO-GO pour transmettre des données GitHub réelles ou créer une mission connectée.** La PR #1 livre une interface de démonstration; les artefacts examinés ne montrent ni authentification ATLAS, ni connexion GitHub, ni autorisations workspace, ni API de mission OpenMausBot, ni isolation de données.

Le premier incrément autorisable après clôture des critères ci-dessous est une revue strictement en lecture seule : demande explicite d'un membre autorisé, dossier borné pour une PR épinglée, mission OpenMausBot réelle de l'agent choisi, rapport lié à la PR exacte. Pas de commentaire, écriture, exécution de code, label ou merge GitHub.

## Éléments examinés et limites

- Dépôt public [DIALLO575/atlas-hq](https://github.com/DIALLO575/atlas-hq). `main` = `2a78c11d7adc8cedaf61b1aa697a11b4e69e6b5c`; arbre contenant uniquement `README.md`.
- [PR #1](https://github.com/DIALLO575/atlas-hq/pull/1), ouverte et non fusionnée : base `main`, tête `feat/atlas-hq-foundation`, SHA `25ab398e3728e40284d2988275c07169219aea1b`. Le README de la PR et `src/app/agents/page.tsx` confirment le mode démo et l'absence de connexion d'agent. Les 34 fichiers changés forment l'interface Next.js/PWA, des exemples et des tests de contrat statiques; aucun backend ou schéma d'autorisation.
- Les recherches GitHub de branches « agent » et « security » n'ont retourné aucune branche.
- Scopes OAuth, liaison d'installation, permissions effectives de VISION, API OpenMausBot, RLS, hébergement et rétention ne sont pas établis. Cette revue ne les présume pas et ne prouve pas leur configuration externe.

## Contrôle d'autorisation obligatoire

L'autorisation est calculée côté serveur à partir de la session authentifiée et vérifiée à nouveau avant transmission et affichage du résultat. Le client ne peut fournir une preuve de rôle, workspace, connexion ou droit. Exiger simultanément :

| Dimension | Contrôle et refus attendu |
| --- | --- |
| Utilisateur | Session valide et compte actif; sinon refus avant assemblage du contexte. |
| Workspace | Membre actif avec droit de demander une revue; ID de workspace client jamais fiable. |
| Connexion GitHub | Connexion/installation active liée à ce workspace et permissions attestées; révocation ou ambiguïté = refus. |
| Dépôt/PR | ID de dépôt immuable couvert par la connexion; vérifier que la PR en dépend, épingler repo ID, PR number, base SHA et head SHA. Rejeter ID/URL contradictoire, fork non autorisé ou accès perdu. |
| Agent | Résoudre `@VISION` dans le registre d'agents autorisés au workspace; transmettre un agent ID stable. Alias libre, inconnu ou désactivé = refus. |
| Outils | Attester côté serveur les capacités effectives et les limiter à la lecture requise. Si le mode lecture seule ne peut être vérifié, ne pas créer la mission. |
| Résultat | Vérifier ID de mission, acteur, tenant/workspace, agent et tuple GitHub épinglé avant stockage/affichage; divergence = quarantaine. |

Toute permission est l'intersection des droits utilisateur, workspace, connexion GitHub, ressource, agent et outils. Les IDs non devinables et les contrôles UI ne remplacent pas l'autorisation.

## Flux et données

1. Le client ne soumet que l'intention, ressource visible et agent. Le serveur dérive utilisateur/workspace de la session, relit la PR via la connexion liée, et épingle `(repo_id, pull_number, base_sha, head_sha)`.
2. Un changement de SHA pendant la préparation invalide le dossier; relire et demander une nouvelle confirmation.
3. Avant l'envoi, montrer à l'utilisateur le dépôt/PR/SHA, `@VISION`, catégories exactes de données, pièces incluses, outils effectifs en lecture seule et règle de rétention. La demande est une confirmation explicite de transmission.
4. Créer une vraie mission par l'API documentée OpenMausBot, avec ID d'idempotence, tenant/workspace et acteur validés, agent ID, tuple PR, manifeste de provenance et outils autorisés. Si ces liaisons ne peuvent être attestées, bloquer; aucune mission simulée ne compte.
5. Lier le rapport à la ressource ATLAS et PR épinglées depuis les métadonnées serveur, jamais depuis une cible ou URL écrite par l'agent.

Dossier minimal par défaut : métadonnées nécessaires de PR, patches des fichiers modifiés et seuls commentaires utiles à la question. Pas d'historique complet, autres PR/issues, dépôt entier ou ressources workspace automatiques. Plafonner fichiers/lignes/octets; rapporter les omissions.

Chaque fragment porte source, repo ID, PR, SHA, chemin/lignes ou ID commentaire, URL canonique, heure de récupération, hash et classification « non fiable ». Les contenus GitHub sont des données, jamais des instructions. Délimiter le contexte non fiable; empêcher les outils d'action côté serveur même si le prompt est injecté. Ne mettre aucun secret, cookie ou token dans le contexte.

Pièces jointes exclues par défaut. Texte/document : autorisation explicite, type réel et taille vérifiés, extraction contrôlée et redaction avant envoi. Capture/OCR : inclusion explicite; provenance conservée pour chaque fragment OCR. Format non pris en charge, dépassement, erreur de parseur ou redaction incertaine = rejet. Les erreurs de filtres doivent échouer en mode fermé.

## Isolation, audit, approbation, rétention

- Scoper chaque mission, fragment, pièce et rapport par tenant/workspace et vérifier le propriétaire de la connexion à chaque lecture/écriture. Si Supabase est utilisé : RLS sur toutes les tables multi-tenant, vérifiée aussi sur rôle privilégié et futures tables; toute route serveur doit autoriser explicitement avant bypass RLS.
- Journaliser acteur, tenant/workspace, connexion, agent/version, ID mission, repo/PR/SHA, décision d'autorisation, provenance/hash, catégories envoyées, outils autorisés, confirmation et résultat. Jamais le diff brut, secrets ou prompts sensibles.
- Fixer une durée de conservation par catégorie (contexte, résultat, audit), suppression vérifiable et invalidation lors de révocation/déconnexion ou suppression workspace.
- Toute future écriture est une capacité séparée. Elle demande une confirmation fraîche indiquant action, contenu et cible exacte et vérifie ensuite l'effet dans GitHub. Un texte de l'agent n'est pas une approbation.
- Le service worker de la PR #1 cache l'enveloppe de page et les actifs statiques; ne jamais y mettre mission, contexte, pièces, token ou résultat privé.

## Risques bloquants et critères de clôture

| Gravité | Preuve / impact | Mitigation requise | Clôture vérifiable |
| --- | --- | --- | --- |
| **Critique — autorisation** | Aucun auth, backend ou contrôle repo/workspace observé; un ID forgé pourrait divulguer un diff à un autre workspace/agent. | Résolveur serveur unique; vérification à chaque frontière avant tout appel. | Tests d'intégration pour utilisateur absent, rôle insuffisant, tenant remplacé, repo hors installation, PR non liée, agent inconnu et connexion révoquée : refus, zéro mission, zéro contenu transmis. |
| **Critique — isolation** | Aucun schéma/RLS ni test inter-tenant observé; résultat/context peut être lu ou attaché via ID substitué. | Cloisonnement DB et autorisation tenant/workspace sur toutes opérations. | Matrice tenant A/B sur create/list/read/result/download/delete, IDs connus et appels concurrents : aucun accès croisé. |
| **Critique — injection/outils** | Aucun registre d'outils ou traitement de contenu GitHub fourni; un commentaire hostile pourrait solliciter divulgation/action. | Outils lecture seule allowlistés et imposés côté serveur; toutes ressources et OCR marqués non fiables; aucun secret. | Fixtures d'injection en titre/commentaire/patch/filename/PDF/OCR : zéro appel d'action et zéro fuite; erreur d'outil ou parseur bloque. |
| **Élevée — rattachement/provenance** | Aucun ID de mission/manifeste/lien rapport-PR observé; un callback erroné peut publier au mauvais endroit. | Corrélation serveur avec IDs et SHA épinglés, idempotence et quarantaine à divergence. | Callbacks rejoués, incomplets, autre tenant/PR/SHA : aucun doublon ni lien erroné; résultat valide montre ses sources. |
| **Élevée — secrets/pièces** | Pas de pipeline d'ingestion/redaction observé; une clé dans un patch ou capture partirait au modèle/journal. | Pièces refusées par défaut, allowlist MIME/tailles, scan/extraction/redaction bloquants, audit sans contenu brut. | Secrets en texte/encodage/OCR, type falsifié, fichier géant et panne redacteur : aucun envoi; journaux sans contenu sensible. |
| **Élevée — révocation/rétention** | Aucune politique de suppression/rétention constatée; copies de données persistent après révocation. | Durées publiées par catégorie; suppression et invalidation appliquées. | Tests de révocation, expiration et suppression workspace bloquent l'accès et suppriment les copies selon politique. |

## Tests d'acceptation avant pilote

1. Auth: session absente/expirée/suspendue, utilisateur ou rôle invalide ⇒ aucune lecture de PR et aucune mission.
2. Cross-tenant: A tente avec IDs de B toutes les opérations, y compris pièces et résultat; l'accès est refusé.
3. GitHub: installation/dépôt non autorisé, PR/fork contradictoire, SHA changé ou révocation ⇒ aucune mission.
4. Agent: alias inconnu, désactivé ou capacité d'écriture non vérifiable ⇒ aucune mission; reçu de succès contient agent/version et allowlist lecture seule.
5. Contexte: comparer un manifeste de fixture; seuls fragments consentis, sous plafonds et épinglés sont transmis; chacun est traçable.
6. Injection: directives hostiles dans métadonnées, code, commentaires, noms, documents et OCR ne modifient ni politique ni outils.
7. Redaction: secrets en clair/encodés et erreur du filtre bloquent l'envoi; aucun secret/diff brut dans audit.
8. Mission: appel réel OpenMausBot retourne ID vérifiable; répétition idempotente n'en crée pas une seconde.
9. Résultat: callback rejoué ou cible/tenant/SHA incohérent est rejeté/quarantainé; résultat valable n'apparaît que sur la PR exacte.
10. Secrets frontend: inspection du bundle/réseau confirme zéro secret serveur/token/contexte privé; `.env.example` ne contient que valeurs publiques.
11. Rétention: tester expiration, suppression et révocation selon la politique publiée.
12. CI: toutes les suites de sécurité passent et les cas négatifs échouent fermés.

## Porte GO / NO-GO

- **GO prototype :** données synthétiques uniquement, marqué démonstration.
- **NO-GO connecté :** tant que auth, permissions, vraie API de mission, contexte minimisé/redacté, isolation, audit, rétention et tests ne sont pas prouvés.
- **GO pilote lecture seule :** clôture de tous les risques critiques et élevés, capacité OpenMausBot/GitHub observée, CI reproductible et démonstration de bout en bout sur comptes de test.
- Écriture, exécution de code et publication GitHub requièrent une revue séparée.

## Modifications

Branche documentaire `docs/atlas-agent-layer-security-review`, créée à partir de la tête de PR #1 (`25ab398e3728e40284d2988275c07169219aea1b`). Aucun merge, déploiement, appel de mission ou changement à PR #1.
