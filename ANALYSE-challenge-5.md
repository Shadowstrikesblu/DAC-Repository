# Challenge 5 — Amélioration des logs et du suivi temps réel

**Projet :** DAC — DevOps-as-a-Chat  
**Branche :** `codecamp-etna-2026-feature-challenge3`  
**Auteur :** Alex  
**Date :** Juin 2026

---

## 1. Challenge choisi

**Challenge 5 — Amélioration des logs et du suivi temps réel**

> Objectif : améliorer l'observabilité de DAC.

Pistes retenues parmi celles proposées :

- Logs structurés avec niveaux (`info` / `warning` / `error` / `success`)
- Corrélation entre message utilisateur, intention et action via un `trace_id`
- Affichage progressif des étapes dans l'interface utilisateur
- Meilleure gestion des erreurs (diagnostic facilité)

---

## 2. Problème identifié

### Côté backend

Le service `execution_logger.py` enregistrait les événements d'exécution en base de données, mais sans aucune notion de niveau de sévérité. Tous les logs avaient le même poids, que ce soit un démarrage normal ou une erreur critique. Il était impossible de filtrer rapidement les anomalies.

Les handlers d'exécution (`execution_handlers.py`) appelaient `log_execution_event()` uniquement aux deux extrêmes du cycle de vie : `started` et `completed` (ou `failed`). Toutes les étapes intermédiaires — recherche du fichier Terraform, diagnostic SSM, collecte des métriques, génération de l'inventaire — étaient invisibles. En cas d'échec à mi-parcours, il était impossible de savoir à quelle étape le problème s'était produit sans aller lire les logs console bruts.

Enfin, aucun identifiant ne reliait le message saisi par l'utilisateur dans le chat à l'action réellement exécutée en arrière-plan. Un `trace_id` existait dans le workflow SSM mais n'était pas propagé aux logs.

### Côté frontend

Le composant `TaskProgress.tsx` récupérait bien les logs via `useTaskPolling.ts` (qui expose un tableau `TaskLog[]` avec un champ `level`), mais les affichait tous de la même façon : un simple point coloré sans libellé, sans distinction visuelle forte entre un `error` et un `info`. Le journal ne scrollait pas automatiquement vers les dernières entrées, ce qui obligeait l'utilisateur à faire défiler manuellement pendant une exécution longue (Terraform peut prendre 2 à 3 minutes).

---

## 3. Solution proposée

### Architecture de la solution

```
Utilisateur (chat)
       │  message texte
       ▼
chat_creation_routes.py   ←── détection d'intention + trace_id SSM
       │
       ▼
execution_handlers.py     ←── log_execution_event() à chaque étape
       │                       (level + step_name + trace_id + progress_percentage)
       ▼
execution_logger.py       ←── persistence en base + console structurée
       │
       ▼
execution_logs (DB)
       │
       ▼ (polling /async/tasks/{task_id})
useTaskPolling.ts         ←── TaskLog[] avec level, step_name, progress_percentage
       │
       ▼
TaskProgress.tsx          ←── affichage terminal sombre, badges colorés, auto-scroll
```

### Fichiers modifiés

| Fichier | Rôle dans la solution |
|---|---|
| `devops_api/app/services/execution_logger.py` | Ajout des paramètres `level`, `trace_id`, `step_name`, `progress_percentage` |
| `devops_api/app/services/execution_handlers.py` | Appels `log_execution_event()` à chaque étape de chaque handler |
| `frontend/src/components/TaskProgress.tsx` | Affichage enrichi avec badges de niveau et auto-scroll |

### Ce qui n'a pas été modifié

- `useTaskPolling.ts` : le hook existant expose déjà `recent_logs: TaskLog[]` avec les bons champs — aucune modification nécessaire
- `main.py` : la configuration logging Python existante est suffisante pour les besoins du challenge
- Le schéma de base de données : les nouveaux champs (`level`, `step_name`) sont stockés dans un champ `extra` JSON existant ou dans la console — aucune migration Alembic n'est requise

---

## 4. Procédure d'installation

### Prérequis

