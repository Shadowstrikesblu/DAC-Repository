# DAC Code Camp ETNA 2026 - Choix techniques

## Challenge choisi

Challenge principal: mode simulation / preview avant execution.

Variante retenue pour le Code Camp: preview et confirmation avant un deploiement AWS reel, avec garde-fous pedagogiques.

## Probleme identifie

DAC sait generer et executer des actions DevOps, mais le parcours etudiant doit etre plus fiable:

- les credentials AWS pouvaient etre enregistres sans validation reelle;
- Terraform pouvait demarrer avec une cle expiree ou incorrecte;
- les erreurs AWS etaient difficiles a comprendre pour un debutant;
- le perimetre de demo devait etre limite pour eviter les couts et les actions dangereuses.

## Solution proposee

La branche `codecamp-etna-2026` garde le deploiement reel, mais le rend plus encadre:

- AWS est le provider cible du parcours ecole;
- la creation est limitee par `DAC_SCHOOL_MODE=true`;
- le nombre de VM est limite par `DAC_SCHOOL_MAX_INSTANCES`;
- les credentials AWS sont valides via STS avant sauvegarde et avant Terraform;
- les erreurs de credentials renvoient l'utilisateur vers l'onboarding AWS;
- la documentation explique le chemin de demo et les limites.

## Composants impactes

- `devops_api/app/services/aws_credentials_service.py`: validation STS des credentials.
- `devops_api/app/routes/user_credentials_routes.py`: validation a l'enregistrement et au statut AWS.
- `devops_api/app/routes/chat_creation_routes.py`: preflight AWS avant CREATE.
- `devops_api/app/services/terraform_service.py`: garde-fou avant plan/apply Terraform.
- `devops_api/app/routes/generate_terraform.py`: mode ecole AWS limite.
- `.env.example`: variables de configuration codecamp.
- `docker-compose.yml`: base PostgreSQL reproductible.

## Variables d'environnement utiles

```bash
DAC_SCHOOL_MODE=true
DAC_SCHOOL_MAX_INSTANCES=1
DAC_AI_PROVIDER=mock
DAC_AI_MODEL=gpt-4o-mini
OPENAI_API_KEY=
DATABASE_URL=postgresql://dac:dac@localhost:5432/devops_api_db
BACKEND_BASE_URL=http://localhost:8000
FRONTEND_BASE_URL=http://localhost:5173
```

## Choix IA

Par defaut, la branche CodeCamp utilise `DAC_AI_PROVIDER=mock`.

Ce choix permet de lancer DAC sans cle OpenAI. Le chat libre renvoie alors une reponse pedagogique indiquant que le mode mock est actif, et les workflows DAC continuent d'utiliser les detecteurs par regles et les fallbacks applicatifs.

Pour tester une vraie IA, configurer:

```bash
DAC_AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
DAC_AI_MODEL=gpt-4o-mini
```

Le modele conseille pour les etudiants est `gpt-4o-mini`, car il est plus economique que `gpt-4o` tout en restant suffisant pour l'aide DevOps, la reformulation et l'explication d'erreurs.

## Procedure de lancement

Demarrer PostgreSQL:

```bash
docker compose up -d postgres
```

Backend:

```bash
cp .env.example .env
cd devops_api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Scenario de demonstration

1. Se connecter a DAC.
2. Ouvrir l'onboarding AWS.
3. Enregistrer des credentials AWS valides.
4. Passer en mode DAC.
5. Demander: `cree une instance EC2 Ubuntu`.
6. Donner les parametres: `AWS Ubuntu 22.04 t2.micro eu-west-1`.
7. Confirmer avec `ok`.
8. Observer la generation Terraform et le resultat.
9. Montrer un cas d'erreur avec une cle AWS invalide ou expiree.

## Limites connues

- Le projet reste une version alpha.
- Le parcours ecole cible AWS uniquement.
- Les credentials AWS doivent etre fournis par les etudiants ou l'encadrement.
- Les droits IAM doivent autoriser au minimum STS et les actions EC2 necessaires au deploiement.
- La suppression des ressources doit etre verifiee en fin de demo pour eviter les couts.

## Pistes d'amelioration pour les etudiants

- Ajouter un bouton destroy plus visible.
- Ajouter une estimation de cout.
- Ajouter un dashboard d'executions.
- Ameliorer la detection d'intention.
- Ajouter un resume IA des erreurs Terraform.
- Ajouter des tests end-to-end reproductibles.
