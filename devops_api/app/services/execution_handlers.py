# ============================================================
# Étape 3 & 4 — Pipeline unique orchestré par run_execution_by_id()
# ============================================================

import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.utils.extra_data_utils import get_extra, set_extra
from app.services.execution_logger import log_execution_event
from app.services.execution_service import run_execution, get_execution_logger
from app.utils.execution_progress import update_execution_progress

logger = logging.getLogger(__name__)

async def run_terraform_execution(
    db: Session,
    execution: models.Execution,
    user_id: int,
) -> dict:
    """
    Handler Terraform : découpe du bloc if execution.task_type == "terraform" de executions_routes.py
    Logique : cherche file, provider, credentials, run_execution, persiste instances, génère inventaire.
    """
    from app.routes.executions_routes import _persist_instances_if_create
    from app.utils.crypto import encrypt, decrypt
    from app.utils.file_utils import get_latest_private_key_path
    from app.services.ansible_inventory import generate_inventory_from_executions

    log = get_execution_logger(execution.id, "terraform")
    log.info("[Handler] Terraform execution started")

    extra_data = get_extra(execution)
    update_execution_progress(db, execution.id, 10, "Préparation Terraform…", "preparing")

    # CHALLENGE 5 — log de début de phase Terraform
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message="Recherche du fichier Terraform et du provider",
        level="info", step_name="preparation", progress_percentage=10,
    )

    # Lookup terraform file
    terraform_file = (
        db.query(models.GeneratedTerraformFile)
        .filter_by(id=execution.target_file, user_id=user_id)
        .first()
    )
    if not terraform_file:
        # CHALLENGE 5 — log d'erreur avec niveau "error" pour faciliter le diagnostic
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="failed", message="Fichier Terraform introuvable en base.",
            level="error", step_name="preparation",
        )
        raise Exception("Fichier Terraform non trouvé.")

    # Lookup provider
    provider = (
        db.query(models.Provider)
        .filter_by(session_id=execution.session_id, user_id=user_id)
        .order_by(models.Provider.created_at.desc())
        .first()
    )
    if not provider:
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="failed", message="Aucun provider cloud associé à cette session.",
            level="error", step_name="preparation",
        )
        raise Exception("Aucun provider associé.")

    credentials = json.loads(decrypt(provider.encrypted_credentials))

    # Determine intent type
    intent_type: Optional[str] = None
    if getattr(execution, "intent_id", None):
        intent_row = db.query(models.Intent).filter_by(id=execution.intent_id).first()
        if intent_row:
            intent_type = (intent_row.intent_type or "").lower()

    update_execution_progress(db, execution.id, 30, "Exécution Terraform…", "running")

    # CHALLENGE 5 — log avant l'appel Terraform (étape la plus longue)
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message=f"Lancement terraform apply (intent_type={intent_type})",
        level="info", step_name="terraform_apply", progress_percentage=30,
    )

    # Run terraform
    result = await run_execution(
        engine="terraform",
        file_id=execution.target_file,
        credentials=credentials,
        db=db,
        execution_id=execution.id,
        user_id=user_id
    )

    update_execution_progress(db, execution.id, 70, "Traitement des instances…", "processing")

    # CHALLENGE 5 — log après terraform apply
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message="Terraform apply terminé, persistance des instances",
        level="success", step_name="terraform_apply", progress_percentage=70,
    )

    # Persist instances if create
    _persist_instances_if_create(
        db=db,
        intent_type=intent_type,
        session_id=execution.session_id,
        provider_name=provider.provider_name,
        instances_result=result.get("instances"),
    )

    update_execution_progress(db, execution.id, 80, "Génération d'inventaire…", "finalizing")

    # CHALLENGE 5 — log génération inventaire
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message="Génération de l'inventaire Ansible",
        level="info", step_name="inventory_generation", progress_percentage=80,
    )

    # Generate auto inventory (MIXED)
    try:
        db_instances = db.query(models.Instance).filter_by(session_id=execution.session_id).all()
        if db_instances:
            from app.services.ansible_inventory import generate_inventory_from_executions
            items = []
            for inst in db_instances:
                is_win = (inst.os_family or "").lower() == "windows" or (inst.distro or "").lower() == "windows"
                items.append({
                    "name":        inst.name or inst.hostname or inst.instance_id,
                    "ip":          decrypt(inst.public_ip) if inst.public_ip else None,
                    "os_family":   "windows" if is_win else "linux",
                    "distro":      (inst.distro or "unknown").lower(),
                    "ssh_user":    "Administrator" if is_win else (inst.ssh_user or "ubuntu"),
                    "private_key": None if is_win else (decrypt(inst.ssh_private_key) if inst.ssh_private_key else None),
                    "ssh_port":    None,
                    "runtime":     "winrm" if is_win else "ssh",
                })
            inv_path, inv_id = generate_inventory_from_executions(
                instances=items,
                user_id=user_id,
                db=db,
                session_id=execution.session_id,
                intent_id=getattr(execution, "intent_id", None)
            )
            extra_data["generated_inventory_id"] = inv_id
            extra_data["generated_inventory_path"] = inv_path
            set_extra(execution, extra_data)
            db.commit()
            # CHALLENGE 5 — log succès inventaire
            log_execution_event(
                db=db, execution_id=execution.id, user_id=user_id,
                event="step", message=f"Inventaire généré : {inv_path}",
                level="success", step_name="inventory_generation", progress_percentage=90,
            )
    except Exception as e:
        # CHALLENGE 5 — warning non bloquant (l'inventaire est optionnel)
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="warning", message=f"Inventaire auto ignoré (non bloquant) : {str(e)[:200]}",
            level="warning", step_name="inventory_generation",
        )
        logger.warning(f"Impossible de générer l'inventaire auto (MIXED): {e}")

    log.info("[Handler] Terraform execution completed")
    return {"status": "ok", **(result or {})}


