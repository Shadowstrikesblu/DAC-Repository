# Modifications — Challenge 2 / Piste 2 : Mode dry-run (simulation)

> Date : 2026-06-08

## Problème traité
Impossible de **voir ce qui serait fait sans le faire**. Aucune séparation simulation / exécution.

## Solution implémentée
Ajout d'un paramètre **`dry_run`** à l'exécuteur SSM : en mode simulation, **aucune commande
n'est envoyée** aux instances ; on retourne la commande qui *serait* lancée (statut `simulated`).
Le presenter de plan (Piste 3) sait afficher cette sortie simulée.

> Côté Terraform, la simulation correspond au `terraform plan` déjà exécuté avant l'`apply`
> (récapitulatif structuré ajouté au Challenge 1, Axe 3).

## Fichiers impactés
| Fichier | Nature | Détail |
|---|---|---|
| `devops_api/app/services/ssm_executor.py` | Modifié | `execute_command(..., dry_run=False)` : court-circuit retournant un résultat `simulated` sans `send_command`. |
| `devops_api/app/services/plan_presenter.py` | (Piste 3) | Paramètre `simulated_output` pour afficher le résultat de simulation. |

## Comportement
```python
execute_command(["i-0123"], "sudo systemctl restart nginx", dry_run=True)
# -> {"i-0123": {"status": "simulated",
#                "stdout": "[DRY-RUN] La commande suivante serait exécutée ... sudo systemctl restart nginx",
#                ...}}
```
Aucune modification réelle sur les instances en mode `dry_run`.

## Commande `simuler` (mode preview câblé end-to-end)
Une commande conversationnelle **`simuler <commande>`** déclenche un vrai dry-run, disponible
dans **n'importe quel état**, sans GPT :

`devops_api/app/routes/chat_creation_routes.py` — handler `simuler` :
1. classe la commande (Piste 1, badge de sensibilité) ;
2. récupère les instances de l'utilisateur ;
3. appelle `SSMExecutor.execute_command(..., dry_run=True)` → **aucune exécution réelle** ;
4. affiche le plan + la **sortie simulée** via `format_action_plan(..., ask_confirmation=False)`.

Exemple : `simuler sudo systemctl restart nginx` →
```
🔍 Mode simulation (dry-run) — aucune commande n'a été exécutée sur tes VM.
Plan d'action — 🟠 Action sensible
- Commande proposée : sudo systemctl restart nginx
Résultat simulé : i-0123: [DRY-RUN] sudo systemctl restart nginx
ℹ️ Simulation uniquement — aucune commande n'a été exécutée.
```
La commande est aussi documentée dans le **menu d'aide** (`aide`).

Fichiers ajoutés/modifiés pour le câblage :
- `chat_creation_routes.py` — handler `simuler` (global, avant la machine à états).
- `plan_presenter.py` — paramètre `ask_confirmation` (simulation sans prompt de confirmation).

## Critères de réussite — état
- [x] Le mode simulation est démontrable **dans le chat** (commande `simuler`), aucun effet réel.
- [x] Séparation simulation (`dry_run=True`) vs exécution réelle (`dry_run=False`).
- [x] Sortie simulée affichée par instance, avec badge de sensibilité.

## Suite
- Toggle « Simuler / Exécuter » dans l'UI (bouton) en plus de la commande texte.
- Mode `--check` natif d'Ansible pour la simulation côté playbooks.
