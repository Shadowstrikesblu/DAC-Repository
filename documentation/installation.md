# Installation et lancement de DAC

Ce guide explique tout ce qu'il faut installer pour lancer DAC en local pendant le CodeCamp ETNA 2026.

Pour une version courte avec uniquement les commandes a copier-coller, voir [commandes-linux.md](commandes-linux.md).

## 1. Ce qu'il faut installer

### Obligatoire

- Git
- Docker Desktop ou Docker Engine recent
- Docker Compose v2
- Un navigateur web recent

### Recommande pour le mode developpement local

- Python 3.12
- Node.js 22.12 ou plus recent
- npm
- Terraform CLI, si vous lancez le backend hors Docker

## 2. Verifier les versions

```bash
git --version
docker version
docker compose version
```

Pour le mode local sans Docker:

```bash
python3 --version
node -v
npm -v
terraform -version
```

Versions conseillees:

```text
Python 3.12+
Node.js 22.12+
Docker API 1.44+
Terraform 1.6+
```

Si Node est trop ancien ou incompatible, utiliser `nvm`:

```bash
nvm install 22
nvm use 22
```

## 3. Lancement simple avec Docker

Depuis la racine du projet:

```bash
docker compose up --build
```

Le fichier `docker-compose.yml` contient deja des valeurs locales de developpement. Copier `.env.example` vers `.env` reste utile pour documenter ou personnaliser votre environnement, mais ce n'est pas obligatoire pour le premier demarrage Docker.

Puis ouvrir:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8000
Swagger:  http://localhost:8000/docs
```

Pour arreter:

```bash
docker compose down
```

Pour supprimer aussi la base locale Docker:

```bash
docker compose down -v
```

## 4. Lancement local sans Docker

Cette methode est utile si Docker n'est pas disponible.

### 4.1 Demarrer PostgreSQL

Le plus simple est de lancer seulement PostgreSQL avec Docker:

```bash
docker compose up -d postgres
```

Si Docker ne marche pas, installer PostgreSQL localement et creer une base compatible avec `DATABASE_URL`.

### 4.2 Backend FastAPI

Depuis la racine du projet:

```bash
cp .env.example .env
cd devops_api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Verifier:

```text
http://localhost:8000/health
```

### 4.3 Frontend React

Dans un deuxieme terminal:

```bash
cd frontend
npm install
npm run dev
```

Ouvrir:

```text
http://localhost:5173
```

## 5. Configuration AWS

Pour deployer reellement une VM, il faut un compte AWS de test et des credentials IAM.

Dans l'interface DAC:

1. Creer un compte utilisateur.
2. Aller dans l'onboarding AWS.
3. Entrer:
   - AWS Access Key ID
   - AWS Secret Access Key
   - Region, par exemple `eu-west-1`
4. DAC valide les credentials avant de les enregistrer.

Droits AWS minimaux attendus pour la demo:

- `sts:GetCallerIdentity`
- actions EC2 necessaires pour creer, lister et supprimer une instance
- security groups si le workflow en cree

Utiliser un compte sandbox pour eviter les risques.

## 6. Test manuel de demo

Dans le chat DAC:

```text
cree une instance EC2 Ubuntu
```

Puis:

```text
AWS Ubuntu 22.04 t3.micro eu-west-1
```

Puis confirmer:

```text
ok
```

Tester l'inventaire:

```text
liste des ressources
```

Tester la suppression:

```text
supprimer mon instance
```

## 7. Problemes frequents

### Docker refuse de lancer

Erreur possible:

```text
client version 1.43 is too old. Minimum supported API version is 1.44
```

Solution: mettre Docker a jour.

### Frontend Vite ne demarre pas

Erreur possible:

```text
TypeError: crypto.hash is not a function
```

Solution: utiliser Node.js 22.12+.

```bash
nvm install 22
nvm use 22
npm install
npm run dev
```

### AWS refuse Terraform

Erreur possible:

```text
InvalidClientTokenId
```

Cela veut dire que les credentials AWS sont invalides, expires ou mal copies. Retourner dans l'onboarding AWS et enregistrer une nouvelle cle.

## 8. Commandes de verification

Backend:

```bash
cd devops_api
python3 -m compileall app
```

Frontend:

```bash
cd frontend
npm run build
```

Docker:

```bash
docker compose config
```
