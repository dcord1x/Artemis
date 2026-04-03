import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Sparkles, AlertTriangle, Download, Tag, X, GitCompare, ScanSearch, Lock, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api';
import type { Report } from '../types';
import FieldRow from '../components/FieldRow';
import TimelineStrip from '../components/TimelineStrip';
import { useToast } from '../components/Toast';
import SectionPanel from '../components/SectionPanel';

/**
 * Field-state-aware NLP badge.
 *
 * States:
 *   pending  — NLP found a signal but the analyst hasn't coded the field yet
 *   accepted — analyst set the field to yes/probable (NLP and field agree)
 *   rejected — analyst set the field to no (NLP signal dismissed)
 *
 * The badge never disappears after coding — it tracks the decision so the
 * analyst can always see what the NLP suggested and what they decided.
 */
function NlpBadge({ rank, evidence, fieldValue }: { rank: number; evidence: string[]; fieldValue?: string }) {
  if (rank > 2) return null;
  const isHigh = rank === 1;
  const fullTitle = `NLP signal — ${isHigh ? 'strong' : 'possible (review)'}\n\nEvidence:\n${evidence.join('\n')}`;

  // ── Accepted: field is coded yes/probable ──────────────────────────────────
  if (fieldValue === 'yes' || fieldValue === 'probable' || fieldValue === 'inferred') {
    return (
      <span title={fullTitle} style={{
        flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
        border: '1px solid var(--green-border)', background: 'var(--green-pale)', color: 'var(--green)',
        cursor: 'default', letterSpacing: '0.03em', whiteSpace: 'nowrap',
      }}>
        NLP ✓ accepted
      </span>
    );
  }

  // ── Rejected: field is coded no ────────────────────────────────────────────
  if (fieldValue === 'no') {
    return (
      <span title={fullTitle} style={{
        flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
        border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)',
        cursor: 'default', letterSpacing: '0.03em', whiteSpace: 'nowrap', textDecoration: 'line-through',
      }}>
        NLP — rejected
      </span>
    );
  }

  // ── Pending: field not yet coded ───────────────────────────────────────────
  const firstEv = (evidence[0] || '').replace(/^[\w\s]+:\s*/, '').slice(0, 38);
  return (
    <span title={fullTitle} style={{
      flexShrink: 0, display: 'inline-flex', flexDirection: 'column', gap: 1,
      fontSize: 10.5, fontWeight: 600,
      padding: '2px 7px', borderRadius: 4,
      border: `1px solid ${isHigh ? 'var(--accent-border)' : 'var(--amber-border)'}`,
      background: isHigh ? 'var(--accent-pale)' : 'var(--amber-pale)',
      color: isHigh ? 'var(--accent)' : 'var(--amber)',
      cursor: 'default', letterSpacing: '0.03em', maxWidth: 200,
    }}>
      <span style={{ whiteSpace: 'nowrap' }}>{isHigh ? 'NLP signal — pending' : 'NLP possible — pending'}</span>
      {firstEv && (
        <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.8, whiteSpace: 'normal', lineHeight: 1.2 }}>
          {firstEv}{evidence[0]?.length > 40 ? '…' : ''}
        </span>
      )}
    </span>
  );
}

// Evidence type labels for the signals panel
const EV_PREFIX_LABELS: Record<string, string> = {
  'restraint SVO':    'Grammatical pattern',
  'physical SVO':     'Grammatical pattern',
  'transport SVO':    'Grammatical pattern',
  'arc:':             'Narrative arc',
  'coercion phrase':  'Phrase match',
  'physical phrase':  'Phrase match',
  'movement phrase':  'Phrase match',
  'weapon display phrase': 'Display phrase',
  'weapon + action':  'Weapon + action context',
  'weapon mentioned': 'Weapon term (possible)',
  'weapon (negated)': 'Weapon (negated)',
  'primary term':     'Direct wording',
  'secondary term':   'Contextual phrase',
  'term (negated)':   'Negated phrase',
  'two locations':    'Two locations detected',
  'keyword':          'Keyword signal',
  'keyword (negated)':'Keyword (negated)',
  'phrase (negated)': 'Phrase (negated)',
};

function formatEvidence(ev: string): { type: string; text: string } {
  for (const prefix of Object.keys(EV_PREFIX_LABELS)) {
    if (ev.startsWith(prefix)) {
      return { type: EV_PREFIX_LABELS[prefix], text: ev.slice(prefix.length).replace(/^:\s*/, '').trim() };
    }
  }
  return { type: 'Signal', text: ev };
}

// ── Location hint display validation ─────────────────────────────────────────
//
// Mirror of the backend _is_valid_location logic. Used to gate NLP-extracted
// location hints before they are shown as clickable badges, so junk fragments
// like "the" or "near" are never presented to the analyst.

const _HINT_STOPWORDS = new Set([
  'the','a','an','this','that','these','those',
  'he','she','they','it','i','we','you',
  'him','her','them','his','their','its',
  'at','on','in','by','near','to','from','of','for',
  'around','behind','outside','inside','beside','across',
  'along','between','within','through','toward','towards',
  'onto','into','out','up','down','off','over','under','past',
  'and','or','but','with','without',
  'somewhere','anywhere','nearby','there','here','where',
  'which','who','whom','what','when',
  'said','told','reported','mentioned','stated',
]);

const _HINT_LOC_KEYWORDS = new Set([
  'street','st','avenue','ave','boulevard','blvd','road','rd',
  'drive','dr','lane','ln','way','place','pl','court','ct',
  'crescent','cres','circle','cir','parkway','pkwy',
  'highway','hwy','freeway','expressway','alley','terrace',
  'trail','pass','row','close','path',
  'intersection','corner','block','blocks','strip',
  'station','transit','bus','stop','depot','terminal','platform',
  'hotel','motel','inn','hostel','airbnb',
  'mall','plaza','centre','center','complex',
  'park','lot','garage','parkade','parking',
  'bar','club','lounge','pub','tavern',
  'restaurant','cafe','coffee','diner',
  'store','shop','market','grocery','pharmacy',
  'school','hospital','clinic','church','library',
  'casino','gym','arena','stadium',
  'apartment','apt','condo','house','home','basement',
  'suite','unit','room','townhouse','duplex','residence',
  'downtown','uptown','district','neighbourhood','neighborhood',
  'square','bridge','ravine','alleyway','laneway',
  'north','south','east','west','central',
]);

// Verbs that signal a string is a narrative clause, not a bare location name.
// Mirrors the backend _CLAUSE_VERBS set in nlp_analysis.py.
const _HINT_CLAUSE_VERBS = new Set([
  'was', 'were', 'had', 'got', 'gone', 'went', 'said', 'told',
  'picked', 'brought', 'drove', 'driven', 'taken', 'walked', 'moved',
  'waited', 'stood', 'working', 'sitting', 'reported', 'described',
  'happened', 'occurred', 'started', 'ended', 'began', 'report', 'reports',
]);

/**
 * Returns false for single stop-words, articles, pronouns, prepositions,
 * full-sentence narrative fragments, and anything that does not look like
 * a plausible location phrase. Mirrors backend _is_valid_location +
 * _strip_clause_prefix.
 */
