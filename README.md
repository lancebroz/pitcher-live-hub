# Pitcher Command Center

Live MLB pitcher tracking dashboard with Statcast metrics.

## Quick Start (Local Development)

### 1. Start the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

The API will be running at http://localhost:8000

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be running at http://localhost:5173

## Deploying

### Backend → Railway
1. Push to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Set root directory to `backend`
4. Railway auto-detects Python
5. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Copy your Railway URL

### Frontend → Vercel
1. Go to vercel.com → Import your GitHub repo
2. Set root directory to `frontend`
3. Framework preset: Vite
4. Add environment variable: `VITE_API_URL` = your Railway URL
5. Deploy
