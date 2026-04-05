# Frontend — Red Light Alert

React 18 + TypeScript SPA. Vite dev server on port 5173; proxies `/api/*` to FastAPI backend on 8000.

## Commands

```bash
npm install       # install dependencies
npm run dev       # development server (http://localhost:5173)
npm run build     # production build → dist/
npm run preview   # preview production build locally
```

## Structure

```
src/
├── pages/          # Full-page views (CodingScreen, CaseList, Analysis, …)
├── components/     # Reusable UI (FieldRow, SectionPanel, Layout, Toast, …)
├── types.ts        # TypeScript Report interface and related types
├── api.ts          # HTTP client for all backend endpoints
├── App.tsx         # Router setup
└── main.tsx        # Entry point
```

See [../docs/FRONTEND.md](../docs/FRONTEND.md) for the full page and component guide.
