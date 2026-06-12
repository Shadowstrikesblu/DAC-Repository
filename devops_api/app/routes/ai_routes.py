# © 2024–2026 TOURE Arnaud Patrick
# Licensed under the MIT License

# app/routes/ai_routes.py
"""
Routes API pour les analyses IA d'erreurs et suggestions correctives.

Endpoints :
- GET /api/ai/analyses/{execution_id} → Récupère l'analyse
- POST /api/ai/analyses/{analysis_id}/feedback → Enregistre le feedback
- GET /api/ai/history → Historique des analyses
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta

from app.database import get_db
from app.auth import get_current_user
from app.models import AIAnalysis, Execution, User
from app.schemas.ai_schemas import (
    AIAnalysisResponse,
    AIAnalysisListResponse,
    FeedbackRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])


# ============================================================================
# Schemas
# ============================================================================

class AIAnalysisSchema(dict):
    """Schema de base pour une analyse IA"""
    pass


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/analyses/{execution_id}")
async def get_analysis(
    execution_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Récupère l'analyse IA pour une exécution donnée.
    
    Returns:
    {
        "id": 1,
        "execution_id": 123,
        "raw_error": "...",
        "error_type": "terraform_apply",
        "analysis": {
            "root_cause": "...",
            "explanation": "...",
            "severity": "high",
            "affected_components": [...],
            "recommendations": [...]
        },
        "created_at": "2026-06-12T10:00:00",
        "user_feedback": null
    }
    """
    # Vérifie que l'exécution appartient à l'utilisateur
    execution = db.query(Execution).filter_by(
        id=execution_id,
        user_id=current_user.id
    ).first()
    
    if not execution:
        raise HTTPException(status_code=404, detail="Execution non trouvée")
    
    # Récupère l'analyse (s'il y en a une)
    analysis = db.query(AIAnalysis).filter_by(
        execution_id=execution_id
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Aucune analyse IA disponible pour cette exécution")
    
    return {
        "id": analysis.id,
        "execution_id": analysis.execution_id,
        "raw_error": analysis.raw_error[:500] + "..." if len(analysis.raw_error) > 500 else analysis.raw_error,
        "error_type": analysis.error_type,
        "analysis": analysis.analysis,
        "created_at": analysis.created_at.isoformat() if analysis.created_at else None,
        "user_feedback": analysis.user_feedback,
    }


@router.post("/analyses/{analysis_id}/feedback")
async def submit_feedback(
    analysis_id: int,
    feedback: dict,  # {"feedback": "helpful" | "incorrect" | "incomplete"}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Enregistre le feedback utilisateur sur une analyse.
    
    Cela aide à améliorer les prompts et évaluer la qualité des analyses.
    """
    analysis = db.query(AIAnalysis).filter_by(
        id=analysis_id,
        user_id=current_user.id
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analyse non trouvée")
    
    feedback_value = feedback.get("feedback", "").lower()
    if feedback_value not in ["helpful", "incorrect", "incomplete"]:
        raise HTTPException(status_code=400, detail="Feedback invalide")
    
    analysis.user_feedback = feedback_value
    analysis.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(analysis)
    
    logger.info(f"Feedback recorded for analysis {analysis_id}: {feedback_value}")
    
    return {
        "message": "Feedback enregistré",
        "analysis_id": analysis_id,
        "feedback": feedback_value,
    }


@router.get("/history")
async def get_analysis_history(
    limit: int = Query(10, ge=1, le=100),
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Récupère l'historique des analyses pour l'utilisateur.
    
    Query params:
    - limit: Nombre max d'analyses (défaut 10)
    - days: Période en jours (défaut 30)
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    analyses = db.query(AIAnalysis).filter(
        AIAnalysis.user_id == current_user.id,
        AIAnalysis.created_at >= cutoff_date,
    ).order_by(AIAnalysis.created_at.desc()).limit(limit).all()
    
    return {
        "count": len(analyses),
        "analyses": [
            {
                "id": a.id,
                "execution_id": a.execution_id,
                "error_type": a.error_type,
                "severity": a.analysis.get("severity", "unknown") if a.analysis else "unknown",
                "root_cause": a.analysis.get("root_cause", "")[:100] if a.analysis else "",
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "user_feedback": a.user_feedback,
            }
            for a in analyses
        ],
    }


@router.get("/stats")
async def get_ai_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retourne les statistiques d'utilisation de l'IA pour l'utilisateur.
    """
    # Compte les analyses totales
    total_analyses = db.query(AIAnalysis).filter_by(user_id=current_user.id).count()
    
    # Compte les feedbacks positifs
    helpful_count = db.query(AIAnalysis).filter_by(
        user_id=current_user.id,
        user_feedback="helpful"
    ).count()
    
    # Compte les erreurs par type
    from sqlalchemy import func
    error_type_stats = db.query(
        AIAnalysis.error_type,
        func.count(AIAnalysis.id).label("count")
    ).filter_by(user_id=current_user.id).group_by(AIAnalysis.error_type).all()
    
    # Compte les erreurs par sévérité
    severity_stats = []
    for severity in ["low", "medium", "high", "critical"]:
        count = 0
        for a in db.query(AIAnalysis).filter_by(user_id=current_user.id).all():
            if a.analysis and a.analysis.get("severity") == severity:
                count += 1
        if count > 0:
            severity_stats.append({"severity": severity, "count": count})
    
    return {
        "total_analyses": total_analyses,
        "helpful_feedback_count": helpful_count,
        "helpful_feedback_ratio": helpful_count / total_analyses if total_analyses > 0 else 0,
        "error_types": [
            {"type": et, "count": c} for et, c in error_type_stats
        ],
        "severity_distribution": severity_stats,
    }
