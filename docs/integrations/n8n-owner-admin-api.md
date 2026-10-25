# n8n Public API Admin : Atlas / propriétaire unique

## Configuration réelle
- Adresse : https://ops.shadoron.com (n8n 2.43.5, Caddy TLS).
- Quatre variables existent en **Vercel Production**, toutes Sensitive : ATLAS_N8N_BASE_URL, ATLAS_N8N_ALLOWED_HOST, ATLAS_N8N_API_KEY et ATLAS_N8N_WORKSPACE_ID. Les valeurs sensibles n'ont pas été dévoilées.
- Après déploiement, sélectionner dans Mes Apps/n8n le **même workspace** que ATLAS_N8N_WORKSPACE_ID; seul le rôle **owner** Atlas y a accès.
- Premier test : GET workflows, puis GET executions et GET projects. 503 = binding manquant, 502 N8N_AUTH_REFUSED = clé refusée, 200 = ressource atteinte sous les droits de n8n.

## Console propriétaire
- API publique n8n sous /api/v1 uniquement : méthodes GET, POST, PUT, PATCH, DELETE, chemins et JSON contrôlés, opérations génériques et raccourcis.
- Pour toutes les mutations, vérification de l'origine HTTP, workspace exact, rôle owner, confirmation textuelle CONFIRM METHOD path; aucune URL distante fournie par le navigateur, clé API uniquement côté serveur.
- TLS certifié avec IP DNS publique épinglée, redirections refusées, réponse JSON et payload bornés.
- Des opérations n8n complexes (édition graphique canvas, transport MCP, webhook et publication) n'ont pas forcément de méthode REST exposée. Un endpoint absent renvoie 404/403; aucune disponibilité n'est inventée.
- Cette console propriétaire est distincte du moteur autonome : n8nReleasePermission HTTP423 et SQL atlas_n8n_runtime_offline_only continuent à bloquer les agents/worker. Pas de diffusion des droits API n8n à Chief, Missions ou aux membres.
- Les mutations sont réelles et peuvent toucher des workflows SHADORON. La confirmation textuelle n'est pas une approbation durable. Aucun workflow n8n n'a été créé, édité, publié ou exécuté pendant cette livraison.
- Le contenu JSON affiché est potentiellement sensible : il est temporaire dans la session navigateur propriétaire et n'est pas synchronisé automatiquement vers Supabase.