async def run_ansible_execution(
    db: Session,
    execution: models.Execution,
    user_id: int,
) -> dict:
    """
    Handler Ansible : découpe du bloc elif execution.task_type == "ansible" de executions_routes.py
    Logique : lookup playbook, check inventory, ensure prereqs, run_execution.
    """
    from app.routes.executions_routes import _ensure_ansible_prereqs, _instances_to_candidates

    log = get_execution_logger(execution.id, "ansible")
    log.info("[Handler] Ansible execution started")

    extra_data = get_extra(execution)
    update_execution_progress(db, execution.id, 10, "Préparation Ansible…", "preparing")

    # CHALLENGE 5 — log démarrage Ansible
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message="Recherche du playbook Ansible",
        level="info", step_name="ansible_preparation", progress_percentage=10,
    )

    inventory_path = extra_data.get("inventory_path") or extra_data.get("generated_inventory_path")

    # Lookup playbook
    playbook = (
        db.query(models.GeneratedPlaybook)
        .filter_by(id=execution.target_file, user_id=user_id)
        .first()
    )
    if not playbook:
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="failed", message="Playbook Ansible introuvable.",
            level="error", step_name="ansible_preparation",
        )
        raise Exception("Playbook non trouvé.")

    # Pre-flight: Ansible collections & deps
    try:
        update_execution_progress(db, execution.id, 30, "Vérification des dépendances…", "preparing")
        # CHALLENGE 5 — log vérification prérequis
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="step", message="Vérification des collections Ansible",
            level="info", step_name="ansible_prereqs", progress_percentage=30,
        )
        _ensure_ansible_prereqs(inventory_path)
    except Exception as e:
        # CHALLENGE 5 — warning : les prérequis sont non bloquants
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="warning", message=f"Pré-flight Ansible non bloquant : {str(e)[:200]}",
            level="warning", step_name="ansible_prereqs",
        )
        logger.warning(f"Pré-flight Ansible échoué: {e}")

    if not inventory_path:
        candidates = _instances_to_candidates(db, execution.session_id)
        # Return special response for inventory selection
        raise Exception(f"inventory_required: {json.dumps(candidates)}")

    update_execution_progress(db, execution.id, 50, "Exécution Ansible…", "running")

    # CHALLENGE 5 — log lancement playbook
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message=f"Lancement du playbook : {playbook.file_path}",
        level="info", step_name="ansible_run", progress_percentage=50,
    )

    result = await run_execution(
        engine="ansible",
        file_id=playbook.id,
        instances=None,
        extra_args={
            "inventory_path": inventory_path,
            "playbook_path": playbook.file_path,
        },
        db=db,
        execution_id=execution.id,
        user_id=user_id,
    )

    # CHALLENGE 5 — log fin Ansible
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message="Playbook Ansible terminé",
        level="success", step_name="ansible_run", progress_percentage=90,
    )

    log.info("[Handler] Ansible execution completed")
    return {"status": "ok", **(result or {})}


