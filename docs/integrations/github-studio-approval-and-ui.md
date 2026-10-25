# GitHub Studio — Approbation explicite et nouveau design

**Date : 24 octobre 2026. PR de développement uniquement, non déployée sur Production.**

## Permission GitHub ≠ confirmation d'une création

L'utilisateur a activé la permission GitHub App Repository creation: Write dans les paramètres de son App. Cela **ne prouve pas automatiquement** que le propriétaire de chaque installation a accepté la nouvelle permission. Le Studio utilise un appel read-only authentifié par le JWT GitHub App (`GET /app/installations/{installationId}`) pour présenter trois états : `granted`, `missing`, `unavailable`. Un état indisponible ou manquant ne peut jamais être présenté comme une permission accordée.

## Deuxième barrière : confirmation humaine

`POST /api/apps/github/studio/repositories/approve` est **désactivé** sauf `VERCEL_ENV=preview` et `ATLAS_GITHUB_STUDIO_APPROVAL_ENABLED=sandbox`. Le serveur vérifie :
- `Origin`, taille/forme de requête, `Idempotency-Key` UUID, workspace et installation sandbox explicitement autorisés ;
- utilisateur Supabase avec rôle owner/admin *actuel*, installation enregistrée vérifiée ;
- permission GitHub `repository_creation:write` relue à l'instant du clic ;
- nom recopié **à l'identique**, case de consentement et paramètres normalisés.

Il retourne un reçu HMAC signé de **5 minutes**, lié cryptographiquement à l'acteur, workspace, installation, visibilité, description, initialisation, nom de dépôt et UUID d'idempotence. **Aucun dépôt n'est créé, aucun OAuth user token n'est généré et aucune écriture GitHub n'est effectuée**.

`POST /api/apps/github/studio/repositories/execute`, lui-même en sandbox et OFF par défaut, exige désormais ce reçu en header `x-studio-approval` **en plus** du jeton OAuth utilisateur du serveur, de la session Atlas admin et de `confirmed:true`. Les opérations PostgreSQL idempotentes/CAS déjà en place empêchent plusieurs envois du même UUID.

Le reçu n'est pas une autorisation de création permanente, n'accorde aucun nouveau droit GitHub et ne supprime pas les contraintes de la future validation E2E. L'approbation d'installation GitHub nécessite toujours le consentement du propriétaire si GitHub réclame une revalidation.

## Design

Nouvel onglet Studio plus aéré : hero lilas doux, titre, barre de progression 3 étapes, formulaire regroupé, sélecteurs privés/publics lisibles, carte d'aperçu responsive, vue séparée de l'approbation et message explicite `Création GitHub désactivée`. Les modifications d'un champ invalident immédiatement la prévisualisation et l'approbation précédentes.

## Conditions avant activation sandbox

- Revalider les autorisations GitHub App propriétaire et `GET /app/installations` renvoyant réellement `repository_creation:write`.
- Installer secrets configurés sur une Preview HTTPS dédiée et choisir une installation **sandbox**, sans réutiliser les clés de Production.
- Définir `ATLAS_GITHUB_STUDIO_APPROVAL_ENABLED=sandbox`, `ATLAS_GITHUB_STUDIO_WRITE_ENABLED=sandbox`, IDs workspace/installation sandbox et origine HTTPS canonique uniquement après revue d'authentification.
- Tester le parcours OAuth GitHub user-to-server et le processus de création/réconciliation sur une base Supabase de test distincte.
- Garder `main` et Vercel Production inchangés tant que la PR n'est pas approuvée.

Références :
- https://github.blog/changelog/2026-10-13-github-app-improvements-for-least-privilege-and-management/
- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app
