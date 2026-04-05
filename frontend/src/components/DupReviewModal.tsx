import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface MatchedInfo {
  incident_date: string;
  city: string;
  narrative_preview: string;
}

export interface DupEntry {
  status: 'exact' | 'possible';
  matchedId: string;
  matchedInfo?: MatchedInfo;
}

interface ParsedIncident {
  raw_narrative: string;
  incident_date: string;
  city: string;
  [key: string]: string | string[];
}

interface Props {
  incidents: ParsedIncident[];
  dupStatus: Record<number, DupEntry>;
  flaggedIndices: number[];
  decisions: Record<number, boolean>;
  onToggle: (i: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DupReviewModal({
  incidents, dupStatus, flaggedIndices, decisions, onToggle, onConfirm, onCancel,
}: Props) {

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const exactCount    = flaggedIndices.filter(i => dupStatus[i]?.status === 'exact').length;
  const possibleCount = flaggedIndices.filter(i => dupStatus[i]?.status === 'possible').length;
  const approvedCount = flaggedIndices.filter(i => dupStatus[i]?.status === 'possible' && decisions[i]).length;
  const skippedPossibleCount = possibleCount - approvedCount;
  const totalToImport = approvedCount; // exact are always excluded

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 700, maxWidth: '94vw', maxHeight: '86vh',
          background: 'var(--surface)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          background: 'var(--surface-2)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <AlertTriangle size={15} style={{ color: 'var(--amber)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'Lora, serif', fontSize: 14, fontWeight: 500, color: 'var(--text-1)', flex: 1 }}>
            Review Flagged Incidents
          </span>
          <span style={{
            fontSize: 11.5, padding: '2px 9px', borderRadius: 20, fontWeight: 500,
            color: 'var(--amber)', background: 'var(--amber-pale)', border: '1px solid var(--amber-border)',
          }}>
            {flaggedIndices.length} flagged
          </span>
          <button
            onClick={onCancel}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', padding: 4, lineHeight: 1,
              borderRadius: 4, marginLeft: 4,
            }}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Intro note ── */}
        <div style={{
          padding: '10px 16px',
          background: 'var(--amber-pale)',
          borderBottom: '1px solid var(--amber-border)',
          fontSize: 12.5, color: 'var(--amber)', flexShrink: 0,
        }}>
          {exactCount > 0 && possibleCount > 0 && (
            <><strong>{exactCount}</strong> exact {exactCount === 1 ? 'match' : 'matches'} (already in database, will be skipped) and <strong>{possibleCount}</strong> possible {possibleCount === 1 ? 'match' : 'matches'} to review.</>
          )}
          {exactCount > 0 && possibleCount === 0 && (
            <><strong>{exactCount}</strong> {exactCount === 1 ? 'incident is' : 'incidents are'} already in the database and will be skipped.</>
          )}
          {exactCount === 0 && possibleCount > 0 && (
            <><strong>{possibleCount}</strong> possible {possibleCount === 1 ? 'duplicate' : 'duplicates'} detected. Choose to skip or import each one.</>
          )}
        </div>

        {/* ── Body (scrollable) ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {flaggedIndices.map(i => {
            const inc = incidents[i];
            const dup = dupStatus[i];
            if (!dup) return null;
            const isExact = dup.status === 'exact';
            const approved = decisions[i] === true;

            return (
              <div
                key={i}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${isExact ? 'var(--accent-border)' : approved ? 'var(--green-border)' : 'var(--border-mid)'}`,
                  borderRadius: '0 8px 8px 0',
                  padding: '12px 14px',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}
              >
                {/* Row: identity + status badge + matched ID */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {inc.incident_date && (
                    <span style={{
                      fontSize: 11.5, color: 'var(--text-3)',
                      padding: '1px 7px', borderRadius: 20,
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                    }}>
                      {inc.incident_date}
                    </span>
                  )}
                  {inc.city && (
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{inc.city}</span>
                  )}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
                    color: isExact ? 'var(--accent)' : 'var(--amber)',
                    background: isExact ? 'var(--accent-pale)' : 'var(--amber-pale)',
                    border: `1px solid ${isExact ? 'var(--accent-border)' : 'var(--amber-border)'}`,
                  }}>
                    <AlertTriangle size={9} />
                    {isExact ? 'Exact duplicate' : 'Possible duplicate'}
                  </span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 11.5, fontFamily: 'monospace',
                    color: 'var(--text-3)',
                  }}>
                    → {dup.matchedId}
                  </span>
                </div>

                {/* Two-column narrative preview */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {/* Incoming */}
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div className="section-label" style={{ marginBottom: 5 }}>Incoming</div>
                    <div style={{
                      fontSize: 12, lineHeight: 1.55, color: 'var(--text-2)',
                      fontStyle: 'italic',
                      padding: '8px 10px', borderRadius: 6,
                      background: 'var(--bg)', border: '1px solid var(--border)',
                    }}>
                      {(inc.raw_narrative || '').slice(0, 120).trim()}
                      {(inc.raw_narrative || '').length > 120 ? '…' : ''}
                    </div>
                  </div>

                  {/* Matched record */}
                  {dup.matchedInfo && (
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <div className="section-label" style={{ marginBottom: 5 }}>
                        Matched record
                        {dup.matchedInfo.incident_date && ` · ${dup.matchedInfo.incident_date}`}
                        {dup.matchedInfo.city && ` · ${dup.matchedInfo.city}`}
                      </div>
                      <div style={{
                        fontSize: 12, lineHeight: 1.55, color: 'var(--text-2)',
                        fontStyle: 'italic',
                        padding: '8px 10px', borderRadius: 6,
                        background: 'var(--bg)', border: '1px solid var(--border)',
                      }}>
                        {dup.matchedInfo.narrative_preview || '(no narrative stored)'}
                        {dup.matchedInfo.narrative_preview.length === 120 ? '…' : ''}
                      </div>
                    </div>
                  )}
                </div>

                {/* Decision row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                  {isExact ? (
                    <span style={{
                      fontSize: 11.5, padding: '2px 10px', borderRadius: 20,
                      color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)',
                    }}>
                      Already in database — will be skipped
                    </span>
                  ) : (
                    <>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Decision:</span>
                      <button
                        onClick={() => approved && onToggle(i)}
                        style={{
                          padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                          cursor: approved ? 'pointer' : 'default',
                          border: `1px solid ${!approved ? 'var(--accent)' : 'var(--border)'}`,
                          background: !approved ? 'var(--accent-pale)' : 'transparent',
                          color: !approved ? 'var(--accent)' : 'var(--text-3)',
                          transition: 'all 0.15s',
                        }}
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => !approved && onToggle(i)}
                        style={{
                          padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                          cursor: !approved ? 'pointer' : 'default',
                          border: `1px solid ${approved ? 'var(--green)' : 'var(--border)'}`,
                          background: approved ? 'var(--green-pale)' : 'transparent',
                          color: approved ? 'var(--green)' : 'var(--text-3)',
                          transition: 'all 0.15s',
                        }}
                      >
                        Import anyway
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-2)',
          flexShrink: 0, gap: 12, flexWrap: 'wrap',
        }}>
          {/* Summary */}
          <div style={{ display: 'flex', gap: 14, fontSize: 12.5, flexWrap: 'wrap' }}>
            {exactCount > 0 && (
              <span style={{ color: 'var(--accent)' }}>
                {exactCount} exact — skipped
              </span>
            )}
            {approvedCount > 0 && (
              <span style={{ color: 'var(--green)' }}>
                {approvedCount} possible — will import
              </span>
            )}
            {skippedPossibleCount > 0 && (
              <span style={{ color: 'var(--text-3)' }}>
                {skippedPossibleCount} possible — skipping
              </span>
            )}
            {totalToImport === 0 && exactCount === 0 && (
              <span style={{ color: 'var(--text-3)' }}>All flagged incidents will be skipped</span>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={onCancel} style={{ fontSize: 13 }}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={onConfirm}
              style={{ fontSize: 13 }}
            >
              Confirm Import{totalToImport > 0 ? ` (${totalToImport} report${totalToImport !== 1 ? 's' : ''})` : ' — skip all'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