async def run_kubernetes_execution(
    db: Session,
    execution: models.Execution,
    user_id: int,
) -> dict:
    """
    Handler Kubernetes : découpe du bloc elif execution.task_type == "kubernetes" de executions_routes.py
    Logique : lookup manifest, lookup provider, decrypt creds, run_execution.
    """
    from app.utils.crypto import decrypt
    from app.utils.file_utils import get_k8s_manifest_content

    log = get_execution_logger(execution.id, "kubernetes")
    log.info("[Handler] Kubernetes execution started")

    update_execution_progress(db, execution.id, 10, "Préparation Kubernetes…", "preparing")

    # CHALLENGE 5 — log démarrage Kubernetes
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message="Recherche du manifest Kubernetes",
        level="info", step_name="k8s_preparation", progress_percentage=10,
    )

    # Lookup manifest
    k8s_manifest = (
        db.query(models.GeneratedKubernetesManifest)
        .filter_by(id=execution.target_file, user_id=user_id)
        .first()
    )
    if not k8s_manifest:
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="failed", message="Manifest Kubernetes introuvable.",
            level="error", step_name="k8s_preparation",
        )
        raise Exception("Manifest Kubernetes non trouvé.")

    # Lookup provider
    provider = (
        db.query(models.Provider)
        .filter_by(session_id=execution.session_id, user_id=user_id)
        .order_by(models.Provider.created_at.desc())
        .first()
    )
    if not provider:
        raise Exception("Aucun provider associé.")

    credentials = json.loads(decrypt(provider.encrypted_credentials))
    manifest_content = get_k8s_manifest_content(k8s_manifest.file_path)

    update_execution_progress(db, execution.id, 50, "Déploiement Kubernetes…", "running")

    # CHALLENGE 5 — log lancement déploiement K8s
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message="Déploiement du manifest Kubernetes en cours",
        level="info", step_name="k8s_deploy", progress_percentage=50,
    )

    # Run kubernetes
    result = await run_execution(
        engine="kubernetes",
        file_id=None,
        credentials=credentials,
        extra_args={"manifest": manifest_content},
        db=db,
        execution_id=execution.id,
        user_id=user_id
    )

    # CHALLENGE 5 — log fin déploiement
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message="Déploiement Kubernetes terminé",
        level="success", step_name="k8s_deploy", progress_percentage=90,
    )

    log.info("[Handler] Kubernetes execution completed")
    return {"status": "ok", **(result or {})}


async def run_audit_execution(
    db: Session,
    execution: models.Execution,
    user_id: int,
) -> dict:
    """
    Handler Audit : appel direct à run_execution(engine="audit")
    Option A : pas de background, juste run_execution direct (+ logging via log_execution_event)
    """
    log = get_execution_logger(execution.id, "audit")
    log.info("[Handler] Audit execution started")

    # CHALLENGE 5 — log démarrage audit
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message="Démarrage de l'audit de sécurité (SSM + recettes)",
        level="info", step_name="audit_start", progress_percentage=5,
    )

    result = await run_execution(
        engine="audit",
        db=db,
        execution_id=execution.id,
        user_id=user_id,
    )

    # CHALLENGE 5 — log fin audit avec résumé des findings
    audit_result = result.get("audit_result") if isinstance(result, dict) else {}
    status = (audit_result or {}).get("status", "unknown")
    summary = (audit_result or {}).get("summary", {})
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step",
        message=f"Audit terminé — status={status} | ok={summary.get('ok', 0)} failed={summary.get('failed', 0)}",
        level="success" if status not in ("failed",) else "error",
        step_name="audit_complete", progress_percentage=95,
    )

    log.info("[Handler] Audit execution completed")
    return result


