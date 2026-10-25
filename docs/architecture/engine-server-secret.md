# SHA-149 — Mode simple : secret serveur, KMS différé

Le Founder a reporté le KMS externe. Le premier périmètre peut utiliser un token
provisionné dans l'environnement serveur, pour un workspace et une instance
explicitement configurés. Le coffre chiffré dynamique multi-tenant reste différé.
Aucun fournisseur KMS, abonnement, migration ou token réel n'est configuré par ce lot.

## Contrat livré

`readMausbotServerSecret(env, {workspaceId, instanceId})` exige la correspondance
exacte des deux UUID avec `ATLAS_MAUSBOT_WORKSPACE_ID` et
`ATLAS_MAUSBOT_INSTANCE_ID`. Le token privé `ATLAS_MAUSBOT_TOKEN` est obligatoire,
sans espace ni caractère de contrôle, ASCII imprimable, au maximum 4096 caractères.
`ATLAS_MAUSBOT_TOKEN_VERSION` est un identifiant opérateur de version (pas un secret).
L'absence de configuration ou une ressource différente retourne null ; une valeur
malformée produit seulement `MAUSBOT_SERVER_SECRET_INVALID`.

`resolveMausbotInstanceConfig` compose ce credential avec l'URL serveur validée.
La lecture n'effectue aucun appel réseau et retourne toujours `canDispatch:false`.
Le token est accessible explicitement au code serveur qui construit l'en-tête HTTP.
Il est non énumérable, absent des projections JSON/spread et expurgé dans l'inspection
Node. Cela évite une fuite accidentelle de l'objet ; cela n'empêche pas du code
privilégié de lire ou de journaliser explicitement `.token`.

L'ancien résolveur workspace reste compatible en l'absence d'instance configurée.
Si une instance est configurée, il exige aussi le contrat/version du mode simple.
Les deux chemins respectent `ATLAS_MAUSBOT_TOKEN_REVOKED=true` et refusent une
valeur de révocation inconnue. Les routes existantes conservent leurs contrôles
session/workspace et leur gate HTTP 423 ; le nouveau point d'entrée d'instance
n'est pas un endpoint public ni un worker opérationnel.

## Provisionnement ultérieur

Utiliser les noms du fichier `.env.mausbot.server.example` dans le gestionnaire de
secrets serveur de l'environnement choisi. Ne jamais y commiter de vraies valeurs,
utiliser un préfixe NEXT_PUBLIC_, enregistrer le token en SQL en clair ou le saisir
dans une requête navigateur. Staging et production ont leurs secrets distincts.
Conserver `ATLAS_MAUSBOT_RELEASE_STAGE=offline`. Configurer un token ne donne
aucune autorisation de lecture réseau, mutation ou exécution MAUSBOT.

## Remplacement et révocation

1. Préparer un nouveau token limité côté MAUSBOT lorsque cette opération sera autorisée.
2. Remplacer le secret et changer son identifiant de version dans l'environnement cible.
3. Redémarrer/redéployer tous les consommateurs pour charger leur nouvel environnement.
4. Révoquer l'ancien token côté MAUSBOT et vérifier le refus de son utilisation.

Pour désactiver les nouvelles résolutions : retirer le secret ou définir
`ATLAS_MAUSBOT_TOKEN_REVOKED=true`, puis redémarrer tous les consommateurs.
Le module ne met pas le secret en cache. Il ne peut pas effacer les anciennes copies
déjà chargées en mémoire, interrompre un appel en vol ou révoquer le token chez le
fournisseur. La révocation amont et la procédure d'arrêt restent indispensables.
Une modification de l'environnement d'un déploiement ne modifie pas magiquement
les processus déjà démarrés.

## Preuves et reste

Tests avec valeurs factices : mauvais workspace/instance, configuration absente,
secret malformé, projections expurgées, remplacement/removal/révocation, URL
invalide, transport injecté simulé et write/execute toujours 423 pour tous les stages.
Aucune connexion réelle ni E2E Auth ne découle de ces tests.

Restent : provisionnement staging identifié, vraie Auth, worker durable, droits
SQL privés pertinents, rotation/révocation amont testées et SHA-133. SHA-149 n'est
pas Done ; sa partie KMS reste reportée. La future intégration du coffre ne doit
pas recevoir un faux fournisseur KMS basé sur cette variable d'environnement.
