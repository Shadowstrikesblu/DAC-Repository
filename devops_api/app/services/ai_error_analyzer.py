# © 2024–2026 TOURE Arnaud Patrick
# Licensed under the MIT License

# app/services/ai_error_analyzer.py
"""
Service pour analyser les erreurs d'exécution via l'IA et suggérer des corrections.

Ce service :
1. Capture les erreurs d'exécution (Terraform, Ansible, SSM, Kubernetes)
2. Les envoie au modèle GPT pour analyse
3. Parse la réponse structurée en JSON
4. Stocke le résultat en BD pour historique et feedback
5. Publie un événement pour notification frontend
"""
import logging
import json
import re
import asyncio
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from app.models import AIAnalysis, Execution, ExecutionLog
from app.services.gpt_service import _chat_with_retry
from app.services.ai_prompts import get_analysis_prompt_for_error_type
from app.database import SessionLocal

logger = logging.getLogger(__name__)


# ============================================================================
# Helpers de redaction et extraction
# ============================================================================

def redact_sensitive_data(logs: str) -> str:
    """
    Supprime les credentials/tokens des logs avant envoi à GPT.
    
    Redacte les patterns communs:
    - AWS credentials (AKIA..., AWS_SECRET...)
    - API keys et tokens
    - Mots de passe
    """
    if not logs:
        return logs
    
    redacted = logs
    
    # Patterns à redacter
    patterns = [
        # AWS Access Keys
        (r'(AKIA[0-9A-Z]{16})', '[AWS_KEY_REDACTED]'),
        # AWS Secret Keys (40+ chars alphanumeric)
        (r'(aws_?secret_?access_?key|AWS_SECRET_ACCESS_KEY)[\s:=]+[A-Za-z0-9/+=]{40,}', '[AWS_SECRET_REDACTED]'),
        # Generic API keys
        (r'(api[_-]?key|token|password)[\s:=]+[^\s]+', '[CREDENTIAL_REDACTED]'),
        # Bearer tokens
        (r'(bearer|authorization)[\s:]+[^\s]+', '[TOKEN_REDACTED]'),
        # Common secret patterns
        (r'(secret|private_key|pk)[\s:=]+[^\s\n]+', '[SECRET_REDACTED]'),
    ]
    
    for pattern, replacement in patterns:
        redacted = re.sub(pattern, replacement, redacted, flags=re.IGNORECASE)
    
    return redacted


def extract_error_context(execution: Execution, db: Session) -> Dict[str, Any]:
    """
    Extrait le contexte utile pour analyser l'erreur.
    
    Retourne:
    {
        "error_type": "terraform_apply" | "ansible_run" | "ssm_command" | ...,
        "provider": "aws" | "azure" | "gcp" | ...,
        "raw_error": "Error message...",
        "task_type": Type d'exécution (terraform, ansible, etc.),
        "tags": Tags associés à l'exécution,
    }
    """
    error_type = execution.task_type.lower() if execution.task_type else "unknown"
    
    # Récupère le dernier log d'erreur
    last_error_log = (
        db.query(ExecutionLog)
        .filter_by(execution_id=execution.id, event="failed")
        .order_by(ExecutionLog.created_at.desc())
        .first()
    )
    
    raw_error = ""
    if last_error_log and last_error_log.message:
        # Essaie de parser le message (peut être JSON)
        if isinstance(last_error_log.message, str):
            try:
                msg_json = json.loads(last_error_log.message)
                raw_error = msg_json.get("error", str(msg_json))
            except (json.JSONDecodeError, TypeError):
                raw_error = last_error_log.message
        else:
            raw_error = str(last_error_log.message)
    
    # Redacte les données sensibles
    raw_error = redact_sensitive_data(raw_error)
    
    # Détermine le provider (AWS, Azure, GCP)
    provider = "unknown"
    if execution.extra_data and isinstance(execution.extra_data, dict):
        provider = execution.extra_data.get("provider", "unknown")
    
    # Tags
    tags = execution.tags or []
    
    return {
        "error_type": error_type,
        "provider": provider,
        "raw_error": raw_error,
        "task_type": execution.task_type,
        "tags": tags,
        "execution_id": execution.id,
    }


# ============================================================================
# Service d'analyse asynchrone
# ============================================================================