async def run_monitoring_execution(
    db: Session,
    execution: models.Execution,
    user_id: int,
) -> dict:
    """Handler Monitoring : collecte de métriques via MonitoringRunner"""
    from app.services.monitoring_engine import MonitoringRunner, MonitoringPlan, save_metrics_snapshot
    from app.services.ssm_executor import SSMExecutor
    from app.utils.crypto import decrypt
    from app.paths import MONITORING_DIR

    log = get_execution_logger(execution.id, "monitoring")
    log.info("[Handler] Monitoring execution started")

    extra_data = get_extra(execution)
    update_execution_progress(db, execution.id, 10, "Préparation monitoring…", "preparing")

    # CHALLENGE 5 — log démarrage monitoring
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message="Récupération des credentials AWS pour le monitoring",
        level="info", step_name="monitoring_preparation", progress_percentage=10,
    )

    # Extract monitoring parameters
    plan_data = extra_data.get("plan", {})
    monitoring_type = plan_data.get("monitoring_type", "metrics_snapshot")
    instance_ids = plan_data.get("instance_ids", [])
    session_id = extra_data.get("session_id") or execution.session_id

    if not instance_ids:
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="failed", message="Aucune instance sélectionnée pour le monitoring.",
            level="error", step_name="monitoring_preparation",
        )
        raise Exception("Aucune instance pour monitoring")

    # Get AWS credentials
    creds = db.query(models.UserAWSCredentials).filter_by(user_id=user_id).first()
    if not creds:
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="failed", message="Credentials AWS manquants pour le monitoring.",
            level="error", step_name="monitoring_preparation",
        )
        raise Exception("AWS credentials manquants")

    if isinstance(creds, dict):
        aws_access = creds.get("AWS_ACCESS_KEY_ID")
        aws_secret = creds.get("AWS_SECRET_ACCESS_KEY")
        region = creds.get("region", "eu-north-1")
    else:
        aws_access = creds.access_key_id
        aws_secret = decrypt(creds.secret_access_key_encrypted)
        region = getattr(creds, "region", None) or "eu-north-1"

    update_execution_progress(db, execution.id, 30, "Collecte des métriques…", "running")

    # CHALLENGE 5 — log collecte métriques avec liste des instances
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step",
        message=f"Collecte SSM en cours sur {len(instance_ids)} instance(s) — type={monitoring_type}",
        level="info", step_name="metrics_collection", progress_percentage=30,
    )

    ssm_executor = SSMExecutor(
        aws_access_key=aws_access,
        aws_secret_key=aws_secret,
        region=region,
    )

    runner = MonitoringRunner(db=db, ssm_executor=ssm_executor)
    plan = MonitoringPlan(**plan_data)

    metrics_snapshot = await runner.collect_metrics(
        monitoring_type=monitoring_type,
        instance_ids=instance_ids,
        task_id=None,
    )

    update_execution_progress(db, execution.id, 80, "Sauvegarde des résultats…", "finalizing")

    # CHALLENGE 5 — log sauvegarde snapshot
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message="Sauvegarde du snapshot de métriques",
        level="info", step_name="metrics_save", progress_percentage=80,
    )

    snapshot_path = save_metrics_snapshot(
        metrics_snapshot,
        output_dir=MONITORING_DIR,
        db=db,
        session_id=session_id,
        user_id=user_id
    )

    extra_data["metrics_snapshot"] = metrics_snapshot.dict()
    extra_data["snapshot_path"] = snapshot_path
    set_extra(execution, extra_data)
    db.commit()

    # CHALLENGE 5 — log fin monitoring avec résumé
    summary = metrics_snapshot.dict().get("summary", {})
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step",
        message=f"Monitoring terminé — {summary.get('instances_ok', 0)}/{summary.get('instances_total', 0)} instances OK",
        level="success", step_name="metrics_save", progress_percentage=95,
    )

    log.info("[Handler] Monitoring execution completed")
    return {
        "status": "ok",
        "snapshot_path": snapshot_path,
        "metrics_snapshot": metrics_snapshot.dict(),
    }


