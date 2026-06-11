# DAC — DevOps-as-a-Chat — Trace complète des challenges

> Projet : DAC (DevOps-as-a-Chat) · CodeCamp ETNA 2026
> Document de synthèse pour la présentation finale.
> Pour chaque challenge : **problème · solution proposée · choix techniques · démonstration ·
> limites restantes · améliorations possibles**.

Challenges couverts :

1. Amélioration de l'expérience utilisateur du chat (UX)
2. Amélioration de la détection d'intentions
3. Sécurisation : simulation (dry-run) & confirmation avant exécution
4. Amélioration des logs et du suivi temps réel

---

## Challenge 1 — Amélioration de l'expérience utilisateur du chat

### Problème
Le chat était confus : messages d'erreur bruts/tronqués (préfixes dupliqués `500: … 500: …`),
aucune distinction entre information / proposition / exécution, plan d'infra non lisible,
messages système opaques (« Aucune étape détectée »), erreurs réseau en anglais brut, et aucun
retour de progression sur les tâches longues.

### Solution proposée
Six axes (5 livrés, 1 déféré) :

- **Axe 1 — Erreurs compréhensibles** : capture du **stderr** Terraform (vraie cause) + service
  de **traduction d'erreurs** (résumé clair + action corrective), fin de la troncature à 300 car.
- **Axe 2 — Types de message** : badges **info / proposition / exécution / erreur** (couleur + icône).
- **Axe 3 — Plan structuré** : récapitulatif des ressources (instance, OS, région, réseau, sécurité)
  + barre de progression de la tâche jusqu'à la fin.
- **Axe 5 — Guidage de saisie** : **suggestions cliquables** + message d'aide actionnable.
- **Axe 6 — Robustesse réseau** : messages d'erreur réseau traduits en français.
- **Axe 4 — Statut des conversations** dans la sidebar : *déféré* (données fragiles).

### Choix techniques
- Type de message porté par `extra.type` (réutilise la colonne `extra` JSON existante, **pas de
  migration**), avec **inférence de secours** côté frontend pour les messages historiques.
