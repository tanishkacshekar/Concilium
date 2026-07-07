# Meeting Monitor Backend

FastAPI backend for Meeting Monitor application.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Start MongoDB (if running locally):
```bash
mongod
```

4. Seed the database with initial data (optional, for development):
```bash
python -m scripts.seed_db
```

This will create:
- Test users (manager, member, teacher, student)
- Sample workspaces and classes
- Default password for all users: `password123`

5. Run the server:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or use the run script:
```bash
python run.py
```

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Environment Variables

See `.env.example` for required configuration.