async def analyze_error_async(
    execution_id: int,
    user_id: int,
    db: Optional[Session] = None,
) -> Optional[AIAnalysis]:
    """
    Lance une analyse asynchrone de l'erreur d'une exécution.
    
    Cette fonction est non-bloquante et peut être appelée via asyncio.create_task().
    
    Args:
        execution_id: ID de l'exécution ayant échoué
        user_id: ID de l'utilisateur propriétaire
        db: Session BD (optionnel, crée une session locale si absent)
    
    Returns:
        L'objet AIAnalysis créé, ou None en cas d'erreur
    """
    db_session = db or SessionLocal()
    try:
        # Récupère l'exécution
        execution = db_session.query(Execution).filter_by(
            id=execution_id,
            user_id=user_id
        ).first()
        
        if not execution:
            logger.warning(f"Execution {execution_id} not found for user {user_id}")
            return None
        
        # Vérifie que c'est bien une erreur
        if execution.status != "failed":
            logger.info(f"Execution {execution_id} is not in failed state ({execution.status})")
            return None
        
        # Extrait le contexte d'erreur
        context = extract_error_context(execution, db_session)
        raw_error = context["raw_error"]
        
        if not raw_error or len(raw_error.strip()) == 0:
            logger.info(f"No error message found for execution {execution_id}")
            return None
        
        logger.info(f"[AI Analysis] Starting analysis for execution {execution_id}")
        
        # Construit le prompt structuré
        prompt = get_analysis_prompt_for_error_type(
            error_type=context["error_type"],
            provider=context["provider"],
            raw_error=raw_error,
            tags=context["tags"]
        )
        
        # Appelle le modèle IA
        try:
            ai_response = await analyze_error_with_gpt(prompt)
        except Exception as e:
            logger.error(f"GPT analysis failed for execution {execution_id}: {e}")
            # Fallback sur heuristiques
            ai_response = analyze_error_with_heuristics(context)
        
        # Crée l'enregistrement AIAnalysis en BD
        ai_analysis = AIAnalysis(
            execution_id=execution_id,
            user_id=user_id,
            raw_error=raw_error,
            error_type=context["error_type"],
            analysis=ai_response,
        )
        
        db_session.add(ai_analysis)
        db_session.commit()
        db_session.refresh(ai_analysis)
        
        logger.info(f"[AI Analysis] Analysis saved for execution {execution_id} (analysis_id={ai_analysis.id})")
        
        return ai_analysis
    
    except Exception as e:
        logger.error(f"Error in analyze_error_async: {e}", exc_info=True)
        return None
    
    finally:
        if not db:  # Ferme la session si elle a été créée localement
            db_session.close()


async def analyze_error_with_gpt(prompt: str) -> Dict[str, Any]:
    """
    Appelle GPT pour analyser l'erreur avec prompt structuré.
    
    Returns:
    {
        "root_cause": "...",
        "explanation": "...",
        "severity": "low|medium|high|critical",
        "affected_components": [...],
        "recommendations": [...]
    }
    """
    messages = [
        {
            "role": "system",
            "content": (
                "Tu es un expert DevOps / SRE spécialisé dans le troubleshooting d'infrastructure. "
                "Tu analyses les erreurs d'infrastructure (Terraform, Ansible, SSM, Kubernetes) "
                "et fournis des diagnostics précis et des recommandations actionnables. "
                "Réponds toujours en JSON structuré. Réponds en français."
            ),
        },
        {"role": "user", "content": prompt},
    ]
    
    # Appelle le modèle avec timeout
    try:
        response_text = await asyncio.to_thread(
            _chat_with_retry,
            messages,
            model=None,  # Utilise le modèle par défaut
            temperature=0.2,
            response_format=None,  # Pas de schema strict, juste du JSON
            max_retries=3,
            timeout_seconds=10,
        )
        
        # Parse la réponse JSON
        # Tente d'extraire le JSON du texte (peut être entouré de texte ou code fences)
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            response_text = json_match.group(0)
        
        analysis = json.loads(response_text)
        
        # Valide la structure
        analysis = validate_analysis_structure(analysis)
        
        return analysis
    
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse GPT response as JSON: {e}")
        raise
    except Exception as e:
        logger.error(f"GPT analysis error: {e}")
        raise


