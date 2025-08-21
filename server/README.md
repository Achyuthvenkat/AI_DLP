# AI DLP Server (Flask)

Minimal API + dashboard.

## Endpoints
- `GET /api/policy` ? returns JSON policy (domain blocks, keywords)
- `POST /api/events` ? receives incident events from agents/extensions
- `GET /` ? simple HTML dashboard (last 200 events)

## Local (SQLite)
```bash
pip install -r requirements.txt
set PORT=8000
set JWT=PASTE_JWT   # optional (omit to disable auth)
python app.py
# open http://localhost:8000
