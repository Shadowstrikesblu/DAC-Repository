# © 2024–2026 TOURE Arnaud Patrick
# Licensed under the MIT License

# app/schemas/ai_schemas.py
"""
Pydantic schemas for AI analysis API responses.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class RecommendationSchema(BaseModel):
    """Une recommandation d'action corrective"""
    action: str
    priority: str = Field(..., pattern="^(immediate|high|normal)$")
    commands: List[str]
    risk: str = Field(..., pattern="^(low|medium|high)$")
    estimated_time_minutes: int = 10


class AIAnalysisSchema(BaseModel):
    """Contenu structuré d'une analyse IA"""
    root_cause: str
    explanation: str
    severity: str = Field(..., pattern="^(low|medium|high|critical)$")
    affected_components: List[str]
    recommendations: List[RecommendationSchema]


class AIAnalysisResponse(BaseModel):
    """Réponse API pour une analyse"""
    id: int
    execution_id: int
    raw_error: str
    error_type: str
    analysis: Dict[str, Any]
    created_at: Optional[datetime]
    user_feedback: Optional[str]

    class Config:
        from_attributes = True


class AIAnalysisListItem(BaseModel):
    """Item dans la liste des analyses"""
    id: int
    execution_id: int
    error_type: str
    severity: str
    root_cause: str
    created_at: Optional[datetime]
    user_feedback: Optional[str]


class AIAnalysisListResponse(BaseModel):
    """Réponse API pour la liste des analyses"""
    count: int
    analyses: List[AIAnalysisListItem]


class FeedbackRequest(BaseModel):
    """Requête de feedback utilisateur"""
    feedback: str = Field(..., pattern="^(helpful|incorrect|incomplete)$")


class AIStatsResponse(BaseModel):
    """Statistiques d'utilisation de l'IA"""
    total_analyses: int
    helpful_feedback_count: int
    helpful_feedback_ratio: float
    error_types: List[Dict[str, Any]]
    severity_distribution: List[Dict[str, Any]]
