# © 2024–2026 TOURE Arnaud Patrick
# Licensed under the MIT License

# app/services/ai_prompts.py
"""
Prompts centralisés pour l'analyse d'erreurs par IA.

Chaque type d'erreur a un prompt optimisé qui guide le modèle vers 
une analyse structurée et actionnelle.
"""
from typing import List


def get_analysis_prompt_for_error_type(
    error_type: str,
    provider: str,
    raw_error: str,
    tags: List[str] = None,
) -> str:
    """
    Retourne un prompt optimisé selon le type d'erreur.
    
    Args:
        error_type: "terraform", "ansible", "ssm_command", "kubernetes", etc.
        provider: "aws", "azure", "gcp", etc.
        raw_error: Message d'erreur brut (déjà redacté)
        tags: Tags contextuels ["ssm", "bootstrap", etc.]
    
    Returns:
        Prompt structuré pour le modèle IA
    """
    tags = tags or []
    
    # Demande commune à tous les types
    common_instructions = """
INSTRUCTIONS :
- Analyse précise : identifie la vraie cause, pas un symptôme superficiel
- Langage clair : explique en français, accessible à un étudiant DevOps
- Actions concrètes : chaque recommandation doit être exécutable
- Priorisée : "immediate" pour les blocages critiques, "normal" sinon
- Prudente : indique le risque de chaque action

RÉPONSE REQUISE (JSON STRICT) :
{
  "root_cause": "Cause racine en 1-2 phrases",
  "explanation": "Explication détaillée du problème",
  "severity": "low|medium|high|critical",
  "affected_components": ["composant1", "composant2"],
  "recommendations": [
    {
      "action": "Description de l'action",
      "priority": "immediate|high|normal",
      "commands": ["commande1", "commande2"],
      "risk": "low|medium|high",
      "estimated_time_minutes": 5
    }
  ]
}
"""
    
    if error_type.lower() in ["terraform", "terraform_apply", "terraform_plan"]:
        return f"""Tu es un expert Terraform et Infrastructure-as-Code.

CONTEXTE :
- Erreur Terraform sur {provider.upper()}
- Logs :
```
{raw_error}
```

Analyse cette erreur Terraform et fournisse des recommandations.

{common_instructions}"""
    
    elif error_type.lower() in ["ansible", "ansible_run"]:
        return f"""Tu es un expert Ansible et automation DevOps.

CONTEXTE :
- Erreur Ansible sur {provider.upper()}
- Logs :
```
{raw_error}
```

Analyse cette erreur Ansible et propose des corrections.
Considère les problèmes courants : inventaire invalide, SSH, permissions, handlers, etc.

{common_instructions}"""
    
    elif error_type.lower() in ["ssm", "ssm_command"]:
        return f"""Tu es un expert AWS Systems Manager (SSM).

CONTEXTE :
- Erreur SSM sur une instance AWS
- Logs :
```
{raw_error}
```

Analyse cette erreur SSM et propose des corrections.
Considère : agent SSM offline, permissions IAM, réseau, timeouts.

{common_instructions}"""
    
    elif error_type.lower() in ["kubernetes", "k8s"]:
        return f"""Tu es un expert Kubernetes.

CONTEXTE :
- Erreur Kubernetes
- Provider: {provider.upper()}
- Logs :
```
{raw_error}
```

Analyse cette erreur Kubernetes et propose des corrections.
Considère : ressources, permissions RBAC, réseau, état des pods.

{common_instructions}"""
    
    # Fallback pour types inconnus
    else:
        return f"""Tu es un expert DevOps / Infrastructure.

CONTEXTE :
- Type d'erreur : {error_type}
- Provider : {provider.upper()}
- Logs :
```
{raw_error}
```

Analyse cette erreur d'infrastructure et propose des corrections actionnables.

{common_instructions}"""


def get_prompt_for_command_safety_review(
    command: str,
    context: str = "",
) -> str:
    """
    Prompt pour vérifier la sécurité d'une commande avant exécution.
    Utilisé comme contrôle supplémentaire pour les commandes sensibles.
    """
    return f"""Tu es un expert en sécurité DevOps.

Analyse cette commande pour identifier les risques de sécurité ou les erreurs :

Commande :
```
{command}
```

Contexte : {context}

ANALYSE :
1. ✅ Syntaxe correcte ?
2. ⚠️  Risques de sécurité ?
3. 🔒 Pourrait détruire des données ?
4. 📊 Ordre d'exécution correct ?

Réponds en JSON :
{{
  "is_safe": true|false,
  "confidence": 0.0-1.0,
  "risks": ["risque1", "risque2"],
  "warnings": ["avertissement1"],
  "suggestions": ["suggestion1"]
}}
"""


def get_prompt_for_log_summary(
    logs: str,
    max_length: int = 500,
) -> str:
    """
    Prompt pour résumer les logs d'exécution.
    Utile pour afficher un résumé dans le chat.
    """
    return f"""Tu es un expert DevOps.

Résume ces logs d'exécution en {max_length} caractères maximum.
Focus sur les informations importantes pour l'utilisateur.

Logs :
```
{logs}
```

Résumé (max {max_length} chars) :
"""


def get_prompt_for_corrective_commands(
    error_context: str,
    affected_component: str,
) -> str:
    """
    Prompt pour générer des commandes de correction.
    """
    return f"""Tu es un expert DevOps.

Génère les commandes exact (copie-colle prêtes) pour corriger ce problème :

Contexte :
{error_context}

Composant affecté : {affected_component}

Commandes (une par ligne, commentaires expliquant) :
"""


# ============================================================================
# Prompts pour améliorations futures
# ============================================================================

def get_prompt_for_preventive_measures(
    error_type: str,
    root_cause: str,
) -> str:
    """
    Prompt pour suggérer des mesures préventives.
    """
    return f"""Tu es un expert DevOps en prévention des incidents.

Comment prévenir cette erreur à l'avenir ?

Type d'erreur : {error_type}
Cause : {root_cause}

Suggère :
1. Contrôles préventifs (linting, validation, tests)
2. Amélioration des processus
3. Monitoring/alertes recommandées
4. Documentation à ajouter

Réponse en format markdown clair.
"""


def get_prompt_for_documentation_draft(
    error_summary: str,
    solution: str,
) -> str:
    """
    Prompt pour générer une documentation basée sur l'erreur/solution.
    """
    return f"""Tu es un expert en documentation DevOps.

Génère une page de documentation/FAQ basée sur cet incident :

Problème :
{error_summary}

Solution :
{solution}

Format demandé :
# [Titre]

## Problème
[Description]

## Symptômes
[Signes]

## Solution
[Étapes]

## Prévention
[Mesures]

## Références
[Liens]
"""
