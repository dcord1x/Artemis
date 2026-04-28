import type { Report, Stats, SimilarCandidate, CompareResult, ResearchAggregate, CaseSummary, ReportStage, StagePatterns, ResearchNote, LinkagePatterns, BulletinData } from './types';

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

  // ── Stage CRUD ─────────────────────────────────────────────────────────────

  getStages: (reportId: string) =>
    req<ReportStage[]>(`/reports/${reportId}/stages`),

  createStage: (reportId: string, data: Partial<ReportStage>) =>
    req<ReportStage>(`/reports/${reportId}/stages`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  updateStage: (reportId: string, stageId: number, data: Partial<ReportStage>) =>
    req<ReportStage>(`/reports/${reportId}/stages/${stageId}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),

  deleteStage: (reportId: string, stageId: number) =>
    req<{ ok: boolean }>(`/reports/${reportId}/stages/${stageId}`, { method: 'DELETE' }),

  reorderStages: (reportId: string, items: { id: number; stage_order: number }[]) =>
    req<{ ok: boolean }>(`/reports/${reportId}/stages/reorder`, {
      method: 'PUT', body: JSON.stringify(items),
    }),

  getStagePatterns: (params?: { stage_type?: string; visibility?: string; guardianship?: string; isolation?: string; date_from?: string; date_to?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString() : '';
    return req<StagePatterns>(`/research/stage-patterns${qs}`);
  },

  getLinkagePatterns: () => req<LinkagePatterns>('/research/linkage-patterns'),

  getResearchNotes: () => req<ResearchNote[]>('/research/notes'),

  createResearchNote: (data: { note_text: string; tagged_report_ids?: string[]; tagged_pattern?: string }) =>
    req<ResearchNote>('/research/notes', { method: 'POST', body: JSON.stringify(data) }),

  deleteResearchNote: (noteId: number) =>
    req<{ ok: boolean }>(`/research/notes/${noteId}`, { method: 'DELETE' }),

  getBulletinData: (params?: { date_from?: string; date_to?: string; status?: string; city?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString() : '';
    return req<BulletinData>(`/export/bulletin-data${qs}`);
  },
};
