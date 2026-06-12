# Challenge 6 Implementation Guide: AI-Powered Error Analysis

## Table des matières

1. [Architecture](#architecture)
2. [Installation](#installation)
3. [Utilisation](#utilisation)
4. [API Reference](#api-reference)
5. [Configuration](#configuration)
6. [Testing](#testing)
7. [Limitations & Disclaimers](#limitations--disclaimers)

---

## Architecture

### Composants

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                                 │
│  ErrorAnalysisPanel.tsx - Affiche analyses & recommandations         │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP REST
┌────────────────────────▼────────────────────────────────────────────┐
│                     API Routes (FastAPI)                             │
│  GET  /api/ai/analyses/{execution_id}                               │
│  POST /api/ai/analyses/{analysis_id}/feedback                       │
│  GET  /api/ai/history                                               │
│  GET  /api/ai/stats                                                 │
└────────────────────────┬────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────────┐
│            AI Error Analyzer Service                                 │
│  - Extract error context                                            │
│  - Redact sensitive data                                            │
│  - Call GPT or fallback heuristics                                  │
│  - Store analysis in DB                                             │
└────────────────────────┬────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────────┐
│               GPT Service (_chat_with_retry)                         │
│  - OpenAI API calls with retry logic                                │
│  - Timeout handling (10s)                                           │
│  - Mock fallback support                                            │
└────────────────────────┬────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────────┐
│                  PostgreSQL Database                                 │
│  Table: ai_analyses (execution_id, analysis JSON, feedback)         │
└─────────────────────────────────────────────────────────────────────┘
```

### Flux de données

1. **Exécution échoue** → `execution_service.py` capture l'exception
2. **Log d'erreur** → `log_execution_event(..., event="failed")`
3. **AI Analysis asynchrone** → `asyncio.create_task(analyze_error_async(...))`
4. **Extraction contexte** → Type d'erreur, provider, logs (redactés)
5. **Appel GPT** → Prompt structuré → Réponse JSON
6. **Stockage** → `AIAnalysis` table en BD
7. **Frontend** → Affiche "💡 Analyse IA disponible" si analyse existe

---

## Installation

### 1. Base de données (Alembic migration)

```bash
cd /root/DAC-Repository/devops_api

# Appliquer la migration
alembic upgrade head
```

La table `ai_analyses` est créée automatiquement avec :
- Index sur `execution_id`, `user_id`, `created_at`
- Contrainte de FK cascading

### 2. Dépendances (déjà incluses dans `requirements.txt`)

```
- openai>=1.0.0
- sqlalchemy>=2.0.0
- pydantic>=2.0.0
- fastapi
```

### 3. Configuration d'environnement

```bash
# .env ou docker-compose.yml environment

# Utiliser OpenAI (recommandé)
DAC_AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
DAC_AI_MODEL=gpt-4o-mini

# OU mode mock (gratuit, localisé)
DAC_AI_PROVIDER=mock

# Timeout des analyses
AI_ANALYSIS_TIMEOUT_SECONDS=10
```

### 4. Vérifier l'installation

```bash
# Vérifier que la table existe
PGPASSWORD=dac psql -h localhost -U dac -d devops_api_db -c "SELECT * FROM ai_analyses LIMIT 1;"

# Vérifier que les routes sont enregistrées
curl http://localhost:8000/docs | grep "/api/ai"
```

---

## Utilisation

### Scénario : Erreur Terraform

#### 1. Utilisateur crée une ressource (via chat DAC)

```
User: "Crée une instance Ubuntu sur AWS"
```

#### 2. Terraform échoue

```
❌ Error: InvalidAMIID.NotFound: The image id 'ami-invalid' does not exist
```

#### 3. Backend capture l'erreur et déclenche analyse IA

```python
# Dans execution_service.py (exception handler)
asyncio.create_task(
    ai_error_analyzer.analyze_error_async(
        execution_id=123,
        user_id=456,
    )
)
```

#### 4. Frontend poll l'API et affiche le résultat

```javascript
// Après quelques secondes (analysis en background)
GET /api/ai/analyses/123
→ Retourne l'analyse structurée
```

#### 5. Affichage du diagnostic

```
💡 Diagnostic : Cause racine identifiée

🔴 Cause : L'image (AMI) demandée n'existe pas dans la région eu-west-1

📋 Explication :
Vous avez essayé de créer une instance avec un AMI invalide...

✅ Actions correctives (priorité: HIGH)
  1️⃣ [HIGH] Utiliser une AMI valide
     ```
     aws ec2 describe-images --owners amazon --query '...' --region eu-west-1
     ```
```

### Usage via API

#### Récupérer l'analyse d'une exécution

```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:8000/api/ai/analyses/123
```

**Response** :
```json
{
  "id": 1,
  "execution_id": 123,
  "raw_error": "Error: InvalidAMIID.NotFound...",
  "error_type": "terraform_apply",
  "analysis": {
    "root_cause": "L'image (AMI) demandée n'existe pas...",
    "explanation": "Vous avez essayé...",
    "severity": "high",
    "affected_components": ["EC2", "AMI"],
    "recommendations": [
      {
        "action": "Utiliser une AMI valide",
        "priority": "immediate",
        "commands": ["aws ec2 describe-images..."],
        "risk": "low",
        "estimated_time_minutes": 5
      }
    ]
  },
  "created_at": "2026-06-12T10:00:00",
  "user_feedback": null
}
```

#### Soumettre un feedback

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"feedback": "helpful"}' \
  http://localhost:8000/api/ai/analyses/1/feedback
```

#### Voir l'historique des analyses

```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:8000/api/ai/history?limit=20&days=30"
```

Response:
```json
{
  "count": 5,
  "analyses": [
    {
      "id": 5,
      "execution_id": 123,
      "error_type": "terraform_apply",
      "severity": "high",
      "root_cause": "L'image (AMI)...",
      "created_at": "2026-06-12T10:00:00",
      "user_feedback": "helpful"
    }
  ]
}
```

---

## API Reference

### Endpoints

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/ai/analyses/{execution_id}` | Récupère l'analyse d'une exécution |
| POST | `/api/ai/analyses/{analysis_id}/feedback` | Enregistre feedback utilisateur |
| GET | `/api/ai/history` | Historique des analyses (avec pagination) |
| GET | `/api/ai/stats` | Stats d'utilisation IA pour l'utilisateur |

### Query Parameters

#### GET /api/ai/history

| Param | Type | Default | Range |
|-------|------|---------|-------|
| `limit` | int | 10 | 1-100 |
| `days` | int | 30 | 1-365 |

---

## Configuration

### Mode OpenAI (Production)

```bash
export DAC_AI_PROVIDER=openai
export OPENAI_API_KEY=sk-proj-xxxxx
export DAC_AI_MODEL=gpt-4o-mini
```

**Coûts estimés** : ~0.05-0.10€ par analyse (très faible)

### Mode Mock (Développement)

```bash
export DAC_AI_PROVIDER=mock
```

Utilise des **heuristiques prédéfinies** (regex patterns) pour analyser les erreurs courantes.

**Avantages** :
- Aucun coût
- Pas de dépendance réseau
- Parfait pour CI/CD et démos

**Limitations** :
- Analyse moins nuancée
- Patterns limités aux cas courants

### Mode Hybride (Recommend)

Combine heuristiques rapides + GPT pour approfondir :

```python
# Dans ai_error_analyzer.py
if simple_heuristic_matches(error):
    # Retourne analyse heuristique rapide (< 100ms)
    return heuristic_analysis
else:
    # Appelle GPT pour cas complexes
    return gpt_analysis
```

---

## Testing

### Test unitaire : Analyse d'erreur

```python
# tests/test_ai_error_analyzer.py
import pytest
from app.services.ai_error_analyzer import (
    analyze_error_with_heuristics,
    redact_sensitive_data,
)

def test_redact_aws_keys():
    logs = "AWS_ACCESS_KEY_ID=AKIA123456789ABC AWS_SECRET=abc123"
    redacted = redact_sensitive_data(logs)
    assert "AKIA" not in redacted
    assert "abc123" not in redacted

def test_ami_not_found_heuristics():
    context = {
        "raw_error": "Error: InvalidAMIID.NotFound",
        "error_type": "terraform",
        "provider": "aws",
    }
    analysis = analyze_error_with_heuristics(context)
    
    assert "AMI" in analysis["root_cause"]
    assert analysis["severity"] == "high"
    assert len(analysis["recommendations"]) > 0
```

### Test d'intégration : E2E

```python
# tests_e2e/test_ai_analysis_e2e.py
async def test_ai_analysis_e2e(client, db_session):
    # 1. Créer une exécution
    exec = Execution(user_id=1, task_type="terraform", status="failed")
    db_session.add(exec)
    db_session.commit()
    
    # 2. Analyser l'erreur
    analysis = await analyze_error_async(exec.id, 1, db_session)
    
    # 3. Vérifier l'analyse
    assert analysis.analysis["root_cause"] is not None
    assert analysis.analysis["severity"] in ["low", "medium", "high", "critical"]
    
    # 4. Récupérer via API
    response = client.get(f"/api/ai/analyses/{exec.id}")
    assert response.status_code == 200
    assert response.json()["analysis"]["root_cause"]
```

---

## Limitations & Disclaimers

### ⚠️ Important

1. **Les analyses IA ne sont PAS des conseils d'experts**
   - À vérifier avant application
   - Peut contenir des erreurs ou imprécisions

2. **Secrets ne sont jamais envoyés à l'API GPT**
   - Les AWS keys, API tokens sont redactés (`[REDACTED]`)
   - Vous pouvez auditer `ai_error_analyzer.redact_sensitive_data()`

3. **Les suggestions ne sont jamais auto-exécutées**
   - Affichage uniquement → Utilisateur décide d'agir
   - Aucun changement d'infra sans consentement explicite

4. **Coûts OpenAI** (si utilisé)
   - Env. 0.05€ par analyse (GPT-4o-mini)
   - Budget recommandé : 10€/mois pour 200 analyses
   - Surveillance : `curl https://api.openai.com/dashboard/usage`

5. **Performance**
   - Analyses asynchrones → pas de blocage du chat
   - Timeout 10s → fallback heuristique si GPT timeout
   - Latence P99 : < 5s

### 📊 Métriques de qualité

| Métrique | Cible | Mesure |
|----------|-------|--------|
| Pertinence | 80%+ | Via user feedback (helpful/incorrect) |
| Latence | < 5s | Monitoring des timestamps |
| Disponibilité | 99%+ | Fallback sur heuristiques |
| Coût | < 0.15€/analyse | CPM tracking |

---

## Améliorations futures

1. **Analyse multi-contexte** : Corréler plusieurs erreurs
2. **Mesures préventives** : Suggérer des monitorings
3. **Documentation auto-générée** : FAQ basée sur les erreurs
4. **Ollama local** : Déployer un modèle local sans dépendre d'OpenAI
5. **Benchmark de prompts** : A/B testing des prompts

---

## Support & Troubleshooting

### Problème : "Aucune analyse IA disponible"

**Cause** : Analysis pas encore générée (délai <  5s)
**Solution** : Attendre quelques secondes puis recharger

### Problème : "Erreur API OpenAI"

```
DAC_AI_PROVIDER=openai
OPENAI_API_KEY n'est pas set
```

**Solution** :
```bash
export OPENAI_API_KEY=sk-your-key
docker restart backend
```

### Problème : Analyses lentes (>10s)

**Cause** : GPT timeout ou réseau lent
**Solution** : Vérifier connectivité → GPT fallback sur heuristiques automatiquement

### Vérifier les logs

```bash
# Logs de l'API
tail -f /root/DAC-Repository/devops_api/generated_files/api_logs/api_*.log | grep "AI Analysis"

# Logs de la base de données
select * from ai_analyses order by created_at desc limit 10;
```

---

## Auteur

Challenge 6 - AI Features for DevOps  
Année : 2026  
Licens : MIT