function isPlausibleLocationHint(hint: string): boolean {
  if (!hint || hint.length < 4) return false;
  if (!/[a-zA-Z]/.test(hint)) return false;
  const tokens = hint.toLowerCase().match(/[a-zA-Z']+/g) ?? [];
  if (tokens.length === 0) return false;
  if (tokens.length === 1 && _HINT_STOPWORDS.has(tokens[0])) return false;
  if (tokens.every(t => _HINT_STOPWORDS.has(t))) return false;
  // Reject sentence-like fragments — 4+ tokens containing a clause verb.
  // These are narrative text, not location names, and confuse analysts.
  if (tokens.length >= 4 && tokens.some(t => _HINT_CLAUSE_VERBS.has(t))) return false;
  // Condition A: recognised location keyword
  if (tokens.some(t => _HINT_LOC_KEYWORDS.has(t))) return true;
  // Condition B: number + meaningful word
  if (/\b\d+\w*\b/.test(hint)) {
    const meaningful = tokens.filter(t => !_HINT_STOPWORDS.has(t) && t.length >= 3);
    if (meaningful.length >= 1) return true;
  }
  // Condition C: 2+ meaningful tokens with sufficient length
  const meaningful = tokens.filter(t => !_HINT_STOPWORDS.has(t) && t.length >= 3);
  if (meaningful.length >= 2 && hint.length >= 8) return true;
  return false;
}

/**
 * Returns true when a stored location field value looks like a full narrative
 * sentence rather than a concise location name. Used to flag analyst attention.
 * Pattern: 4+ tokens AND contains a clause verb.
 */
function looksLikeSentenceFragment(value: string): boolean {
  if (!value || value.length < 12) return false;
  const tokens = value.toLowerCase().match(/[a-z']+/g) ?? [];
  return tokens.length >= 4 && tokens.some(t => _HINT_CLAUSE_VERBS.has(t));
}

// ── NLP provenance helpers ────────────────────────────────────────────────────

/**
 * Non-residential signals: if any of these appear in the narrative, the location
 * cannot be classified as any residence type.
 */
const NON_RESIDENTIAL_CUES = [
  'alley', 'back alley', 'back ally', 'laneway', 'back lane',
  'parking lot', 'parking garage', 'parkade',
  'in his car', 'in her car', 'in the car', 'in a car', 'in his vehicle', 'in a van',
  'in the back seat', 'back seat', 'in his truck', 'in his suv', 'in a taxi',
  'behind the store', 'behind a store', 'behind the building', 'behind the shop',
  'hotel', 'motel', 'airbnb',
];

/** Keyword sets required to support each residence subtype from narrative text. */
const RESIDENCE_REQUIRED_CUES: Record<string, string[]> = {
  'offender residence': ['his house', 'his apartment', 'his place', 'his home', 'his condo',
                         "suspect's place", "suspect's apartment", "suspect's house",
                         'took her to his', 'brought her to his', 'drove her to his',
                         'took him to his', 'brought him to his'],
  'victim residence':   ['her house', 'her apartment', 'her place', 'her home', 'her room',
                         "worker's place", "worker's apartment", "worker's home",
                         "victim's apartment", "victim's place", 'at her house', 'at her place'],
  'other residence':    ['their place', 'their home', 'their house', 'a house', 'a residence',
                         'a home', 'a condo', 'condo', 'townhouse', 'duplex', 'a suite'],
  'unknown residence':  ['residence', 'basement', 'apartment building'],
};

/**
 * Returns true only when the current narrative text actually supports the given
 * environment location_type. Residence types require both:
 *   - at least one affirmative cue present
 *   - no non-residential override signals present
 * Non-residence types always return true (trust the stored classification).
 */
function isEnvLocationSupportedByNarrative(locationType: string, narrativeText: string): boolean {
  if (!locationType) return false;
  if (!locationType.includes('residence')) return true; // Non-residence: trust stored value
  const low = narrativeText.toLowerCase();
  if (NON_RESIDENTIAL_CUES.some((s) => low.includes(s))) return false;
  const required = RESIDENCE_REQUIRED_CUES[locationType] ?? RESIDENCE_REQUIRED_CUES['unknown residence'];
  return required.some((c) => low.includes(c));
}

/** Full NLP signals panel shown in the Narrative tab. */
function NlpSignalsPanel({
  nlp, onSetField, reportId, getFieldValue,
}: {
  nlp: Record<string, any>;
  onSetField?: (field: string, value: string) => void;
  reportId?: string;
  getFieldValue?: (field: string) => string;
}) {
  type Signal = { label: string; rank: number; evidence: string[]; field: string; acceptValue: string };
  const signals: Signal[] = [];

  if ((nlp.coercion_rank ?? 3) <= 2)
    signals.push({ label: 'Coercion', rank: nlp.coercion_rank, evidence: nlp.coercion_evidence ?? [], field: 'coercion_present', acceptValue: 'yes' });
  if ((nlp.physical_rank ?? 3) <= 2)
    signals.push({ label: 'Physical force', rank: nlp.physical_rank, evidence: nlp.physical_evidence ?? [], field: 'physical_force', acceptValue: 'yes' });
  if ((nlp.sexual_rank ?? 3) <= 2)
    signals.push({ label: 'Sexual assault', rank: nlp.sexual_rank, evidence: nlp.sexual_evidence ?? [], field: 'sexual_assault', acceptValue: 'yes' });
  if ((nlp.movement_rank ?? 3) <= 2)
    signals.push({ label: 'Movement', rank: nlp.movement_rank, evidence: nlp.movement_evidence ?? [], field: 'movement_present', acceptValue: 'yes' });
  if ((nlp.weapon_rank ?? 3) <= 2)
    signals.push({ label: 'Weapon', rank: nlp.weapon_rank, evidence: nlp.weapon_evidence ?? [], field: 'threats_present', acceptValue: 'yes' });

  if (signals.length === 0) return null;

  const btnStyle = (color: string, bg: string, border: string): import('react').CSSProperties => ({
    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
    border: `1px solid ${border}`, background: bg, color, cursor: 'pointer',
    letterSpacing: '0.03em', whiteSpace: 'nowrap',
  });

  // Provenance check: is this NLP data actually for this report?
  const sourceId = nlp._source_report_id as string | undefined;
  const analyzedAt = nlp._analyzed_at as string | undefined;
  const provenanceMatch = !sourceId || !reportId || sourceId === reportId;
  const analyzedLabel = analyzedAt ? new Date(analyzedAt).toLocaleDateString('en-CA') : null;

  return (
    <div style={{ marginBottom: 14, borderRadius: 7, border: `1px solid ${provenanceMatch ? 'var(--amber-border)' : '#FCA5A5'}`, overflow: 'hidden' }}>
      {/* Provenance mismatch warning */}
      {!provenanceMatch && (
        <div style={{
          padding: '5px 12px', background: '#FEF2F2', borderBottom: '1px solid #FCA5A5',
          fontSize: 10, color: '#DC2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>⚠</span>
          <span>NLP data was analyzed for a different record ({sourceId}) — re-run NLP Analyze to generate signals for this case.</span>
        </div>
      )}
      {/* Header */}
      <div style={{
        padding: '6px 12px',
        background: provenanceMatch ? 'var(--amber-pale)' : '#FFF7F7',
        borderBottom: `1px solid ${provenanceMatch ? 'var(--amber-border)' : '#FCA5A5'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: provenanceMatch ? 'var(--amber)' : '#DC2626' }}>
          NLP Signals — Provisional
        </span>
        <span style={{ fontSize: 10, color: provenanceMatch ? 'var(--amber)' : '#DC2626', opacity: 0.85 }}>
          {provenanceMatch
            ? (analyzedLabel ? `Analyzed ${analyzedLabel} · analyst review required` : 'Analyst review required before coding')
            : 'Stale — does not reflect current record'}
        </span>
      </div>
      {/* Signal rows */}
      {signals.map((sig) => {
        const isStrong = sig.rank === 1;
        const currentVal = getFieldValue ? getFieldValue(sig.field) : '';
        // Derive sync status from current field value
        const syncStatus: 'accepted' | 'rejected' | 'unclear' | 'pending' =
          (currentVal === 'yes' || currentVal === 'probable' || currentVal === 'inferred') ? 'accepted'
          : currentVal === 'no' ? 'rejected'
          : currentVal === 'unclear' ? 'unclear'
          : 'pending';
        const syncCfg = {
          accepted: { label: 'Field: yes — accepted', color: 'var(--green)',    bg: 'var(--green-pale)',   border: 'var(--green-border)' },
          rejected: { label: 'Field: no — rejected',  color: 'var(--text-3)',   bg: 'var(--surface-2)',    border: 'var(--border)' },
          unclear:  { label: 'Field: unclear',         color: 'var(--amber)',    bg: 'var(--amber-pale)',   border: 'var(--amber-border)' },
          pending:  { label: 'Not yet coded',          color: 'var(--text-3)',   bg: 'var(--surface-2)',    border: 'var(--border)' },
        }[syncStatus];

        return (
          <div key={sig.label} style={{
            padding: '8px 12px', borderBottom: '1px solid var(--border)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
            background: syncStatus === 'accepted' ? '#F0FDF420' : syncStatus === 'rejected' ? 'transparent' : 'transparent',
          }}>
            {/* Rank badge */}
            <span style={{
              flexShrink: 0, padding: '2px 8px', borderRadius: 4,
              fontSize: 10, fontWeight: 700,
              background: isStrong ? 'var(--accent-pale)' : 'var(--amber-pale)',
              color: isStrong ? 'var(--accent)' : 'var(--amber)',
              border: `1px solid ${isStrong ? 'var(--accent-border)' : 'var(--amber-border)'}`,
              letterSpacing: '0.04em',
            }}>
              {isStrong ? 'Strong signal' : 'Possible signal'}
            </span>
            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>{sig.label}</span>
                <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)' }}>
                  → {sig.field.replace(/_/g, ' ')} field
                </span>
                {/* Current field sync state */}
                <span style={{
                  fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                  color: syncCfg.color, background: syncCfg.bg, border: `1px solid ${syncCfg.border}`,
                  letterSpacing: '0.03em',
                  textDecoration: syncStatus === 'rejected' ? 'line-through' : 'none',
                }}>
                  {syncCfg.label}
                </span>
              </div>
              {sig.evidence.map((ev, i) => {
                const { type, text } = formatEvidence(ev);
                return (
                  <div key={i} style={{ fontSize: 10.5, color: 'var(--text-2)', lineHeight: 1.5, display: 'flex', gap: 5 }}>
                    <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>◆ {type}:</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, background: 'var(--surface-2)', padding: '0 4px', borderRadius: 3 }}>{text}</span>
                  </div>
                );
              })}
            </div>
            {/* Analyst action buttons — only show when not already decided */}
            {onSetField && syncStatus !== 'accepted' && syncStatus !== 'rejected' && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'flex-start', paddingTop: 1 }}>
                <button
                  title={`Accept: set ${sig.field} = yes`}
                  style={btnStyle('var(--green)', 'var(--green-pale)', 'var(--green-border)')}
                  onClick={() => onSetField(sig.field, sig.acceptValue)}
                >Accept</button>
                <button
                  title={`Mark unclear: set ${sig.field} = unclear`}
                  style={btnStyle('var(--text-3)', 'var(--surface-2)', 'var(--border)')}
                  onClick={() => onSetField(sig.field, 'unclear')}
                >Unclear</button>
                <button
                  title={`Reject: set ${sig.field} = no`}
                  style={btnStyle('var(--red, #DC2626)', 'var(--red-pale, #FEF2F2)', 'var(--red-border, #FCA5A5)')}
                  onClick={() => onSetField(sig.field, 'no')}
                >Reject</button>
              </div>
            )}
            {/* When decided: show a small undo/revisit button */}
            {onSetField && (syncStatus === 'accepted' || syncStatus === 'rejected') && (
              <div style={{ flexShrink: 0, paddingTop: 1 }}>
                <button
                  title="Revisit this decision — clear the field to re-evaluate"
                  style={btnStyle('var(--text-3)', 'var(--surface-2)', 'var(--border)')}
                  onClick={() => onSetField(sig.field, '')}
                >Revisit</button>
              </div>
            )}
          </div>
        );
      })}
      {/* Footer note */}
      <div style={{ padding: '5px 12px', background: 'var(--surface-2)', fontSize: 9.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
        These are NLP-generated signals only. They do not set any field values until accepted. Analyst must confirm or reject each signal before coding.
      </div>
    </div>
  );
}

const STAGE_ORDER = ['negotiation','agreement','refusal','pressure','threats','physical','sexual_violence','robbery'];
const STAGE_LABEL: Record<string, string> = {
  negotiation: 'Negotiation', agreement: 'Agreement', refusal: 'Refusal',
  pressure: 'Pressure', threats: 'Threats', physical: 'Physical',
  sexual_violence: 'Sexual violence', robbery: 'Robbery',
};
const STAGE_COLOR: Record<string, string> = {
  negotiation: '#6B7280', agreement: '#6B7280',
  refusal: '#D97706', pressure: '#EA580C',
  threats: '#DC2626', physical: '#B91C1C',
  sexual_violence: '#7F1D1D', robbery: '#7F1D1D',
};

/** Horizontal escalation arc strip shown in the Narrative Coding section. */
function EscalationArc({ esc }: { esc: Record<string, any> }) {
  if (!esc || !esc.stages || esc.stages.length === 0) return null;
  const score: number = esc.score ?? 1;
  const scoreColor = score >= 5 ? '#7F1D1D' : score >= 4 ? '#B91C1C' : score >= 3 ? '#EA580C' : '#D97706';
  const patterns: string[] = esc.patterns ?? [];
  const PATTERN_LABELS: Record<string, string> = {
    condom_refusal: 'Condom refusal', payment_dispute: 'Payment dispute',
    bait_and_switch: 'Bait-and-switch', rapid_escalation: 'Rapid escalation',
    weapon_present: 'Weapon present', multi_suspect: 'Multiple suspects',
    online_lure: 'Online lure', drugging_intoxication: 'Drugging / intoxication',
    confinement: 'Confinement',
  };

  return (
    <div style={{
      margin: '6px 0 10px', padding: '10px 12px',
      borderRadius: 7, border: `1px solid ${scoreColor}40`,
      background: `${scoreColor}08`,
    }}>
      {/* Score + arc label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 600,
          color: scoreColor, minWidth: 18, textAlign: 'center',
        }}>{score}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Escalation score / 5</span>
        {patterns.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 4 }}>
            {patterns.map(p => (
              <span key={p} style={{
                fontSize: 10.5, padding: '1px 6px', borderRadius: 3,
                background: `${scoreColor}18`, color: scoreColor,
                border: `1px solid ${scoreColor}40`, fontWeight: 500,
              }}>{PATTERN_LABELS[p] ?? p}</span>
            ))}
          </div>
        )}
      </div>
      {/* Score rationale */}
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8, fontStyle: 'italic' }}>
        {score === 1 && 'No escalation stages detected in narrative.'}
        {score === 2 && 'Refusal present — may have been resolved; no further pressure detected.'}
        {score === 3 && 'Pressure or manipulation detected after refusal.'}
        {score === 4 && 'Threats or physical force detected in narrative.'}
        {score === 5 && 'Sexual violence or robbery detected — or multiple high-severity stages co-occur.'}
      </div>

      {/* Stage bubbles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
        {STAGE_ORDER.map((stage, i) => {
          const active = (esc.stages as string[]).includes(stage);
          const color = active ? STAGE_COLOR[stage] : 'var(--border)';
          const isLast = i === STAGE_ORDER.length - 1;
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                title={active ? `${STAGE_LABEL[stage]} — detected` : `${STAGE_LABEL[stage]} — not detected`}
                style={{
                  padding: '2px 8px', borderRadius: 10,
                  fontSize: 10.5, fontWeight: active ? 600 : 400,
                  background: active ? `${color}20` : 'transparent',
                  color: active ? color : 'var(--border-mid)',
                  border: `1px solid ${active ? color + '60' : 'var(--border)'}`,
                  whiteSpace: 'nowrap', cursor: 'default',
                  transition: 'all 0.2s',
                  opacity: active ? 1 : 0.45,
                }}
              >{STAGE_LABEL[stage]}</div>
              {!isLast && (
                <div style={{ width: 14, height: 1, background: active ? `${color}60` : 'var(--border)', margin: '0 1px', flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Badge shown on incident_date when NLP detected date uncertainty. */
function DateCertaintyBadge({ certainty, reason }: { certainty: string; reason?: string }) {
  if (!certainty || certainty === 'exact') return null;
  const cfg: Record<string, { label: string; color: string; bg: string; border: string }> = {
    vague:       { label: 'Vague date',  color: 'var(--amber)', bg: 'var(--amber-pale)', border: 'var(--amber-border)' },
    approximate: { label: 'Approx date', color: 'var(--amber)', bg: 'var(--amber-pale)', border: 'var(--amber-border)' },
    range:       { label: 'Date range',  color: 'var(--blue)',  bg: 'var(--blue-pale)',  border: 'var(--blue-border)'  },
  };
  const { label, color, bg, border } = cfg[certainty] ?? { label: certainty, color: 'var(--text-3)', bg: 'var(--surface-2)', border: 'var(--border)' };
  return (
    <span title={reason || certainty} style={{
      flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
      border: `1px solid ${border}`, background: bg, color, cursor: 'default', whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

/** Badge showing extracted time-of-day bucket from narrative or explicit time. */
function TimeBucketBadge({ bucket, source, weather }: { bucket: string; source: string; weather?: Record<string, any> }) {
  if (!bucket) return null;
  const weatherText = weather && !weather.error && weather.weather_desc ? weather.weather_desc.toLowerCase() : '';
  const label = weatherText ? `${bucket} · ${weatherText}` : bucket;
  return (
    <span title={`Time bucket (${source}): ${bucket}`} style={{
      flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
      border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)',
      cursor: 'default', whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

/** Historical weather card shown after NLP Analyze fetches Open-Meteo data. */
function WeatherCard({ w }: { w: Record<string, any> }) {
  if (!w || w.error || w.temp_c == null) return null;
  const code = w.weather_code ?? 0;
  const icon = code === 0 ? '☀️' : code <= 3 ? '🌤' : code <= 48 ? '🌫' : code <= 67 ? '🌧' : code <= 77 ? '❄️' : code <= 82 ? '🌦' : code <= 86 ? '🌨' : '⛈';
  return (
    <div style={{
      margin: '8px 0 12px', borderRadius: 8,
      border: '1px solid var(--blue-border)', background: 'var(--blue-pale)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '5px 12px', borderBottom: '1px solid var(--blue-border)',
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--blue)',
      }}>
        Weather at time of incident
      </div>
      <div style={{
        padding: '9px 12px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{w.temp_c}°C</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>feels {w.feels_like_c}°C</span>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)' }}>{w.weather_desc}</span>
        {w.precip_mm > 0 && <span style={{ fontSize: 11, color: 'var(--blue)', background: 'var(--surface-1)', border: '1px solid var(--blue-border)', padding: '1px 7px', borderRadius: 4, fontWeight: 600 }}>☂ {w.precip_mm} mm</span>}
        {w.wind_kmh > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>💨 {w.wind_kmh} km/h</span>}
        <span style={{ fontSize: 10.5, color: 'var(--text-3)', marginLeft: 'auto' }}>
          {w.is_daytime ? 'Daytime' : 'Nighttime'} · high {w.daily_max_c}°C · low {w.daily_min_c}°C
        </span>
      </div>
    </div>
  );
}

// ── Case-level analytical summary (derived from current field values) ─────────

/** Resolve field provenance state to a display tier */
function _prov(fp: Record<string, string> | undefined, field: string): 'coded' | 'provisional' | 'unset' {
  const state = fp?.[field] ?? 'unset';
  if (state === 'analyst_filled' || state === 'reviewed') return 'coded';
  if (state === 'ai_suggested') return 'provisional';
  return 'unset';
}

function ProvenancePill({ p }: { p: 'coded' | 'provisional' | 'unset' }) {
  if (p === 'provisional') return (
    <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
      background: 'var(--amber-pale)', color: 'var(--amber)', border: '1px solid var(--amber-border)',
      marginLeft: 4, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
      provisional
    </span>
  );
  return null;
}

function SequenceChip({ label, prov }: { label: string; prov: 'coded' | 'provisional' | 'unset' }) {
  const isProvisional = prov === 'provisional';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 6, fontSize: 12,
      border: isProvisional ? '1px dashed var(--amber-border)' : '1px solid var(--border)',
      background: isProvisional ? 'var(--amber-pale)' : 'var(--surface-2)',
      color: isProvisional ? 'var(--amber)' : 'var(--text-2)',
      fontWeight: isProvisional ? 500 : 400,
    }}>
      {label}
      {isProvisional && (
        <span style={{ fontSize: 9, opacity: 0.75 }}>~</span>
      )}
    </span>
  );
}

function SummarySection({ title, items }: {
  title: string;
  items: { text: string; prov: 'coded' | 'provisional' | 'unset' }[];
}) {
  if (items.length === 0) return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em',
        textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>— not coded</div>
    </div>
  );
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em',
        textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
            <span style={{ marginRight: 6, color: 'var(--text-3)', flexShrink: 0 }}>·</span>
            <span>{item.text}<ProvenancePill p={item.prov} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryTab({ fields }: { fields: Partial<Report> }) {
  const fp = (fields.field_provenance as Record<string, string>) ?? {};

  // ── Encounter sequence ───────────────────────────────────────────────────
  type StageDef = [string, string, Set<string> | null];
  const stageDefs: StageDef[] = [
    ['Negotiation',             'negotiation_present',          new Set(['yes'])],
    ['Service discussed',       'service_discussed',            new Set(['yes'])],
    ['Refusal',                 'refusal_present',              new Set(['yes'])],
    ['Pressure after refusal',  'pressure_after_refusal',       new Set(['yes'])],
    ['Repeated pressure',       'repeated_pressure',            new Set(['yes'])],
    ['Coercion',                'coercion_present',             new Set(['yes'])],
    ['Intimidation',            'intimidation_present',         new Set(['yes'])],
    ['Threats',                 'threats_present',              new Set(['yes'])],
    ['Verbal abuse',            'verbal_abuse',                 new Set(['yes'])],
    ['Abrupt tone change',      'abrupt_tone_change',           new Set(['yes'])],
    ['Movement',                'movement_present',             new Set(['yes'])],
    ['Environment shift: public→private',  'public_to_private_shift',  new Set(['yes'])],
    ['Environment shift: public→secluded', 'public_to_secluded_shift', new Set(['yes'])],
    ['Physical force',          'physical_force',               new Set(['yes'])],
    ['Sexual assault',          'sexual_assault',               new Set(['yes'])],
    ['Robbery / theft',         'robbery_theft',                new Set(['yes'])],
    ['Stealthing',              'stealthing',                   new Set(['yes'])],
  ];

  const approach = (fields.initial_approach_type || '').trim();
  const contactLabel = approach ? `Contact (${approach})` : 'Contact';
  const contactProv = approach ? _prov(fp, 'initial_approach_type') : 'unset';

  type SeqStage = { label: string; prov: 'coded' | 'provisional' | 'unset' };
  const seqStages: SeqStage[] = [{ label: contactLabel, prov: contactProv }];

  for (const [label, field, positiveVals] of stageDefs) {
    const val = (fields[field as keyof Report] as string || '').trim();
    if (!val) continue;
    if (positiveVals === null || positiveVals.has(val)) {
      seqStages.push({ label, prov: _prov(fp, field) });
    }
  }

  const exitType = (fields.exit_type || '').trim();
  if (exitType) {
    const exitLabels: Record<string, string> = {
      completed: 'Exit — completed', escaped: 'Exit — escaped',
      abandoned: 'Exit — abandoned', interrupted: 'Exit — interrupted',
      unknown: 'Exit — unknown',
    };
    seqStages.push({ label: exitLabels[exitType] ?? `Exit (${exitType})`, prov: _prov(fp, 'exit_type') });
  }

  const hasProvisional = seqStages.some(s => s.prov === 'provisional');

  // ── Mobility items ────────────────────────────────────────────────────────
  type SItem = { text: string; prov: 'coded' | 'provisional' | 'unset' };
  const mobItems: SItem[] = [];

  const addMob = (text: string, field: string) =>
    mobItems.push({ text, prov: _prov(fp, field) });

  if (fields.movement_present === 'yes')    addMob('Movement present', 'movement_present');
  if (fields.movement_attempted === 'yes' && fields.movement_completed !== 'yes')
    addMob('Movement attempted (not completed)', 'movement_attempted');
  if (fields.movement_completed === 'yes') addMob('Movement completed', 'movement_completed');
  if (fields.entered_vehicle === 'yes')    addMob('Entered vehicle', 'entered_vehicle');
  const mode = (fields.mode_of_movement || '').trim();
  if (mode)                                addMob(`Mode: ${mode}`, 'mode_of_movement');
  if (fields.public_to_private_shift === 'yes')  addMob('Public → private shift', 'public_to_private_shift');
  if (fields.public_to_secluded_shift === 'yes') addMob('Public → secluded shift', 'public_to_secluded_shift');
  if (fields.cross_neighbourhood === 'yes')      addMob('Cross-neighbourhood movement', 'cross_neighbourhood');
  if (fields.cross_municipality === 'yes')       addMob('Cross-municipality movement', 'cross_municipality');
  if (fields.cross_city_movement === 'yes')      addMob('Cross-city movement', 'cross_city_movement');
  const ctrl = (fields.offender_control_over_movement || '').trim();
  if (ctrl) addMob(`Offender control: ${ctrl}`, 'offender_control_over_movement');
  const whoCtrl = (fields.who_controlled_movement || '').trim();
  if (whoCtrl) addMob(`Movement controlled by: ${whoCtrl}`, 'who_controlled_movement');
  const startLoc = (fields.start_location_type || '').trim();
  const destLoc  = (fields.destination_location_type || '').trim();
  if (startLoc && destLoc) mobItems.push({ text: `Route: ${startLoc} → ${destLoc}`, prov: 'coded' });
  else if (startLoc)       mobItems.push({ text: `Start: ${startLoc}`, prov: 'coded' });
  else if (destLoc)        mobItems.push({ text: `Destination: ${destLoc}`, prov: 'coded' });

  // ── Environment items ─────────────────────────────────────────────────────
  const envItems: SItem[] = [];
  const io = (fields.indoor_outdoor || '').trim();
  if (io)  envItems.push({ text: io.charAt(0).toUpperCase() + io.slice(1), prov: _prov(fp, 'indoor_outdoor') });
  const pp = (fields.public_private || '').trim();
  if (pp)  envItems.push({ text: pp.replace(/_/g, ' ').replace(/^./, s => s.toUpperCase()), prov: _prov(fp, 'public_private') });
  const des = (fields.deserted || '').trim();
  if (des) envItems.push({ text: des.replace(/_/g, ' ').replace(/^./, s => s.toUpperCase()), prov: _prov(fp, 'deserted') });
  const icLoc = (fields.initial_contact_location || '').trim();
  if (icLoc)  envItems.push({ text: `Contact location: ${icLoc}`, prov: 'coded' });
  const pLoc  = (fields.incident_location_primary || '').trim();
  if (pLoc)   envItems.push({ text: `Primary incident: ${pLoc}`, prov: 'coded' });
  const sLoc  = (fields.incident_location_secondary || '').trim();
  if (sLoc)   envItems.push({ text: `Secondary: ${sLoc}`, prov: 'coded' });

  // ── Harm items ─────────────────────────────────────────────────────────────
  const harmItems: SItem[] = [];
  const harmFields: [string, string][] = [
    ['coercion_present', 'Coercion'], ['threats_present', 'Threats'],
    ['intimidation_present', 'Intimidation'], ['verbal_abuse', 'Verbal abuse'],
    ['verbal_abuse_before_violence', 'Verbal abuse before violence'],
    ['physical_force', 'Physical force'], ['sexual_assault', 'Sexual assault'],
    ['robbery_theft', 'Robbery / theft'], ['stealthing', 'Stealthing'],
  ];
  for (const [field, label] of harmFields) {
    if (fields[field as keyof Report] === 'yes')
      harmItems.push({ text: label, prov: _prov(fp, field) });
  }
  const trigger = (fields.escalation_trigger || '').trim();
  if (trigger) harmItems.push({ text: `Escalation trigger: ${trigger.slice(0, 100)}`, prov: 'coded' });
  const escPt   = (fields.escalation_point || '').trim();
  if (escPt)   harmItems.push({ text: `Escalation point: ${escPt}`, prov: 'coded' });

  // ── Exit items ────────────────────────────────────────────────────────────
  const exitItems: SItem[] = [];
  if (exitType) {
    const exitLabels: Record<string, string> = {
      completed: 'Incident completed (no disruption)', escaped: 'Victim escaped',
      abandoned: 'Incident abandoned', interrupted: 'Incident interrupted',
      unknown: 'Exit outcome unknown',
    };
    exitItems.push({ text: exitLabels[exitType] ?? `Exit: ${exitType}`, prov: _prov(fp, 'exit_type') });
  }
  if (fields.repeat_suspect_flag === 'yes') exitItems.push({ text: 'Repeat suspect flagged', prov: 'coded' });
  if (fields.repeat_vehicle_flag === 'yes') exitItems.push({ text: 'Repeat vehicle flagged', prov: 'coded' });

  return (
    <div style={{ padding: '20px 24px', maxWidth: 860 }}>

      {/* Provenance note */}
      {hasProvisional && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11.5,
          color: 'var(--text-3)', padding: '8px 12px',
          background: 'var(--amber-pale)', borderRadius: 6,
          border: '1px solid var(--amber-border)', marginBottom: 18,
        }}>
          <span style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 10 }}>⚠</span>
          <span>
            Some stages in this summary are sourced from NLP analysis only and are marked
            <strong style={{ fontWeight: 600, color: 'var(--amber)' }}> provisional</strong>.
            These should be reviewed and confirmed by the analyst before use.
          </span>
        </div>
      )}

      {/* Encounter sequence */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em',
          textTransform: 'uppercase', marginBottom: 10 }}>Encounter progression</div>
        {seqStages.length <= 1 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
            — code encounter fields to generate sequence
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', rowGap: 6 }}>
            {seqStages.map((s, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <SequenceChip label={s.label} prov={s.prov} />
                {i < seqStages.length - 1 && (
                  <span style={{ color: 'var(--text-3)', fontSize: 14, margin: '0 2px' }}>→</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
        <SummarySection title="Harm indicators" items={harmItems} />
        <SummarySection title="Exit / outcome" items={exitItems} />
        <SummarySection title="Mobility pathway" items={mobItems} />
        <SummarySection title="Environment context" items={envItems} />
      </div>

    </div>
  );
}

type Section = 'basics' | 'encounter' | 'mobility' | 'suspect' | 'narrative' | 'gis' | 'scoring' | 'summary';

// ── Behavioral domain scoring config (mirrors BINARY_FIELDS in backend/similarity.py) ──

const SCORING_DOMAINS = [
  { key: 'control', label: 'Control behaviors', color: '#7C2D12', fields: [
    { key: 'physical_force',                 label: 'Physical force',           weight: 2.0 },
    { key: 'coercion_present',               label: 'Coercion',                 weight: 2.0 },
    { key: 'threats_present',                label: 'Threats',                  weight: 1.5 },
    { key: 'pressure_after_refusal',         label: 'Pressure after refusal',   weight: 1.5 },
    { key: 'offender_control_over_movement', label: 'Movement control',         weight: 1.5 },
  ]},
  { key: 'sexual', label: 'Sexual behaviors', color: '#9B1D1D', fields: [
    { key: 'sexual_assault',  label: 'Sexual assault',  weight: 2.0 },
    { key: 'stealthing',      label: 'Stealthing',      weight: 2.0 },
    { key: 'refusal_present', label: 'Refusal present', weight: 1.5 },
  ]},
  { key: 'style', label: 'Style/approach behaviors', color: '#B45309', fields: [
    { key: 'robbery_theft',        label: 'Robbery/theft',       weight: 1.0 },
    { key: 'verbal_abuse',         label: 'Verbal abuse',         weight: 1.0 },
    { key: 'negotiation_present',  label: 'Negotiation present',  weight: 0.5 },
    { key: 'service_discussed',    label: 'Service discussed',    weight: 0.5 },
    { key: 'payment_discussed',    label: 'Payment discussed',    weight: 0.5 },
  ]},
  { key: 'escape', label: 'Escape/mobility behaviors', color: '#166534', fields: [
    { key: 'movement_present',          label: 'Movement present',       weight: 1.0 },
    { key: 'entered_vehicle',           label: 'Entered vehicle',         weight: 1.0 },
    { key: 'public_to_private_shift',   label: 'Public→private shift',   weight: 1.0 },
    { key: 'public_to_secluded_shift',  label: 'Public→secluded shift',  weight: 1.0 },
    { key: 'cross_municipality',        label: 'Cross municipality',      weight: 1.0 },
    { key: 'cross_neighbourhood',       label: 'Cross neighbourhood',     weight: 1.0 },
  ]},
  { key: 'target', label: 'Target selection behaviors', color: '#1D4ED8', fields: [
    { key: 'deserted',            label: 'Deserted location', weight: 1.0 },
    { key: 'repeat_suspect_flag', label: 'Repeat suspect',    weight: 1.0 },
    { key: 'repeat_vehicle_flag', label: 'Repeat vehicle',    weight: 1.0 },
  ]},
];

function ScoringTab({ fields }: { fields: Partial<Report> }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14, marginTop: 0 }}>
        Behavioral domain breakdown for this case. Coded fields contribute to similarity matching when compared against other cases.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {SCORING_DOMAINS.map((domain) => {
          const codedCount = domain.fields.filter((fd) => {
            const v = String((fields as any)[fd.key] || '').toLowerCase();
            return v === 'yes' || v === 'no' || v === 'probable' || v === 'inferred';
          }).length;
          const noCoded = codedCount === 0;

          return (
            <div key={domain.key} style={{
              flex: '1 1 220px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--surface)',
            }}>
              {/* Header */}
              <div style={{
                padding: '8px 12px',
                borderBottom: `2px solid ${domain.color}`,
                background: `${domain.color}10`,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: domain.color, letterSpacing: '0.02em' }}>
                  {domain.label}
                </span>
              </div>

              {/* Badge / count row */}
              <div style={{
                padding: '5px 10px',
                display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                borderBottom: '1px solid var(--border)',
                background: noCoded ? 'var(--surface-2)' : 'transparent',
              }}>
                {noCoded && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 600, color: '#6B7280',
                    background: '#F3F4F6', padding: '1px 6px',
                    borderRadius: 3, border: '1px solid #E5E7EB',
                  }}>
                    No coded values
                  </span>
                )}
                <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>
                  {codedCount} of {domain.fields.length} fields coded
                  {noCoded && <span style={{ color: '#B45309', fontWeight: 600 }}> · score suppressed</span>}
                </span>
              </div>

              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 60px 108px',
                padding: '4px 8px', background: 'var(--surface-2)',
                borderBottom: '1px solid var(--border)',
              }}>
                {['Field (weight)', 'Value', 'Status'].map((h) => (
                  <span key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</span>
                ))}
              </div>

              {/* Field rows */}
              {domain.fields.map((fd) => {
                const raw = String((fields as any)[fd.key] || '').toLowerCase();
                const isEmpty = !raw || raw === 'unclear' || raw === 'unknown' || raw === 'n/a';

                let statusLabel = 'Not coded';
                let statusColor = '#9CA3AF';
                let statusBg = 'transparent';
                let rowBg = 'transparent';

                if (raw === 'yes') {
                  statusLabel = 'Yes — coded'; statusColor = '#166534'; statusBg = '#D1FAE5'; rowBg = '#F0FDF480';
                } else if (raw === 'no') {
                  statusLabel = 'No — coded'; statusColor = '#6B7280'; statusBg = '#F3F4F6';
                } else if (raw === 'probable' || raw === 'inferred') {
                  statusLabel = 'Probable/inferred'; statusColor = '#92400E'; statusBg = '#FEF3C7'; rowBg = '#FFFBEB60';
                } else if (raw === 'unclear') {
                  statusLabel = 'Unclear'; statusColor = '#6B7280'; statusBg = '#F3F4F6';
                }

                return (
                  <div key={fd.key} style={{
                    display: 'grid', gridTemplateColumns: '1fr 60px 108px',
                    padding: '4px 8px', borderBottom: '1px solid var(--border)',
                    background: rowBg, alignItems: 'center',
                  }}>
                    <div>
                      <span style={{ fontSize: 10, color: isEmpty ? 'var(--text-3)' : 'var(--text-1)', fontWeight: isEmpty ? 400 : 500 }}>
                        {fd.label}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 4 }}>×{fd.weight}</span>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: isEmpty ? 400 : 600,
                      color: isEmpty ? 'var(--text-3)' : 'var(--text-1)',
                      fontStyle: isEmpty ? 'italic' : 'normal',
                    }}>
                      {isEmpty ? '—' : raw}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 600, color: statusColor,
                      background: statusBg !== 'transparent' ? statusBg : undefined,
                      padding: statusBg !== 'transparent' ? '1px 5px' : undefined,
                      borderRadius: 3, display: 'inline-block', lineHeight: 1.4,
                    }}>
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  uncoded:     { label: 'Uncoded',     color: 'var(--text-3)',  bg: 'var(--surface-2)', border: 'var(--border)' },
  in_progress: { label: 'In Progress', color: 'var(--amber)',   bg: 'var(--amber-pale)', border: 'var(--amber-border)' },
  coded:       { label: 'Coded',       color: 'var(--green)',   bg: 'var(--green-pale)', border: 'var(--green-border)' },
  reviewed:    { label: 'Reviewed',    color: 'var(--blue)',    bg: 'var(--blue-pale)',  border: 'var(--blue-border)' },
};

export default function CodingScreen() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const isNew = !reportId;

  const [narrative, setNarrative] = useState('');
  const [sourceOrg, setSourceOrg] = useState('');
  const [analystName, setAnalystName] = useState(() => localStorage.getItem('analyst_name') || '');
  const [dateReceived, setDateReceived] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Report | null>(null);
  const [fields, setFields] = useState<Partial<Report>>({});
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [activeTab, setActiveTab] = useState<Section>('basics');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savedAgoText, setSavedAgoText] = useState('');
  const [caseList, setCaseList] = useState<string[]>([]);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [cleanedNarrative, setCleanedNarrative] = useState('');
  const [showCleaned, setShowCleaned] = useState(false);
  const [nlp, setNlp] = useState<Record<string, any>>({});
  const [analyzingNlp, setAnalyzingNlp] = useState(false);
  const [weather, setWeather] = useState<Record<string, any>>({});
  const [provenance, setProvenance] = useState<Record<string, string>>({});
  const [analystSummary, setAnalystSummary] = useState('');
  const [showAnalystSummary, setShowAnalystSummary] = useState(false);
  const [leftWidth, setLeftWidth] = useState(45); // percent of split container
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(Math.max(pct, 20), 75));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  useEffect(() => {
    if (!isNew && reportId) {
      api.getReport(reportId).then((r) => {
        setReport(r);
        setNarrative(r.raw_narrative);
        setSourceOrg(r.source_organization);
        setAnalystName(r.analyst_name);
        setDateReceived(r.date_received);
        setTags(r.tags || []);
        setCleanedNarrative(r.cleaned_narrative || '');
        if (r.cleaned_narrative) setShowCleaned(true);
        const fieldKeys: (keyof Report)[] = [
          'incident_date','incident_time_exact','incident_time_range','day_of_week','city','neighbourhood',
          'initial_contact_location','incident_location_primary','incident_location_secondary',
          'indoor_outdoor','public_private','deserted','initial_approach_type','negotiation_present',
          'service_discussed','payment_discussed','refusal_present','pressure_after_refusal',
          'coercion_present','threats_present','verbal_abuse','physical_force','sexual_assault',
          'robbery_theft','stealthing','exit_type','movement_present','movement_attempted',
          'mode_of_movement','entered_vehicle','vehicle_driver_role','start_location_type',
          'destination_location_type','public_to_private_shift','public_to_secluded_shift',
          'cross_neighbourhood','cross_municipality','offender_control_over_movement',
          'suspect_count','suspect_gender','suspect_description_text','suspect_race_ethnicity',
          'suspect_age_estimate','vehicle_present','vehicle_make','vehicle_model','vehicle_colour',
          'plate_partial','repeat_suspect_flag','repeat_vehicle_flag','early_escalation_score',
          'mobility_richness_score','escalation_point','summary_analytic','key_quotes','coder_notes','uncertainty_notes',
          'cleaned_narrative',
          'initial_contact_address_raw','incident_address_raw','destination_address_raw',
          'lat_initial','lon_initial','lat_incident','lon_incident','lat_destination','lon_destination',
          'coding_status','confidence_level',
          // Extended fields
          'destination_known','location_certainty',
          'movement_completed','who_controlled_movement','movement_confidence','movement_notes',
          'repeated_pressure','intimidation_present','abrupt_tone_change','escalation_trigger','verbal_abuse_before_violence',
          'initial_contact_address_normalized','initial_contact_precision','initial_contact_source','initial_contact_confidence','initial_contact_analyst_notes',
          'incident_address_normalized','incident_precision','incident_source','incident_confidence','incident_analyst_notes',
          'destination_address_normalized','destination_precision','destination_source','destination_confidence','destination_analyst_notes',
          // Location-stage city fields
          'initial_contact_city','initial_contact_city_confidence',
          'incident_city','incident_city_confidence',
          'destination_city','destination_city_confidence',
          'cross_city_movement',
        ];
        const f: Partial<Report> = {};
        for (const k of fieldKeys) f[k] = r[k] as any;
        setFields(f);
        setProvenance(r.field_provenance || {});
        setAnalystSummary(r.analyst_summary || '');
        if (r.analyst_summary) setShowAnalystSummary(true);
        // Always reset NLP/weather/flags — never carry over from a previously opened case
        setFlags(r.ai_suggestions?.flags ?? []);
        setNlp(r.ai_suggestions?.nlp ?? {});
        setWeather(r.ai_suggestions?.weather ?? {});
      });
    }
  }, [reportId, isNew]);

  // ── "Saved Xs ago" ticker ──────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (!lastSavedAt) return;
      const secs = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
      if (secs < 5)  { setSavedAgoText('just now'); return; }
      if (secs < 60) { setSavedAgoText(`${secs}s ago`); return; }
      setSavedAgoText(`${Math.floor(secs / 60)}m ago`);
    }, 5000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  // ── Fetch ordered case list for ← → navigation ─────────────────────────────
  useEffect(() => {
    api.listReports().then((reports) => {
      setCaseList(reports.map((r) => r.report_id));
    }).catch(() => {});
  }, []);

  const handleSave = useCallback(async (silent = false) => {
    if (!narrative.trim()) return;
    setSaving(true);
    try {
      localStorage.setItem('analyst_name', analystName);
      if (isNew) {
        const created = await api.createReport({ raw_narrative: narrative, source_organization: sourceOrg, analyst_name: analystName, date_received: dateReceived });
        const updated = await api.updateReport(created.report_id, { ...fields, cleaned_narrative: cleanedNarrative, analyst_summary: analystSummary, field_provenance: provenance, tags, ai_suggestions: { ...suggestions, flags, ...(Object.keys(nlp).length ? { nlp } : {}), ...(Object.keys(weather).length ? { weather } : {}) }, analyst_name: analystName } as any);
        navigate(`/code/${updated.report_id}`);
      } else if (report) {
        await api.updateReport(report.report_id, { ...fields, cleaned_narrative: cleanedNarrative, analyst_summary: analystSummary, field_provenance: provenance, tags, ai_suggestions: { ...suggestions, flags, ...(Object.keys(nlp).length ? { nlp } : {}), ...(Object.keys(weather).length ? { weather } : {}) }, source_organization: sourceOrg, analyst_name: analystName, date_received: dateReceived } as any);
        const now = new Date();
        setLastSavedAt(now);
        setSavedAgoText('just now');
        if (!silent) toast('Case saved');
      }
    } finally { setSaving(false); }
  }, [narrative, isNew, analystName, sourceOrg, dateReceived, fields, cleanedNarrative, analystSummary, provenance, tags, suggestions, flags, nlp, weather, report, navigate, toast]);

  // ── Autosave: debounce 2s after last field change (existing reports only) ───
  const scheduleAutosave = useCallback(() => {
    if (isNew || !report) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      handleSave(true);
    }, 2000);
  }, [isNew, report, handleSave]);

  const set = useCallback((key: keyof Report, val: string | number | null) => {
    setFields((f) => ({ ...f, [key]: val }));
    setProvenance((p) => ({ ...p, [key]: 'analyst_filled' }));
    scheduleAutosave();
  }, [scheduleAutosave]);

  const markReviewed = useCallback((key: keyof Report) => {
    setProvenance((p) => ({ ...p, [key]: 'reviewed' }));
  }, []);

  const prov = (key: string) => (provenance[key] || 'unset') as 'unset' | 'ai_suggested' | 'analyst_filled' | 'reviewed';

  const s = (key: string) => suggestions[key] || '';
  const acceptSuggestion = (key: keyof Report) => set(key, suggestions[key]);
  const f = (key: keyof Report): string => {
    const v = fields[key];
    return v === null || v === undefined ? '' : String(v);
  };

  const handleAISuggest = async () => {
    if (!narrative.trim()) return;
    setLoadingAI(true);
    try {
      const result = await api.suggest(narrative);
      if (result.error) { alert('AI error: ' + result.error); return; }
      const { flags: newFlags, ...fieldSuggestions } = result;
      setSuggestions(fieldSuggestions);
      setFlags(newFlags || []);
      // Mark fields that have a suggestion as ai_suggested (only if not already filled by analyst)
      setProvenance((p) => {
        const updated = { ...p };
        Object.keys(fieldSuggestions).forEach((k) => {
          if (!updated[k] || updated[k] === 'unset') updated[k] = 'ai_suggested';
        });
        return updated;
      });
    } finally { setLoadingAI(false); }
  };

  const handleNlpAnalyze = async () => {
    if (!report) return;
    setAnalyzingNlp(true);
    try {
      const result = await api.analyzeReport(report.report_id);
      if (result.ai_suggestions?.nlp) setNlp(result.ai_suggestions.nlp);
      if (result.ai_suggestions?.flags) setFlags(result.ai_suggestions.flags);
      if (result.ai_suggestions?.weather) setWeather(result.ai_suggestions.weather);
    } finally { setAnalyzingNlp(false); }
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags((t) => [...t, tagInput.trim()]);
      setTagInput('');
    }
  };

  const status = f('coding_status') || 'uncoded';
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.uncoded;

  // ── Case navigation ─────────────────────────────────────────────────────────
  const currentIndex = report ? caseList.indexOf(report.report_id) : -1;
  const prevId = currentIndex > 0 ? caseList[currentIndex - 1] : null;
  const nextId = currentIndex >= 0 && currentIndex < caseList.length - 1 ? caseList[currentIndex + 1] : null;

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+S → save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave(false);
        return;
      }
      // Ctrl+ArrowLeft → prev case
      if (e.ctrlKey && e.key === 'ArrowLeft' && prevId) {
        e.preventDefault();
        navigate(`/code/${prevId}`);
        return;
      }
      // Ctrl+ArrowRight → next case
      if (e.ctrlKey && e.key === 'ArrowRight' && nextId) {
        e.preventDefault();
        navigate(`/code/${nextId}`);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prevId, nextId, handleSave, navigate]);

  // NLP provenance: verify the stored NLP data was generated from this specific report.
  // If _source_report_id is present and doesn't match the current report, NLP data is stale.
  // If _source_report_id is absent (older records), we allow display but can't verify.
  const nlpSourceId = nlp._source_report_id as string | undefined;
  const nlpBelongsHere = !nlpSourceId || !report?.report_id || nlpSourceId === report.report_id;
  // Gate all NLP-derived chips: only show them when the data is verifiably for this report
  // or when the record predates provenance stamping (no _source_report_id).
  const showNlpChips = Object.keys(nlp).length > 0 && nlpBelongsHere;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        flexWrap: 'wrap',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Case nav arrows + ID + counter */}
        {report && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="btn-ghost"
              onClick={() => prevId && navigate(`/code/${prevId}`)}
              disabled={!prevId}
              title="Previous case (Ctrl+←)"
              style={{ padding: '4px 7px', fontSize: 12 }}
            >
              <ChevronLeft size={14} />
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1 }}>
              <span style={{ fontFamily: 'DM Sans, monospace', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.03em' }}>
                {report.report_id}
              </span>
              {caseList.length > 0 && currentIndex >= 0 && (
                <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>
                  {currentIndex + 1} / {caseList.length}
                </span>
              )}
            </div>
            <button
              className="btn-ghost"
              onClick={() => nextId && navigate(`/code/${nextId}`)}
              disabled={!nextId}
              title="Next case (Ctrl+→)"
              style={{ padding: '4px 7px', fontSize: 12 }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <div style={{
          padding: '3px 10px', borderRadius: 20,
          fontSize: 11.5, fontWeight: 500,
          color: statusCfg.color, background: statusCfg.bg, border: `1px solid ${statusCfg.border}`,
        }}>
          {statusCfg.label}
        </div>

        {/* Autosave indicator */}
        {lastSavedAt && (
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
            Saved {savedAgoText}
          </span>
        )}

        {flags.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <AlertTriangle size={13} style={{ color: 'var(--amber)', flexShrink: 0 }} />
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--amber)', letterSpacing: '0.05em',
              textTransform: 'uppercase', flexShrink: 0,
            }}>NLP signals (unconfirmed):</span>
            {flags.map((flag) => (
              <span key={flag} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                background: 'var(--amber-pale)', color: 'var(--amber)', border: '1px solid var(--amber-border)',
              }}>{flag}</span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <input
            style={{
              padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-1)', fontSize: 12.5,
              fontFamily: 'DM Sans, sans-serif', outline: 'none', width: 130,
            }}
            placeholder="Analyst name"
            value={analystName}
            onChange={(e) => setAnalystName(e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
          <select
            value={status}
            onChange={(e) => set('coding_status', e.target.value)}
            style={{
              padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-1)', fontSize: 12.5,
              fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="uncoded">Uncoded</option>
            <option value="in_progress">In Progress</option>
            <option value="coded">Coded</option>
            <option value="reviewed">Reviewed</option>
          </select>

          <button
            className="btn-ghost"
            onClick={handleAISuggest}
            disabled={loadingAI || !narrative.trim()}
            style={{ fontSize: 12.5 }}
          >
            <Sparkles size={13} style={{ color: 'var(--amber)' }} />
            {loadingAI ? 'Analysing…' : 'AI Suggest'}
          </button>

          {!isNew && report && (
            <button
              className="btn-ghost"
              onClick={handleNlpAnalyze}
              disabled={analyzingNlp}
              title="Re-run spaCy NLP analysis on this narrative"
              style={{ fontSize: 12.5 }}
            >
              <ScanSearch size={13} style={{ color: 'var(--blue)' }} />
              {analyzingNlp ? 'Analysing…' : 'NLP Analyze'}
            </button>
          )}

          {!isNew && report && (
            <button
              className="btn-ghost"
              onClick={() => navigate(`/similar/${report.report_id}`)}
              style={{ fontSize: 12.5 }}
            >
              <GitCompare size={13} style={{ color: 'var(--blue)' }} />
              Find Similar
            </button>
          )}

          <button
            className="btn-primary"
            onClick={() => handleSave(false)}
            disabled={saving || !narrative.trim()}
            style={{ fontSize: 12.5 }}
          >
            <Save size={13} />
            {saving ? 'Saving…' : 'Save'}
          </button>

          <button
            className="btn-ghost"
            onClick={() => api.exportCsv()}
            style={{ fontSize: 12.5 }}
          >
            <Download size={13} />
            Export
          </button>
        </div>
      </div>

      {/* ── Main split ───────────────────────────────────────────────── */}
      <div ref={splitContainerRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT — Narrative ───────────────────────────────────────── */}
        <div style={{
          width: `${leftWidth}%`, minWidth: 240,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          background: isNew ? 'var(--surface)' : '#1A1B2E',
          flexShrink: 0,
        }}>
          {/* Meta */}
          <div style={{
            display: 'flex', gap: 8, padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-2)',
            flexShrink: 0, flexWrap: 'wrap',
          }}>
            <input
              style={{
                flex: 1, minWidth: 160,
                padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)',
                background: 'var(--surface)', fontSize: 12.5, fontFamily: 'DM Sans, sans-serif',
                color: 'var(--text-1)', outline: 'none',
              }}
              placeholder="Source organization"
              value={sourceOrg}
              onChange={(e) => setSourceOrg(e.target.value)}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
            <input
              type="date"
              style={{
                padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)',
                background: 'var(--surface)', fontSize: 12.5, fontFamily: 'DM Sans, sans-serif',
                color: 'var(--text-1)', outline: 'none',
              }}
              value={dateReceived}
              onChange={(e) => setDateReceived(e.target.value)}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Source narrative label */}
          <div style={{
            padding: '7px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
            background: isNew ? 'var(--surface-2)' : '#1E2030',
            borderBottom: isNew ? '1px solid var(--border)' : '1px solid #374151',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!isNew && <Lock size={11} color="#9CA3AF" />}
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                color: isNew ? 'var(--text-3)' : '#9CA3AF', textTransform: 'uppercase',
              }}>
                {isNew ? 'SOURCE MATERIAL' : 'SOURCE — IMMUTABLE'}
              </span>
              {!isNew && (
                <span style={{
                  fontSize: 9.5, padding: '1px 6px', borderRadius: 3,
                  background: '#374151', color: '#9CA3AF',
                  border: '1px solid #4B5563', fontWeight: 600, letterSpacing: '0.04em',
                }}>READ ONLY</span>
              )}
            </div>
            {narrative && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: isNew ? 'var(--text-3)' : '#6B7280' }}>
                  {narrative.split(/\s+/).filter(Boolean).length} words
                </span>
                {!isNew && narrative.split(/\s+/).filter(Boolean).length > 80 && (
                  <span style={{
                    fontSize: 9.5, color: '#6B7280', background: '#374151',
                    border: '1px solid #4B5563', padding: '1px 5px', borderRadius: 3,
                    letterSpacing: '0.03em',
                  }}>
                    ↓ scroll for full text
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Narrative body */}
          <div className="narrative-text" style={{ flex: 1, overflow: 'auto', padding: '12px 16px', background: isNew ? 'inherit' : '#161722' }}>
            {isNew ? (
              <textarea
                style={{
                  width: '100%', height: '100%', minHeight: 220,
                  padding: '12px', borderRadius: 8,
                  border: '1.5px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text-1)', fontSize: 13.5,
                  fontFamily: 'DM Sans, sans-serif',
                  lineHeight: 1.7, resize: 'none', outline: 'none',
                  boxSizing: 'border-box',
                }}
                placeholder="Paste the raw report narrative here…"
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
            ) : (
              <div style={{
                fontSize: 13, lineHeight: 1.8,
                color: '#C9CDD4',
                whiteSpace: 'pre-wrap',
                padding: '14px',
                borderRadius: 8,
                background: '#0F1020',
                border: '1.5px solid #2D3148',
                userSelect: 'text',
                fontFamily: 'Georgia, serif',
              }}>
                {narrative}
              </div>
            )}

            {/* Analyst cleaned / transcribed version */}
            {!isNew && (
              <div style={{ marginTop: 12 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="section-label" style={{ color: 'var(--accent)' }}>ANALYST TRANSCRIPTION</span>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4,
                      background: 'var(--accent-pale)', color: 'var(--accent)',
                      border: '1px solid var(--accent-border)', fontWeight: 600,
                    }}>ANALYST</span>
                  </div>
                  <button
                    onClick={() => setShowCleaned((v) => !v)}
                    style={{
                      fontSize: 11, background: 'none', border: 'none',
                      color: 'var(--text-3)', cursor: 'pointer', padding: '2px 4px',
                    }}
                  >
                    {showCleaned ? 'hide' : 'show / add'}
                  </button>
                </div>
                {showCleaned && (
                  <textarea
                    style={{
                      width: '100%', minHeight: 120,
                      padding: '10px 12px', borderRadius: 8,
                      border: '1.5px solid var(--accent-border)',
                      background: 'var(--accent-pale)',
                      color: 'var(--text-1)', fontSize: 13,
                      fontFamily: 'DM Sans, sans-serif',
                      lineHeight: 1.7, resize: 'vertical', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    placeholder="Paste or type a cleaned / transcribed version here. This is analyst-added content — it does not replace the source."
                    value={cleanedNarrative}
                    onChange={(e) => { setCleanedNarrative(e.target.value); scheduleAutosave(); }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--accent-border)')}
                  />
                )}
              </div>
            )}

            {/* Analyst interpretive summary — distinct from transcription */}
            {!isNew && (
              <div style={{ marginTop: 10 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                      color: '#0D9488',
                    }}>ANALYST INTERPRETIVE SUMMARY</span>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4,
                      background: '#CCFBF1', color: '#0F766E',
                      border: '1px solid #99F6E4', fontWeight: 600,
                    }}>ANALYST</span>
                  </div>
                  <button
                    onClick={() => setShowAnalystSummary((v) => !v)}
                    style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '2px 4px' }}
                  >
                    {showAnalystSummary ? 'hide' : 'show / add'}
                  </button>
                </div>
                {showAnalystSummary && (
                  <textarea
                    style={{
                      width: '100%', minHeight: 90,
                      padding: '10px 12px', borderRadius: 8,
                      border: '1.5px solid #99F6E4',
                      background: '#F0FDFA',
                      color: 'var(--text-1)', fontSize: 13,
                      fontFamily: 'DM Sans, sans-serif',
                      lineHeight: 1.7, resize: 'vertical', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    placeholder="Analyst's interpretive summary — your analytic reading of this case. Distinct from cleaned transcription. Not source material."
                    value={analystSummary}
                    onChange={(e) => { setAnalystSummary(e.target.value); scheduleAutosave(); }}
                    onFocus={(e) => (e.target.style.borderColor = '#0D9488')}
                    onBlur={(e) => (e.target.style.borderColor = '#99F6E4')}
                  />
                )}
              </div>
            )}
          </div>

          {/* Timeline */}
          <TimelineStrip report={fields} />

          {/* Tags */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
            background: 'var(--surface)',
          }}>
            <Tag size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 20,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-2)', fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                {t} <X size={10} />
              </button>
            ))}
            <input
              style={{
                background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--border)',
                fontSize: 12, color: 'var(--text-1)', outline: 'none',
                padding: '1px 4px', width: 90,
                fontFamily: 'DM Sans, sans-serif',
              }}
              placeholder="add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
            />
          </div>
        </div>

        {/* ── Drag divider ─────────────────────────────────────────── */}
        <div
          onMouseDown={handleDividerMouseDown}
          style={{
            width: 5, flexShrink: 0,
            cursor: 'col-resize',
            background: isNew ? 'var(--border)' : '#2D3148',
            transition: 'background 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = isNew ? 'var(--border)' : '#2D3148'; }}
          title="Drag to resize"
        />

        {/* RIGHT — Coding fields ──────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', minWidth: 0 }}>

          {/* Tab bar */}
          <div style={{
            display: 'flex', flexShrink: 0,
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            overflowX: 'auto',
          }}>
            {([
              ['basics', 'Basics', ['incident_date','city','neighbourhood','indoor_outdoor','public_private','deserted','incident_time_exact','day_of_week','destination_known','location_certainty','initial_contact_city','incident_city','destination_city']],
              ['encounter', 'Encounter', ['initial_approach_type','negotiation_present','refusal_present','pressure_after_refusal','coercion_present','threats_present','verbal_abuse','physical_force','sexual_assault','robbery_theft','stealthing','exit_type','repeated_pressure','intimidation_present','abrupt_tone_change','verbal_abuse_before_violence']],
              ['mobility', 'Mobility', ['movement_present','movement_attempted','mode_of_movement','entered_vehicle','public_to_private_shift','public_to_secluded_shift','cross_neighbourhood','cross_municipality','cross_city_movement','offender_control_over_movement','movement_completed','who_controlled_movement','movement_confidence']],
              ['suspect', 'Suspect', ['suspect_gender','suspect_age_estimate','vehicle_present','vehicle_make','vehicle_model','vehicle_colour','plate_partial']],
              ['narrative', 'Narrative', ['early_escalation_score','escalation_point','summary_analytic','key_quotes','coder_notes']],
              ['gis', 'GIS', ['initial_contact_address_raw','incident_address_raw','initial_contact_confidence','incident_confidence','destination_confidence']],
              ['scoring', 'Scoring', ['physical_force','coercion_present','threats_present','pressure_after_refusal','offender_control_over_movement','sexual_assault','stealthing','refusal_present','robbery_theft','verbal_abuse','negotiation_present','service_discussed','payment_discussed','movement_present','entered_vehicle','public_to_private_shift','public_to_secluded_shift','cross_municipality','cross_neighbourhood','deserted','repeat_suspect_flag','repeat_vehicle_flag']],
              ['summary', 'Summary', ['initial_approach_type','negotiation_present','refusal_present','pressure_after_refusal','coercion_present','threats_present','physical_force','sexual_assault','robbery_theft','exit_type','movement_present','entered_vehicle','public_to_private_shift','public_to_secluded_shift','indoor_outdoor','public_private']],
            ] as [Section, string, string[]][]).map(([sec, label, keys]) => {
              const filled = keys.filter(k => { const v = fields[k as keyof Report]; return v !== null && v !== undefined && String(v).trim() !== ''; }).length;
              return (
                <button
                  key={sec}
                  onClick={() => setActiveTab(sec)}
                  style={{
                    padding: '10px 14px',
                    border: 'none',
                    borderBottom: activeTab === sec ? '2px solid var(--accent)' : '2px solid transparent',
                    background: 'transparent',
                    color: activeTab === sec ? 'var(--accent)' : 'var(--text-3)',
                    fontFamily: 'DM Sans, sans-serif', fontSize: 12,
                    fontWeight: activeTab === sec ? 600 : 400,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                >
                  {label}
                  {filled > 0 && (
                    <span style={{ marginLeft: 5, fontSize: 10, color: filled === keys.length ? 'var(--green)' : 'var(--text-3)', fontWeight: 400 }}>
                      {filled}/{keys.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 24px' }}>

            {activeTab === 'basics' && (
              <div style={{ marginBottom: 12 }}>
                <SectionPanel title="Date & Time" fieldKeys={['incident_date','incident_time_exact','incident_time_range','day_of_week']} fields={fields}>
                  <FieldRow label="Incident date" value={f('incident_date')} onChange={(v) => set('incident_date', v)} suggested={s('incident_date')} onAcceptSuggestion={() => acceptSuggestion('incident_date')} placeholder="YYYY-MM-DD" provenance={prov('incident_date')} onMarkReviewed={() => markReviewed('incident_date')}
                    badge={showNlpChips ? <DateCertaintyBadge certainty={nlp.date_certainty ?? ''} reason={nlp.date_certainty_reason} /> : undefined}
                  />
                  <FieldRow label="Time exact" value={f('incident_time_exact')} onChange={(v) => set('incident_time_exact', v)} suggested={s('incident_time_exact')} onAcceptSuggestion={() => acceptSuggestion('incident_time_exact')} provenance={prov('incident_time_exact')} onMarkReviewed={() => markReviewed('incident_time_exact')}
                    badge={showNlpChips ? <TimeBucketBadge bucket={nlp.temporal?.time_of_day_bucket ?? ''} source={nlp.temporal?.time_of_day_source ?? ''} weather={weather} /> : undefined}
                  />
                  <FieldRow label="Time range" value={f('incident_time_range')} onChange={(v) => set('incident_time_range', v)} suggested={s('incident_time_range')} onAcceptSuggestion={() => acceptSuggestion('incident_time_range')} placeholder="e.g. 10pm–midnight" provenance={prov('incident_time_range')} onMarkReviewed={() => markReviewed('incident_time_range')} />
                  <FieldRow label="Day of week" value={f('day_of_week')} onChange={(v) => set('day_of_week', v)} type="select" options={['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']} suggested={s('day_of_week')} onAcceptSuggestion={() => acceptSuggestion('day_of_week')} provenance={prov('day_of_week')} onMarkReviewed={() => markReviewed('day_of_week')} />
                </SectionPanel>

                <SectionPanel title="Primary Location" fieldKeys={['city','neighbourhood','indoor_outdoor','public_private','deserted','destination_known','location_certainty','confidence_level']} fields={fields}>
                  <FieldRow label="Primary case city" value={f('city')} onChange={(v) => set('city', v)} suggested={s('city')} onAcceptSuggestion={() => acceptSuggestion('city')} placeholder="Summary / fallback if stages differ" provenance={prov('city')} onMarkReviewed={() => markReviewed('city')} />
                  <FieldRow label="Neighbourhood" value={f('neighbourhood')} onChange={(v) => set('neighbourhood', v)} suggested={s('neighbourhood')} onAcceptSuggestion={() => acceptSuggestion('neighbourhood')} provenance={prov('neighbourhood')} onMarkReviewed={() => markReviewed('neighbourhood')} />
                  <FieldRow label="Indoor / outdoor" value={f('indoor_outdoor')} onChange={(v) => set('indoor_outdoor', v)} type="select" options={['indoor','outdoor','unclear']} suggested={s('indoor_outdoor')} onAcceptSuggestion={() => acceptSuggestion('indoor_outdoor')} provenance={prov('indoor_outdoor')} onMarkReviewed={() => markReviewed('indoor_outdoor')} />
                  <FieldRow label="Public / private" value={f('public_private')} onChange={(v) => set('public_private', v)} type="select" options={['public','private','semi-private']} suggested={s('public_private')} onAcceptSuggestion={() => acceptSuggestion('public_private')} provenance={prov('public_private')} onMarkReviewed={() => markReviewed('public_private')} />
                  <FieldRow label="Deserted" value={f('deserted')} onChange={(v) => set('deserted', v)} type="select" options={['deserted','not deserted','unclear']} provenance={prov('deserted')} onMarkReviewed={() => markReviewed('deserted')}
                    badge={showNlpChips && nlp.environment?.area_character ? (
                      <span title={`NLP area (from current narrative): ${nlp.environment.area_character}${nlp.environment.lighting ? ' · lighting: ' + nlp.environment.lighting : ''}`} style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'default', whiteSpace: 'nowrap' }}>
                        {nlp.environment.area_character}{nlp.environment.lighting ? ` · ${nlp.environment.lighting}` : ''}
                      </span>
                    ) : undefined}
                  />
                  <FieldRow label="Destination known" value={f('destination_known')} onChange={(v) => set('destination_known', v)} type="yesno-extended" provenance={prov('destination_known')} onMarkReviewed={() => markReviewed('destination_known')} />
                  <FieldRow label="Location certainty" value={f('location_certainty')} onChange={(v) => set('location_certainty', v)} type="select" options={['high','medium','low','unknown']} provenance={prov('location_certainty')} onMarkReviewed={() => markReviewed('location_certainty')} />
                  <FieldRow label="Confidence level" value={f('confidence_level')} onChange={(v) => set('confidence_level', v)} type="select" options={['low','medium','high']} />
                </SectionPanel>

                {/* ── Location stages — each with its own city ──────────────────── */}
                <SectionPanel title="Location Stages" fieldKeys={['initial_contact_location','initial_contact_city','initial_contact_city_confidence','incident_location_primary','incident_city','incident_city_confidence','incident_location_secondary','destination_city','destination_city_confidence']} fields={fields}>

                <FieldRow label="Initial contact location" value={f('initial_contact_location')} onChange={(v) => set('initial_contact_location', v)} suggested={s('initial_contact_location')} onAcceptSuggestion={() => acceptSuggestion('initial_contact_location')} provenance={prov('initial_contact_location')} onMarkReviewed={() => markReviewed('initial_contact_location')}
                  badge={(() => {
                    const hint = nlp.contact_location_hint;
                    const fieldVal = f('initial_contact_location');
                    return (
                      <>
                        {/* NLP hint chip — only when field is empty and hint is clean */}
                        {showNlpChips && isPlausibleLocationHint(hint) && !fieldVal && (
                          <span title={`NLP extracted from current narrative: "${hint}" — click to accept`} onClick={() => set('initial_contact_location', hint)} style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 4, border: '1px solid var(--blue-border)', background: 'var(--blue-pale)', color: 'var(--blue)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            ↳ NLP: {String(hint).slice(0, 26)}
                          </span>
                        )}
                        {/* Sentence-fragment warning — value looks like narrative text */}
                        {looksLikeSentenceFragment(fieldVal) && (
                          <span title="This value looks like a narrative sentence. Extract just the concise location name (e.g. 'Victoria and Kingsway' not 'The worker was picked up at…')" style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 3, border: '1px solid #FDE68A', background: '#FEF3C7', color: '#92400E', cursor: 'help', whiteSpace: 'nowrap' }}>
                            ⚠ Looks like narrative — extract location name
                          </span>
                        )}
                      </>
                    );
                  })()}
                />
                <FieldRow label="Initial contact city" value={f('initial_contact_city')} onChange={(v) => set('initial_contact_city', v)} provenance={prov('initial_contact_city')} onMarkReviewed={() => markReviewed('initial_contact_city')} />
                <FieldRow label="Contact city — certainty" value={f('initial_contact_city_confidence')} onChange={(v) => set('initial_contact_city_confidence', v)} type="select" options={['known','probable','inferred','unknown']} provenance={prov('initial_contact_city_confidence')} onMarkReviewed={() => markReviewed('initial_contact_city_confidence')} />

                <FieldRow label="Primary incident location" value={f('incident_location_primary')} onChange={(v) => set('incident_location_primary', v)} suggested={s('incident_location_primary')} onAcceptSuggestion={() => acceptSuggestion('incident_location_primary')} provenance={prov('incident_location_primary')} onMarkReviewed={() => markReviewed('incident_location_primary')}
                  badge={(() => {
                    const hint = nlp.incident_location_hint;
                    const locType: string = nlp.environment?.location_type ?? '';
                    const envSupported = showNlpChips && locType ? isEnvLocationSupportedByNarrative(locType, narrative) : false;
                    const fieldVal = f('incident_location_primary');
                    return (
                      <>
                        {showNlpChips && isPlausibleLocationHint(hint) && !fieldVal && (
                          <span
                            title={`NLP extracted from current narrative: "${hint}" — click to accept`}
                            onClick={() => set('incident_location_primary', hint)}
                            style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 4, border: '1px solid var(--blue-border)', background: 'var(--blue-pale)', color: 'var(--blue)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            ↳ NLP: {String(hint).slice(0, 26)}
                          </span>
                        )}
                        {envSupported && (
                          <span
                            title={`NLP environment type (provisional — not written to any field): ${locType}. Confirm before coding.`}
                            style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 4, border: '1px solid var(--amber-border)', background: 'var(--amber-pale)', color: 'var(--amber)', cursor: 'default', whiteSpace: 'nowrap' }}
                          >
                            ⌂ {locType} · provisional
                          </span>
                        )}
                        {looksLikeSentenceFragment(fieldVal) && (
                          <span title="This value looks like a narrative sentence. Extract just the concise location name." style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 3, border: '1px solid #FDE68A', background: '#FEF3C7', color: '#92400E', cursor: 'help', whiteSpace: 'nowrap' }}>
                            ⚠ Looks like narrative — extract location name
                          </span>
                        )}
                      </>
                    );
                  })()}
                />
                <FieldRow label="Primary incident city" value={f('incident_city')} onChange={(v) => set('incident_city', v)} provenance={prov('incident_city')} onMarkReviewed={() => markReviewed('incident_city')} />
                <FieldRow label="Incident city — certainty" value={f('incident_city_confidence')} onChange={(v) => set('incident_city_confidence', v)} type="select" options={['known','probable','inferred','unknown']} provenance={prov('incident_city_confidence')} onMarkReviewed={() => markReviewed('incident_city_confidence')} />

                <FieldRow label="Secondary / destination location" value={f('incident_location_secondary')} onChange={(v) => set('incident_location_secondary', v)} provenance={prov('incident_location_secondary')} onMarkReviewed={() => markReviewed('incident_location_secondary')} />
                <FieldRow label="Destination city" value={f('destination_city')} onChange={(v) => set('destination_city', v)} provenance={prov('destination_city')} onMarkReviewed={() => markReviewed('destination_city')} />
                <FieldRow label="Destination city — certainty" value={f('destination_city_confidence')} onChange={(v) => set('destination_city_confidence', v)} type="select" options={['known','probable','inferred','unknown']} provenance={prov('destination_city_confidence')} onMarkReviewed={() => markReviewed('destination_city_confidence')} />
                </SectionPanel>
              </div>
            )}

            {activeTab === 'encounter' && (
              <div style={{ marginBottom: 12 }}>
                <SectionPanel title="Negotiation & Approach" fieldKeys={['initial_approach_type','negotiation_present','service_discussed','payment_discussed','refusal_present','pressure_after_refusal']} fields={fields}>
                  <FieldRow label="Initial approach type" value={f('initial_approach_type')} onChange={(v) => set('initial_approach_type', v)} suggested={s('initial_approach_type')} onAcceptSuggestion={() => acceptSuggestion('initial_approach_type')} provenance={prov('initial_approach_type')} onMarkReviewed={() => markReviewed('initial_approach_type')} />
                  <FieldRow label="Negotiation present" value={f('negotiation_present')} onChange={(v) => set('negotiation_present', v)} type="yesno-extended" suggested={s('negotiation_present')} onAcceptSuggestion={() => acceptSuggestion('negotiation_present')} provenance={prov('negotiation_present')} onMarkReviewed={() => markReviewed('negotiation_present')} />
                  <FieldRow label="Service discussed" value={f('service_discussed')} onChange={(v) => set('service_discussed', v)} type="yesno" suggested={s('service_discussed')} onAcceptSuggestion={() => acceptSuggestion('service_discussed')} provenance={prov('service_discussed')} onMarkReviewed={() => markReviewed('service_discussed')} />
                  <FieldRow label="Payment discussed" value={f('payment_discussed')} onChange={(v) => set('payment_discussed', v)} type="yesno" suggested={s('payment_discussed')} onAcceptSuggestion={() => acceptSuggestion('payment_discussed')} provenance={prov('payment_discussed')} onMarkReviewed={() => markReviewed('payment_discussed')} />
                  <FieldRow label="Refusal present" value={f('refusal_present')} onChange={(v) => set('refusal_present', v)} type="yesno-extended" suggested={s('refusal_present')} onAcceptSuggestion={() => acceptSuggestion('refusal_present')} provenance={prov('refusal_present')} onMarkReviewed={() => markReviewed('refusal_present')} />
                  <FieldRow label="Pressure after refusal" value={f('pressure_after_refusal')} onChange={(v) => set('pressure_after_refusal', v)} type="yesno" suggested={s('pressure_after_refusal')} onAcceptSuggestion={() => acceptSuggestion('pressure_after_refusal')} provenance={prov('pressure_after_refusal')} onMarkReviewed={() => markReviewed('pressure_after_refusal')} />
                </SectionPanel>

                <SectionPanel title="Violence Indicators" fieldKeys={['coercion_present','threats_present','verbal_abuse','physical_force','sexual_assault','robbery_theft','stealthing','exit_type']} fields={fields}>
                  <FieldRow label="Coercion present" value={f('coercion_present')} onChange={(v) => set('coercion_present', v)} type="yesno-extended" suggested={s('coercion_present')} onAcceptSuggestion={() => acceptSuggestion('coercion_present')} provenance={prov('coercion_present')} onMarkReviewed={() => markReviewed('coercion_present')} badge={showNlpChips ? <NlpBadge rank={nlp.coercion_rank ?? 3} evidence={nlp.coercion_evidence ?? []} fieldValue={f('coercion_present')} /> : undefined} />
                  <FieldRow label="Threats present" value={f('threats_present')} onChange={(v) => set('threats_present', v)} type="yesno" suggested={s('threats_present')} onAcceptSuggestion={() => acceptSuggestion('threats_present')} provenance={prov('threats_present')} onMarkReviewed={() => markReviewed('threats_present')} badge={showNlpChips ? <NlpBadge rank={nlp.weapon_rank ?? 3} evidence={nlp.weapon_evidence ?? []} fieldValue={f('threats_present')} /> : undefined} />
                  <FieldRow label="Verbal abuse" value={f('verbal_abuse')} onChange={(v) => set('verbal_abuse', v)} type="yesno" suggested={s('verbal_abuse')} onAcceptSuggestion={() => acceptSuggestion('verbal_abuse')} provenance={prov('verbal_abuse')} onMarkReviewed={() => markReviewed('verbal_abuse')} />
                  <FieldRow label="Physical force" value={f('physical_force')} onChange={(v) => set('physical_force', v)} type="yesno-extended" suggested={s('physical_force')} onAcceptSuggestion={() => acceptSuggestion('physical_force')} provenance={prov('physical_force')} onMarkReviewed={() => markReviewed('physical_force')} badge={showNlpChips ? <NlpBadge rank={nlp.physical_rank ?? 3} evidence={nlp.physical_evidence ?? []} fieldValue={f('physical_force')} /> : undefined} />
                  <FieldRow label="Sexual assault" value={f('sexual_assault')} onChange={(v) => set('sexual_assault', v)} type="yesno-extended" suggested={s('sexual_assault')} onAcceptSuggestion={() => acceptSuggestion('sexual_assault')} provenance={prov('sexual_assault')} onMarkReviewed={() => markReviewed('sexual_assault')} badge={showNlpChips ? <NlpBadge rank={nlp.sexual_rank ?? 3} evidence={nlp.sexual_evidence ?? []} fieldValue={f('sexual_assault')} /> : undefined} />
                  <FieldRow label="Robbery / theft" value={f('robbery_theft')} onChange={(v) => set('robbery_theft', v)} type="yesno" suggested={s('robbery_theft')} onAcceptSuggestion={() => acceptSuggestion('robbery_theft')} provenance={prov('robbery_theft')} onMarkReviewed={() => markReviewed('robbery_theft')} />
                  <FieldRow label="Stealthing / condom refusal" value={f('stealthing')} onChange={(v) => set('stealthing', v)} type="yesno" suggested={s('stealthing')} onAcceptSuggestion={() => acceptSuggestion('stealthing')} provenance={prov('stealthing')} onMarkReviewed={() => markReviewed('stealthing')} />
                  <FieldRow label="Exit type" value={f('exit_type')} onChange={(v) => set('exit_type', v)} type="select" options={['completed','escaped','abandoned','interrupted','unknown']} suggested={s('exit_type')} onAcceptSuggestion={() => acceptSuggestion('exit_type')} provenance={prov('exit_type')} onMarkReviewed={() => markReviewed('exit_type')} />
                </SectionPanel>

                <SectionPanel title="Early Escalation Detail" fieldKeys={['repeated_pressure','intimidation_present','abrupt_tone_change','verbal_abuse_before_violence','escalation_trigger']} fields={fields} defaultCollapsed>
                  <FieldRow label="Repeated pressure" value={f('repeated_pressure')} onChange={(v) => set('repeated_pressure', v)} type="yesno" provenance={prov('repeated_pressure')} onMarkReviewed={() => markReviewed('repeated_pressure')} />
                  <FieldRow label="Intimidation present" value={f('intimidation_present')} onChange={(v) => set('intimidation_present', v)} type="yesno" provenance={prov('intimidation_present')} onMarkReviewed={() => markReviewed('intimidation_present')} />
                  <FieldRow label="Abrupt tone change" value={f('abrupt_tone_change')} onChange={(v) => set('abrupt_tone_change', v)} type="yesno" provenance={prov('abrupt_tone_change')} onMarkReviewed={() => markReviewed('abrupt_tone_change')} />
                  <FieldRow label="Verbal abuse before violence" value={f('verbal_abuse_before_violence')} onChange={(v) => set('verbal_abuse_before_violence', v)} type="yesno" provenance={prov('verbal_abuse_before_violence')} onMarkReviewed={() => markReviewed('verbal_abuse_before_violence')} />
                  <FieldRow label="Escalation trigger" value={f('escalation_trigger')} onChange={(v) => set('escalation_trigger', v)} type="textarea" placeholder="What triggered escalation? (free text)" provenance={prov('escalation_trigger')} onMarkReviewed={() => markReviewed('escalation_trigger')} />
                </SectionPanel>
              </div>
            )}

            {activeTab === 'mobility' && (
              <div style={{ marginBottom: 12 }}>
                <SectionPanel title="Movement" fieldKeys={['movement_present','movement_attempted','movement_completed','mode_of_movement','entered_vehicle','vehicle_driver_role','who_controlled_movement']} fields={fields}>
                  <FieldRow label="Movement present" value={f('movement_present')} onChange={(v) => set('movement_present', v)} type="yesno-extended" suggested={s('movement_present')} onAcceptSuggestion={() => acceptSuggestion('movement_present')} provenance={prov('movement_present')} onMarkReviewed={() => markReviewed('movement_present')} badge={showNlpChips ? <NlpBadge rank={nlp.movement_rank ?? 3} evidence={nlp.movement_evidence ?? []} fieldValue={f('movement_present')} /> : undefined} />
                  <FieldRow label="Movement attempted" value={f('movement_attempted')} onChange={(v) => set('movement_attempted', v)} type="yesno" suggested={s('movement_attempted')} onAcceptSuggestion={() => acceptSuggestion('movement_attempted')} provenance={prov('movement_attempted')} onMarkReviewed={() => markReviewed('movement_attempted')} />
                  <FieldRow label="Movement completed" value={f('movement_completed')} onChange={(v) => set('movement_completed', v)} type="yesno" provenance={prov('movement_completed')} onMarkReviewed={() => markReviewed('movement_completed')} />
                  <FieldRow label="Mode of movement" value={f('mode_of_movement')} onChange={(v) => set('mode_of_movement', v)} suggested={s('mode_of_movement')} onAcceptSuggestion={() => acceptSuggestion('mode_of_movement')} provenance={prov('mode_of_movement')} onMarkReviewed={() => markReviewed('mode_of_movement')} />
                  <FieldRow label="Entered vehicle" value={f('entered_vehicle')} onChange={(v) => set('entered_vehicle', v)} type="yesno" suggested={s('entered_vehicle')} onAcceptSuggestion={() => acceptSuggestion('entered_vehicle')} provenance={prov('entered_vehicle')} onMarkReviewed={() => markReviewed('entered_vehicle')} />
                  <FieldRow label="Vehicle driver role" value={f('vehicle_driver_role')} onChange={(v) => set('vehicle_driver_role', v)} provenance={prov('vehicle_driver_role')} onMarkReviewed={() => markReviewed('vehicle_driver_role')} />
                  <FieldRow label="Who controlled movement" value={f('who_controlled_movement')} onChange={(v) => set('who_controlled_movement', v)} type="select" options={['offender','victim','shared','unclear']} provenance={prov('who_controlled_movement')} onMarkReviewed={() => markReviewed('who_controlled_movement')} />
                </SectionPanel>

                <SectionPanel title="Geography" fieldKeys={['start_location_type','destination_location_type','public_to_private_shift','public_to_secluded_shift','cross_neighbourhood','cross_municipality','cross_city_movement','offender_control_over_movement']} fields={fields}>
                  <FieldRow label="Start location type" value={f('start_location_type')} onChange={(v) => set('start_location_type', v)} suggested={s('start_location_type')} onAcceptSuggestion={() => acceptSuggestion('start_location_type')} provenance={prov('start_location_type')} onMarkReviewed={() => markReviewed('start_location_type')} />
                  <FieldRow label="Destination location type" value={f('destination_location_type')} onChange={(v) => set('destination_location_type', v)} suggested={s('destination_location_type')} onAcceptSuggestion={() => acceptSuggestion('destination_location_type')} provenance={prov('destination_location_type')} onMarkReviewed={() => markReviewed('destination_location_type')} />
                  <FieldRow label="Public → private shift" value={f('public_to_private_shift')} onChange={(v) => set('public_to_private_shift', v)} type="yesno" suggested={s('public_to_private_shift')} onAcceptSuggestion={() => acceptSuggestion('public_to_private_shift')} provenance={prov('public_to_private_shift')} onMarkReviewed={() => markReviewed('public_to_private_shift')} />
                  <FieldRow label="Public → secluded shift" value={f('public_to_secluded_shift')} onChange={(v) => set('public_to_secluded_shift', v)} type="yesno" suggested={s('public_to_secluded_shift')} onAcceptSuggestion={() => acceptSuggestion('public_to_secluded_shift')} provenance={prov('public_to_secluded_shift')} onMarkReviewed={() => markReviewed('public_to_secluded_shift')} />
                  <FieldRow label="Cross neighbourhood" value={f('cross_neighbourhood')} onChange={(v) => set('cross_neighbourhood', v)} type="yesno" provenance={prov('cross_neighbourhood')} onMarkReviewed={() => markReviewed('cross_neighbourhood')} />
                  <FieldRow label="Cross municipality" value={f('cross_municipality')} onChange={(v) => set('cross_municipality', v)} type="yesno" provenance={prov('cross_municipality')} onMarkReviewed={() => markReviewed('cross_municipality')} />
                  <FieldRow label="Cross-city movement" value={f('cross_city_movement')} onChange={(v) => set('cross_city_movement', v)} type="select" options={['yes','no','unclear']} provenance={prov('cross_city_movement')} onMarkReviewed={() => markReviewed('cross_city_movement')} />
                  <FieldRow label="Offender movement control" value={f('offender_control_over_movement')} onChange={(v) => set('offender_control_over_movement', v)} type="select" options={['low','moderate','high','unclear']} provenance={prov('offender_control_over_movement')} onMarkReviewed={() => markReviewed('offender_control_over_movement')} />
                </SectionPanel>

                <SectionPanel title="Assessment" fieldKeys={['movement_confidence','movement_notes']} fields={fields} defaultCollapsed>
                  <FieldRow label="Movement confidence" value={f('movement_confidence')} onChange={(v) => set('movement_confidence', v)} type="select" options={['high','medium','low','unclear']} provenance={prov('movement_confidence')} onMarkReviewed={() => markReviewed('movement_confidence')} />
                  <FieldRow label="Movement notes" value={f('movement_notes')} onChange={(v) => set('movement_notes', v)} type="textarea" placeholder="Analyst notes on movement coding confidence and sources" provenance={prov('movement_notes')} onMarkReviewed={() => markReviewed('movement_notes')} />
                </SectionPanel>
              </div>
            )}

            {activeTab === 'suspect' && (
              <div style={{ marginBottom: 12 }}>
                <SectionPanel title="Suspect Description" fieldKeys={['suspect_count','suspect_gender','suspect_description_text','suspect_race_ethnicity','suspect_age_estimate']} fields={fields}>
                  <FieldRow label="Suspect count" value={f('suspect_count')} onChange={(v) => set('suspect_count', v)} suggested={s('suspect_count')} onAcceptSuggestion={() => acceptSuggestion('suspect_count')} provenance={prov('suspect_count')} onMarkReviewed={() => markReviewed('suspect_count')} />
                  <FieldRow label="Suspect gender" value={f('suspect_gender')} onChange={(v) => set('suspect_gender', v)} suggested={s('suspect_gender')} onAcceptSuggestion={() => acceptSuggestion('suspect_gender')} provenance={prov('suspect_gender')} onMarkReviewed={() => markReviewed('suspect_gender')} />
                  <FieldRow label="Suspect description" value={f('suspect_description_text')} onChange={(v) => set('suspect_description_text', v)} type="textarea" suggested={s('suspect_description_text')} onAcceptSuggestion={() => acceptSuggestion('suspect_description_text')} provenance={prov('suspect_description_text')} onMarkReviewed={() => markReviewed('suspect_description_text')} />
                  <FieldRow label="Race / ethnicity (as reported)" value={f('suspect_race_ethnicity')} onChange={(v) => set('suspect_race_ethnicity', v)} suggested={s('suspect_race_ethnicity')} onAcceptSuggestion={() => acceptSuggestion('suspect_race_ethnicity')} provenance={prov('suspect_race_ethnicity')} onMarkReviewed={() => markReviewed('suspect_race_ethnicity')} />
                  <FieldRow label="Age estimate" value={f('suspect_age_estimate')} onChange={(v) => set('suspect_age_estimate', v)} suggested={s('suspect_age_estimate')} onAcceptSuggestion={() => acceptSuggestion('suspect_age_estimate')} provenance={prov('suspect_age_estimate')} onMarkReviewed={() => markReviewed('suspect_age_estimate')} />
                </SectionPanel>

                <SectionPanel title="Vehicle" fieldKeys={['vehicle_present','vehicle_make','vehicle_model','vehicle_colour','plate_partial','repeat_suspect_flag','repeat_vehicle_flag']} fields={fields}>
                  <FieldRow label="Vehicle present" value={f('vehicle_present')} onChange={(v) => set('vehicle_present', v)} type="yesno-extended" suggested={s('vehicle_present')} onAcceptSuggestion={() => acceptSuggestion('vehicle_present')} provenance={prov('vehicle_present')} onMarkReviewed={() => markReviewed('vehicle_present')} />
                  <FieldRow label="Vehicle make" value={f('vehicle_make')} onChange={(v) => set('vehicle_make', v)} suggested={s('vehicle_make')} onAcceptSuggestion={() => acceptSuggestion('vehicle_make')} provenance={prov('vehicle_make')} onMarkReviewed={() => markReviewed('vehicle_make')} />
                  <FieldRow label="Vehicle model" value={f('vehicle_model')} onChange={(v) => set('vehicle_model', v)} suggested={s('vehicle_model')} onAcceptSuggestion={() => acceptSuggestion('vehicle_model')} provenance={prov('vehicle_model')} onMarkReviewed={() => markReviewed('vehicle_model')} />
                  <FieldRow label="Vehicle colour" value={f('vehicle_colour')} onChange={(v) => set('vehicle_colour', v)} suggested={s('vehicle_colour')} onAcceptSuggestion={() => acceptSuggestion('vehicle_colour')} provenance={prov('vehicle_colour')} onMarkReviewed={() => markReviewed('vehicle_colour')} />
                  <FieldRow label="Plate (partial)" value={f('plate_partial')} onChange={(v) => set('plate_partial', v)} suggested={s('plate_partial')} onAcceptSuggestion={() => acceptSuggestion('plate_partial')} placeholder="e.g. JC3 37L" provenance={prov('plate_partial')} onMarkReviewed={() => markReviewed('plate_partial')} />
                  <FieldRow label="Repeat suspect flag" value={f('repeat_suspect_flag')} onChange={(v) => set('repeat_suspect_flag', v)} type="yesno" provenance={prov('repeat_suspect_flag')} onMarkReviewed={() => markReviewed('repeat_suspect_flag')} />
                  <FieldRow label="Repeat vehicle flag" value={f('repeat_vehicle_flag')} onChange={(v) => set('repeat_vehicle_flag', v)} type="yesno" provenance={prov('repeat_vehicle_flag')} onMarkReviewed={() => markReviewed('repeat_vehicle_flag')} />
                </SectionPanel>
              </div>
            )}

            {activeTab === 'narrative' && (
              <div style={{ marginBottom: 12 }}>
                <NlpSignalsPanel nlp={nlp} onSetField={(field, value) => set(field as keyof Report, value)} reportId={report?.report_id} getFieldValue={(field) => f(field as keyof Report)} />
                <EscalationArc esc={nlp.escalation ?? {}} />
                <WeatherCard w={weather} />
                <FieldRow label="Escalation point" value={f('escalation_point')} onChange={(v) => set('escalation_point', v)} type="select" options={['refusal ignored','threat made','physical force applied','sexual assault initiated','robbery occurred','victim escaped','other']} suggested={s('escalation_point')} onAcceptSuggestion={() => acceptSuggestion('escalation_point')} provenance={prov('escalation_point')} onMarkReviewed={() => markReviewed('escalation_point')} />
                <FieldRow label="Early escalation score (1–5)" value={f('early_escalation_score')} onChange={(v) => set('early_escalation_score', v)} type="select" options={['1','2','3','4','5']} suggested={s('early_escalation_score')} onAcceptSuggestion={() => acceptSuggestion('early_escalation_score')} provenance={prov('early_escalation_score')} onMarkReviewed={() => markReviewed('early_escalation_score')}
                  badge={nlp.escalation?.score && nlp.escalation.score >= 3 ? (
                    <NlpBadge rank={nlp.escalation.score >= 4 ? 1 : 2} evidence={[`NLP suggests score ${nlp.escalation.score}: ${nlp.escalation.arc}`]} fieldValue={f('early_escalation_score')} />
                  ) : undefined}
                />
                <FieldRow label="Mobility richness score (1–5)" value={f('mobility_richness_score')} onChange={(v) => set('mobility_richness_score', v)} type="select" options={['1','2','3','4','5']} suggested={s('mobility_richness_score')} onAcceptSuggestion={() => acceptSuggestion('mobility_richness_score')} provenance={prov('mobility_richness_score')} onMarkReviewed={() => markReviewed('mobility_richness_score')} />
                <FieldRow label="Analytic summary (coded)" value={f('summary_analytic')} onChange={(v) => set('summary_analytic', v)} type="textarea" suggested={s('summary_analytic')} onAcceptSuggestion={() => acceptSuggestion('summary_analytic')} placeholder="1–2 sentence analytic summary (coded field — see left panel for interpretive summary)" provenance={prov('summary_analytic')} onMarkReviewed={() => markReviewed('summary_analytic')} />
                <FieldRow label="Key quotes" value={f('key_quotes')} onChange={(v) => set('key_quotes', v)} type="textarea" suggested={s('key_quotes')} onAcceptSuggestion={() => acceptSuggestion('key_quotes')} provenance={prov('key_quotes')} onMarkReviewed={() => markReviewed('key_quotes')} />
                <FieldRow label="Coder notes" value={f('coder_notes')} onChange={(v) => set('coder_notes', v)} type="textarea" provenance={prov('coder_notes')} onMarkReviewed={() => markReviewed('coder_notes')} />
                <FieldRow label="Uncertainty notes" value={f('uncertainty_notes')} onChange={(v) => set('uncertainty_notes', v)} type="textarea" suggested={s('uncertainty_notes')} onAcceptSuggestion={() => acceptSuggestion('uncertainty_notes')} provenance={prov('uncertainty_notes')} onMarkReviewed={() => markReviewed('uncertainty_notes')} />
              </div>
            )}

            {activeTab === 'gis' && (
              <div style={{ marginBottom: 12 }}>
                {([
                  {
                    heading: 'INITIAL CONTACT POINT',
                    rawKey: 'initial_contact_address_raw' as const,
                    normKey: 'initial_contact_address_normalized' as const,
                    precKey: 'initial_contact_precision' as const,
                    srcKey:  'initial_contact_source' as const,
                    confKey: 'initial_contact_confidence' as const,
                    notesKey:'initial_contact_analyst_notes' as const,
                    latKey:  'lat_initial' as const,
                    lonKey:  'lon_initial' as const,
                  },
                  {
                    heading: 'INCIDENT POINT',
                    rawKey: 'incident_address_raw' as const,
                    normKey: 'incident_address_normalized' as const,
                    precKey: 'incident_precision' as const,
                    srcKey:  'incident_source' as const,
                    confKey: 'incident_confidence' as const,
                    notesKey:'incident_analyst_notes' as const,
                    latKey:  'lat_incident' as const,
                    lonKey:  'lon_incident' as const,
                  },
                  {
                    heading: 'DESTINATION POINT',
                    rawKey: 'destination_address_raw' as const,
                    normKey: 'destination_address_normalized' as const,
                    precKey: 'destination_precision' as const,
                    srcKey:  'destination_source' as const,
                    confKey: 'destination_confidence' as const,
                    notesKey:'destination_analyst_notes' as const,
                    latKey:  'lat_destination' as const,
                    lonKey:  'lon_destination' as const,
                  },
                ]).map((loc) => (
                  <div key={loc.heading} style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{
                      padding: '6px 12px',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                      color: 'var(--text-3)', background: 'var(--surface-2)',
                      borderBottom: '1px solid var(--border)',
                    }}>{loc.heading}</div>
                    <div style={{ padding: '6px 12px' }}>
                      <FieldRow label="Raw address (source)" value={f(loc.rawKey)} onChange={(v) => set(loc.rawKey, v)} placeholder="Verbatim address from source" provenance={prov(loc.rawKey)} onMarkReviewed={() => markReviewed(loc.rawKey)} />
                      <FieldRow label="Normalized address" value={f(loc.normKey)} onChange={(v) => set(loc.normKey, v)} placeholder="Standardized address for geocoding" provenance={prov(loc.normKey)} onMarkReviewed={() => markReviewed(loc.normKey)} />
                      <FieldRow label="Precision" value={f(loc.precKey)} onChange={(v) => set(loc.precKey, v)} type="select" options={['exact','approximate','unknown']} provenance={prov(loc.precKey)} onMarkReviewed={() => markReviewed(loc.precKey)} />
                      <FieldRow label="Source" value={f(loc.srcKey)} onChange={(v) => set(loc.srcKey, v)} type="select" options={['stated','inferred','unclear']} provenance={prov(loc.srcKey)} onMarkReviewed={() => markReviewed(loc.srcKey)} />
                      <FieldRow label="Confidence" value={f(loc.confKey)} onChange={(v) => set(loc.confKey, v)} type="select" options={['high','medium','low','none']} provenance={prov(loc.confKey)} onMarkReviewed={() => markReviewed(loc.confKey)} />
                      <FieldRow label="Analyst notes" value={f(loc.notesKey)} onChange={(v) => set(loc.notesKey, v)} type="textarea" placeholder="Notes on location uncertainty, source quality, geocoding issues" provenance={prov(loc.notesKey)} onMarkReviewed={() => markReviewed(loc.notesKey)} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                        {([
                          [loc.latKey, 'Latitude'],
                          [loc.lonKey, 'Longitude'],
                        ] as [keyof Report, string][]).map(([key, label]) => (
                          <div key={String(key)}>
                            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>{label}</label>
                            <input
                              type="number" step="0.000001"
                              value={fields[key] as number ?? ''}
                              onChange={(e) => set(key, e.target.value ? parseFloat(e.target.value) : null)}
                              placeholder="0.000000"
                              style={{
                                width: '100%', padding: '4px 8px', borderRadius: 5,
                                border: '1px solid var(--border)', background: 'var(--surface)',
                                fontSize: 12, fontFamily: 'DM Sans, monospace', color: 'var(--text-1)', outline: 'none',
                              }}
                              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'scoring' && <ScoringTab fields={fields} />}
            {activeTab === 'summary' && <SummaryTab fields={fields} />}
          </div>
        </div>
      </div>

      {/* ── Audit log ─────────────────────────────────────────────────── */}
      {report?.audit_log && report.audit_log.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '5px 20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-2)',
          flexShrink: 0, overflow: 'hidden',
        }}>
          <span className="section-label" style={{ flexShrink: 0 }}>Audit</span>
          <div style={{ display: 'flex', gap: 16, overflow: 'hidden', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {[...report.audit_log].reverse().slice(0, 4).map((entry, i) => (
              <span key={i}>
                {new Date(entry.ts).toLocaleString()} — {entry.action}
                {entry.field && ` · ${entry.field}`}
                {entry.by && ` · ${entry.by}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

