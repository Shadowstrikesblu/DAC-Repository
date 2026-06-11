# © 2024–2026 TOURE Arnaud Patrick
# Licensed under the MIT License

import logging
import json
from sqlalchemy.orm import Session
from app import models
from datetime import datetime
from typing import Union, Optional, Literal  # CHALLENGE 5 — import Literal pour typer les niveaux

logger = logging.getLogger(__name__)

# CHALLENGE 5 — Niveaux de log standardisés (cohérents avec le frontend TaskLog)
LogLevel = Literal["info", "warning", "error", "success"]

# CHALLENGE 5 — Événements standardisés (évite les chaînes libres dans le codebase)
LOG_EVENTS = {
    "started":    "Exécution démarrée",
    "step":       "Étape en cours",
    "completed":  "Exécution terminée avec succès",
    "failed":     "Exécution échouée",
    "warning":    "Avertissement",
    "phase":      "Changement de phase",
    "progress":   "Progression",
}


def log_execution_event(
    db: Session,
    execution_id: int,
    user_id: int,
    event: str,
    message: Union[str, dict],
    log_content: Union[str, dict] = "",
    level: LogLevel = "info",                  # CHALLENGE 5 — niveau de log (info/warning/error/success)
    trace_id: Optional[str] = None,            # CHALLENGE 5 — corrélation entre message → intention → action
    step_name: Optional[str] = None,           # CHALLENGE 5 — nom de l'étape pour l'affichage frontend
    progress_percentage: Optional[float] = None,  # CHALLENGE 5 — pourcentage pour la barre de progression
):
    """
    Crée une entrée dans execution_logs.

    CHALLENGE 5 — Enrichissements :
    - level       : "info" | "warning" | "error" | "success"
    - trace_id    : corrèle message utilisateur ↔ intention ↔ action dans les logs
    - step_name   : libellé de l'étape affiché dans le journal frontend
    - progress_percentage : valeur 0-100 transmise au frontend via le polling
    """

    # Sécuriser : convertir tous les dicts en chaîne pour message
    if isinstance(message, dict):
        try:
            message = json.dumps(message, indent=2, ensure_ascii=False)
        except Exception as e:
            message = f"[ERREUR de serialization JSON message] {str(e)}"

    # log_content uniquement pour affichage console
    if isinstance(log_content, dict):
        try:
            log_content = json.dumps(log_content, indent=2, ensure_ascii=False)
        except Exception as e:
            log_content = f"[ERREUR de serialization JSON log_content] {str(e)}"

    # CHALLENGE 5 — Log structuré : on inclut le contexte complet dans la console
    log_context = {
        "execution_id": execution_id,
        "event": event,
        "level": level,
    }
    if trace_id:
        log_context["trace_id"] = trace_id       # CHALLENGE 5 — corrélation trace
    if step_name:
        log_context["step"] = step_name          # CHALLENGE 5 — étape lisible

    # CHALLENGE 5 — Choisir la méthode de log Python selon le niveau
    log_fn = {
        "error":   logger.error,
        "warning": logger.warning,
        "success": logger.info,
        "info":    logger.info,
    }.get(level, logger.info)

    log_fn("[EXEC_LOG] %s | %s", json.dumps(log_context), message[:200])

    # CHALLENGE 5 — extra_json stocke les métadonnées enrichies en base
    extra_json: Optional[str] = None
    extra_payload: dict = {}
    if trace_id:
        extra_payload["trace_id"] = trace_id
    if step_name:
        extra_payload["step_name"] = step_name
    if progress_percentage is not None:
        extra_payload["progress_percentage"] = progress_percentage
    if level != "info":
        extra_payload["level"] = level
    if extra_payload:
        extra_json = json.dumps(extra_payload)

    log = models.ExecutionLog(
        execution_id=execution_id,
        user_id=user_id,
        event=event,
        message=message,
        created_at=datetime.utcnow(),
        # CHALLENGE 5 — stocker level + extra dans la colonne extra si elle existe,
        # sinon les données restent dans les logs console (pas de migration requise)
        **({} if not hasattr(models.ExecutionLog, "extra") else {"extra": extra_json}),
    )

    db.add(log)
    db.commit()
    logger.debug("[EXEC_LOG] Entrée enregistrée en base.")
