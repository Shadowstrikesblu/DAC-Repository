# Fiche commandes Linux - lancer DAC

Cette fiche donne les commandes utiles pour lancer DAC pendant le CodeCamp ETNA 2026.

Objectif: un etudiant clone le projet, lance Docker, ouvre le frontend, puis teste le chat DAC.

## 1. Aller dans le projet

```bash
cd ~/devops-as-a-chat
```

Verifier que vous etes sur la bonne branche:

```bash
git branch --show-current
git status
```

La branche attendue est:

```text
codecamp-etna-2026
```

## 2. Verifier les outils installes

```bash
git --version
docker version
docker compose version
```

Pour un lancement local sans Docker complet:

```bash
python3 --version
node -v
npm -v
terraform -version
```

Versions conseillees:

```text
Docker Compose v2
Docker API 1.44+
Python 3.12+
Node.js 22.12+
Terraform 1.6+
```

## 3. Lancement recommande avec Docker

Depuis la racine du projet:

```bash
docker compose up --build
```

Ouvrir ensuite:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8000
Swagger:  http://localhost:8000/docs
Health:   http://localhost:8000/health
```

## 4. Docker en arriere-plan

Lancer sans bloquer le terminal:

```bash
docker compose up --build -d
```

Voir les conteneurs:

```bash
docker compose ps
```

Voir tous les logs:

```bash
docker compose logs -f
```

Voir seulement les logs backend:

```bash
docker compose logs -f backend
```

Voir seulement les logs frontend:

```bash
docker compose logs -f frontend
```

Arreter le projet:

```bash
docker compose down
```

Arreter et supprimer aussi la base PostgreSQL Docker:

```bash
docker compose down -v
```

## 5. Verifier la configuration Docker

Avant de lancer, vous pouvez verifier que le fichier Docker Compose est valide:

```bash
docker compose config
```

Si vous voyez une erreur comme:

```text
client version 1.43 is too old. Minimum supported API version is 1.44
```

Il faut mettre Docker a jour.

## 6. Lancement local sans Docker complet

Utiliser cette methode seulement si Docker ne peut pas lancer tout le projet.

### Terminal 1 - PostgreSQL

Depuis la racine du projet:

```bash
docker compose up -d postgres
```

### Terminal 2 - Backend FastAPI

```bash
cd ~/devops-as-a-chat
cp .env.example devops_api/.env
cd devops_api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Verifier le backend:

```bash
curl http://localhost:8000/health
```

### Terminal 3 - Frontend React

```bash
cd ~/devops-as-a-chat/frontend
npm install
npm run dev
```

Ouvrir:

```text
http://localhost:5173
```

## 7. Si Node.js est trop ancien

Si `npm run dev` affiche une erreur Vite ou `crypto.hash`, utiliser Node.js 22 avec `nvm`:

```bash
source ~/.nvm/nvm.sh
nvm install 22
nvm use 22
cd ~/devops-as-a-chat/frontend
npm install
npm run dev
```

## 8. Configuration AWS pour la demo

Dans l'interface DAC:

1. Creer un compte ou se connecter.
2. Aller dans l'onboarding AWS.
3. Renseigner une Access Key, une Secret Key et une region.
4. Revenir dans le chat DAC.

Tester dans le chat:

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

Lister les ressources:

```text
liste des ressources
```

Supprimer une ressource:

```text
supprimer mon instance
```

## 9. Erreurs frequentes

### Le port 8000 est deja utilise

Voir le processus qui utilise le port:

```bash
sudo lsof -i :8000
```

Arreter proprement le processus si vous savez que c'est un ancien backend DAC:

```bash
kill <PID>
```

### Le port 5173 est deja utilise

Voir le processus:

```bash
sudo lsof -i :5173
```

Arreter proprement le processus si c'est un ancien frontend DAC:

```bash
kill <PID>
```

### AWS refuse Terraform

Si le chat affiche `InvalidClientTokenId`, les credentials AWS sont invalides ou expires.

Solution:

1. Retourner dans l'onboarding AWS.
2. Enregistrer de nouvelles cles.
3. Relancer la demande dans le chat.

## 10. Commandes de verification pour developpeurs

Verifier le backend Python:

```bash
cd ~/devops-as-a-chat/devops_api
source .venv/bin/activate
python3 -m compileall app
```

Verifier le frontend:

```bash
cd ~/devops-as-a-chat/frontend
npm run build
```

Verifier Docker Compose:

```bash
cd ~/devops-as-a-chat
docker compose config
```