async def run_configure_execution(
    db: Session,
    execution: models.Execution,
    user_id: int,
) -> dict:
    """Handler Configure : configuration de services via ansible/scripts avec workflow SSM"""
    log = get_execution_logger(execution.id, "configure")
    log.info("[Handler] Configure execution started")

    extra_data = get_extra(execution)
    update_execution_progress(db, execution.id, 10, "Préparation configuration…", "preparing")

    # Extract instances from extra_data (stored as [{"id": X, "instance_id": Y}, ...])
    instances_data = extra_data.get("instances", [])
    original_text = extra_data.get("original_text", "")

    if not instances_data:
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="failed", message="Aucune instance sélectionnée pour la configuration.",
            level="error", step_name="configure_preparation",
        )
        raise Exception("Aucune instance pour configuration")

    # Load actual Instance objects from DB
    instance_ids_list = [inst_data["id"] for inst_data in instances_data]
    instances = db.query(models.Instance).filter(models.Instance.id.in_(instance_ids_list)).all()

    if not instances:
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="failed", message=f"Instances introuvables en base (ids={instance_ids_list}).",
            level="error", step_name="configure_preparation",
        )
        raise Exception("Instances non trouvées en DB")

    # CHALLENGE 5 — log avec corrélation sur le message utilisateur original
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step",
        message=f"Configuration de {len(instances)} instance(s) — demande : \"{original_text[:120]}\"",
        level="info", step_name="configure_start", progress_percentage=10,
    )

    log.info(f"Configure instances: {[i.instance_id for i in instances]}")

    update_execution_progress(db, execution.id, 30, "Diagnostic SSM…", "running")

    # CHALLENGE 5 — log diagnostic SSM (étape clé pour le diagnostic d'erreurs)
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step", message="Diagnostic SSM en cours (vérification accès instances)",
        level="info", step_name="ssm_diagnostic", progress_percentage=30,
    )

    update_execution_progress(db, execution.id, 50, "Exécution du workflow SSM + configuration…", "running")

    # Import and call _start_configure_task from chat_creation_routes
    # This function does: SSM diagnostic -> bootstrap if needed -> configure
    from app.routes.chat_creation_routes import _start_configure_task_wrapper

    result = await _start_configure_task_wrapper(
        db=db,
        user_id=user_id,
        instances=instances,
        original_text=original_text,
        session_id=execution.session_id,
    )

    # CHALLENGE 5 — log résultat configuration selon success/failure
    is_success = result.get("success", False)
    trace_id = result.get("trace_id")
    log_execution_event(
        db=db, execution_id=execution.id, user_id=user_id,
        event="step",
        message=f"Configuration {'réussie' if is_success else 'échouée'} — {result.get('details', '')}",
        level="success" if is_success else "error",
        step_name="configure_complete",
        trace_id=trace_id,          # CHALLENGE 5 — corrélation trace_id SSM → résultat
        progress_percentage=90,
    )

    update_execution_progress(db, execution.id, 90, "Finalisation configuration…", "finalizing")
    log.info(f"Configure result: success={result.get('success')}")

    return result