- Service backend dédié `error_translator.py` (table motif → message), découplé et testable.
- Rendu **Markdown** des messages (pas de HTML brut, car le chat ne rend pas le HTML).
- Barre de progression : on réutilise le polling `/async/tasks/{id}/status` existant et on lit le
  `task_id` depuis `extra` (corrige le cas où il n'était pas dans le texte).
- Frontend : React + MUI ; util `friendlyNetworkError` centralisant la traduction réseau.

### Démonstration
1. Lancer une création qui échoue (type non Free Tier) → message clair « utilise t3.micro »
   au lieu d'une stacktrace.
2. Montrer les **badges** colorés selon le type de message (erreur rouge, exécution bleue…).
3. Lancer une création → **récapitulatif du plan** + **barre de progression** qui va jusqu'au bout.
4. Champ de saisie vide → **suggestions cliquables**.

### Limites restantes
- Axe 4 (statut des conversations) non implémenté.
- La traduction d'erreurs couvre les cas fréquents (extensible).
- Les outputs Terraform (IP/instance_id) ne sont pas encore en tableau copiable.

### Améliorations possibles
- Boutons d'action sur chaque message `proposal`.
- Carte React dédiée `PlanSummary` + outputs en tableau.
- Statut + reprise de conversation dans la sidebar.

---

## Challenge 2 — Amélioration de la détection d'intentions

### Problème
DAC ne reconnaissait que **Ubuntu**. Les phrases génériques (« monte-moi un serveur debian »,
« je veux un VPS ») n'étaient pas comprises, et une intention inconnue renvoyait un free_chat
muet, sans message d'aide.

### Solution proposée
Reconnaissance de **Debian, Windows et formulations génériques** (VPS, serveur) + **message de
suggestion** quand l'intention est inconnue.
- `intent_detector.py` : patterns Debian/Windows/générique + méthode `detect_os_creation()`.
- `detect_intent_catalog.py` : fallback amélioré appelant `detect_os_creation()` + suggestion.

### Choix techniques
- **Score de confiance** à 3 niveaux : `0.9` (mot-clé explicite créer/déployer), `0.6` (détection
  générique), `0.0` (free_chat + suggestion).
- Approche **par patterns/mots-clés** (déterministe, rapide, pas de dépendance NLP lourde).

### Démonstration
Taper dans le chat et montrer l'intent retourné :

| Phrase | Intent |
|--------|--------|
| « monte-moi un serveur debian » | `create` |
| « crée une instance windows » | `create` |
| « je veux un VPS aws t3.micro » | `create` |
| « dis-moi une blague » | `free_chat` + suggestion |

### Limites restantes
- Phrases trop originales non reconnues (« spawne une bécane debian »).
- Pas de gestion des **fautes d'orthographe**.
- Windows détecté mais non exécutable sans AMI AWS payante.

### Améliorations possibles
- Ajouter Rocky Linux, AlmaLinux, CentOS.
- `difflib` pour tolérer les fautes de frappe.
- Modèle NLP léger (spaCy).

---

## Challenge 3 — Sécurisation : simulation (dry-run) & confirmation avant exécution

### Problème
Aucune notion de sensibilité des actions ; la configuration s'exécutait dès la sélection des VM,
**sans confirmation** ; pas de **simulation** possible avant exécution ; aucune **trace** des
décisions utilisateur.

### Solution proposée
Quatre pistes :

- **Piste 1 — Classification** : `action_safety.py` classe une commande en
  **safe / sensitive / dangerous** et impose une confirmation pour les deux derniers.
- **Piste 2 — Dry-run** : commande **`simuler <commande>`** → exécute un dry-run réel
  (`execute_command(dry_run=True)`) qui **n'exécute rien** et montre ce qui *serait* lancé.
- **Piste 3 — Plan + confirmation** : `plan_presenter.py` (action / cible / environnement /
  commande proposée / « non exécutée ») + **boutons Confirmer / Annuler**.
- **Piste 4 — Journalisation** : table `action_decisions` + `decision_log.py` ; chaque `oui`/`non`
  est tracé (confirmé/refusé, horodaté, attribué à l'utilisateur).
- **Intégration configure→SSM** : la sélection des VM affiche désormais le plan + confirmation
  (état `awaiting_configure_confirmation`) avant toute exécution.

### Choix techniques
- Classification par **motifs regex** + principe de prudence (« sensible si doute »).
- **Dry-run sans appel AWS** : le `dry_run` court-circuite avant `send_command` (aucun effet réel).
- Table `action_decisions` **auto-créée** au démarrage (`Base.metadata.create_all`), pas de
  migration manuelle ; commandes tronquées, pas de secrets journalisés.
- Réutilise les briques du Challenge 1 : type de message `proposal` (Axe 2) + récap de plan (Axe 3).

### Démonstration
1. `simuler sudo systemctl restart nginx` → badge de sensibilité + commande affichée +
   « Simulation uniquement — aucune commande exécutée ».
2. Flux configure : « installe nginx » → sélection VM → **plan d'action + boutons Confirmer/Annuler**.
3. Cliquer **Annuler** puis **Confirmer** → décisions tracées dans `action_decisions`.
4. Montrer qu'une commande dangereuse (`rm -rf`) est classée **dangereuse**.

### Limites restantes
- La **commande shell exacte** du flux configure n'est pas toujours affichée (générée à
  l'exécution) → on montre l'action de catalogue.
- Journalisation branchée surtout sur create et configure.
- Dry-run démontré via `simuler` (commande texte), pas encore via un **toggle UI**.

### Améliorations possibles
- Toggle « Simuler / Exécuter » dans l'UI + dry-run **Ansible `--check`** natif.
- Écran d'historique des décisions (audit trail consultable).
- Garde-fou systématique : refus d'exécution directe pour toute action sensible non confirmée.

---

## Challenge 5 — Amélioration des logs et du suivi temps réel

### Problème
Les logs n'avaient **aucun niveau** de sévérité ; seuls `started`/`completed` étaient tracés
(étapes intermédiaires invisibles) ; aucun identifiant ne reliait message → intention → action ;
côté frontend, le journal n'avait pas de distinction visuelle ni d'auto-scroll.

### Solution proposée
Observabilité de bout en bout :
- `execution_logger.py` : paramètres `level`, `trace_id`, `step_name`, `progress_percentage`.
- `execution_handlers.py` : `log_execution_event()` à **chaque étape** de chaque handler.
- `TaskProgress.tsx` : **journal type terminal** (fond sombre, monospace), **badges de niveau**,
  **auto-scroll**.

### Choix techniques
- **Rétrocompatibilité totale** : nouveaux paramètres optionnels (valeurs par défaut).
- **Pas de migration Alembic** : métadonnées dans un champ `extra` JSON / console.
- **Pas de WebSocket** : réutilisation du **polling** existant (5 s), suffisant pour 2-3 min.
- **Niveaux alignés** backend (`Literal[...]`) ↔ frontend (union TS) pour éviter toute désync.
- Rendu **terminal sombre** (`#0d1117`, monospace), cohérent avec un public DevOps.

### Démonstration
1. `docker compose up --build`, ouvrir l'app, lancer « créer une instance EC2 Ubuntu ».
2. **Frontend** : le journal `TaskProgress` scrolle seul, avec badges colorés par niveau.
3. **Console backend** : logs structurés
   `INFO [EXEC_LOG] {"level":"success","step":"terraform_apply"} | …terminé`.
4. **Base** : requête `ExecutionLog` pour montrer la persistance.

### Limites restantes
- Champ `extra` non garanti en base → métadonnées parfois seulement en console.
- Délai de polling jusqu'à **5 s** (étapes très courtes peuvent n'apparaître qu'après coup).
- **Volume** : 5-10 entrées/exécution ; le janitor ne purge pas encore `execution_logs`.
- **`trace_id` partiel** : présent pour SSM/configure, pas encore Terraform/Ansible/Monitoring.

### Améliorations possibles
- Migration Alembic (`level`, `step_name`, `trace_id`) pour filtrer en SQL.
- Endpoint `GET /diagnostics/execution/{id}/logs` (filtrage par niveau).
- **SSE** (`StreamingResponse`) pour éliminer le délai de 5 s.
- Purge automatique des `execution_logs` + bouton « Télécharger les logs ».
- `trace_id` global dès la réception du message, propagé à tous les handlers.

---

## Récapitulatif — choix techniques transverses

- **Stack** : FastAPI (Python) + React/TypeScript (Vite) + PostgreSQL, orchestré par Docker Compose.
- **Sans migration quand possible** : réutilisation des colonnes `extra` JSON et de
  `Base.metadata.create_all` (création des tables au démarrage).
- **Rétrocompatibilité** : nouveaux paramètres optionnels, fallbacks côté frontend.
- **Découplage** : services dédiés (`error_translator`, `action_safety`, `plan_presenter`,
  `decision_log`, `intent_detector`) faciles à tester.
- **Qualité** : tests frontend **Vitest + Testing Library** (17 tests) sur les briques du Challenge 1
  (traduction d'erreurs, badges de message, suggestions de saisie).

## Comment lancer une démonstration complète

```bash
docker compose up --build
# Frontend : http://localhost:5173   (ou le port défini dans docker-compose.yml)
# Backend  : http://localhost:8000   ·   Swagger : http://localhost:8000/docs
```

Scénario de démo « fil rouge » :
1. Taper `aide` → menu des options (Challenge 1).
2. « monte-moi un serveur debian » → intention comprise (Challenge 2).
3. Création → plan + barre de progression + logs temps réel (Challenges 1 & 5).
4. Provoquer une erreur (type non Free Tier) → message clair (Challenge 1).
5. `simuler sudo systemctl restart nginx` → dry-run sans effet (Challenge 3).
6. « installe nginx » → sélection VM → confirmation + décision tracée (Challenge 3).
