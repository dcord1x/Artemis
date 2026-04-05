# Backend — Red Light Alert

FastAPI application. Runs on port 8000.

## Start

```bash
# from /backend
uvicorn main:app --reload --port 8000
```

Requires Python 3.10+ and dependencies from `../requirements.txt` installed in a virtual environment.

For AI features, set `ANTHROPIC_API_KEY` in your environment before starting.

## Modules

| File | Purpose |
|---|---|
| `main.py` | 30+ REST endpoints (CRUD, AI/NLP, import, similarity, stats, export) |
| `models.py` | SQLAlchemy ORM — `Report` (~150 columns) and `CaseLinkage` tables |
| `schemas.py` | Pydantic I/O validation — `ReportCreate`, `ReportUpdate`, `ReportOut` |
| `ai.py` | Claude API — field suggestions + bulletin parsing |
| `nlp_analysis.py` | spaCy violence detection pipeline (coercion, physical, sexual, weapon, escalation) |
| `similarity.py` | Weighted behavioral linkage engine (Tonkin et al. 2025) |
| `weather.py` | Open-Meteo historical weather lookup |
| `parser.py` | Rules-based PDF bulletin parser |
| `import_excel.py` | Excel bulk import via openpyxl |
| `research.py` | Research-oriented aggregate analysis |

See [../docs/BACKEND.md](../docs/BACKEND.md) for the full module guide.
See [../docs/API_REFERENCE.md](../docs/API_REFERENCE.md) for all endpoint details.
See [../docs/CODING_FIELDS.md](../docs/CODING_FIELDS.md) for the complete field reference.