async def run_installer_execution(
    db: Session,
    execution: models.Execution,
    user_id: int,
) -> dict:
    """
    Handler Installer : exécute le nouveau pipeline installer_engine.

    extra_data contient:
    {
        "intent_type": "install|configure|upgrade",
        "apps": ["nginx"],
        "requested_port": 8080,
        "instance_ids": ["i-..."],
        "execution_mode": "mvp_local|ssm",
    }

    Utilise ExecutionRunner + ExecutionPlanner du nouveau moteur.
    """
    from app.services.execution_runner import ExecutionRunner
    from app.services.execution_planner import ExecutionPlanner

    log = get_execution_logger(execution.id, "installer")
    log.info("[Handler] Installer execution started")

    extra_data = get_extra(execution)
    update_execution_progress(db, execution.id, 10, "Préparation installation…", "preparing")

    # Extract installer parameters
    intent_type = extra_data.get("intent_type", "install")
    apps = extra_data.get("apps") or []
    requested_port = extra_data.get("requested_port")
    instance_ids = extra_data.get("instance_ids") or []
    execution_mode = extra_data.get("execution_mode", "mvp_local")

    if not apps:
        raise Exception("Aucune application à installer (apps vide).")
    if not instance_ids:
        raise Exception("Aucune instance cible (instance_ids vide).")

    # CHALLENGE 5 — log phase installer enrichi (apps + instances + mode)
    log_execution_event(
        db=db,
        execution_id=execution.id,
        user_id=user_id,
        event="phase",
        message=f"Installation {intent_type} — apps: {', '.join(apps)} | instances: {', '.join(instance_ids)} | mode: {execution_mode}",
        level="info",
        step_name="installer_start",
        progress_percentage=10,
    )

    # MVP: Pour l'instant, on utilise le moteur local
    # Production: Appeler SSMExecutor.execute_command() via ExecutionRunner
    try:
        update_execution_progress(db, execution.id, 30, "Création du plan d'installation…", "preparing")

        # CHALLENGE 5 — log création du plan
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="step", message="Création du plan d'installation (ExecutionPlanner)",
            level="info", step_name="plan_creation", progress_percentage=30,
        )

        planner = ExecutionPlanner()
        runner = ExecutionRunner(db=db, execution_id=execution.id, user_id=user_id)

        # Créer le plan
        plan = planner.create_plan(
            intent_type=intent_type,
            apps=apps,
            port=requested_port,
            instance_ids=instance_ids,
        )
        log.info(f"[Handler] Installer plan created: {len(plan.steps)} steps")

        # CHALLENGE 5 — log détail des étapes du plan
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="step", message=f"Plan créé : {len(plan.steps)} étape(s) à exécuter",
            level="info", step_name="plan_creation", progress_percentage=40,
        )

        update_execution_progress(db, execution.id, 50, f"Installation des {len(plan.steps)} étapes…", "running")

        # Exécuter le plan
        result = await runner.execute_installation(plan=plan, execution_mode=execution_mode)

        update_execution_progress(db, execution.id, 90, "Finalisation…", "finalizing")

        # Convertir ExecutionResult en dict
        result_dict = {
            "status": result.status if hasattr(result, 'status') else "completed",
            "summary": result.summary if hasattr(result, 'summary') else "Installation complétée",
            "instances_updated": result.instances_updated if hasattr(result, 'instances_updated') else [],
            "errors": result.errors if hasattr(result, 'errors') else [],
        }

        # CHALLENGE 5 — log résultat final installation
        is_ok = result_dict["status"] not in ("failed", "error")
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="step",
            message=f"Installation {'terminée' if is_ok else 'échouée'} — {result_dict.get('summary', '')}",
            level="success" if is_ok else "error",
            step_name="installer_complete", progress_percentage=95,
        )

        log.info(f"[Handler] Installer execution completed: {result_dict['status']}")
        return result_dict

    except Exception as e:
        # CHALLENGE 5 — log erreur installation avec niveau "error"
        log_execution_event(
            db=db, execution_id=execution.id, user_id=user_id,
            event="failed", message=f"Erreur installer : {str(e)[:400]}",
            level="error", step_name="installer_complete",
        )
        log.error(f"[Handler] Installer execution failed: {e}", exc_info=True)
        raise


# ============================================================
# Point d'entrée unique : run_execution_by_id()
# ============================================================

EXECUTION_HANDLERS = {
    "terraform": run_terraform_execution,
    "ansible": run_ansible_execution,
    "kubernetes": run_kubernetes_execution,
    "audit": run_audit_execution,
    "monitoring": run_monitoring_execution,
    "configure": run_configure_execution,
    "installer": run_installer_execution,
}


