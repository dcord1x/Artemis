import type { Report, Stats, SimilarCandidate, CompareResult, ResearchAggregate, CaseSummary } from './types';

// In dev: Vite proxies /api → localhost:8000. In production build: empty string (same-origin).
const BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export const api = {
  listReports: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return req<Report[]>(`/reports${qs}`);
  },

  getReport: (reportId: string) => req<Report>(`/reports/${reportId}`),

  createReport: (data: { raw_narrative: string; source_organization?: string; analyst_name?: string; date_received?: string }) =>
    req<Report>('/reports', { method: 'POST', body: JSON.stringify(data) }),

  updateReport: (reportId: string, data: Partial<Report>) =>
    req<Report>(`/reports/${reportId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteReport: (reportId: string) =>
    req<{ ok: boolean }>(`/reports/${reportId}`, { method: 'DELETE' }),

  deleteReports: (reportIds: string[]) =>
    req<{ ok: boolean; deleted: number }>('/reports/bulk-delete', { method: 'POST', body: JSON.stringify({ report_ids: reportIds }) }),

  suggest: (narrative: string) =>
    req<Record<string, any>>('/suggest', { method: 'POST', body: JSON.stringify({ narrative }) }),

  getStats: () => req<Stats>('/stats'),

  exportCsv: () => {
    window.open(BASE + '/export/csv', '_blank');
  },

  exportGeoJson: () => {
    window.open(BASE + '/export/geojson', '_blank');
  },

  getSimilar: (reportId: string, minScore = 10) =>
    req<SimilarCandidate[]>(`/reports/${reportId}/similar?min_score=${minScore}`),

  compareReports: (reportIdA: string, reportIdB: string) =>
    req<CompareResult>(`/reports/${reportIdA}/compare/${reportIdB}`),

  saveLinkage: (data: { report_id_a: string; report_id_b: string; analyst_status: string; analyst_notes: string }) =>
    req<{ ok: boolean }>('/linkage', { method: 'POST', body: JSON.stringify(data) }),

  analyzeReport: (reportId: string) =>
    req<{ ok: boolean; ai_suggestions: Record<string, any> }>(`/reports/${reportId}/analyze`, { method: 'POST' }),

  batchAnalyze: () =>
    req<{ ok: boolean; processed: number; nlp_available: boolean }>('/reports/batch-analyze', { method: 'POST' }),

  // ── Research / pattern analysis ─────────────────────────────────────────

  getResearchAggregate: () => req<ResearchAggregate>('/research/aggregate'),

  getCaseSummary: (reportId: string) => req<CaseSummary>(`/reports/${reportId}/summary`),

  exportCaseSummaries: () => {
    window.open(BASE + '/export/case-summaries', '_blank');
  },

  exportResearchTables: () => {
    window.open(BASE + '/export/research-tables', '_blank');
  },

  visualizeParse: (text: string) =>
    req<{ dep_html: string; ent_html: string }>('/nlp/visualize', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};
