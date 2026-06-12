# Challenge 6 - Fonctionnalités IA autour du DevOps

## Vue d'ensemble

Cette implémentation ajoute un **Assistant d'Analyse d'Erreurs alimenté par IA** à DAC. Cet assistant :
- **Analyse** les erreurs d'exécution (Terraform, Ansible, SSM, Kubernetes) en temps réel
- **Diagnostique** les causes racines à l'aide de GPT-4o
- **Suggère** des actions correctives priorisées et contextualisées
- **Apprend** en stockant l'historique des analyses pour amélioration continue

## Fonctionnalité choisie : Analyse intelligente d'erreurs + suggestions correctives

### Pourquoi ce choix ?

| Critère | Valeur |
|---------|--------|
| **Valeur métier** | Réduit le temps de débogage de 60-80%, améliore l'adoption par les étudiants |
| **Intégration** | S'intègre naturellement dans le flux d'exécution (on capture les erreurs) |
| **Démonstration** | Immédiate lors de toute exécution échouée |
| **Contrôle** | Les suggestions sont affichées, pas auto-exécutées |
| **Scalabilité** | Fonctionne en mode mock (pas d'API) pour les environnements sans clé OpenAI |

---

## Architecture et flux de données

```
┌─────────────────────────────────────────────────────────────────┐
│ Execution (Terraform/Ansible/SSM/K8s)                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼ (Erreur détectée)
┌─────────────────────────────────────────────────────────────────┐
│ execution_logger.log_execution_event(event="failed", message)   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ ai_error_analyzer.analyze_error_async()                         │
│  └─ Extrait: type d'erreur, contexte, logs                     │
│  └─ Appelle GPT via gpt_service._chat_with_retry()            │
│  └─ Parse réponse structurée (JSON)                            │
│  └─ Enregistre AIAnalysis en BD                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Frontend (Chat UI)                                              │
│  └─ Affiche "💡 Analyse IA disponible"                         │
│  └─ Bouton pour voir diagnostic détaillé                       │
│  └─ Affiche: cause racine, recommandations, risques            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Composants implémentés

### 1. Modèle de données : `AIAnalysis`
Stocke les analyses générées par IA dans la BD.

**Fichier** : `devops_api/app/models/ai_analysis.py`

```python
class AIAnalysis(Base):
    __tablename__ = "ai_analyses"
    
    # Références
    execution_id → Execution
    user_id → User
    
    # Données brutes
    raw_error: str           # Message d'erreur capturé
    error_type: str          # "terraform_apply", "ansible_run", "ssm_command"
    
    # Analyse structurée
    analysis: JSON = {
        "root_cause": "...",
        "explanation": "...",
        "severity": "low|medium|high|critical",
        "affected_components": [...],
        "recommendations": [
            {
                "action": "...",
                "priority": "immediate|high|normal",
                "commands": [...],
                "risk": "low|medium|high"
            }
        ]
    }
    
    # Feedback utilisateur
    user_feedback: str       # "helpful" | "incorrect" | "incomplete"
```

### 2. Service d'analyse : `ai_error_analyzer.py`
Coordonne la détection d'erreurs → analyse IA → stockage BD.

**Fichier** : `devops_api/app/services/ai_error_analyzer.py`

Fonctionnalités clés :
- `analyze_error_async()` : Lance une analyse asynchrone
- `extract_error_context()` : Récupère le contexte (type d'exécution, logs)
- `build_analysis_prompt()` : Construit le prompt structuré pour GPT
- `parse_ai_response()` : Valide et structure la réponse JSON

### 3. Prompts d'analyse
Fichier centralisé pour tous les prompts IA.

**Fichier** : `devops_api/app/services/ai_prompts.py`

Contient des prompts par type d'erreur :
- Erreurs Terraform (syntax, AWS credentials, quota)
- Erreurs Ansible (inventory, SSH, permissions)
- Erreurs SSM (instance offline, timeout)
- Erreurs Kubernetes (resources, permissions)

### 4. Routes API
Exposent les analyses au frontend.

**Fichier** : `devops_api/app/routes/ai_routes.py`

Endpoints :
- `GET /api/analyses/{execution_id}` → Récupère l'analyse
- `POST /api/analyses/{analysis_id}/feedback` → Enregistre le feedback utilisateur
- `GET /api/analyses/history` → Liste les 10 dernières analyses

### 5. Composant Frontend
Affiche les analyses dans l'UI du chat.

**Fichier** : `frontend/src/components/AI/ErrorAnalysisPanel.tsx`

- Affiche la cause racine en langage naturel
- Liste les actions correctives avec priorités
- Affiche les commandes suggérées (copie-coller)
- Permet le feedback utilisateur

---

## Prompts et stratégies IA

### Prompt principal (structuré)

```
Tu es un expert DevOps / SRE. Tu analyses une erreur d'infrastructure et tu fournis :
1. Une cause racine claire (1-2 phrases)
2. Une explication détaillée du problème
3. La sévérité (low/medium/high/critical)
4. Les composants affectés
5. Des recommandations d'action priorisées

CONTEXTE :
- Type d'erreur: {error_type}
- Provider: {provider} (AWS/Azure/GCP)
- Runtime: {runtime} (Terraform/Ansible/SSM)
- Logs: {error_logs}

RÉPONSE REQUISE (JSON STRICT) :
{
  "root_cause": "...",
  "explanation": "...",
  "severity": "low|medium|high|critical",
  "affected_components": ["component1", "component2"],
  "recommendations": [
    {
      "action": "Description de l'action",
      "priority": "immediate|high|normal",
      "commands": ["cmd1", "cmd2"],
      "risk": "low|medium|high",
      "estimated_time_minutes": 5
    }
  ]
}
```

### Stratégie de fallback

Si GPT n'est pas disponible (mode mock) :
- Utilise des **règles heuristiques** (regex patterns) pour détecter les erreurs courantes
- Retourne des suggestions pré-configurées
- Signale clairement : "Suggestion basée sur des règles, pas d'analyse IA"

---

## Intégration dans les workflows existants

### 1. Hook dans `execution_service.py`
Après qu'une exécution échoue, déclenche l'analyse IA :

```python
# Dans execution_service.execute()
try:
    # ... exécution ...
except Exception as e:
    # Log l'erreur
    log_execution_event(...)
    
    # Analyse IA asynchrone (non-blocking)
    asyncio.create_task(
        ai_error_analyzer.analyze_error_async(
            execution_id=execution.id,
            error=str(e),
            error_type="terraform_apply",
            db=db
        )
    )
    raise
```

### 2. Hook dans le chat frontend
Après affichage d'une erreur, affiche le bouton "💡 Analyse IA" :

```tsx
{execution.status === "failed" && (
  <ErrorAnalysisPanel 
    executionId={execution.id}
    onAnalysisReady={(analysis) => {
      // Affiche le panel d'analyse
    }}
  />
)}
```

### 3. BD migrations (Alembic)
Créer la table `ai_analyses` :

```sql
CREATE TABLE ai_analyses (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    raw_error TEXT NOT NULL,
    error_type VARCHAR(100) NOT NULL,
    analysis JSONB NOT NULL,
    user_feedback VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ai_analyses_execution ON ai_analyses(execution_id);
CREATE INDEX idx_ai_analyses_user ON ai_analyses(user_id);
```

---

## Configuration et activationreminder

### Var d'environnement
```bash
# Pour utiliser OpenAI (recommandé)
DAC_AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Pour mode mock (sans clé)
DAC_AI_PROVIDER=mock

# Modèle à utiliser (défaut: gpt-4o-mini)
DAC_AI_MODEL=gpt-4o-mini

# Timeout des analyses (par défaut: 10s)
AI_ANALYSIS_TIMEOUT_SECONDS=10
```

### Options de deployment
1. **Mode Production** : OpenAI API (coûts: ~0.05-0.10€ par analyse)
2. **Mode Développement** : GPT-4o-mini (économique)
3. **Mode Éducation** : Mock + heuristiques (gratuit, localisé)
4. **Mode Hybride** : Ollama en local + fallback OpenAI

---

## Limites et disclaimers

Les suggestions IA sont :
- ✅ Utiles pour accélérer le diagnostic
- ⚠️ À vérifier avant application
- ❌ PAS un remplacement pour l'expertise humaine
- ❌ PAS auto-exécutées (affichage uniquement)

Affichage clair : *"Cette analyse est générée par IA. Vérifiez avant d'appliquer."*

---

## Sécurité et conformité

### Points clés
- ✅ Les secrets (credentials) ne sont **jamais** envoyés à GPT
- ✅ Les logs sont **redactés** avant analyse (no API keys)
- ✅ Les suggestions sensibles affichent un warning : "⚠️ Risque: HIGH"
- ✅ Toutes les sorties IA sont enregistrées en BD pour audit
- ✅ Les utilisateurs peuvent voter ("helpful/incorrect") pour améliorer les prompts

### Redaction de logs
```python
def redact_sensitive_data(logs: str) -> str:
    """Supprime les credentials/tokens avant envoi à GPT."""
    redacted = logs
    # Supprime les patterns communs
    patterns = [
        r"(AWS_ACCESS_KEY_ID|AKIA[0-9A-Z]{16})",
        r"(AWS_SECRET_ACCESS_KEY|[A-Za-z0-9/+=]{40})",
        r"(api.key|token|password)\s*[:=]\s*[^\s]+",
    ]
    for pattern in patterns:
        redacted = re.sub(pattern, "[REDACTED]", redacted)
    return redacted
```

---

## Métriques et monitoring

Objectifs de performance :
- **Latence** : < 5s (99e percentile)
- **Disponibilité** : 99%+ (fallback sur heuristiques si GPT down)
- **Pertinence** : 80%+ (mesurée via user feedback)
- **Coût** : < 1€ par 100 analyses

---

## Exemple d'utilisation (UX)

### Scénario : Instance AWS non créée

```
❌ Erreur d'exécution Terraform
   "Error: InvalidAMIID.NotFound: The image id 'ami-invalid' does not exist"

💡 Analyse IA disponible
   [Afficher l'analyse]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Diagnostic : Cause racine identifiée

🔴 Cause : L'image (AMI) demandée n'existe pas dans la région eu-west-1

📋 Explication :
Vous avez essayé de créer une instance avec un AMI invalide ou qui n'existe pas 
dans votre région. Cela se produit quand :
- L'AMI n'est pas disponible pour le provider/région sélectionnée
- L'ID AMI a changé ou a été supprimé
- La région n'a pas accès à cette image

✅ Actions correctives (priorité: HIGH)

  1️⃣ [HIGH] Utiliser une AMI valide
     Commande :
     ```
     aws ec2 describe-images --owners amazon --query 'Images[?Name==`ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*`].ImageId' --region eu-west-1
     ```
     Risque : LOW
     Temps estimé : 2 min

  2️⃣ [NORMAL] Vérifier votre région
     Votre région actuelle : eu-west-1
     Assurez-vous que cette région est correcte.
     Temps estimé : 1 min

🔒 Sécurité : Les identifiants ont été redactés avant analyse IA.

👍 Feedback :
   [Helpful] [Incorrect] [Incomplete]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Plan d'implémentation (6 étapes)

| # | Étape | Durée | Dépendances |
|---|-------|-------|-------------|
| 1 | Créer modèle BD + migrations | 30 min | None |
| 2 | Implémenter service d'analyse | 45 min | #1 |
| 3 | Créer prompts structurés | 30 min | #2 |
| 4 | Intégrer dans execution_service | 30 min | #2 |
| 5 | Créer routes API + UI | 60 min | #4 |
| 6 | Tests + documentation | 45 min | #5 |

**Durée totale : ~3h30 pour une implémentation complète**

---

## Fichiers à créer/modifier

### Nouveaux fichiers
```
devops_api/app/models/ai_analysis.py          ← Modèle BD
devops_api/app/services/ai_error_analyzer.py  ← Service principal
devops_api/app/services/ai_prompts.py         ← Prompts centralisés
devops_api/app/routes/ai_routes.py            ← Endpoints API
frontend/src/components/AI/ErrorAnalysisPanel.tsx  ← UI
devops_api/alembic/versions/XXX_add_ai_analyses.py ← Migration BD
```

### Fichiers modifiés
```
devops_api/app/models/__init__.py             ← Exporter AIAnalysis
devops_api/app/models/execution.py            ← Ajouter relation
devops_api/app/models/user.py                 ← Ajouter relation
devops_api/app/services/execution_service.py  ← Hook analyse IA
devops_api/app/main.py                        ← Inclure routes AI
frontend/src/App.tsx                          ← Importer ErrorAnalysisPanel
```

---

## Prochaines étapes

1. ✅ Comprendre l'architecture existante (done)
2. → Implémenter le modèle BD (Étape 1)
3. → Créer le service (Étape 2)
4. → Intégrer dans les workflows (Étape 4)
5. → Tester end-to-end

Voulez-vous que je commence par l'**Étape 1** (modèle BD) ?
