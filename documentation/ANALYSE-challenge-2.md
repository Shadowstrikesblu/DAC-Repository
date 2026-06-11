# Challenge 2 — Amélioration de la détection d'intentions

## Problème identifié
DAC ne reconnaissait que Ubuntu comme OS. Les phrases génériques comme
"monte-moi un serveur debian" ou "je veux un VPS" n'étaient pas comprises.
Les intentions inconnues retournaient un free_chat muet sans message d'aide.

## Solution apportée
Modification de 2 fichiers :
- `devops_api/app/services/intent_detector.py` : ajout des patterns Debian,
  Windows, générique et de la méthode `detect_os_creation()`
- `devops_api/app/services/detect_intent_catalog.py` : fallback amélioré
  avec appel à `detect_os_creation()` et message de suggestion

## Fichiers modifiés
- `devops_api/app/services/intent_detector.py`
- `devops_api/app/services/detect_intent_catalog.py`

## OS supportés après modification
| OS                          | Avant | Après |
|-----------------------------|-------|-------|
| Ubuntu                      | ✅    | ✅    |
| Debian                      | ❌    | ✅    |
| Windows                     | ❌    | ✅    |
| Générique (VPS, serveur...) | ❌    | ✅    |

## Score de confiance
- 0.9 → mot-clé explicite (créer, déployer)
- 0.6 → détection générique (detect_os_creation)
- 0.0 → free_chat avec suggestion

## Tests validés
| Phrase                                        | Intent retourné       |
|-----------------------------------------------|-----------------------|
| "monte-moi un serveur debian"                 | create ✅             |
| "crée une instance debian aws t3.micro"       | create ✅             |
| "crée une instance windows"                   | create ✅             |
| "je veux un VPS aws t3.micro"                 | create ✅             |
| "dis-moi une blague"                          | free_chat + suggestion ✅ |

## Limites connues
- Phrases trop originales non reconnues ("spawne une bécane debian")
- Pas de gestion des fautes d'orthographe
- Windows détecté mais non exécutable sans AMI AWS payante

## Pistes d'amélioration
- Ajouter Rocky Linux, AlmaLinux, CentOS
- Utiliser difflib pour gérer les fautes de frappe
- Implémenter un modèle NLP léger (spaCy)
