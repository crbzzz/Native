# Native AI

Interface web (React/Vite) + backend API (FastAPI) pour discuter avec des modèles Mistral, avec authentification et persistance via Supabase.

## Aperçu

- Frontend: React + Vite + TypeScript (port `5000`)
- Backend: FastAPI (Uvicorn) (port `8000`)
- Données/Auth: Supabase
- Paiement (optionnel): Stripe

## Démarrage rapide (Windows)

1) Pré-requis

- Python 3.11+ (recommandé)
- Node.js 18+ (ou 20+)

2) Variables d'environnement

- Copier `.env.example` vers `.env`
- Renseigner au minimum:
	- `MISTRAL_API_KEY`
	- `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`
	- `SUPABASE_SERVICE_ROLE_KEY` (nécessaire côté backend pour certaines routes)

3) Lancer en dev

```powershell
./start-dev.ps1
```

Le script ouvre 2 terminaux:

- Frontend: http://localhost:5000
- Backend: http://localhost:8000

## Commandes utiles

### Frontend

```powershell
cd interface
npm install
npm run dev -- --host --port 5000
```

### Backend

```powershell
pip install -r backend/requirements.txt
python -m uvicorn --app-dir . backend.app:app --reload --port 8000
```

## Architecture du repo

```text
.
├─ backend/                  # API FastAPI (routes, STT, billing, etc.)
├─ interface/                # App React/Vite
│  ├─ src/                   # UI + pages
│  └─ supabase/migrations/   # Migrations SQL (Supabase)
├─ .env.example              # Exemple de configuration (copier en .env)
└─ start-dev.ps1             # Lance backend + frontend en dev
```

## Notes

- Si le frontend affiche des erreurs proxy `/api/*`, démarre aussi le backend (port `8000`).
- Les clés `VITE_*` sont exposées au frontend (normal pour Supabase anon). Ne mets jamais de secrets (Stripe secret, service role) en `VITE_*`.