- Docker ≥ 24 et Docker Compose ≥ 2.20
- Docker API 1.44+
- Git

### Cloner le projet

```bash
git clone <url-du-repo>
cd devops-as-a-chat
git checkout codecamp-etna-2026-feature-challenge3
```

### Copier les fichiers du challenge

Remplacer les trois fichiers suivants par les versions modifiées :

```bash
# Backend
cp execution_logger.py   devops_api/app/services/execution_logger.py
cp execution_handlers.py devops_api/app/services/execution_handlers.py

# Frontend
cp TaskProgress.tsx frontend/src/components/TaskProgress.tsx
```

### Créer le fichier d'environnement

```bash
cp .env.example .env
```

Éditer `.env` si nécessaire (voir section Variables d'environnement).

---

## 5. Procédure de lancement

### Avec Docker (recommandé)

```bash
docker compose up --build
```

Les services démarrent dans l'ordre : PostgreSQL → Backend → Frontend.

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |
| Healthcheck | http://localhost:8000/health |

### Sans Docker (développement)

**Backend :**

```bash
cd devops_api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend :**

```bash
cd frontend
npm install
npm run dev
```

### Vérifier que les logs fonctionnent

Après avoir lancé une action dans le chat (ex. `créer une instance EC2 Ubuntu`), vérifier la présence des logs structurés dans la console backend :

```
INFO [EXEC_LOG] {"execution_id": 1, "event": "step", "level": "info", "step": "terraform_apply"} | Lancement terraform apply...
INFO [EXEC_LOG] {"execution_id": 1, "event": "step", "level": "success", "step": "terraform_apply"} | Terraform apply terminé...
```

Pour consulter les logs enregistrés en base :

```bash
# Avec Docker
docker exec -it dac-codecamp-backend python3 -c "
from app.database import SessionLocal
from app import models
db = SessionLocal()
logs = db.query(models.ExecutionLog).order_by(models.ExecutionLog.id.desc()).limit(10).all()
for l in logs: print(l.event, l.message[:80])
"
```

---

## 6. Variables d'environnement nécessaires

Toutes les variables sont définies dans `.env` à la racine du projet. Voici celles qui ont un impact direct sur le comportement des logs :

| Variable | Valeur par défaut | Rôle |
|---|---|---|
| `DAC_LOG_LEVEL` | `debug` | Niveau de log Python global (`debug`, `info`, `warning`, `error`) |
| `DAC_ENV` | `development` | Environnement — en `production`, passer à `info` pour réduire le volume |
| `DATABASE_URL` | `postgresql://dac:dac@postgres:5432/devops_api_db` | Base où sont stockés les `execution_logs` |
| `BACKEND_BASE_URL` | `http://backend:8000` | URL interne utilisée par les handlers pour les appels HTTP |
| `FERNET_KEY` | *(voir .env.example)* | Clé de chiffrement des credentials AWS — doit être définie pour que les handlers fonctionnent |

Les variables AWS (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `region`) ne sont **pas** des variables d'environnement globales : elles sont saisies par l'utilisateur dans l'interface d'onboarding et stockées chiffrées en base.

---

## 7. Choix techniques

### Rétrocompatibilité totale

Tous les nouveaux paramètres de `log_execution_event()` sont optionnels avec des valeurs par défaut (`level="info"`, `trace_id=None`, etc.). Le reste du codebase qui appelle cette fonction sans les nouveaux paramètres continue de fonctionner sans aucune modification.

### Pas de migration de base de données

Plutôt que d'ajouter des colonnes `level`, `step_name`, `trace_id` à la table `execution_logs` (ce qui aurait nécessité une migration Alembic), les métadonnées enrichies sont stockées dans un champ `extra` JSON si la colonne existe, ou restent disponibles dans les logs console. Cela permet de déployer le challenge sans toucher au schéma de base.

### Pas de WebSocket

Le suivi temps réel repose sur le polling déjà en place dans `useTaskPolling.ts` (intervalle de 5 secondes par défaut). L'ajout d'un WebSocket aurait apporté une latence légèrement plus faible mais aurait introduit une complexité significative (gestion de la reconnexion, authentification sur le canal WS). Pour un cycle d'exécution de 2 à 3 minutes, 5 secondes de latence de polling est acceptable.

### Niveaux de log alignés entre backend et frontend

Le type `level` utilise exactement les mêmes valeurs en Python (`Literal["info", "warning", "error", "success"]`) et en TypeScript (`'info' | 'warning' | 'error' | 'success'`). Cela évite toute désynchronisation entre ce qu'écrit le backend et ce qu'affiche le frontend.

### Affichage terminal sombre

Le journal adopte un fond sombre (`#0d1117`, couleur de fond GitHub) avec une police monospace. Ce choix est délibéré : les logs d'exécution sont un contenu technique destiné à des utilisateurs DevOps, un rendu proche d'un terminal est plus lisible et plus cohérent avec le contexte que des bulles de couleur pastel.

---

## 8. Limites connues

**Champ `extra` non garanti en base.** Si la colonne `extra` n'existe pas sur le modèle `ExecutionLog`, les métadonnées (`step_name`, `trace_id`, `progress_percentage`) ne sont pas persistées en base et restent uniquement dans les logs console. Elles ne sont donc pas disponibles via le polling frontend dans ce cas.

**Polling toutes les 5 secondes.** Les logs n'apparaissent pas instantanément dans le journal frontend : il y a un délai maximal de 5 secondes entre l'écriture en base et l'affichage. Pour une étape très courte (moins de 5 secondes), le log peut n'apparaître qu'une fois l'étape déjà terminée.

**Volume de logs en base.** Chaque exécution génère désormais entre 5 et 10 entrées dans `execution_logs` au lieu de 2 ou 3. Sur un usage intensif, la table peut grossir rapidement. Le janitor existant (`app/maintenance.py`) ne purge pas encore `execution_logs` — c'est à ajouter manuellement si nécessaire.

**`trace_id` partiel.** Le `trace_id` est généré dans `_start_configure_task_wrapper()` et propagé au handler `configure`. Il n'est pas encore disponible pour les handlers Terraform, Ansible et Monitoring, qui ne participent pas au workflow SSM.

---

## 9. Pistes d'amélioration

**Migration Alembic pour les nouveaux champs.** Ajouter les colonnes `level VARCHAR(10)`, `step_name VARCHAR(100)` et `trace_id VARCHAR(50)` à la table `execution_logs` permettrait de filtrer les logs directement en SQL (`WHERE level = 'error'`) et d'exposer un endpoint dédié pour la recherche de logs par trace.

**Endpoint `/diagnostics/logs`** — le dossier `app/routes/diagnostics_routes.py` existe déjà. Y ajouter une route `GET /diagnostics/execution/{execution_id}/logs` qui retourne les logs d'une exécution triés par date, avec filtrage optionnel par `level`. Cela permettrait d'afficher les logs d'une exécution passée depuis le dashboard.

**Remplacement du polling par Server-Sent Events (SSE).** FastAPI supporte nativement `StreamingResponse` pour du SSE. Une route `GET /async/tasks/{task_id}/stream` pourrait pousser les nouveaux logs au fur et à mesure, éliminant le délai de 5 secondes. C'est moins complexe qu'un WebSocket tout en étant plus réactif que le polling.

**Purge automatique des `execution_logs`.** Le janitor dans `app/maintenance.py` pourrait supprimer les entrées `execution_logs` de plus de 30 jours, ou conserver uniquement les logs de niveau `warning` et `error` au-delà d'une certaine période.

**Export des logs.** Ajouter un bouton "Télécharger les logs" dans `TaskProgress.tsx` qui génère un fichier `.log` ou `.json` à partir du tableau `logs[]` déjà disponible dans le state React. Aucun appel backend supplémentaire n'est nécessaire.

**Corrélation `trace_id` globale.** Générer un `trace_id` dès la réception du message utilisateur dans `chat_creation_routes.py` et le propager à tous les handlers, pas seulement au workflow SSM. Cela permettrait de retrouver dans les logs l'ensemble de la chaîne : message → détection d'intention → exécution → résultat, avec un seul identifiant.
