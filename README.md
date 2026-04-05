# Red Light Alert

A qualitative harm-report coding and GIS research tool for documenting violence against sex workers. Researchers use it to import raw narratives, systematically code incidents across ~80 fields, map locations, detect violence signals via NLP, and link suspected repeat offenders.

---

## Quick Start

### Windows
```bat
start_with_ai.bat      # prompts for ANTHROPIC_API_KEY, then launches everything
start.bat              # no AI suggestions
```

### Mac / Linux
```bash
./start_mac.sh
```

Both scripts start the FastAPI backend on **port 8000** and open the React frontend at **http://localhost:5173**.

---

## Workflow

1. **Import** — paste a narrative or upload PDF/Excel bulletins
2. **Code** — fill ~80 structured fields in 7 categories (Basics, Encounter, Mobility, Suspect, Narrative, GIS, Scoring)
3. **Assist** — Claude suggests field values; spaCy flags violence signals; analyst decides
4. **Map** — geocode three location stages and visualize movement trajectories
5. **Analyze** — aggregate statistics dashboard with drill-down filters
6. **Link** — similarity engine scores case pairs for suspected repeat offenders

> All AI suggestions are reviewer-only; every field has a provenance state (`unset → ai_suggested → analyst_filled → reviewed`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS 4 |
| Mapping | React-Leaflet + Nominatim geocoding |
| Backend | FastAPI (Python 3), SQLAlchemy 2 |
| Database | SQLite (`redlight.db`) |
| AI | Anthropic Claude (`claude-3-5-haiku`) |
| NLP | spaCy `en_core_web_sm` |
| Weather | Open-Meteo archive API |
| Import | openpyxl, pdfplumber |

---

## Documentation

| File | Contents |
|---|---|
| [APP_OVERVIEW.md](APP_OVERVIEW.md) | Full technical deep-dive (architecture, data model, all features) |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | All REST endpoints with parameters and responses |
| [docs/CODING_FIELDS.md](docs/CODING_FIELDS.md) | Complete field reference organized by coding section |
| [docs/BACKEND.md](docs/BACKEND.md) | Backend module guide (`main.py`, `ai.py`, `nlp_analysis.py`, etc.) |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Frontend pages and components guide |
| [UI_UX_IMPROVEMENTS.md](UI_UX_IMPROVEMENTS.md) | Recent UI changes and design decisions |

---

## File Structure

```
Red Light Alert/
├── backend/                  # FastAPI application
│   ├── main.py               # 30+ REST endpoints
│   ├── models.py             # SQLAlchemy ORM (Report, CaseLinkage)
│   ├── schemas.py            # Pydantic I/O validation
│   ├── ai.py                 # Claude API integration
│   ├── nlp_analysis.py       # spaCy violence detection pipeline
│   ├── similarity.py         # Case linkage / repeat-offender scoring
│   ├── weather.py            # Open-Meteo historical weather
│   ├── parser.py             # Rules-based PDF bulletin parser
│   ├── import_excel.py       # Excel bulk import
│   └── research.py           # Research analysis outputs
├── frontend/                 # React SPA
│   └── src/
│       ├── pages/            # CodingScreen, CaseList, Analysis, MapView, …
│       ├── components/       # FieldRow, SectionPanel, TimelineStrip, …
│       ├── types.ts          # TypeScript interfaces
│       └── api.ts            # HTTP client
├── docs/                     # Reference documentation
├── redlight.db               # SQLite database (auto-created)
├── requirements.txt
├── start.bat / start_with_ai.bat / start_mac.sh
└── APP_OVERVIEW.md
```