async def run_execution_by_id(
    db: Session,
    execution_id: int,
    user_id: int,
) -> dict:
    """
    Point d'entrée UNIQUE pour exécuter une tâche.

    Charge l'execution, valide le propriétaire, délègue au handler spécialisé.
    Gère status=running, completed, failed.
    Logs d'événements via log_execution_event.

    Args:
        db: Session DB
        execution_id: ID de l'exécution à lancer
        user_id: ID de l'utilisateur propriétaire

    Returns:
        dict résumé du résultat

    Raises:
        HTTPException si execution non trouvée ou erreur lors de l'exécution
    """
    log = get_execution_logger(execution_id, "run_execution_by_id")
    log.info("[run_execution_by_id] Starting for execution_id=%s, user_id=%s", execution_id, user_id)

    # Load execution & validate ownership
    execution = db.query(models.Execution).filter_by(id=execution_id, user_id=user_id).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution introuvable ou propriétaire incorrect.")

    # Mark as running
    extra_data = get_extra(execution)

    try:
        # CHALLENGE 5 — log démarrage avec type de tâche
        log_execution_event(
            db=db,
            execution_id=execution_id,
            user_id=user_id,
            event="started",
            message=f"Exécution {execution.task_type} démarrée (id={execution_id})",
            level="info",
            step_name="init",
            progress_percentage=0,
        )

        execution.status = "running"
        execution.updated_at = datetime.utcnow()
        extra_data["progress"] = 0
        extra_data["progress_phase"] = "running"
        set_extra(execution, extra_data)
        db.commit()

        # Get handler
        handler = EXECUTION_HANDLERS.get(execution.task_type)
        if not handler:
            raise Exception(f"Type d'exécution non supporté: {execution.task_type}")

        # Run handler
        log.info("[run_execution_by_id] Calling handler for %s", execution.task_type)
        result = await handler(db=db, execution=execution, user_id=user_id)

        # WARN CRITICAL: Vérifier que le handler n'a pas retourné une erreur/failure
        # Certains handlers retournent {"status": "failed", "error": ...} sans lever d'exception
        handler_status = None
        if isinstance(result, dict):
            handler_status = result.get("status")
            handler_error = result.get("error")

        if handler_status in ("failed", "blocked"):
            # Le handler a échoué silencieusement - c'est une erreur
            error_msg = handler_error or f"Handler returned status={handler_status}"
            raise Exception(f"[Handler Failed] {error_msg}")

        # Mark as completed (seulement si le handler n'a pas échoué)
        execution.status = "completed"
        execution.updated_at = datetime.utcnow()
        extra_data = get_extra(execution)
        extra_data["progress"] = 100
        extra_data["progress_phase"] = "done"
        set_extra(execution, extra_data)
        db.commit()

        # CHALLENGE 5 — log complétion avec niveau "success"
        log_execution_event(
            db=db,
            execution_id=execution_id,
            user_id=user_id,
            event="completed",
            message=f"Exécution {execution.task_type} complétée avec succès",
            level="success",
            step_name="done",
            progress_percentage=100,
        )

        log.info("[run_execution_by_id] Execution completed successfully")
        return result

    except Exception as e:
        # Mark as failed
        log.error("[run_execution_by_id] Error: %s", str(e), exc_info=True)

        execution.status = "failed"
        execution.updated_at = datetime.utcnow()
        extra_data = get_extra(execution)
        extra_data["progress_phase"] = "failed"
        extra_data["error"] = str(e)
        set_extra(execution, extra_data)
        db.commit()

        # CHALLENGE 5 — log d'échec avec niveau "error" (facilite le diagnostic)
        try:
            log_execution_event(
                db=db,
                execution_id=execution_id,
                user_id=user_id,
                event="failed",
                message=str(e),
                level="error",               # CHALLENGE 5 — niveau error pour filtrage
                step_name="error",
            )
        except Exception as log_err:
            log.warning("[run_execution_by_id] Error logging failure: %s", log_err)

        raise HTTPException(status_code=500, detail=f"Erreur exécution : {str(e)}")
