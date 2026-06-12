# © 2024–2026 TOURE Arnaud Patrick
# Licensed under the MIT License

# app/models/ai_analysis.py
"""
Model for storing AI-generated error analyses and troubleshooting suggestions.
Allows DAC to maintain a history of errors analyzed by the AI system.
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"

    id = Column(Integer, primary_key=True, index=True)

    # Reference to execution that generated the error
    execution_id = Column(
        Integer,
        ForeignKey("executions.id", ondelete="CASCADE"),
        nullable=False
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    # Raw error message that was analyzed
    raw_error = Column(Text, nullable=False)

    # Error type (terraform_apply, ansible_run, ssm_command, kubernetes_deploy, etc.)
    error_type = Column(String, nullable=False, default="unknown")

    # AI-generated analysis (JSON structure for flexibility)
    analysis = Column(JSON, nullable=False)  # {
    #   "root_cause": "...",
    #   "explanation": "...",
    #   "severity": "low|medium|high|critical",
    #   "affected_components": ["..."],
    #   "recommendations": [
    #     {
    #       "action": "...",
    #       "priority": "immediate|high|normal",
    #       "commands": ["..."],
    #       "risk": "low|medium|high",
    #       "estimated_time_minutes": 5
    #     }
    #   ]
    # }

    # Feedback from user (useful for improving prompts)
    user_feedback = Column(String, nullable=True)  # "helpful" | "incorrect" | "incomplete"

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    execution = relationship("Execution", back_populates="ai_analyses")
    user = relationship("User", back_populates="ai_analyses")