def validate_analysis_structure(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """
    Valide et complète la structure de l'analyse IA.
    """
    # Structure par défaut
    validated = {
        "root_cause": analysis.get("root_cause", "Cause racine inconnue"),
        "explanation": analysis.get("explanation", ""),
        "severity": analysis.get("severity", "medium"),
        "affected_components": analysis.get("affected_components", []),
        "recommendations": analysis.get("recommendations", []),
    }
    
    # Valide severity
    if validated["severity"] not in ["low", "medium", "high", "critical"]:
        validated["severity"] = "medium"
    
    # Valide recommendations
    if not isinstance(validated["recommendations"], list):
        validated["recommendations"] = []
    else:
        validated["recommendations"] = [
            validate_recommendation(rec) for rec in validated["recommendations"]
        ]
    
    # Assure que affected_components est une liste
    if not isinstance(validated["affected_components"], list):
        validated["affected_components"] = []
    
    return validated


def validate_recommendation(rec: Dict[str, Any]) -> Dict[str, Any]:
    """
    Valide et complète une recommandation individuelle.
    """
    validated = {
        "action": rec.get("action", "Action non spécifiée"),
        "priority": rec.get("priority", "normal"),
        "commands": rec.get("commands", []),
        "risk": rec.get("risk", "medium"),
        "estimated_time_minutes": rec.get("estimated_time_minutes", 10),
    }
    
    # Valide priority
    if validated["priority"] not in ["immediate", "high", "normal"]:
        validated["priority"] = "normal"
    
    # Valide risk
    if validated["risk"] not in ["low", "medium", "high"]:
        validated["risk"] = "medium"
    
    # Assure que commands est une liste
    if not isinstance(validated["commands"], list):
        validated["commands"] = []
    
    return validated


# ============================================================================
# Fallback : Analyse par heuristiques (quand GPT n'est pas disponible)
# ============================================================================

def analyze_error_with_heuristics(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyse l'erreur par règles heuristiques (fallback quand GPT n'est pas dispo).
    
    Retourne une structure similaire à l'analyse GPT mais basée sur des regex.
    """
    raw_error = context["raw_error"].lower()
    error_type = context["error_type"].lower()
    provider = context["provider"].lower()
    
    # Détecte les patterns d'erreur courants
    if "ami" in raw_error and "not found" in raw_error:
        return {
            "root_cause": "L'image (AMI) demandée n'existe pas dans cette région AWS",
            "explanation": "Vous avez essayé de créer une instance avec un AMI invalide ou qui n'existe pas dans votre région.",
            "severity": "high",
            "affected_components": ["EC2", "AMI"],
            "recommendations": [
                {
                    "action": "Utiliser une AMI valide",
                    "priority": "immediate",
                    "commands": ["aws ec2 describe-images --owners amazon --query 'Images[].ImageId' --region eu-west-1"],
                    "risk": "low",
                    "estimated_time_minutes": 5,
                },
            ],
        }
    
    elif "unauthorized" in raw_error or "permission denied" in raw_error:
        return {
            "root_cause": "Permissions insuffisantes pour cette opération",
            "explanation": "Votre utilisateur AWS/Azure/GCP n'a pas les permissions requises.",
            "severity": "high",
            "affected_components": ["IAM", "Permissions"],
            "recommendations": [
                {
                    "action": "Ajouter les permissions IAM/RBAC nécessaires",
                    "priority": "high",
                    "commands": ["# Consulter les permissions requises dans la documentation"],
                    "risk": "medium",
                    "estimated_time_minutes": 15,
                },
            ],
        }
    
    elif "timeout" in raw_error or "timed out" in raw_error:
        return {
            "root_cause": "Dépassement du délai d'attente pour l'opération",
            "explanation": "L'opération a pris trop de temps à s'exécuter ou le backend a perdu la connexion.",
            "severity": "medium",
            "affected_components": ["Backend", "Network"],
            "recommendations": [
                {
                    "action": "Réessayer l'opération",
                    "priority": "normal",
                    "commands": ["# Relancez l'exécution"],
                    "risk": "low",
                    "estimated_time_minutes": 2,
                },
            ],
        }
    
    # Fallback par défaut
    return {
        "root_cause": "Erreur d'exécution non identifiée",
        "explanation": f"Une erreur s'est produite lors de {error_type} sur {provider}. Les détails techniques sont affichés ci-dessous.",
        "severity": "medium",
        "affected_components": [error_type.title(), provider.upper()],
        "recommendations": [
            {
                "action": "Consulter les logs détaillés",
                "priority": "normal",
                "commands": ["# Vérifiez les logs d'exécution pour plus de détails"],
                "risk": "low",
                "estimated_time_minutes": 5,
            },
        ],
    }
