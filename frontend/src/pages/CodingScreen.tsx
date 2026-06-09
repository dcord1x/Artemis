import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Sparkles, Download, Tag, X, GitCompare, Lock, ChevronLeft, ChevronRight, ExternalLink, FileText, ChevronDown, ScanSearch, Copy, Check } from 'lucide-react';
import { api } from '../api';
import type { Report } from '../types';
import FieldRow from '../components/FieldRow';
import TimelineStrip from '../components/TimelineStrip';
import { useToast } from '../components/Toast';
import SectionPanel from '../components/SectionPanel';
import ParseViewer from '../components/ParseViewer';
import GisMapModal from '../components/GisMapModal';
import StageSequencer from '../components/StageSequencer';
import { broadPos as _broadPos } from '../utils';

// ── NLP field badge ───────────────────────────────────────────────────────────

function NlpBadge({ rank, evidence, fieldValue }: { rank: number; evidence: string[]; fieldValue?: string }) {
  if (rank > 2) return null;
  const isHigh = rank === 1;
  const fullTitle = `NLP signal — ${isHigh ? 'strong' : 'possible (review)'}\n\nEvidence:\n${evidence.join('\n')}`;
  if (fieldValue === 'yes' || fieldValue === 'probable' || fieldValue === 'inferred') {
    return (
      <span title={fullTitle} style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4, border: '1px solid var(--green-border)', background: 'var(--green-pale)', color: 'var(--green)', cursor: 'default', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
        NLP ✓ accepted
      </span>
    );
  }
  if (fieldValue === 'no') {
    return (
      <span title={fullTitle} style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', cursor: 'default', letterSpacing: '0.03em', whiteSpace: 'nowrap', textDecoration: 'line-through' }}>
        NLP — rejected
      </span>
    );
  }
  const firstEv = (evidence[0] || '').replace(/^[\w\s]+:\s*/, '').slice(0, 38);
  return (
    <span title={fullTitle} style={{ flexShrink: 0, display: 'inline-flex', flexDirection: 'column', gap: 1, fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4, border: `1px solid ${isHigh ? 'var(--accent-border)' : 'var(--amber-border)'}`, background: isHigh ? 'var(--accent-pale)' : 'var(--amber-pale)', color: isHigh ? 'var(--accent)' : 'var(--amber)', cursor: 'default', letterSpacing: '0.03em', maxWidth: 200 }}>
      <span style={{ whiteSpace: 'nowrap' }}>{isHigh ? 'NLP signal — pending' : 'NLP possible — pending'}</span>
      {firstEv && <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.8, whiteSpace: 'normal', lineHeight: 1.2 }}>{firstEv}{evidence[0]?.length > 40 ? '…' : ''}</span>}
    </span>
  );
}

const EV_PREFIX_LABELS: Record<string, string> = {
  'restraint SVO': 'Grammatical pattern', 'physical SVO': 'Grammatical pattern',
  'transport SVO': 'Grammatical pattern', 'arc:': 'Narrative arc',
  'coercion phrase': 'Phrase match', 'physical phrase': 'Phrase match',
  'movement phrase': 'Phrase match', 'weapon display phrase': 'Display phrase',
  'weapon + action': 'Weapon + action context', 'weapon mentioned': 'Weapon term (possible)',
  'weapon (negated)': 'Weapon (negated)', 'primary term': 'Direct wording',
  'secondary term': 'Contextual phrase', 'term (negated)': 'Negated phrase',
  'two locations': 'Two locations detected', 'keyword': 'Keyword signal',
  'keyword (negated)': 'Keyword (negated)', 'phrase (negated)': 'Phrase (negated)',
};

function formatEvidence(ev: string): { type: string; text: string } {
  for (const prefix of Object.keys(EV_PREFIX_LABELS)) {
    if (ev.startsWith(prefix)) {
      return { type: EV_PREFIX_LABELS[prefix], text: ev.slice(prefix.length).replace(/^:\s*/, '').trim() };
    }
  }
  return { type: 'Signal', text: ev };
}

function NlpSignalsPanel({ nlp, onSetField, reportId, getFieldValue }: {
  nlp: Record<string, any>;
  onSetField?: (field: string, value: string) => void;
  reportId?: string;
  getFieldValue?: (field: string) => string;
}) {
  type Signal = { label: string; rank: number; evidence: string[]; field: string; acceptValue: string };
  const signals: Signal[] = [];
  if ((nlp.coercion_rank ?? 3) <= 2) signals.push({ label: 'Coercion', rank: nlp.coercion_rank, evidence: nlp.coercion_evidence ?? [], field: 'coercion_present', acceptValue: 'yes' });
  if ((nlp.physical_rank ?? 3) <= 2) signals.push({ label: 'Physical force', rank: nlp.physical_rank, evidence: nlp.physical_evidence ?? [], field: 'physical_force', acceptValue: 'yes' });
  if ((nlp.sexual_rank ?? 3) <= 2) signals.push({ label: 'Sexual assault', rank: nlp.sexual_rank, evidence: nlp.sexual_evidence ?? [], field: 'sexual_assault', acceptValue: 'yes' });
  if ((nlp.movement_rank ?? 3) <= 2) signals.push({ label: 'Movement', rank: nlp.movement_rank, evidence: nlp.movement_evidence ?? [], field: 'movement_present', acceptValue: 'yes' });
  if ((nlp.weapon_rank ?? 3) <= 2) signals.push({ label: 'Weapon', rank: nlp.weapon_rank, evidence: nlp.weapon_evidence ?? [], field: 'threats_present', acceptValue: 'yes' });
  if (signals.length === 0) return null;

  const btnStyle = (color: string, bg: string, border: string): import('react').CSSProperties => ({
    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
    border: `1px solid ${border}`, background: bg, color, cursor: 'pointer', letterSpacing: '0.03em', whiteSpace: 'nowrap',
  });
  const sourceId = nlp._source_report_id as string | undefined;
  const analyzedAt = nlp._analyzed_at as string | undefined;
  const provenanceMatch = !sourceId || !reportId || sourceId === reportId;
  const analyzedLabel = analyzedAt ? new Date(analyzedAt).toLocaleDateString('en-CA') : null;

  return (
    <div style={{ marginBottom: 14, borderRadius: 7, border: `1px solid ${provenanceMatch ? 'var(--amber-border)' : '#FCA5A5'}`, overflow: 'hidden' }}>
      {!provenanceMatch && (
        <div style={{ padding: '5px 12px', background: '#FEF2F2', borderBottom: '1px solid #FCA5A5', fontSize: 10, color: '#DC2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>⚠</span>
          <span>NLP data was analyzed for a different record ({sourceId}) — re-run NLP Analyze to generate signals for this case.</span>
        </div>
      )}
      <div style={{ padding: '6px 12px', background: provenanceMatch ? 'var(--amber-pale)' : '#FFF7F7', borderBottom: `1px solid ${provenanceMatch ? 'var(--amber-border)' : '#FCA5A5'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: provenanceMatch ? 'var(--amber)' : '#DC2626' }}>NLP Signals — Provisional</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: provenanceMatch ? 'var(--amber)' : '#DC2626', opacity: 0.85 }}>
            {provenanceMatch ? (analyzedLabel ? `Analyzed ${analyzedLabel} · analyst review required` : 'Analyst review required before coding') : 'Stale — does not reflect current record'}
          </span>
          {onSetField && provenanceMatch && signals.some(sig => {
            const val = getFieldValue ? getFieldValue(sig.field) : '';
            return val !== 'yes' && val !== 'probable' && val !== 'inferred' && val !== 'no' && val !== 'unclear';
          }) && (
            <button
              type="button"
              style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--green-border)', background: 'var(--green-pale)', color: 'var(--green)', cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.03em' }}
              onClick={() => signals.forEach(sig => {
                const val = getFieldValue ? getFieldValue(sig.field) : '';
                if (val !== 'yes' && val !== 'probable' && val !== 'inferred' && val !== 'no' && val !== 'unclear') {
                  onSetField(sig.field, sig.acceptValue);
                }
              })}
            >
              Accept all pending
            </button>
          )}
        </div>
      </div>
      {signals.map((sig) => {
        const isStrong = sig.rank === 1;
        const currentVal = getFieldValue ? getFieldValue(sig.field) : '';
        const syncStatus: 'accepted' | 'rejected' | 'unclear' | 'pending' =
          (currentVal === 'yes' || currentVal === 'probable' || currentVal === 'inferred') ? 'accepted'
          : currentVal === 'no' ? 'rejected' : currentVal === 'unclear' ? 'unclear' : 'pending';
        const syncCfg = {
          accepted: { label: 'Field: yes — accepted', color: 'var(--green)', bg: 'var(--green-pale)', border: 'var(--green-border)' },
          rejected: { label: 'Field: no — rejected', color: 'var(--text-3)', bg: 'var(--surface-2)', border: 'var(--border)' },
          unclear:  { label: 'Field: unclear', color: 'var(--amber)', bg: 'var(--amber-pale)', border: 'var(--amber-border)' },
          pending:  { label: 'Not yet coded', color: 'var(--text-3)', bg: 'var(--surface-2)', border: 'var(--border)' },
        }[syncStatus];
        return (
          <div key={sig.label} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: isStrong ? 'var(--accent-pale)' : 'var(--amber-pale)', color: isStrong ? 'var(--accent)' : 'var(--amber)', border: `1px solid ${isStrong ? 'var(--accent-border)' : 'var(--amber-border)'}`, letterSpacing: '0.04em' }}>
              {isStrong ? 'Strong signal' : 'Possible signal'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>{sig.label}</span>
                <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)' }}>→ {sig.field.replace(/_/g, ' ')} field</span>
                <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 3, color: syncCfg.color, background: syncCfg.bg, border: `1px solid ${syncCfg.border}`, letterSpacing: '0.03em', textDecoration: syncStatus === 'rejected' ? 'line-through' : 'none' }}>{syncCfg.label}</span>
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
            {onSetField && syncStatus !== 'accepted' && syncStatus !== 'rejected' && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'flex-start', paddingTop: 1 }}>
                <button type="button" style={btnStyle('var(--green)', 'var(--green-pale)', 'var(--green-border)')} onClick={() => onSetField(sig.field, sig.acceptValue)}>Accept</button>
                <button type="button" style={btnStyle('var(--text-3)', 'var(--surface-2)', 'var(--border)')} onClick={() => onSetField(sig.field, 'unclear')}>Unclear</button>
                <button type="button" style={btnStyle('var(--red, #DC2626)', 'var(--red-pale, #FEF2F2)', 'var(--red-border, #FCA5A5)')} onClick={() => onSetField(sig.field, 'no')}>Reject</button>
              </div>
            )}
            {onSetField && (syncStatus === 'accepted' || syncStatus === 'rejected') && (
              <div style={{ flexShrink: 0, paddingTop: 1 }}>
                <button type="button" style={btnStyle('var(--text-3)', 'var(--surface-2)', 'var(--border)')} onClick={() => onSetField(sig.field, '')}>Revisit</button>
              </div>
            )}
          </div>
        );
      })}
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
  negotiation: '#6B7280', agreement: '#6B7280', refusal: '#D97706', pressure: '#EA580C',
  threats: '#DC2626', physical: '#B91C1C', sexual_violence: '#7F1D1D', robbery: '#7F1D1D',
};

function EscalationArc({ esc }: { esc: Record<string, any> }) {
  if (!esc || !esc.stages || esc.stages.length === 0) return null;
  return (
    <div style={{ margin: '6px 0 10px', borderRadius: 7, border: '1px solid var(--amber-border)', overflow: 'hidden' }}>
      <div style={{ padding: '5px 12px', background: 'var(--amber-pale)', borderBottom: '1px solid var(--amber-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--amber)' }}>NLP — Escalation Arc</span>
        <span style={{ fontSize: 9.5, color: 'var(--amber)', opacity: 0.85 }}>Machine detection only · not analyst confirmed</span>
      </div>
      <div style={{ padding: '8px 12px', background: 'var(--surface-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
        {STAGE_ORDER.map((stage, i) => {
          const active = (esc.stages as string[]).includes(stage);
          const color = active ? STAGE_COLOR[stage] : 'var(--border)';
          const isLast = i === STAGE_ORDER.length - 1;
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center' }}>
              <div title={active ? `${STAGE_LABEL[stage]} — detected` : `${STAGE_LABEL[stage]} — not detected`} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10.5, fontWeight: active ? 600 : 400, background: active ? `${color}20` : 'transparent', color: active ? color : 'var(--border-mid)', border: `1px solid ${active ? color + '60' : 'var(--border)'}`, whiteSpace: 'nowrap', cursor: 'default', opacity: active ? 1 : 0.45 }}>
                {STAGE_LABEL[stage]}
              </div>
              {!isLast && <div style={{ width: 14, height: 1, background: active ? `${color}60` : 'var(--border)', margin: '0 1px', flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
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
// ── Multi-checkbox field (pipe-delimited storage) ─────────────────────────────
function MultiCheckboxField({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const selected = new Set(String(value || '').split('|').filter(Boolean).map(s => s.trim()));
  const toggle = (opt: string) => {
    const next = new Set(selected);
    next.has(opt) ? next.delete(opt) : next.add(opt);
    onChange([...next].join('|'));
  };
  return (
    <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {options.map(opt => {
          const active = selected.has(opt);
          return (
            <label key={opt} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12,
              padding: '4px 10px', borderRadius: 5, cursor: 'pointer', userSelect: 'none',
              background: active ? 'var(--accent)' : 'var(--surface-2)',
              color: active ? '#fff' : 'var(--text-2)',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              fontWeight: active ? 600 : 400,
              transition: 'all 0.12s',
            }}>
              <input type="checkbox" checked={active} onChange={() => toggle(opt)}
                style={{ width: 11, height: 11, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />
              {opt}
            </label>
          );
        })}
      </div>
      {selected.size === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 4 }}>— none selected</div>
      )}
    </div>
  );
}

// Returns the appropriate "data absent" label for a summary section based on coded field values.
// Precedence: no → no-indicator; unclear/not-stated → insufficient; unknown → unknown; else → not-coded
function sectionDataState(fieldVals: (string | undefined)[]): 'not-coded' | 'no-indicator' | 'insufficient' | 'unknown' {
  const vals = fieldVals.map(v => (v || '').trim().toLowerCase());
  if (vals.some(v => v === 'no' || v === 'not coded')) return 'no-indicator';
  if (vals.some(v => v === 'unclear' || v === 'unclear / not stated' || v === 'insufficient information')) return 'insufficient';
  if (vals.some(v => v === 'unknown' || v === 'unknown / unclear')) return 'unknown';
  return 'not-coded';
}

function EmptyState({ state }: { state: 'not-coded' | 'no-indicator' | 'insufficient' | 'unknown' }) {
  const map = {
    'not-coded':    '— Not coded',
    'no-indicator': '— No indicator in report',
    'insufficient': '— Insufficient information',
    'unknown':      '— Unknown',
  };
  return <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>{map[state]}</div>;
}

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


function SummarySectionBox({ title, children, accent }: {
  title: string; children: React.ReactNode; accent?: boolean;
}) {
  return (
    <div style={{ borderRadius: 7, border: `1px solid ${accent ? 'var(--accent-border, #bfdbfe)' : 'var(--border)'}`,
      background: 'var(--surface)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '5px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
        textTransform: 'uppercase', color: 'var(--text-3)', background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)' }}>{title}</div>
      <div style={{ padding: '10px 12px' }}>{children}</div>
    </div>
  );
}

function SummaryKVRow({ label, value, prov }: {
  label: string; value: string; prov: 'coded' | 'provisional' | 'unset';
}) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.4, marginBottom: 4 }}>
      <span style={{ color: 'var(--text-3)', flexShrink: 0, minWidth: 130 }}>{label}</span>
      <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>
        {value}<ProvenancePill p={prov} />
      </span>
    </div>
  );
}

function GisAddressBlock({ heading, raw, normalized, precision, source, confidence, lat, lon }: {
  heading: string; raw: string; normalized: string; precision: string;
  source: string; confidence: string; lat?: number | null; lon?: number | null;
}) {
  const hasAnything = raw || normalized || lat != null;
  if (!hasAnything) return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
        letterSpacing: '0.05em', marginBottom: 3 }}>{heading}</div>
      <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>— not geocoded</span>
    </div>
  );
  const confColor = confidence === 'high' ? 'var(--green)' : confidence === 'medium' ? 'var(--amber)' : confidence === 'low' ? '#c0392b' : 'var(--text-3)';
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
          letterSpacing: '0.05em' }}>{heading}</span>
        {confidence && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
          color: confColor, border: `1px solid ${confColor}`, background: 'var(--surface-2)' }}>{confidence} confidence</span>}
        {precision && <span style={{ fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic' }}>{precision} precision</span>}
      </div>
      {raw && <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{raw}</div>}
      {normalized && normalized !== raw && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>→ {normalized}</div>}
      {lat != null && lon != null && (Math.abs(lat) > 0.001 || Math.abs(lon) > 0.001) && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 2 }}>
          {lat.toFixed(5)}, {lon.toFixed(5)}
          {source && <span style={{ marginLeft: 6, fontStyle: 'italic', fontFamily: 'inherit' }}>({source})</span>}
        </div>
      )}
    </div>
  );
}

function SummaryTab({ fields, analystName, analystSummary, tags, reportId }: {
  fields: Partial<Report>;
  analystName?: string;
  analystSummary?: string;
  tags?: string[];
  reportId?: string;
}) {
  const fp = (fields.field_provenance as Record<string, string>) ?? {};

  // ── Coding completeness ────────────────────────────────────────────────────
  const _v = (field: keyof Report) => (fields[field] as string || '').trim();
  const completeness: { label: string; status: 'complete' | 'partial' | 'not-coded' }[] = [
    { label: 'Basics',    status: (_v('incident_date') && _v('city') && _v('source_organization')) ? 'complete' : (_v('incident_date') || _v('city')) ? 'partial' : 'not-coded' },
    { label: 'Stages',    status: _v('highest_stage_reached') ? 'complete' : 'not-coded' },
    { label: 'Encounter', status: (_v('initial_approach_type') && _v('exit_type')) ? 'complete' : (_v('initial_approach_type') || _v('negotiation_present')) ? 'partial' : 'not-coded' },
    { label: 'Mobility',  status: _v('movement_present') ? 'complete' : 'not-coded' },
    { label: 'Suspect',   status: (_v('suspect_gender') && _v('suspect_age_estimate')) ? 'complete' : (_v('suspect_count') || _v('suspect_gender')) ? 'partial' : 'not-coded' },
    { label: 'Vehicle',   status: _v('vehicle_present') ? 'complete' : 'not-coded' },
    { label: 'Narrative', status: _v('summary_analytic') ? 'complete' : (_v('key_quotes') || _v('coder_notes')) ? 'partial' : 'not-coded' },
    { label: 'GIS',       status: (fields.lat_initial != null || fields.lat_incident != null) ? 'complete' : (_v('initial_contact_address_raw') || _v('incident_address_raw')) ? 'partial' : 'not-coded' },
    { label: 'Flags',     status: (['concern_trafficking','concern_third_party_control','concern_grooming','concern_organized_offending','concern_repeat_suspect','concern_repeat_vehicle'] as (keyof Report)[]).some(f => _v(f) !== '') ? 'complete' : 'not-coded' },
  ];

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
    ['Stealthing',              'stealthing',                   new Set(['yes'])],
    ['Robbery / theft',         'robbery_theft',                new Set(['yes'])],
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
  if (ctrl) addMob(`Movement control: ${ctrl}`, 'offender_control_over_movement');
  const whoCtrl = (fields.who_controlled_movement || '').trim();
  if (whoCtrl) addMob(`Movement controlled by: ${whoCtrl}`, 'who_controlled_movement');
  const startLoc = (fields.start_location_type || '').trim();
  const destLoc  = (fields.destination_location_type || '').trim();
  if (startLoc && destLoc) mobItems.push({ text: `Route: ${startLoc} → ${destLoc}`, prov: 'coded' });
  else if (startLoc)       mobItems.push({ text: `Start: ${startLoc}`, prov: 'coded' });
  else if (destLoc)        mobItems.push({ text: `Destination: ${destLoc}`, prov: 'coded' });
  const movConf = (fields.movement_confidence || '').trim();
  if (movConf) addMob(`Movement confidence: ${movConf}`, 'movement_confidence');
  const movNotes = (fields.movement_notes || '').trim();
  if (movNotes) addMob(`Notes: ${movNotes.slice(0, 120)}`, 'movement_notes');
  if (fields.unexplained_relocation === 'yes') addMob('Unexplained relocation', 'unexplained_relocation');

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
  const primaryHarm = (fields.primary_harm as string || '').trim();
  if (primaryHarm) harmItems.push({ text: `Primary harm: ${primaryHarm}`, prov: _prov(fp, 'primary_harm') });
  if (fields.multi_harm_flag === 'yes') harmItems.push({ text: 'Multi-harm case flagged', prov: _prov(fp, 'multi_harm_flag') });
  const harmFields: [string, string][] = [
    ['coercion_present', 'Coercion'], ['threats_present', 'Threats'],
    ['intimidation_present', 'Intimidation'], ['verbal_abuse', 'Verbal abuse'],
    ['verbal_abuse_before_violence', 'Verbal abuse before violence'],
    ['physical_force', 'Physical force'], ['sexual_assault', 'Sexual assault'],
    ['stealthing', 'Stealthing'], ['robbery_theft', 'Robbery / theft'],
  ];
  for (const [field, label] of harmFields) {
    if (fields[field as keyof Report] === 'yes')
      harmItems.push({ text: label, prov: _prov(fp, field) });
  }
  const trigger = (fields.escalation_trigger || '').trim();
  if (trigger) harmItems.push({ text: `Escalation trigger: ${trigger.slice(0, 100)}`, prov: 'coded' });
  const escPt   = (fields.escalation_point || '').trim();
  if (escPt)   harmItems.push({ text: `Escalation point: ${escPt}`, prov: 'coded' });
  const tPoint  = (fields.turning_point || '').trim();
  if (tPoint)  harmItems.push({ text: `Turning point: ${tPoint}`, prov: _prov(fp, 'turning_point') });
  const newHarmFields: [string, string][] = [
    ['loss_of_consciousness',    'Loss of consciousness'],
    ['non_consensual_substance', 'Non-consensual substance'],
    ['forced_movement_dragging', 'Forced movement / dragging'],
    ['restraint_confinement',    'Restraint / confinement'],
    ['weapon_present_used',      'Weapon present or used'],
    ['choking_strangulation',    'Choking / strangulation'],
    ['prevented_exit',           'Exit prevented'],
  ];
  for (const [field, label] of newHarmFields) {
    if (fields[field as keyof Report] === 'yes')
      harmItems.push({ text: label, prov: _prov(fp, field) });
  }
  const subNotes = (fields.substance_administration_notes || '').trim();
  if (subNotes) harmItems.push({ text: `Substance notes: ${subNotes.slice(0, 120)}`, prov: _prov(fp, 'substance_administration_notes') });

  const boundaryVal = (fields.boundary_issue_present || '') as string;
  if (_broadPos(boundaryVal)) harmItems.push({ text: `Boundary issue present (${boundaryVal})`, prov: _prov(fp, 'boundary_issue_present') });
  const movRelVal = (fields.movement_relocation_present || '') as string;
  if (_broadPos(movRelVal)) harmItems.push({ text: `Movement / relocation present (${movRelVal})`, prov: _prov(fp, 'movement_relocation_present') });

  // Early escalation cues (intimidation_present and verbal_abuse_before_violence already in harmFields)
  const escCueFields: [string, string][] = [
    ['repeated_pressure', 'Repeated pressure'],
    ['abrupt_tone_change', 'Abrupt tone change'],
  ];
  for (const [field, label] of escCueFields) {
    if (fields[field as keyof Report] === 'yes')
      harmItems.push({ text: label, prov: _prov(fp, field) });
  }

  const keyExcerpts = (fields.key_supporting_excerpts || '').trim();
  if (keyExcerpts) harmItems.push({ text: `Supporting excerpt: ${keyExcerpts.slice(0, 200)}`, prov: _prov(fp, 'key_supporting_excerpts') });

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
  const resEndpoint = (fields.resolution_endpoint || '').trim();
  if (resEndpoint) exitItems.push({ text: `Resolution: ${resEndpoint}`, prov: _prov(fp, 'resolution_endpoint') });

  const bulletList = (items: SItem[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
          <span style={{ marginRight: 6, color: 'var(--text-3)', flexShrink: 0 }}>·</span>
          <span>{item.text}<ProvenancePill p={item.prov} /></span>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ padding: '20px 24px', maxWidth: 920 }}>

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

      {/* Case header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        marginBottom: 20, padding: '10px 14px', borderRadius: 7,
        background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {reportId && <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{reportId}</span>}
        {(() => {
          const status = (fields.coding_status || 'uncoded') as string;
          const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.uncoded;
          return <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>;
        })()}
        {fields.confidence_level && (
          <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Confidence: <strong style={{ color: 'var(--text-1)' }}>{fields.confidence_level}</strong></span>
        )}
        {analystName && (
          <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Analyst: <strong style={{ color: 'var(--text-1)' }}>{analystName}</strong></span>
        )}
        <span style={{ borderLeft: '1px solid var(--border)', alignSelf: 'stretch', margin: '0 2px' }} />
        {fields.incident_date && (
          <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
            {fields.incident_date}
            {fields.day_of_week && <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>({fields.day_of_week})</span>}
          </span>
        )}
        {fields.city && (
          <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
            {fields.city}{fields.neighbourhood ? `, ${fields.neighbourhood}` : ''}
          </span>
        )}
      </div>

      {/* Coding completeness chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 18 }}>
        {completeness.map(({ label, status }) => {
          const cfg = status === 'complete'
            ? { color: 'var(--green)', bg: 'var(--green-pale)', border: 'var(--green-border)', dot: '●' }
            : status === 'partial'
            ? { color: 'var(--amber)', bg: 'var(--amber-pale)', border: 'var(--amber-border)', dot: '◐' }
            : { color: 'var(--text-3)', bg: 'var(--surface-2)', border: 'var(--border)', dot: '○' };
          return (
            <span key={label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
              color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
            }}>
              <span style={{ fontSize: 9, lineHeight: 1 }}>{cfg.dot}</span>
              {label}
            </span>
          );
        })}
      </div>

      {/* Incident Overview */}
      {(fields.primary_incident_type || fields.overall_severity || fields.overall_incident_summary || fields.stage_coding_suitability || fields.sequence_clarity) && (
        <div style={{ marginBottom: 20, padding: '12px 14px', borderRadius: 7, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Incident Overview</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: (fields.overall_incident_summary || fields.stage_coding_suitability || fields.sequence_clarity) ? 10 : 0 }}>
            {fields.primary_incident_type && (
              <span style={{ fontSize: 12.5, fontWeight: 600, padding: '3px 10px', borderRadius: 5, background: 'var(--accent-pale)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
                {fields.primary_incident_type as string}
              </span>
            )}
            {fields.overall_severity && (() => {
              const sev = fields.overall_severity as string;
              const isCritical = sev.includes('severe') || sev.includes('high risk');
              const isHigh = sev.includes('high concern');
              const color = isCritical ? '#A51F1F' : isHigh ? 'var(--amber)' : 'var(--green)';
              const bg = isCritical ? '#FDECEA' : isHigh ? 'var(--amber-pale)' : 'var(--green-pale)';
              const border = isCritical ? '#FBBBB0' : isHigh ? 'var(--amber-border)' : 'var(--green-border)';
              return (
                <span style={{ fontSize: 12.5, fontWeight: 600, padding: '3px 10px', borderRadius: 5, background: bg, color, border: `1px solid ${border}` }}>
                  {sev}
                </span>
              );
            })()}
          </div>
          {fields.overall_incident_summary && (
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, fontStyle: 'italic', marginBottom: 8, borderLeft: '2px solid var(--gold, #B38B59)', paddingLeft: 10 }}>
              {fields.overall_incident_summary as string}
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {fields.stage_coding_suitability && (
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Stage suitability: <strong style={{ color: 'var(--text-2)' }}>{fields.stage_coding_suitability as string}</strong></span>
            )}
            {fields.sequence_clarity && (
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Sequence clarity: <strong style={{ color: 'var(--text-2)' }}>{fields.sequence_clarity as string}</strong></span>
            )}
          </div>
        </div>
      )}

      {/* Encounter sequence */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Encounter progression</div>
          {(fields.highest_stage_reached) && (
            String(fields.highest_stage_reached).split('|').filter(Boolean).map(stage => (
              <span key={stage} style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 5,
                background: 'var(--accent-pale)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
                {stage.trim()}
              </span>
            ))
          )}
          {(fields.turning_point) && (
            <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 5,
              background: 'var(--amber-pale)', color: 'var(--amber)', border: '1px solid var(--amber-border)' }}>
              Turning point: {fields.turning_point as string}
            </span>
          )}
        </div>
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

      {/* Encounter Sequence Output */}
      <SummarySectionBox title="Encounter Sequence Output">
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, lineHeight: 1.55, borderLeft: '2px solid var(--border)', paddingLeft: 8 }}>
          This section shows what the case becomes after coding. The auto-generated chain is derived from encounter fields.
          The sequence pattern is the analyst-written summary of the full coded sequence.
          Missing or unclear stages do not mean those stages did not occur — use the coding limitations field to document what the report could not support.
        </div>
        {/* Stage coding suitability + reconstructability */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {fields.stage_coding_suitability && (
            <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 5,
              background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
              Stage coding: {fields.stage_coding_suitability as string}
            </span>
          )}
          {fields.sequence_reconstructable && (
            <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 5,
              background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
              Sequence reconstructable: {fields.sequence_reconstructable as string}
            </span>
          )}
          {fields.narrative_detail_level && (
            <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 5,
              background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
              Narrative detail: {fields.narrative_detail_level as string}
            </span>
          )}
        </div>
        {/* Analyst-written sequence pattern */}
        {fields.sequence_pattern ? (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: 4 }}>Coded sequence pattern</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.55, whiteSpace: 'pre-wrap', borderLeft: '2px solid var(--accent, #3B82F6)', paddingLeft: 10 }}>
              {fields.sequence_pattern as string}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', marginBottom: 8 }}>
            No sequence pattern entered yet — add in the Narrative Excerpts tab.
          </div>
        )}
        {/* Coding limitations */}
        {fields.main_data_limitation && (fields.main_data_limitation as string) !== 'none apparent' && (
          <div style={{ padding: '6px 10px', borderRadius: 5, background: 'var(--amber-pale)', border: '1px solid var(--amber-border)', fontSize: 11.5, color: 'var(--amber)', marginTop: 4 }}>
            <strong style={{ fontWeight: 600 }}>Coding limitation:</strong> {fields.main_data_limitation as string}
            {fields.data_quality_notes && <span style={{ marginLeft: 6, color: 'var(--text-3)' }}>— {(fields.data_quality_notes as string).slice(0, 200)}</span>}
          </div>
        )}
      </SummarySectionBox>

      {/* Row A: Harm | Suspect + Vehicle */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <SummarySectionBox title="Harm Indicators">
          {harmItems.length > 0
            ? bulletList(harmItems)
            : <EmptyState state={sectionDataState([
                'coercion_present','threats_present','intimidation_present','verbal_abuse',
                'physical_force','sexual_assault','stealthing','robbery_theft',
                'loss_of_consciousness','non_consensual_substance','forced_movement_dragging',
                'restraint_confinement','weapon_present_used','choking_strangulation','prevented_exit',
              ].map(f => fields[f as keyof Report] as string | undefined))} />}
        </SummarySectionBox>
        <div>
          <SummarySectionBox title="Suspect">
            {(() => {
              const suspectFields: (keyof Report)[] = ['suspect_count','suspect_gender','suspect_age_estimate','suspect_race_ethnicity','suspect_description_text'];
              const labels: Record<string, string> = {
                suspect_count: 'Count', suspect_gender: 'Gender', suspect_age_estimate: 'Age estimate',
                suspect_race_ethnicity: 'Race / ethnicity', suspect_description_text: 'Description',
              };
              const rows = suspectFields.map((field) => {
                const raw = String(fields[field] || '');
                const val = field === 'suspect_description_text' && raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
                return <SummaryKVRow key={field} label={labels[field]} value={val} prov={_prov(fp, field)} />;
              });
              const hasAny = suspectFields.some(f => (fields[f] as string || '').trim());
              return hasAny ? rows : <EmptyState state={sectionDataState(suspectFields.map(f => fields[f] as string | undefined))} />;
            })()}
          </SummarySectionBox>
          <SummarySectionBox title="Vehicle">
            {(() => {
              const vehicleFields: (keyof Report)[] = ['vehicle_present','vehicle_make','vehicle_model','vehicle_colour','plate_partial','vehicle_driver_role'];
              const labels: Record<string, string> = {
                vehicle_present: 'Present', vehicle_make: 'Make', vehicle_model: 'Model',
                vehicle_colour: 'Colour', plate_partial: 'Plate (partial)', vehicle_driver_role: 'Driver role',
              };
              const rows = vehicleFields.map((field) =>
                <SummaryKVRow key={field} label={labels[field]} value={String(fields[field] || '')} prov={_prov(fp, field)} />
              );
              const hasAny = vehicleFields.some(f => (fields[f] as string || '').trim());
              const repeatFlags = (
                <>
                  {fields.repeat_suspect_flag === 'yes' && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>⚑ Repeat suspect flagged</div>
                  )}
                  {fields.repeat_vehicle_flag === 'yes' && (
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>⚑ Repeat vehicle flagged</div>
                  )}
                </>
              );
              return hasAny
                ? <>{rows}{repeatFlags}</>
                : <><EmptyState state={sectionDataState(['vehicle_present'].map(f => fields[f as keyof Report] as string | undefined))} />{repeatFlags}</>;
            })()}
          </SummarySectionBox>
        </div>
      </div>

      {/* Row B: Exit/Outcome | Mobility */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <SummarySectionBox title="Exit / Outcome">
          {exitItems.length > 0
            ? bulletList(exitItems)
            : <EmptyState state={sectionDataState([fields.exit_type as string | undefined])} />}
        </SummarySectionBox>
        <SummarySectionBox title="Mobility Pathway">
          {mobItems.length > 0
            ? bulletList(mobItems)
            : <EmptyState state={sectionDataState([fields.movement_present as string | undefined])} />}
        </SummarySectionBox>
      </div>

      {/* Row C: Environment | VAWG flags */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <SummarySectionBox title="Environment Context">
          {envItems.length > 0
            ? bulletList(envItems)
            : <EmptyState state={sectionDataState([fields.indoor_outdoor as string | undefined, fields.public_private as string | undefined])} />}
        </SummarySectionBox>
        <SummarySectionBox title="Concern & Exploitation Flags">
          {(() => {
            const flagItems: SItem[] = [];
            // New structured concern flags (Suspect/Vehicle tab)
            const concernFields: [keyof Report, string][] = [
              ['concern_trafficking',        'Trafficking / exploitation concern'],
              ['concern_third_party_control','Third-party control'],
              ['concern_grooming',           'Grooming / recruitment concern'],
              ['concern_organized_offending','Organized / group offending'],
              ['concern_repeat_suspect',     'Repeat suspect concern'],
              ['concern_repeat_vehicle',     'Repeat vehicle concern'],
              ['concern_urgent_public_safety','Urgent public safety concern'],
              ['concern_bulletin_suitable',  'Bulletin suitable'],
            ];
            for (const [field, label] of concernFields) {
              const val = _v(field as keyof Report);
              if (val && val !== '') flagItems.push({ text: `${label} — ${val}`, prov: _prov(fp, field as string) });
            }
            const rationale = (fields.concern_flag_rationale || '').trim();
            if (rationale) flagItems.push({ text: `Rationale: ${rationale.slice(0, 180)}`, prov: _prov(fp, 'concern_flag_rationale') });
            // Legacy VAWG fields from Encounter tab (still captured)
            const vawgFlagFields: [keyof Report, string][] = [
              ['trafficking_exploitation_concern',    'Trafficking concern (encounter)'],
              ['third_party_control_indicated',       'Third-party control (encounter)'],
              ['worker_appears_controlled',           'Worker appears controlled'],
              ['client_connected_to_controller',      'Client connected to controller'],
              ['movement_to_unknown_unsafe_location', 'Movement to unknown / unsafe location'],
              ['worker_unaware_how_arrived',          'Worker unaware how arrived'],
              ['grooming_recruitment_concern',        'Grooming concern (encounter)'],
              ['repeat_targeting_concern',            'Repeat targeting concern'],
              ['multiple_women_referenced',           'Multiple women referenced'],
              ['organized_group_offending_concern',   'Organized offending concern (encounter)'],
            ];
            for (const [field, label] of vawgFlagFields) {
              if (_broadPos(fields[field] as string | undefined))
                flagItems.push({ text: `${label} (${fields[field]})`, prov: _prov(fp, field as string) });
            }
            const bull = (fields.public_safety_bulletin_suitability || '') as string;
            const urg = (fields.public_safety_urgency_level || '') as string;
            if (bull && bull !== 'not coded') flagItems.push({ text: `Bulletin: ${bull}`, prov: _prov(fp, 'public_safety_bulletin_suitability') });
            if (urg && urg !== 'not coded') flagItems.push({ text: `Urgency: ${urg}`, prov: _prov(fp, 'public_safety_urgency_level') });
            const excerpt = (fields.vawg_key_excerpts || '').trim();
            if (excerpt) flagItems.push({ text: `Excerpt: ${excerpt.slice(0, 160)}`, prov: _prov(fp, 'vawg_key_excerpts') });
            return flagItems.length > 0
              ? bulletList(flagItems)
              : <EmptyState state={sectionDataState(
                  (['concern_trafficking','concern_third_party_control','concern_grooming','concern_organized_offending',
                    'concern_repeat_suspect','concern_repeat_vehicle','concern_urgent_public_safety','concern_bulletin_suitable'] as (keyof Report)[])
                    .map(f => fields[f] as string | undefined)
                )} />;
          })()}
        </SummarySectionBox>
      </div>

      {/* Analyst Notes — full width */}
      <SummarySectionBox title="Analyst Notes" accent>
        {analystSummary && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: 4 }}>Analyst summary</div>
            <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.55, whiteSpace: 'pre-wrap', borderLeft: '2px solid var(--gold, #B38B59)', paddingLeft: 10 }}>{analystSummary}</div>
          </div>
        )}
        {fields.summary_analytic && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              Summary analytic
              {(() => {
                const state = fp?.['summary_analytic'] ?? 'unset';
                const isAnalyst = state === 'analyst_filled' || state === 'reviewed';
                const label = isAnalyst ? 'Analyst entered' : state === 'ai_suggested' ? 'System generated' : 'Source unknown';
                const color = isAnalyst ? 'var(--green)' : 'var(--amber)';
                const bg = isAnalyst ? 'var(--green-pale)' : 'var(--amber-pale)';
                const border = isAnalyst ? 'var(--green-border)' : 'var(--amber-border)';
                return <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: bg, color, border: `1px solid ${border}`, textTransform: 'none', letterSpacing: 0 }}>{label}</span>;
              })()}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{fields.summary_analytic}</div>
          </div>
        )}
        {fields.key_quotes && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: 4 }}>Key quotes</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, fontStyle: 'italic', whiteSpace: 'pre-wrap', borderLeft: '2px solid var(--border)', paddingLeft: 10 }}>{fields.key_quotes}</div>
          </div>
        )}
        {(fields.coder_notes || fields.uncertainty_notes) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {fields.coder_notes && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: 4 }}>Coder notes</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{fields.coder_notes}</div>
              </div>
            )}
            {fields.uncertainty_notes && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: 4 }}>Uncertainty notes</div>
                <div style={{ fontSize: 12, color: 'var(--amber)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{fields.uncertainty_notes}</div>
              </div>
            )}
          </div>
        )}
        {!analystSummary && !fields.summary_analytic && !fields.key_quotes &&
          !fields.coder_notes && !fields.uncertainty_notes && (
          <EmptyState state="not-coded" />
        )}
      </SummarySectionBox>

      {/* GIS Summary — full width */}
      <SummarySectionBox title="GIS — Address Summary">
        {fields.geocode_status && (
          <div style={{ marginBottom: 10, fontSize: 11.5 }}>
            <span style={{ color: 'var(--text-3)', marginRight: 6 }}>Geocode status:</span>
            <span style={{ fontWeight: 600, color: fields.geocode_status === 'complete' ? 'var(--green)' : fields.geocode_status === 'partial' ? 'var(--amber)' : 'var(--text-2)' }}>{fields.geocode_status}</span>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0 16px' }}>
          <GisAddressBlock heading="Initial Contact"
            raw={fields.initial_contact_address_raw || ''} normalized={fields.initial_contact_address_normalized || ''}
            precision={fields.initial_contact_precision || ''} source={fields.initial_contact_source || ''}
            confidence={fields.initial_contact_confidence || ''} lat={fields.lat_initial} lon={fields.lon_initial} />
          <GisAddressBlock heading="Incident"
            raw={fields.incident_address_raw || ''} normalized={fields.incident_address_normalized || ''}
            precision={fields.incident_precision || ''} source={fields.incident_source || ''}
            confidence={fields.incident_confidence || ''} lat={fields.lat_incident} lon={fields.lon_incident} />
          <GisAddressBlock heading="Destination"
            raw={fields.destination_address_raw || ''} normalized={fields.destination_address_normalized || ''}
            precision={fields.destination_precision || ''} source={fields.destination_source || ''}
            confidence={fields.destination_confidence || ''} lat={fields.lat_destination} lon={fields.lon_destination} />
        </div>
      </SummarySectionBox>

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
          paddingTop: 14, marginTop: 6, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.05em', color: 'var(--text-3)', marginRight: 4 }}>Tags</span>
          {tags.map((t) => (
            <span key={t} style={{ padding: '2px 9px', borderRadius: 20,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text-2)', fontSize: 11.5 }}>{t}</span>
          ))}
        </div>
      )}

    </div>
  );
}

type Section = 'basics' | 'codability' | 'stages' | 'encounter' | 'mobility' | 'suspect' | 'narrative' | 'gis' | 'summary';

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
  const [isDirty, setIsDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [analyzingNlp, setAnalyzingNlp] = useState(false);
  const [nlpError, setNlpError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Section>('basics');
  const [showGisMap, setShowGisMap] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savedAgoText, setSavedAgoText] = useState('');
  const [caseList, setCaseList] = useState<string[]>([]);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current ref so the autosave timer never calls a stale closure
  const handleSaveRef = useRef<(silent?: boolean) => Promise<void>>(async () => {});
  const toast = useToast();
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [cleanedNarrative, setCleanedNarrative] = useState('');
  const [showCleaned, setShowCleaned] = useState(false);
  const [showBulletinText, setShowBulletinText] = useState(false);
  const [nlp, setNlp] = useState<Record<string, any>>({});
  const [weather, setWeather] = useState<Record<string, any>>({});
  const [provenance, setProvenance] = useState<Record<string, string>>({});
  const [analystSummary, setAnalystSummary] = useState('');
  const [showAnalystSummary, setShowAnalystSummary] = useState(false);
  const [leftWidth, setLeftWidth] = useState(45); // percent of split container
  const [showNlpHighlights, setShowNlpHighlights] = useState(false);
  const [hlCategories, setHlCategories] = useState<Set<string>>(new Set(['coercion','threat','movement','harm','location','payment']));
  const [copiedNarrative, setCopiedNarrative] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const narrativeTextareaRef = useRef<HTMLTextAreaElement>(null);

  const copyNarrativeToClipboard = useCallback(() => {
    navigator.clipboard.writeText(narrative).then(() => {
      setCopiedNarrative(true);
      setTimeout(() => setCopiedNarrative(false), 2000);
    }).catch(() => {
      setCopiedNarrative(true);
      setTimeout(() => setCopiedNarrative(false), 2000);
    });
  }, [narrative]);

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
    const cleanup = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', cleanup);
      document.removeEventListener('mouseleave', cleanup);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', cleanup);
    document.addEventListener('mouseleave', cleanup);
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
          'suspect_age_estimate','vehicle_present','vehicle_make','vehicle_year','vehicle_model','vehicle_colour',
          'vehicle_description','plate_partial','repeat_suspect_flag','repeat_vehicle_flag','human_trafficking_flag',
          'escalation_point','resolution_endpoint','highest_stage_reached','turning_point','summary_analytic','key_quotes','coder_notes','uncertainty_notes',
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
          // New harm fields
          'loss_of_consciousness','non_consensual_substance','substance_administration_notes',
          'forced_movement_dragging','restraint_confinement','weapon_present_used',
          'choking_strangulation','prevented_exit','unexplained_relocation','geocode_status',
          // Incident overview (Encounter tab)
          'primary_incident_type','overall_severity','overall_incident_summary',
          'stage_coding_suitability','sequence_clarity',
          'boundary_issue_present','movement_relocation_present','key_supporting_excerpts',
          // VAWG / Exploitation flags (Encounter tab)
          'trafficking_exploitation_concern','third_party_control_indicated',
          'worker_appears_controlled','client_connected_to_controller',
          'movement_to_unknown_unsafe_location','worker_unaware_how_arrived',
          'grooming_recruitment_concern','repeat_targeting_concern',
          'multiple_women_referenced','organized_group_offending_concern',
          'public_safety_bulletin_suitability','public_safety_urgency_level',
          'vawg_exploitation_notes','vawg_key_excerpts',
          // Mobility new
          'movement_purpose','basis_for_movement_coding',
          // Suspect expanded
          'suspect_distinctive_features','suspect_clothing','suspect_speech_notes',
          'suspect_behavioural_descriptors','known_repeat_suspect',
          // Vehicle expanded
          'vehicle_role_in_encounter','vehicle_ownership_association','vehicle_confidence',
          // Concern flags (Suspect tab)
          'concern_trafficking','concern_third_party_control','concern_grooming',
          'concern_organized_offending','concern_repeat_suspect','concern_repeat_vehicle',
          'concern_urgent_public_safety','concern_bulletin_suitable','concern_flag_rationale',
          // GIS per-block
          'initial_contact_location_type','incident_location_type',
          'initial_contact_geocoding_status','incident_geocoding_status','destination_geocoding_status',
          // Harm classification
          'primary_harm','multi_harm_flag',
          // Codability / Data Quality
          'narrative_detail_level','sequence_reconstructable','movement_coding_suitability',
          'location_coding_suitability','main_data_limitation','data_quality_notes',
          'initial_contact_visible','negotiation_visible','movement_visible',
          'violence_coercion_visible','exit_aftermath_visible',
          // Situation / Environment
          'primary_setting_type','specific_setting_type','visibility_case','isolation_case',
          'guardianship_case','access_to_help','setting_control','other_people_nearby',
          'security_or_business_nearby','environment_notes','environment_supporting_excerpt',
          // Mobility pattern
          'movement_pattern_type','movement_timing',
          // Narrative excerpts
          'stage_excerpt','behaviour_excerpt','environment_excerpt','movement_excerpt','uncertainty_excerpt',
          // Case summary
          'sequence_pattern',
          // GIS mappable status
          'mappable_status',
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
    // Cancel any pending autosave — prevents stale timer from overwriting this save
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setSaving(true);
    setSaveError(null);
    try {
      localStorage.setItem('analyst_name', analystName);
      if (isNew) {
        const created = await api.createReport({ raw_narrative: narrative, source_organization: sourceOrg, analyst_name: analystName, date_received: dateReceived });
        const updated = await api.updateReport(created.report_id, { ...fields, cleaned_narrative: cleanedNarrative, analyst_summary: analystSummary, field_provenance: provenance, tags, ai_suggestions: { ...suggestions, flags, ...(Object.keys(nlp).length ? { nlp } : {}), ...(Object.keys(weather).length ? { weather } : {}) }, analyst_name: analystName } as any);
        setIsDirty(false);
        navigate(`/code/${updated.report_id}`);
      } else if (report) {
        await api.updateReport(report.report_id, { ...fields, cleaned_narrative: cleanedNarrative, analyst_summary: analystSummary, field_provenance: provenance, tags, ai_suggestions: { ...suggestions, flags, ...(Object.keys(nlp).length ? { nlp } : {}), ...(Object.keys(weather).length ? { weather } : {}) }, source_organization: sourceOrg, analyst_name: analystName, date_received: dateReceived } as any);
        const now = new Date();
        setLastSavedAt(now);
        setSavedAgoText('just now');
        setIsDirty(false);
        if (!silent) toast('Case saved');
      }
    } catch (e: any) {
      const msg = e?.message || 'Save failed — check backend';
      setSaveError(msg);
      if (!silent) toast('Save failed: ' + msg);
    } finally { setSaving(false); }
  }, [narrative, isNew, analystName, sourceOrg, dateReceived, fields, cleanedNarrative, analystSummary, provenance, tags, suggestions, flags, weather, report, navigate, toast]);

  // Keep the ref pointing at the latest handleSave after every render
  useEffect(() => { handleSaveRef.current = handleSave; });

  // ── Autosave: debounce 2s after last field change (existing reports only) ───
  // Uses handleSaveRef so the timer always calls the freshest save function,
  // never a stale closure that captured outdated field values.
  const scheduleAutosave = useCallback(() => {
    if (isNew || !report) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      handleSaveRef.current(true);
    }, 2000);
  }, [isNew, report]); // handleSave intentionally omitted — ref is always current

  const set = useCallback((key: keyof Report, val: string | number | null) => {
    setFields((f) => ({ ...f, [key]: val }));
    setProvenance((p) => ({ ...p, [key]: 'analyst_filled' }));
    setIsDirty(true);
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
    setNlpError(null);
    try {
      const result = await api.analyzeReport(report.report_id);
      if (result.ai_suggestions?.nlp) setNlp(result.ai_suggestions.nlp);
      if (result.ai_suggestions?.flags) setFlags(result.ai_suggestions.flags);
      if (result.ai_suggestions?.weather) setWeather(result.ai_suggestions.weather);
      const err = result.ai_suggestions?.error || result.ai_suggestions?.nlp?.error;
      if (err) setNlpError(String(err));
    } catch (e: any) {
      setNlpError(e?.message || 'NLP analysis failed — check backend logs');
    } finally {
      setAnalyzingNlp(false);
    }
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

  const nlpSourceId = nlp._source_report_id as string | undefined;
  const nlpBelongsHere = !nlpSourceId || !report?.report_id || nlpSourceId === report.report_id;
  const showNlpChips = Object.keys(nlp).length > 0 && nlpBelongsHere;

  // ── NLP source highlighting ─────────────────────────────────────────────────
  const NLP_HL_CATS = [
    { key: 'coercion',  label: 'Coercion',  color: '#FCA5A5', bg: 'rgba(239,68,68,0.18)',  evidenceKey: 'coercion_evidence' },
    { key: 'threat',    label: 'Threats',   color: '#FDBA74', bg: 'rgba(249,115,22,0.18)', evidenceKey: 'weapon_evidence' },
    { key: 'movement',  label: 'Movement',  color: '#6EE7B7', bg: 'rgba(16,185,129,0.18)', evidenceKey: 'movement_evidence' },
    { key: 'harm',      label: 'Harm',      color: '#C084FC', bg: 'rgba(168,85,247,0.18)', evidenceKey: 'physical_evidence' },
    { key: 'location',  label: 'Location',  color: '#93C5FD', bg: 'rgba(59,130,246,0.18)', evidenceKey: null as null | string },
    { key: 'payment',   label: 'Payment',   color: '#FDE68A', bg: 'rgba(234,179,8,0.18)',  evidenceKey: 'payment_evidence' },
  ] as const;

  function buildHighlightedNarrative(text: string): React.ReactNode {
    if (!showNlpHighlights || !text) return text;
    // Collect all (phrase, category) pairs from active evidence arrays
    const spans: { start: number; end: number; catKey: string }[] = [];
    for (const cat of NLP_HL_CATS) {
      if (!hlCategories.has(cat.key)) continue;
      let phrases: string[] = [];
      if (cat.evidenceKey && Array.isArray(nlp[cat.evidenceKey])) {
        phrases = nlp[cat.evidenceKey] as string[];
      } else if (cat.key === 'location') {
        const hints = [nlp.contact_location_hint, nlp.incident_location_hint].filter(Boolean) as string[];
        phrases = hints;
      }
      for (const phrase of phrases) {
        if (!phrase || phrase.length < 3) continue;
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) {
          spans.push({ start: m.index, end: m.index + m[0].length, catKey: cat.key });
        }
      }
    }
    if (spans.length === 0) return text;
    // Sort by start, merge overlaps using first cat encountered
    spans.sort((a, b) => a.start - b.start);
    const merged: typeof spans = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && s.start < last.end) { last.end = Math.max(last.end, s.end); }
      else merged.push({ ...s });
    }
    const nodes: React.ReactNode[] = [];
    let pos = 0;
    for (const seg of merged) {
      if (seg.start > pos) nodes.push(text.slice(pos, seg.start));
      const cat = NLP_HL_CATS.find(c => c.key === seg.catKey)!;
      nodes.push(
        <mark key={`${seg.start}-${seg.end}`} style={{
          background: cat.bg,
          color: 'inherit',
          borderRadius: 2,
          padding: '0 1px',
          outline: `1px solid ${cat.color}44`,
        }}>
          {text.slice(seg.start, seg.end)}
        </mark>
      );
      pos = seg.end;
    }
    if (pos < text.length) nodes.push(text.slice(pos));
    return <>{nodes}</>;
  }

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

        {/* Save state indicator */}
        {saveError ? (
          <span style={{ fontSize: 11, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 4, padding: '2px 7px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={saveError}>
            Save failed: {saveError}
          </span>
        ) : saving ? (
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Saving…</span>
        ) : isDirty ? (
          <span style={{ fontSize: 11, color: 'var(--amber)', fontStyle: 'italic' }}>Unsaved changes</span>
        ) : lastSavedAt ? (
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
            Saved {savedAgoText}
          </span>
        ) : null}


        {(() => {
          const nlpFlags = flags.filter(f =>
            !/\bRank\s+\d/i.test(f) &&
            !/\bscore\b/i.test(f) &&
            !/\bescalation\b/i.test(f) &&
            !/\bprobability\b/i.test(f)
          );
          return nlpFlags.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {nlpFlags.map((flag) => (
                <span key={flag} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                  background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)',
                }}>{flag}</span>
              ))}
            </div>
          ) : null;
        })()}

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
          {nlpError && (
            <span style={{ fontSize: 11.5, color: 'var(--red, #c0392b)', background: 'var(--red-pale, #fdecea)', border: '1px solid var(--red, #c0392b)', borderRadius: 4, padding: '2px 7px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nlpError}>
              NLP error: {nlpError}
            </span>
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
          background: isNew ? 'var(--surface)' : '#172A3A',
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
              {!isNew && narrative && (
                <button
                  onClick={copyNarrativeToClipboard}
                  title="Copy full source text to clipboard"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 10, padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
                    border: `1px solid ${copiedNarrative ? '#22C55E' : '#4B5563'}`,
                    background: copiedNarrative ? '#14532D' : '#374151',
                    color: copiedNarrative ? '#86EFAC' : '#9CA3AF',
                    fontWeight: 600, letterSpacing: '0.04em',
                    transition: 'all 0.15s',
                  }}
                >
                  {copiedNarrative ? <Check size={9} /> : <Copy size={9} />}
                  {copiedNarrative ? 'COPIED' : 'COPY'}
                </button>
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
                {!isNew && showNlpChips && (
                  <button
                    onClick={() => setShowNlpHighlights(v => !v)}
                    title="Toggle NLP signal highlights — provisional, not saved"
                    style={{
                      fontSize: 9.5, padding: '1px 7px', borderRadius: 3, cursor: 'pointer',
                      border: '1px solid ' + (showNlpHighlights ? '#6366F1' : '#4B5563'),
                      background: showNlpHighlights ? '#312E81' : '#374151',
                      color: showNlpHighlights ? '#A5B4FC' : '#9CA3AF',
                      fontWeight: 600, letterSpacing: '0.03em',
                    }}
                  >
                    {showNlpHighlights ? '◈ NLP on' : '◈ NLP off'}
                  </button>
                )}
              </div>
            )}
            {!isNew && showNlpHighlights && showNlpChips && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, flexWrap: 'wrap' }}>
                {NLP_HL_CATS.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setHlCategories(prev => {
                      const next = new Set(prev);
                      if (next.has(cat.key)) next.delete(cat.key); else next.add(cat.key);
                      return next;
                    })}
                    style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 3, cursor: 'pointer',
                      border: `1px solid ${cat.color}88`,
                      background: hlCategories.has(cat.key) ? cat.bg : 'transparent',
                      color: hlCategories.has(cat.key) ? cat.color : '#6B7280',
                      fontWeight: 600,
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
                <span style={{ fontSize: 8.5, color: '#6B7280', fontStyle: 'italic', marginLeft: 2 }}>provisional</span>
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
            ) : showNlpHighlights ? (
              /* NLP highlight mode — div needed for <mark> elements */
              <div
                className="narrative-selectable"
                style={{
                  fontSize: 13, lineHeight: 1.8,
                  color: '#C9CDD4',
                  whiteSpace: 'pre-wrap',
                  padding: '14px',
                  borderRadius: 8,
                  background: '#0F1020',
                  border: '1.5px solid #2D3148',
                  fontFamily: 'Georgia, serif',
                }}
              >
                {buildHighlightedNarrative(narrative)}
              </div>
            ) : (
              /* Normal read mode — textarea is always selectable by browsers */
              <textarea
                ref={narrativeTextareaRef}
                readOnly
                value={narrative}
                rows={Math.max(10, (narrative.match(/\n/g) || []).length + 3)}
                style={{
                  display: 'block',
                  width: '100%',
                  resize: 'none',
                  border: '1.5px solid #2D3148',
                  borderRadius: 8,
                  background: '#0F1020',
                  color: '#C9CDD4',
                  padding: '14px',
                  fontSize: 13,
                  lineHeight: 1.8,
                  fontFamily: 'Georgia, serif',
                  overflow: 'auto',
                  outline: 'none',
                  boxSizing: 'border-box',
                  minHeight: 0,
                }}
              />
            )}

            {/* Source provenance — PDF attachment + full bulletin text */}
            {!isNew && (report?.source_bulletin_session_id || report?.source_bulletin_text) && (
              <div style={{ marginTop: 10 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 4,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="section-label" style={{ color: '#6B7280' }}>SOURCE DOCUMENT</span>
                    <span style={{
                      fontSize: 9.5, padding: '1px 6px', borderRadius: 3,
                      background: '#374151', color: '#9CA3AF',
                      border: '1px solid #4B5563', fontWeight: 600, letterSpacing: '0.04em',
                    }}>PROVENANCE</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {report?.source_bulletin_session_id && (
                      <a
                        href={`/api/attachments/${report.source_bulletin_session_id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 11, color: '#60A5FA', textDecoration: 'none',
                          padding: '2px 8px', borderRadius: 4,
                          background: '#1E3A5F', border: '1px solid #2563EB33',
                        }}
                      >
                        <FileText size={11} />
                        View source PDF
                        <ExternalLink size={10} />
                      </a>
                    )}
                    {report?.source_bulletin_text && (
                      <button
                        onClick={() => setShowBulletinText((v) => !v)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 11, background: 'none', border: 'none',
                          color: '#6B7280', cursor: 'pointer', padding: '2px 4px',
                        }}
                      >
                        <ChevronDown size={11} style={{ transform: showBulletinText ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                        {showBulletinText ? 'hide full extraction' : 'full extraction text'}
                      </button>
                    )}
                  </div>
                </div>
                {showBulletinText && report?.source_bulletin_text && (
                  <div
                    className="narrative-selectable"
                    style={{
                      fontSize: 11.5, lineHeight: 1.7, color: '#9CA3AF',
                      whiteSpace: 'pre-wrap',
                      padding: '10px 12px', borderRadius: 6,
                      background: '#0D1117',
                      border: '1px solid #374151',
                      maxHeight: 260, overflow: 'auto',
                      fontFamily: 'monospace',
                    }}
                  >
                    {report.source_bulletin_text}
                  </div>
                )}
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
                    onChange={(e) => { setCleanedNarrative(e.target.value); setIsDirty(true); scheduleAutosave(); }}
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
                    onChange={(e) => { setAnalystSummary(e.target.value); setIsDirty(true); scheduleAutosave(); }}
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
              ['basics',      'Case Record',               ['incident_date','city','neighbourhood','indoor_outdoor','public_private','deserted','incident_time_exact','day_of_week','destination_known','location_certainty','initial_contact_city','incident_city','destination_city']],
              ['codability',  'Codability / Data Quality', ['narrative_detail_level','sequence_reconstructable','stage_coding_suitability','movement_coding_suitability','location_coding_suitability','main_data_limitation']],
              ['stages',      'Stage Coding',              []],
              ['encounter',   'Incident-Level Coding',     ['initial_approach_type','negotiation_present','refusal_present','pressure_after_refusal','coercion_present','threats_present','verbal_abuse','physical_force','sexual_assault','robbery_theft','stealthing','repeated_pressure','intimidation_present','abrupt_tone_change','verbal_abuse_before_violence']],
              ['mobility',    'Mobility / Spatial Sequence', ['movement_present','movement_attempted','mode_of_movement','entered_vehicle','public_to_private_shift','public_to_secluded_shift','cross_neighbourhood','cross_municipality','cross_city_movement','offender_control_over_movement','movement_completed','who_controlled_movement','movement_confidence']],
              ['suspect',     'Suspect / Vehicle',         ['suspect_gender','suspect_age_estimate','vehicle_present','vehicle_make','vehicle_year','vehicle_model','vehicle_colour','plate_partial']],
              ['narrative',   'Narrative Excerpts',        ['highest_stage_reached','turning_point','escalation_point','resolution_endpoint','summary_analytic','key_quotes','coder_notes']],
              ['gis',         'GIS',                       ['initial_contact_address_raw','incident_address_raw','initial_contact_confidence','incident_confidence','destination_confidence']],
              ['summary',     'Case Summary',              ['initial_approach_type','negotiation_present','refusal_present','pressure_after_refusal','coercion_present','threats_present','physical_force','sexual_assault','robbery_theft','exit_type','movement_present','entered_vehicle','public_to_private_shift','public_to_secluded_shift','indoor_outdoor','public_private']],
            ] as [Section, string, string[]][]).map(([sec, label, keys]) => {
              const filled = keys.filter(k => { const v = fields[k as keyof Report]; return v !== null && v !== undefined && String(v).trim() !== ''; }).length;
              return (
                <button
                  key={sec}
                  onClick={() => setActiveTab(sec)}
                  style={{
                    padding: '10px 14px',
                    border: 'none',
                    borderBottom: activeTab === sec ? '2px solid #B38B59' : '2px solid transparent',
                    background: activeTab === sec ? 'rgba(179,139,89,0.07)' : 'transparent',
                    color: activeTab === sec ? '#0B1F33' : 'var(--text-3)',
                    fontFamily: 'DM Sans, sans-serif', fontSize: 12,
                    fontWeight: activeTab === sec ? 600 : 400,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
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
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', fontStyle: 'italic', lineHeight: 1.5 }}>
                  This tab preserves the original report and basic case details. Analytical coding is completed in the following tabs.
                </div>
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

                {/* ── Location summary — brief spatial overview; detail in Stages/Mobility/GIS ── */}
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontStyle: 'italic', margin: '0 0 8px 0' }}>
                  Quick location summary only. Full spatial sequencing belongs in Stages, Mobility, and GIS.
                </p>
                <SectionPanel title="Location Summary" fieldKeys={['initial_contact_location','initial_contact_city','initial_contact_city_confidence','incident_location_primary','incident_city','incident_city_confidence','incident_location_secondary','destination_city','destination_city_confidence']} fields={fields}>

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

            {activeTab === 'codability' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  This section records what the report makes visible. Missing or unclear information must not be treated as evidence that a stage or behaviour did not occur.
                </div>
                <SectionPanel title="Narrative Detail" fieldKeys={['narrative_detail_level','sequence_reconstructable']} fields={fields}>
                  <FieldRow label="Narrative detail level" value={f('narrative_detail_level')} onChange={(v) => set('narrative_detail_level', v)} type="select" options={['low','moderate','high','not reviewed']} provenance={prov('narrative_detail_level')} onMarkReviewed={() => markReviewed('narrative_detail_level')} />
                  <FieldRow label="Sequence reconstructable" value={f('sequence_reconstructable')} onChange={(v) => set('sequence_reconstructable', v)} type="select" options={['yes','partial','no','unclear','not reviewed']} provenance={prov('sequence_reconstructable')} onMarkReviewed={() => markReviewed('sequence_reconstructable')} />
                </SectionPanel>
                <SectionPanel title="Coding Suitability" fieldKeys={['stage_coding_suitability','movement_coding_suitability','location_coding_suitability','main_data_limitation']} fields={fields}>
                  <FieldRow label="Stage coding suitability" value={f('stage_coding_suitability')} onChange={(v) => set('stage_coding_suitability', v)} type="select" options={['full staged coding','partial staged coding','incident-level coding only','not suitable','not reviewed']} provenance={prov('stage_coding_suitability')} onMarkReviewed={() => markReviewed('stage_coding_suitability')} />
                  <FieldRow label="Movement coding suitability" value={f('movement_coding_suitability')} onChange={(v) => set('movement_coding_suitability', v)} type="select" options={['full','partial','limited','not suitable','not reviewed']} provenance={prov('movement_coding_suitability')} onMarkReviewed={() => markReviewed('movement_coding_suitability')} />
                  <FieldRow label="Location coding suitability" value={f('location_coding_suitability')} onChange={(v) => set('location_coding_suitability', v)} type="select" options={['mappable','approximate','descriptive only','not mappable','not reviewed']} provenance={prov('location_coding_suitability')} onMarkReviewed={() => markReviewed('location_coding_suitability')} />
                  <FieldRow label="Main data limitation" value={f('main_data_limitation')} onChange={(v) => set('main_data_limitation', v)} type="select" options={['brief narrative','vague location','unclear sequence','warning-only report','third-party report','missing date/time','missing movement detail','missing incident detail','other','none apparent']} provenance={prov('main_data_limitation')} onMarkReviewed={() => markReviewed('main_data_limitation')} />
                </SectionPanel>
                <SectionPanel title="Stage Visibility" fieldKeys={['initial_contact_visible','negotiation_visible','movement_visible','violence_coercion_visible','exit_aftermath_visible']} fields={fields}>
                  <FieldRow label="Initial contact visible" value={f('initial_contact_visible')} onChange={(v) => set('initial_contact_visible', v)} type="select" options={['yes','no','unclear']} provenance={prov('initial_contact_visible')} onMarkReviewed={() => markReviewed('initial_contact_visible')} />
                  <FieldRow label="Negotiation visible" value={f('negotiation_visible')} onChange={(v) => set('negotiation_visible', v)} type="select" options={['yes','no','unclear']} provenance={prov('negotiation_visible')} onMarkReviewed={() => markReviewed('negotiation_visible')} />
                  <FieldRow label="Movement visible" value={f('movement_visible')} onChange={(v) => set('movement_visible', v)} type="select" options={['yes','no','unclear']} provenance={prov('movement_visible')} onMarkReviewed={() => markReviewed('movement_visible')} />
                  <FieldRow label="Violence / coercion visible" value={f('violence_coercion_visible')} onChange={(v) => set('violence_coercion_visible', v)} type="select" options={['yes','no','unclear']} provenance={prov('violence_coercion_visible')} onMarkReviewed={() => markReviewed('violence_coercion_visible')} />
                  <FieldRow label="Exit / aftermath visible" value={f('exit_aftermath_visible')} onChange={(v) => set('exit_aftermath_visible', v)} type="select" options={['yes','no','unclear']} provenance={prov('exit_aftermath_visible')} onMarkReviewed={() => markReviewed('exit_aftermath_visible')} />
                </SectionPanel>
                <SectionPanel title="Data Quality Notes" fieldKeys={['data_quality_notes']} fields={fields}>
                  <FieldRow label="Data quality notes" value={f('data_quality_notes')} onChange={(v) => set('data_quality_notes', v)} type="textarea" provenance={prov('data_quality_notes')} onMarkReviewed={() => markReviewed('data_quality_notes')} />
                </SectionPanel>
              </div>
            )}

            {activeTab === 'stages' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  This tab codes which parts of the encounter sequence are visible in the report. Stages are coded only where supported by the narrative. Stages may be present, absent, unclear or not applicable.
                </div>
                {reportId ? (
                  <StageSequencer reportId={reportId} />
                ) : (
                  <div style={{ padding: '20px 0', color: 'var(--text-3)', fontSize: 13, fontStyle: 'italic' }}>
                    Save the report first to add stages.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'encounter' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  This tab records case-level indicators that appear anywhere in the report. Timing should be coded in Stage Coding where the narrative allows.
                </div>

                <SectionPanel title="Incident Overview" fieldKeys={['primary_incident_type','overall_severity','overall_incident_summary','stage_coding_suitability','sequence_clarity']} fields={fields}>
                  <FieldRow label="Primary incident type" value={f('primary_incident_type')} onChange={(v) => set('primary_incident_type', v)} type="select" options={['suspicious / concerning behaviour','non-payment / payment dispute','coercion / intimidation','physical violence','sexual violence','robbery / theft','substance-facilitated harm','movement / relocation concern','multiple harms','other','unknown / unclear']} provenance={prov('primary_incident_type')} onMarkReviewed={() => markReviewed('primary_incident_type')} />
                  <FieldRow label="Overall severity" value={f('overall_severity')} onChange={(v) => set('overall_severity', v)} type="select" options={['low concern','moderate concern','high concern','severe violence / high risk','unknown / unclear']} provenance={prov('overall_severity')} onMarkReviewed={() => markReviewed('overall_severity')} />
                  <FieldRow label="Overall incident summary" value={f('overall_incident_summary')} onChange={(v) => set('overall_incident_summary', v)} type="textarea" placeholder="Briefly summarize the incident in 2 to 3 sentences." provenance={prov('overall_incident_summary')} onMarkReviewed={() => markReviewed('overall_incident_summary')} />
                  <FieldRow label="Stage coding suitability" value={f('stage_coding_suitability')} onChange={(v) => set('stage_coding_suitability', v)} type="select" options={['yes, sufficient narrative detail for staged coding','partial, some stages can be coded','no, incident-level coding only','unknown / not reviewed']} provenance={prov('stage_coding_suitability')} onMarkReviewed={() => markReviewed('stage_coding_suitability')} />
                  <FieldRow label="Sequence clarity" value={f('sequence_clarity')} onChange={(v) => set('sequence_clarity', v)} type="select" options={['clear chronological sequence','mostly clear sequence','partial / fragmented sequence','sequence unclear','not applicable']} provenance={prov('sequence_clarity')} onMarkReviewed={() => markReviewed('sequence_clarity')} />
                </SectionPanel>

                <SectionPanel title="Initial Approach & Negotiation" fieldKeys={['initial_approach_type','negotiation_present','service_discussed','payment_discussed','refusal_present','pressure_after_refusal','boundary_issue_present']} fields={fields}>
                  <FieldRow label="Initial approach type" value={f('initial_approach_type')} onChange={(v) => set('initial_approach_type', v)} type="select" options={['street-based approach','online / digital contact','phone / text contact','known / repeat client','vehicle-based approach','third-party arranged','indoor venue / agency / establishment','unclear / not stated','other']} suggested={s('initial_approach_type')} onAcceptSuggestion={() => acceptSuggestion('initial_approach_type')} provenance={prov('initial_approach_type')} onMarkReviewed={() => markReviewed('initial_approach_type')} />
                  <FieldRow label="Negotiation present" value={f('negotiation_present')} onChange={(v) => set('negotiation_present', v)} type="yesno-extended" suggested={s('negotiation_present')} onAcceptSuggestion={() => acceptSuggestion('negotiation_present')} provenance={prov('negotiation_present')} onMarkReviewed={() => markReviewed('negotiation_present')} />
                  <FieldRow label="Service discussed" value={f('service_discussed')} onChange={(v) => set('service_discussed', v)} type="yesno" suggested={s('service_discussed')} onAcceptSuggestion={() => acceptSuggestion('service_discussed')} provenance={prov('service_discussed')} onMarkReviewed={() => markReviewed('service_discussed')} />
                  <FieldRow label="Payment discussed" value={f('payment_discussed')} onChange={(v) => set('payment_discussed', v)} type="yesno" suggested={s('payment_discussed')} onAcceptSuggestion={() => acceptSuggestion('payment_discussed')} provenance={prov('payment_discussed')} onMarkReviewed={() => markReviewed('payment_discussed')} />
                  <FieldRow label="Refusal present" value={f('refusal_present')} onChange={(v) => set('refusal_present', v)} type="yesno-extended" suggested={s('refusal_present')} onAcceptSuggestion={() => acceptSuggestion('refusal_present')} provenance={prov('refusal_present')} onMarkReviewed={() => markReviewed('refusal_present')} />
                  <FieldRow label="Pressure after refusal" value={f('pressure_after_refusal')} onChange={(v) => set('pressure_after_refusal', v)} type="yesno" suggested={s('pressure_after_refusal')} onAcceptSuggestion={() => acceptSuggestion('pressure_after_refusal')} provenance={prov('pressure_after_refusal')} onMarkReviewed={() => markReviewed('pressure_after_refusal')} />
                  <FieldRow label="Boundary issue present" value={f('boundary_issue_present')} onChange={(v) => set('boundary_issue_present', v)} type="select" options={['not coded','yes','no','unclear / not stated','probable / inferred']} provenance={prov('boundary_issue_present')} onMarkReviewed={() => markReviewed('boundary_issue_present')} />
                </SectionPanel>

                <SectionPanel title="Incident-Level Harm and Control Indicators" fieldKeys={['primary_harm','multi_harm_flag','coercion_present','threats_present','verbal_abuse','physical_force','non_consensual_substance','substance_administration_notes','sexual_assault','stealthing','robbery_theft','loss_of_consciousness','forced_movement_dragging','restraint_confinement','weapon_present_used','choking_strangulation','prevented_exit','movement_relocation_present','key_supporting_excerpts']} fields={fields}>
                  <FieldRow label="Primary harm" value={f('primary_harm')} onChange={(v) => set('primary_harm', v)} type="select" options={['sexual assault / rape','physical violence','coercion / intimidation','robbery / theft','stealthing / condom refusal','substance-facilitated harm','confinement / prevented exit','threats / weapon involved','verbal / psychological abuse','multiple harms — see below','other','unknown / unclear']} provenance={prov('primary_harm')} onMarkReviewed={() => markReviewed('primary_harm')} helper="The single most analytically significant harm in this case. Use 'multiple harms — see below' when no single harm predominates." />
                  <FieldRow label="Multi-harm case" value={f('multi_harm_flag')} onChange={(v) => set('multi_harm_flag', v)} type="yesno" provenance={prov('multi_harm_flag')} onMarkReviewed={() => markReviewed('multi_harm_flag')} helper="Flag if more than one distinct harm category is coded. Enables multi-harm filtering in the map workspace." />
                  <FieldRow label="Coercion present" value={f('coercion_present')} onChange={(v) => set('coercion_present', v)} type="yesno-extended" suggested={s('coercion_present')} onAcceptSuggestion={() => acceptSuggestion('coercion_present')} provenance={prov('coercion_present')} onMarkReviewed={() => markReviewed('coercion_present')} badge={showNlpChips ? <NlpBadge rank={nlp.coercion_rank ?? 3} evidence={nlp.coercion_evidence ?? []} fieldValue={f('coercion_present')} /> : undefined} />
                  <FieldRow label="Threats present" value={f('threats_present')} onChange={(v) => set('threats_present', v)} type="yesno" suggested={s('threats_present')} onAcceptSuggestion={() => acceptSuggestion('threats_present')} provenance={prov('threats_present')} onMarkReviewed={() => markReviewed('threats_present')} badge={showNlpChips ? <NlpBadge rank={nlp.weapon_rank ?? 3} evidence={nlp.weapon_evidence ?? []} fieldValue={f('threats_present')} /> : undefined} />
                  <FieldRow label="Verbal abuse" value={f('verbal_abuse')} onChange={(v) => set('verbal_abuse', v)} type="yesno" suggested={s('verbal_abuse')} onAcceptSuggestion={() => acceptSuggestion('verbal_abuse')} provenance={prov('verbal_abuse')} onMarkReviewed={() => markReviewed('verbal_abuse')} />
                  <FieldRow label="Physical force" value={f('physical_force')} onChange={(v) => set('physical_force', v)} type="yesno-extended" suggested={s('physical_force')} onAcceptSuggestion={() => acceptSuggestion('physical_force')} provenance={prov('physical_force')} onMarkReviewed={() => markReviewed('physical_force')} badge={showNlpChips ? <NlpBadge rank={nlp.physical_rank ?? 3} evidence={nlp.physical_evidence ?? []} fieldValue={f('physical_force')} /> : undefined} />
                  <FieldRow label="Non-consensual substance administration" value={f('non_consensual_substance')} onChange={(v) => set('non_consensual_substance', v)} type="yesno-extended" provenance={prov('non_consensual_substance')} onMarkReviewed={() => markReviewed('non_consensual_substance')} />
                  <FieldRow label="Substance administration notes" value={f('substance_administration_notes')} onChange={(v) => set('substance_administration_notes', v)} type="textarea" placeholder='e.g. "drink tasted strange," "woke up later," "felt drugged," "client gave her something," "blackout," "unknown pill"' provenance={prov('substance_administration_notes')} onMarkReviewed={() => markReviewed('substance_administration_notes')} />
                  <FieldRow label="Sexual assault" value={f('sexual_assault')} onChange={(v) => set('sexual_assault', v)} type="yesno-extended" suggested={s('sexual_assault')} onAcceptSuggestion={() => acceptSuggestion('sexual_assault')} provenance={prov('sexual_assault')} onMarkReviewed={() => markReviewed('sexual_assault')} badge={showNlpChips ? <NlpBadge rank={nlp.sexual_rank ?? 3} evidence={nlp.sexual_evidence ?? []} fieldValue={f('sexual_assault')} /> : undefined} />
                  <FieldRow label="Stealthing / condom refusal" value={f('stealthing')} onChange={(v) => set('stealthing', v)} type="yesno" suggested={s('stealthing')} onAcceptSuggestion={() => acceptSuggestion('stealthing')} provenance={prov('stealthing')} onMarkReviewed={() => markReviewed('stealthing')} />
                  <FieldRow label="Robbery / theft" value={f('robbery_theft')} onChange={(v) => set('robbery_theft', v)} type="yesno" suggested={s('robbery_theft')} onAcceptSuggestion={() => acceptSuggestion('robbery_theft')} provenance={prov('robbery_theft')} onMarkReviewed={() => markReviewed('robbery_theft')} />
                  <FieldRow label="Loss of consciousness / blackout / memory gap" value={f('loss_of_consciousness')} onChange={(v) => set('loss_of_consciousness', v)} type="yesno" provenance={prov('loss_of_consciousness')} onMarkReviewed={() => markReviewed('loss_of_consciousness')} />
                  <FieldRow label="Forced movement / dragging" value={f('forced_movement_dragging')} onChange={(v) => set('forced_movement_dragging', v)} type="yesno-extended" provenance={prov('forced_movement_dragging')} onMarkReviewed={() => markReviewed('forced_movement_dragging')} />
                  <FieldRow label="Restraint / confinement" value={f('restraint_confinement')} onChange={(v) => set('restraint_confinement', v)} type="yesno-extended" provenance={prov('restraint_confinement')} onMarkReviewed={() => markReviewed('restraint_confinement')} />
                  <FieldRow label="Weapon present / used" value={f('weapon_present_used')} onChange={(v) => set('weapon_present_used', v)} type="yesno-extended" provenance={prov('weapon_present_used')} onMarkReviewed={() => markReviewed('weapon_present_used')} />
                  <FieldRow label="Choking / strangulation" value={f('choking_strangulation')} onChange={(v) => set('choking_strangulation', v)} type="yesno-extended" provenance={prov('choking_strangulation')} onMarkReviewed={() => markReviewed('choking_strangulation')} />
                  <FieldRow label="Prevented exit / blocked escape" value={f('prevented_exit')} onChange={(v) => set('prevented_exit', v)} type="yesno-extended" provenance={prov('prevented_exit')} onMarkReviewed={() => markReviewed('prevented_exit')} />
                  <FieldRow label="Movement / relocation present" value={f('movement_relocation_present')} onChange={(v) => set('movement_relocation_present', v)} type="select" options={['not coded','yes','no','unclear / not stated','probable / inferred']} provenance={prov('movement_relocation_present')} onMarkReviewed={() => markReviewed('movement_relocation_present')} />
                  <FieldRow label="Key supporting excerpt(s)" value={f('key_supporting_excerpts')} onChange={(v) => set('key_supporting_excerpts', v)} type="textarea" placeholder="Paste short excerpts supporting the main incident-level harm, control, or violence indicators." provenance={prov('key_supporting_excerpts')} onMarkReviewed={() => markReviewed('key_supporting_excerpts')} />
                </SectionPanel>

                <SectionPanel title="Early Escalation Cues" fieldKeys={['repeated_pressure','intimidation_present','abrupt_tone_change','verbal_abuse_before_violence','escalation_trigger']} fields={fields} defaultCollapsed>
                  <FieldRow label="Repeated pressure" value={f('repeated_pressure')} onChange={(v) => set('repeated_pressure', v)} type="yesno" provenance={prov('repeated_pressure')} onMarkReviewed={() => markReviewed('repeated_pressure')} />
                  <FieldRow label="Intimidation present" value={f('intimidation_present')} onChange={(v) => set('intimidation_present', v)} type="yesno" provenance={prov('intimidation_present')} onMarkReviewed={() => markReviewed('intimidation_present')} />
                  <FieldRow label="Abrupt tone change" value={f('abrupt_tone_change')} onChange={(v) => set('abrupt_tone_change', v)} type="yesno" provenance={prov('abrupt_tone_change')} onMarkReviewed={() => markReviewed('abrupt_tone_change')} />
                  <FieldRow label="Verbal abuse before violence" value={f('verbal_abuse_before_violence')} onChange={(v) => set('verbal_abuse_before_violence', v)} type="yesno" provenance={prov('verbal_abuse_before_violence')} onMarkReviewed={() => markReviewed('verbal_abuse_before_violence')} />
                  <FieldRow label="Escalation trigger" value={f('escalation_trigger')} onChange={(v) => set('escalation_trigger', v)} type="textarea" placeholder="What triggered escalation? e.g. refusal, payment dispute, boundary setting, request to leave, condom refusal, relocation, disagreement over service." provenance={prov('escalation_trigger')} onMarkReviewed={() => markReviewed('escalation_trigger')} />
                </SectionPanel>

                <SectionPanel title="Situation / Environment" fieldKeys={['primary_setting_type','specific_setting_type','visibility_case','isolation_case','guardianship_case','access_to_help','setting_control','other_people_nearby','security_or_business_nearby','environment_notes','environment_supporting_excerpt']} fields={fields}>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                    This section operationalises the immediate conditions surrounding the encounter, including visibility, isolation, guardianship, access to assistance and control over the setting.
                  </p>
                  <FieldRow label="Primary setting type" value={f('primary_setting_type')} onChange={(v) => set('primary_setting_type', v)} type="select" options={['indoor','outdoor','mobile','mixed','unclear','not stated']} provenance={prov('primary_setting_type')} onMarkReviewed={() => markReviewed('primary_setting_type')} />
                  <FieldRow label="Specific setting type" value={f('specific_setting_type')} onChange={(v) => set('specific_setting_type', v)} type="select" options={['street','alley/lane','park/open space','vehicle','residence','hotel/motel','business/commercial','parking lot','industrial area','transit hub','SRO','shelter/hostel','support service','other','unknown']} provenance={prov('specific_setting_type')} onMarkReviewed={() => markReviewed('specific_setting_type')} />
                  <FieldRow label="Visibility" value={f('visibility_case')} onChange={(v) => set('visibility_case', v)} type="select" options={['visible','limited visibility','not visible','unclear','not stated']} provenance={prov('visibility_case')} onMarkReviewed={() => markReviewed('visibility_case')} />
                  <FieldRow label="Isolation" value={f('isolation_case')} onChange={(v) => set('isolation_case', v)} type="select" options={['not isolated','partially isolated','isolated','unclear','not stated']} provenance={prov('isolation_case')} onMarkReviewed={() => markReviewed('isolation_case')} />
                  <FieldRow label="Guardianship" value={f('guardianship_case')} onChange={(v) => set('guardianship_case', v)} type="select" options={['present','limited/reduced','absent','unclear','not stated']} provenance={prov('guardianship_case')} onMarkReviewed={() => markReviewed('guardianship_case')} />
                  <FieldRow label="Access to help" value={f('access_to_help')} onChange={(v) => set('access_to_help', v)} type="select" options={['apparent','limited','absent','unclear','not stated']} provenance={prov('access_to_help')} onMarkReviewed={() => markReviewed('access_to_help')} />
                  <FieldRow label="Setting control" value={f('setting_control')} onChange={(v) => set('setting_control', v)} type="select" options={['worker-controlled','client-controlled','shared','unclear','not stated']} provenance={prov('setting_control')} onMarkReviewed={() => markReviewed('setting_control')} />
                  <FieldRow label="Other people nearby" value={f('other_people_nearby')} onChange={(v) => set('other_people_nearby', v)} type="select" options={['yes','no','unclear']} provenance={prov('other_people_nearby')} onMarkReviewed={() => markReviewed('other_people_nearby')} />
                  <FieldRow label="Security / business nearby" value={f('security_or_business_nearby')} onChange={(v) => set('security_or_business_nearby', v)} type="select" options={['yes','no','unclear']} provenance={prov('security_or_business_nearby')} onMarkReviewed={() => markReviewed('security_or_business_nearby')} />
                  <FieldRow label="Environment notes" value={f('environment_notes')} onChange={(v) => set('environment_notes', v)} type="textarea" provenance={prov('environment_notes')} onMarkReviewed={() => markReviewed('environment_notes')} />
                  <FieldRow label="Environment supporting excerpt" value={f('environment_supporting_excerpt')} onChange={(v) => set('environment_supporting_excerpt', v)} type="textarea" provenance={prov('environment_supporting_excerpt')} onMarkReviewed={() => markReviewed('environment_supporting_excerpt')} />
                </SectionPanel>

                <SectionPanel title="Supplementary Public Safety Flags" fieldKeys={['trafficking_exploitation_concern','third_party_control_indicated','worker_appears_controlled','client_connected_to_controller','movement_to_unknown_unsafe_location','worker_unaware_how_arrived','grooming_recruitment_concern','repeat_targeting_concern','multiple_women_referenced','organized_group_offending_concern','public_safety_bulletin_suitability','public_safety_urgency_level','vawg_exploitation_notes','vawg_key_excerpts']} fields={fields} defaultCollapsed>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                    Violence Against Women and Girls indicators relevant to exploitation, coercive control, trafficking concerns, repeat offending, escalation, and public safety review. Code at whole-incident level — timing details belong in Stages.
                  </p>
                  <FieldRow label="Trafficking / exploitation concern" value={f('trafficking_exploitation_concern')} onChange={(v) => set('trafficking_exploitation_concern', v)} type="select" options={['not coded','yes','probable / inferred','no','unclear / not stated']} provenance={prov('trafficking_exploitation_concern')} onMarkReviewed={() => markReviewed('trafficking_exploitation_concern')} />
                  <FieldRow label="Third-party control indicated" value={f('third_party_control_indicated')} onChange={(v) => set('third_party_control_indicated', v)} type="select" options={['not coded','yes','probable / inferred','no','unclear / not stated']} provenance={prov('third_party_control_indicated')} onMarkReviewed={() => markReviewed('third_party_control_indicated')} />
                  <FieldRow label="Worker appears controlled by another person" value={f('worker_appears_controlled')} onChange={(v) => set('worker_appears_controlled', v)} type="select" options={['not coded','yes','probable / inferred','no','unclear / not stated']} provenance={prov('worker_appears_controlled')} onMarkReviewed={() => markReviewed('worker_appears_controlled')} />
                  <FieldRow label="Client connected to or involves a controlling party" value={f('client_connected_to_controller')} onChange={(v) => set('client_connected_to_controller', v)} type="select" options={['not coded','yes','probable / inferred','no','unclear / not stated']} provenance={prov('client_connected_to_controller')} onMarkReviewed={() => markReviewed('client_connected_to_controller')} />
                  <FieldRow label="Movement to unknown or unsafe location" value={f('movement_to_unknown_unsafe_location')} onChange={(v) => set('movement_to_unknown_unsafe_location', v)} type="select" options={['not coded','yes','probable / inferred','no','unclear / not stated']} provenance={prov('movement_to_unknown_unsafe_location')} onMarkReviewed={() => markReviewed('movement_to_unknown_unsafe_location')} />
                  <FieldRow label="Worker unaware how they arrived / memory gap re: location" value={f('worker_unaware_how_arrived')} onChange={(v) => set('worker_unaware_how_arrived', v)} type="select" options={['not coded','yes','probable / inferred','no','unclear / not stated']} provenance={prov('worker_unaware_how_arrived')} onMarkReviewed={() => markReviewed('worker_unaware_how_arrived')} />
                  <FieldRow label="Grooming / recruitment concern" value={f('grooming_recruitment_concern')} onChange={(v) => set('grooming_recruitment_concern', v)} type="select" options={['not coded','yes','probable / inferred','no','unclear / not stated']} provenance={prov('grooming_recruitment_concern')} onMarkReviewed={() => markReviewed('grooming_recruitment_concern')} />
                  <FieldRow label="Repeat targeting or pattern concern" value={f('repeat_targeting_concern')} onChange={(v) => set('repeat_targeting_concern', v)} type="select" options={['not coded','yes','probable / inferred','no','unclear / not stated']} provenance={prov('repeat_targeting_concern')} onMarkReviewed={() => markReviewed('repeat_targeting_concern')} />
                  <FieldRow label="Multiple women / multiple victims referenced" value={f('multiple_women_referenced')} onChange={(v) => set('multiple_women_referenced', v)} type="select" options={['not coded','yes','probable / inferred','no','unclear / not stated']} provenance={prov('multiple_women_referenced')} onMarkReviewed={() => markReviewed('multiple_women_referenced')} />
                  <FieldRow label="Organized or group offending concern" value={f('organized_group_offending_concern')} onChange={(v) => set('organized_group_offending_concern', v)} type="select" options={['not coded','yes','probable / inferred','no','unclear / not stated']} provenance={prov('organized_group_offending_concern')} onMarkReviewed={() => markReviewed('organized_group_offending_concern')} />
                  <FieldRow label="Public safety bulletin suitability" value={f('public_safety_bulletin_suitability')} onChange={(v) => set('public_safety_bulletin_suitability', v)} type="select" options={['not coded','immediate — issue bulletin','yes — further review needed','possible — analyst review','no — insufficient evidence','unclear']} provenance={prov('public_safety_bulletin_suitability')} onMarkReviewed={() => markReviewed('public_safety_bulletin_suitability')} />
                  <FieldRow label="Public safety urgency level" value={f('public_safety_urgency_level')} onChange={(v) => set('public_safety_urgency_level', v)} type="select" options={['not coded','urgent — same-day action','high — within 48 hours','moderate — within 1 week','low — monitor','not applicable']} provenance={prov('public_safety_urgency_level')} onMarkReviewed={() => markReviewed('public_safety_urgency_level')} />
                  <FieldRow label="VAWG / exploitation notes" value={f('vawg_exploitation_notes')} onChange={(v) => set('vawg_exploitation_notes', v)} type="textarea" placeholder="Note the exact concern, uncertainty, or supporting detail. For example: third-party control, possible trafficking, repeated targeting, unknown location, grooming concern, group offending, public safety bulletin issue." provenance={prov('vawg_exploitation_notes')} onMarkReviewed={() => markReviewed('vawg_exploitation_notes')} />
                  <FieldRow label="Key VAWG / exploitation excerpt(s)" value={f('vawg_key_excerpts')} onChange={(v) => set('vawg_key_excerpts', v)} type="textarea" placeholder="Paste short report excerpts supporting the VAWG, exploitation, trafficking, or public safety flag." provenance={prov('vawg_key_excerpts')} onMarkReviewed={() => markReviewed('vawg_key_excerpts')} />
                </SectionPanel>
              </div>
            )}

            {activeTab === 'mobility' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  This tab codes whether the encounter moved, how it moved, who controlled movement and whether movement changed visibility, isolation, access to help or client control.
                </div>
                {/* A. Movement present */}
                <SectionPanel title="Movement Present" fieldKeys={['movement_present']} fields={fields}>
                  <FieldRow label="Movement present" value={f('movement_present')} onChange={(v) => set('movement_present', v)} type="yesno-extended" suggested={s('movement_present')} onAcceptSuggestion={() => acceptSuggestion('movement_present')} provenance={prov('movement_present')} onMarkReviewed={() => markReviewed('movement_present')} badge={showNlpChips ? <NlpBadge rank={nlp.movement_rank ?? 3} evidence={nlp.movement_evidence ?? []} fieldValue={f('movement_present')} /> : undefined} />
                </SectionPanel>

                {/* B. Movement details — hidden when movement_present = 'no' */}
                {f('movement_present') !== 'no' && (
                  <SectionPanel title="Movement Details" fieldKeys={['movement_count','mode_of_movement','entered_vehicle','vehicle_driver_role','who_controlled_movement','unexplained_relocation','movement_purpose']} fields={fields}>
                    <FieldRow label="Movement count" value={f('movement_count')} onChange={(v) => set('movement_count', v)} type="text" placeholder="Number of distinct location changes during the encounter." provenance={prov('movement_count')} onMarkReviewed={() => markReviewed('movement_count')} />
                    <FieldRow label="Mode of movement" value={f('mode_of_movement')} onChange={(v) => set('mode_of_movement', v)} type="select" options={['on foot','personal vehicle','offender vehicle','rideshare / taxi','public transit','bicycle','motorcycle','boat','unknown','other']} suggested={s('mode_of_movement')} onAcceptSuggestion={() => acceptSuggestion('mode_of_movement')} provenance={prov('mode_of_movement')} onMarkReviewed={() => markReviewed('mode_of_movement')} placeholder="Code the main mode used for the most consequential movement, not every minor movement." />
                    <FieldRow label="Entered vehicle" value={f('entered_vehicle')} onChange={(v) => set('entered_vehicle', v)} type="yesno-extended" suggested={s('entered_vehicle')} onAcceptSuggestion={() => acceptSuggestion('entered_vehicle')} provenance={prov('entered_vehicle')} onMarkReviewed={() => markReviewed('entered_vehicle')} />
                    {f('entered_vehicle') !== 'no' && f('mode_of_movement') !== 'on foot' && (
                      <FieldRow label="Vehicle driver role" value={f('vehicle_driver_role')} onChange={(v) => set('vehicle_driver_role', v)} type="select" options={['suspect driving','victim/survivor driving','third party driving','rideshare / taxi driver','shared or unclear driving','unknown','other']} provenance={prov('vehicle_driver_role')} onMarkReviewed={() => markReviewed('vehicle_driver_role')} />
                    )}
                    <FieldRow label="Who controlled movement" value={f('who_controlled_movement')} onChange={(v) => set('who_controlled_movement', v)} type="select" options={['suspect controlled','victim/survivor controlled','shared','unclear','unknown']} provenance={prov('who_controlled_movement')} onMarkReviewed={() => markReviewed('who_controlled_movement')} />
                    <FieldRow label="Unexplained relocation or memory gap involving location" value={f('unexplained_relocation')} onChange={(v) => set('unexplained_relocation', v)} type="yesno-extended" provenance={prov('unexplained_relocation')} onMarkReviewed={() => markReviewed('unexplained_relocation')} />
                    <FieldRow label="Movement purpose / function" value={f('movement_purpose')} onChange={(v) => set('movement_purpose', v)} type="select" options={['relocation to more private setting','relocation to more secluded setting','movement during escape or avoidance','movement imposed by suspect','routine travel to agreed location','unclear','other']} provenance={prov('movement_purpose')} onMarkReviewed={() => markReviewed('movement_purpose')} />
                  </SectionPanel>
                )}

                {/* C. Geography shift — hidden when movement_present = 'no' */}
                {f('movement_present') !== 'no' && (
                  <SectionPanel title="Geography Shift" fieldKeys={['start_location_type','destination_location_type','public_to_private_shift','public_to_secluded_shift','cross_neighbourhood','cross_municipality','cross_city_movement']} fields={fields}>
                    <FieldRow label="Start location type" value={f('start_location_type')} onChange={(v) => set('start_location_type', v)} type="select" options={['residence','SRO','hostel / shelter','street / public area','hotel / motel','bar / club / lounge','massage parlour / spa','escort agency','vehicle','park / open space','vacant lot','commercial building','industrial / warehouse','alley / lane','transit hub','unknown','other']} suggested={s('start_location_type')} onAcceptSuggestion={() => acceptSuggestion('start_location_type')} provenance={prov('start_location_type')} onMarkReviewed={() => markReviewed('start_location_type')} />
                    <FieldRow label="Destination location type" value={f('destination_location_type')} onChange={(v) => set('destination_location_type', v)} type="select" options={['residence','SRO','hostel / shelter','street / public area','hotel / motel','bar / club / lounge','massage parlour / spa','escort agency','vehicle','park / open space','vacant lot','commercial building','industrial / warehouse','alley / lane','transit hub','unknown','other']} suggested={s('destination_location_type')} onAcceptSuggestion={() => acceptSuggestion('destination_location_type')} provenance={prov('destination_location_type')} onMarkReviewed={() => markReviewed('destination_location_type')} />
                    <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '4px 0 8px', fontStyle: 'italic' }}>
                      Code yes only when the narrative supports the shift. Use unclear when a shift is possible but location detail is insufficient.
                    </div>
                    <FieldRow label="Public → private shift" value={f('public_to_private_shift')} onChange={(v) => set('public_to_private_shift', v)} type="yesno-extended" suggested={s('public_to_private_shift')} onAcceptSuggestion={() => acceptSuggestion('public_to_private_shift')} provenance={prov('public_to_private_shift')} onMarkReviewed={() => markReviewed('public_to_private_shift')} />
                    <FieldRow label="Public → secluded shift" value={f('public_to_secluded_shift')} onChange={(v) => set('public_to_secluded_shift', v)} type="yesno-extended" suggested={s('public_to_secluded_shift')} onAcceptSuggestion={() => acceptSuggestion('public_to_secluded_shift')} provenance={prov('public_to_secluded_shift')} onMarkReviewed={() => markReviewed('public_to_secluded_shift')} />
                    <FieldRow label="Cross neighbourhood" value={f('cross_neighbourhood')} onChange={(v) => set('cross_neighbourhood', v)} type="yesno-extended" provenance={prov('cross_neighbourhood')} onMarkReviewed={() => markReviewed('cross_neighbourhood')} />
                    <FieldRow label="Cross municipality" value={f('cross_municipality')} onChange={(v) => set('cross_municipality', v)} type="yesno-extended" provenance={prov('cross_municipality')} onMarkReviewed={() => markReviewed('cross_municipality')} />
                    <FieldRow label="Cross-city movement" value={f('cross_city_movement')} onChange={(v) => set('cross_city_movement', v)} type="yesno-extended" provenance={prov('cross_city_movement')} onMarkReviewed={() => markReviewed('cross_city_movement')} />
                  </SectionPanel>
                )}

                {/* D. Control and coercion — hidden when movement_present = 'no' */}
                {f('movement_present') !== 'no' && (
                  <SectionPanel title="Control and Coercion" fieldKeys={['offender_control_over_movement']} fields={fields}>
                    <FieldRow label="Suspect control over movement" value={f('offender_control_over_movement')} onChange={(v) => set('offender_control_over_movement', v)} type="select" options={['none indicated','suggested movement','pressured movement','deceived into movement','physically forced movement','prevented exit','controlled by vehicle access','unclear','unknown']} provenance={prov('offender_control_over_movement')} onMarkReviewed={() => markReviewed('offender_control_over_movement')} />
                  </SectionPanel>
                )}

                {/* E. Movement pattern classification */}
                <SectionPanel title="Movement Pattern" fieldKeys={['movement_pattern_type','movement_timing']} fields={fields}>
                  <FieldRow label="Movement pattern type" value={f('movement_pattern_type')} onChange={(v) => set('movement_pattern_type', v)} type="select" options={['no movement described','movement unclear','movement within same area','public/street to vehicle','public/street to secluded outdoor location','public/street to residence/private indoor location','vehicle-based encounter','movement across neighbourhood','movement across municipality','post-incident drop-off/stranding','multiple-stage movement','other']} provenance={prov('movement_pattern_type')} onMarkReviewed={() => markReviewed('movement_pattern_type')} />
                  <FieldRow label="Movement timing" value={f('movement_timing')} onChange={(v) => set('movement_timing', v)} type="select" options={['before negotiation','after negotiation','before escalation','during escalation','during/after violence','post-incident','unclear','not applicable']} provenance={prov('movement_timing')} onMarkReviewed={() => markReviewed('movement_timing')} />
                </SectionPanel>

                {/* F. Confidence and notes */}
                <SectionPanel title="Confidence and Notes" fieldKeys={['movement_confidence','basis_for_movement_coding','movement_notes']} fields={fields} defaultCollapsed>
                  <FieldRow label="Movement confidence" value={f('movement_confidence')} onChange={(v) => set('movement_confidence', v)} type="select" options={['high','medium','low','unclear']} provenance={prov('movement_confidence')} onMarkReviewed={() => markReviewed('movement_confidence')} />
                  <FieldRow label="Basis for movement coding" value={f('basis_for_movement_coding')} onChange={(v) => set('basis_for_movement_coding', v)} type="select" options={['explicit narrative statement','inferred from sequence','inferred from addresses / GIS','NLP suggestion only','unclear']} provenance={prov('basis_for_movement_coding')} onMarkReviewed={() => markReviewed('basis_for_movement_coding')} />
                  <FieldRow label="Movement notes" value={f('movement_notes')} onChange={(v) => set('movement_notes', v)} type="textarea" placeholder="Analyst notes on movement coding confidence and sources." provenance={prov('movement_notes')} onMarkReviewed={() => markReviewed('movement_notes')} />
                </SectionPanel>
              </div>
            )}

            {activeTab === 'suspect' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  This tab records suspect and vehicle information where it supports case comparison, repeat-client identification, vehicle involvement or movement analysis.
                </div>
                <SectionPanel title="Suspect Description" fieldKeys={['suspect_count','suspect_gender','suspect_description_text','suspect_race_ethnicity','suspect_age_estimate','suspect_distinctive_features','suspect_clothing','suspect_speech_notes','suspect_behavioural_descriptors','known_repeat_suspect','repeat_suspect_flag']} fields={fields} noAutoCollapse>
                  <FieldRow label="Suspect count" value={f('suspect_count')} onChange={(v) => set('suspect_count', v)} suggested={s('suspect_count')} onAcceptSuggestion={() => acceptSuggestion('suspect_count')} provenance={prov('suspect_count')} onMarkReviewed={() => markReviewed('suspect_count')} />
                  <FieldRow label="Suspect gender" value={f('suspect_gender')} onChange={(v) => set('suspect_gender', v)} suggested={s('suspect_gender')} onAcceptSuggestion={() => acceptSuggestion('suspect_gender')} provenance={prov('suspect_gender')} onMarkReviewed={() => markReviewed('suspect_gender')} />
                  <FieldRow label="Suspect description" value={f('suspect_description_text')} onChange={(v) => set('suspect_description_text', v)} type="textarea" placeholder="Use only descriptors reported in the source. Do not infer." suggested={s('suspect_description_text')} onAcceptSuggestion={() => acceptSuggestion('suspect_description_text')} provenance={prov('suspect_description_text')} onMarkReviewed={() => markReviewed('suspect_description_text')} />
                  <FieldRow label="Race / ethnicity (as reported)" value={f('suspect_race_ethnicity')} onChange={(v) => set('suspect_race_ethnicity', v)} suggested={s('suspect_race_ethnicity')} onAcceptSuggestion={() => acceptSuggestion('suspect_race_ethnicity')} provenance={prov('suspect_race_ethnicity')} onMarkReviewed={() => markReviewed('suspect_race_ethnicity')} />
                  <FieldRow label="Age estimate" value={f('suspect_age_estimate')} onChange={(v) => set('suspect_age_estimate', v)} suggested={s('suspect_age_estimate')} onAcceptSuggestion={() => acceptSuggestion('suspect_age_estimate')} provenance={prov('suspect_age_estimate')} onMarkReviewed={() => markReviewed('suspect_age_estimate')} />
                  <FieldRow label="Distinctive features" value={f('suspect_distinctive_features')} onChange={(v) => set('suspect_distinctive_features', v)} type="textarea" placeholder="Tattoos, scars, piercings, build — as reported." provenance={prov('suspect_distinctive_features')} onMarkReviewed={() => markReviewed('suspect_distinctive_features')} />
                  <FieldRow label="Clothing" value={f('suspect_clothing')} onChange={(v) => set('suspect_clothing', v)} type="textarea" placeholder="Clothing description as reported." provenance={prov('suspect_clothing')} onMarkReviewed={() => markReviewed('suspect_clothing')} />
                  <FieldRow label="Speech / accent / language noted" value={f('suspect_speech_notes')} onChange={(v) => set('suspect_speech_notes', v)} placeholder="e.g. British accent, spoke French — as reported." provenance={prov('suspect_speech_notes')} onMarkReviewed={() => markReviewed('suspect_speech_notes')} />
                  <FieldRow label="Behavioural descriptors" value={f('suspect_behavioural_descriptors')} onChange={(v) => set('suspect_behavioural_descriptors', v)} type="textarea" placeholder="Behavioural patterns noted in the report — as reported, not interpreted." provenance={prov('suspect_behavioural_descriptors')} onMarkReviewed={() => markReviewed('suspect_behavioural_descriptors')} />
                  <FieldRow label="Known / repeat suspect indicator" value={f('known_repeat_suspect')} onChange={(v) => set('known_repeat_suspect', v)} type="yesno-extended" provenance={prov('known_repeat_suspect')} onMarkReviewed={() => markReviewed('known_repeat_suspect')} helper="Whether this suspect matches a known individual or a prior report, based on information available at time of coding." />
                  <FieldRow label="Repeat suspect flag" value={f('repeat_suspect_flag')} onChange={(v) => set('repeat_suspect_flag', v)} type="yesno-extended" provenance={prov('repeat_suspect_flag')} onMarkReviewed={() => markReviewed('repeat_suspect_flag')} helper="Flag for analyst cross-referencing: similar descriptor appears across multiple reports. Does not confirm identity." />
                </SectionPanel>

                <SectionPanel title="Vehicle" fieldKeys={['vehicle_present','vehicle_make','vehicle_year','vehicle_model','vehicle_colour','vehicle_description','plate_partial','repeat_vehicle_flag','vehicle_role_in_encounter','vehicle_ownership_association','vehicle_confidence']} fields={fields} noAutoCollapse>
                  <FieldRow label="Vehicle present" value={f('vehicle_present')} onChange={(v) => set('vehicle_present', v)} type="yesno-extended" suggested={s('vehicle_present')} onAcceptSuggestion={() => acceptSuggestion('vehicle_present')} provenance={prov('vehicle_present')} onMarkReviewed={() => markReviewed('vehicle_present')} />
                  {['yes','probable','inferred','unclear'].includes(f('vehicle_present') || '') && (
                    <>
                      <FieldRow label="Vehicle make" value={f('vehicle_make')} onChange={(v) => set('vehicle_make', v)} suggested={s('vehicle_make')} onAcceptSuggestion={() => acceptSuggestion('vehicle_make')} provenance={prov('vehicle_make')} onMarkReviewed={() => markReviewed('vehicle_make')} />
                      <FieldRow label="Vehicle year" value={f('vehicle_year')} onChange={(v) => set('vehicle_year', v)} provenance={prov('vehicle_year')} onMarkReviewed={() => markReviewed('vehicle_year')} placeholder="e.g. 2019" />
                      <FieldRow label="Vehicle model" value={f('vehicle_model')} onChange={(v) => set('vehicle_model', v)} suggested={s('vehicle_model')} onAcceptSuggestion={() => acceptSuggestion('vehicle_model')} provenance={prov('vehicle_model')} onMarkReviewed={() => markReviewed('vehicle_model')} />
                      <FieldRow label="Vehicle colour" value={f('vehicle_colour')} onChange={(v) => set('vehicle_colour', v)} suggested={s('vehicle_colour')} onAcceptSuggestion={() => acceptSuggestion('vehicle_colour')} provenance={prov('vehicle_colour')} onMarkReviewed={() => markReviewed('vehicle_colour')} />
                      <FieldRow label="Vehicle description" value={f('vehicle_description')} onChange={(v) => set('vehicle_description', v)} type="textarea" placeholder='Free-text description, e.g. "painter&apos;s van with ladders", "rusted rear panel"' provenance={prov('vehicle_description')} onMarkReviewed={() => markReviewed('vehicle_description')} />
                      <FieldRow label="Plate (partial)" value={f('plate_partial')} onChange={(v) => set('plate_partial', v)} suggested={s('plate_partial')} onAcceptSuggestion={() => acceptSuggestion('plate_partial')} placeholder="e.g. JC3 37L" provenance={prov('plate_partial')} onMarkReviewed={() => markReviewed('plate_partial')} />
                      <FieldRow label="Vehicle role in encounter" value={f('vehicle_role_in_encounter')} onChange={(v) => set('vehicle_role_in_encounter', v)} type="select" options={['transportation only','offence location','movement / control mechanism','suspect identification clue','escape / exit context','unclear','other']} provenance={prov('vehicle_role_in_encounter')} onMarkReviewed={() => markReviewed('vehicle_role_in_encounter')} helper="What function did the vehicle serve? Distinguish transportation from use as a control mechanism or offence location." />
                      <FieldRow label="Vehicle ownership / association" value={f('vehicle_ownership_association')} onChange={(v) => set('vehicle_ownership_association', v)} type="select" options={['suspect vehicle','victim/survivor vehicle','third party vehicle','rideshare / taxi','unknown','other']} provenance={prov('vehicle_ownership_association')} onMarkReviewed={() => markReviewed('vehicle_ownership_association')} helper="Who is associated with this vehicle based on available information in the report?" />
                      <FieldRow label="Vehicle confidence" value={f('vehicle_confidence')} onChange={(v) => set('vehicle_confidence', v)} type="select" options={['high','medium','low','unclear']} provenance={prov('vehicle_confidence')} onMarkReviewed={() => markReviewed('vehicle_confidence')} helper="Analyst confidence in the accuracy of the vehicle description as reported." />
                      <FieldRow label="Repeat vehicle flag" value={f('repeat_vehicle_flag')} onChange={(v) => set('repeat_vehicle_flag', v)} type="yesno-extended" provenance={prov('repeat_vehicle_flag')} onMarkReviewed={() => markReviewed('repeat_vehicle_flag')} helper="Flag for analyst cross-referencing: same or similar vehicle description appears across multiple reports." />
                    </>
                  )}
                </SectionPanel>

                <SectionPanel title="Supplementary Concern Flags" fieldKeys={['concern_trafficking','concern_third_party_control','concern_grooming','concern_organized_offending','concern_repeat_suspect','concern_repeat_vehicle','concern_urgent_public_safety','concern_bulletin_suitable','concern_flag_rationale']} fields={fields} defaultCollapsed>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', padding: '4px 0 10px', lineHeight: 1.55 }}>
                    Code each concern flag as <strong>yes, no, unclear, probable, inferred,</strong> or <strong>unknown</strong>.
                    Leave blank if the field has not yet been reviewed.
                    Flags are coded observations only — not confirmed legal or investigative findings.
                  </div>
                  <FieldRow label="Possible trafficking / exploitation concern" value={f('concern_trafficking')} onChange={(v) => set('concern_trafficking', v)} type="yesno-extended" provenance={prov('concern_trafficking')} onMarkReviewed={() => markReviewed('concern_trafficking')} />
                  <FieldRow label="Third-party control indicated" value={f('concern_third_party_control')} onChange={(v) => set('concern_third_party_control', v)} type="yesno-extended" provenance={prov('concern_third_party_control')} onMarkReviewed={() => markReviewed('concern_third_party_control')} />
                  <FieldRow label="Grooming / recruitment concern" value={f('concern_grooming')} onChange={(v) => set('concern_grooming', v)} type="yesno-extended" provenance={prov('concern_grooming')} onMarkReviewed={() => markReviewed('concern_grooming')} />
                  <FieldRow label="Organized or group offending concern" value={f('concern_organized_offending')} onChange={(v) => set('concern_organized_offending', v)} type="yesno-extended" provenance={prov('concern_organized_offending')} onMarkReviewed={() => markReviewed('concern_organized_offending')} />
                  <FieldRow label="Repeat suspect concern" value={f('concern_repeat_suspect')} onChange={(v) => set('concern_repeat_suspect', v)} type="yesno-extended" provenance={prov('concern_repeat_suspect')} onMarkReviewed={() => markReviewed('concern_repeat_suspect')} helper="Operational concern that this suspect may be targeting repeatedly. Supports further investigation or intelligence flagging." />
                  <FieldRow label="Repeat vehicle concern" value={f('concern_repeat_vehicle')} onChange={(v) => set('concern_repeat_vehicle', v)} type="yesno-extended" provenance={prov('concern_repeat_vehicle')} onMarkReviewed={() => markReviewed('concern_repeat_vehicle')} helper="Operational concern about repeat vehicle use across incidents. Supports further investigation." />
                  <FieldRow label="Urgent public safety concern" value={f('concern_urgent_public_safety')} onChange={(v) => set('concern_urgent_public_safety', v)} type="yesno-extended" provenance={prov('concern_urgent_public_safety')} onMarkReviewed={() => markReviewed('concern_urgent_public_safety')} />
                  <FieldRow label="Bulletin suitable" value={f('concern_bulletin_suitable')} onChange={(v) => set('concern_bulletin_suitable', v)} type="yesno-extended" provenance={prov('concern_bulletin_suitable')} onMarkReviewed={() => markReviewed('concern_bulletin_suitable')} />
                  {(['yes','probable','inferred','unclear'].some(v => [
                    f('concern_trafficking'), f('concern_third_party_control'), f('concern_grooming'),
                    f('concern_organized_offending'), f('concern_repeat_suspect'), f('concern_repeat_vehicle'),
                    f('concern_urgent_public_safety'), f('concern_bulletin_suitable'),
                  ].includes(v))) && (
                    <FieldRow label="Flag rationale / supporting details" value={f('concern_flag_rationale')} onChange={(v) => set('concern_flag_rationale', v)} type="textarea" placeholder="Summarize the basis for the flags coded above." provenance={prov('concern_flag_rationale')} onMarkReviewed={() => markReviewed('concern_flag_rationale')} />
                  )}
                </SectionPanel>
              </div>
            )}

            {activeTab === 'narrative' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  Narrative excerpts are verbatim quotations that support specific coding decisions. Text scan outputs are suggestions only — coding decisions must be reviewed and confirmed by the analyst.
                </div>

                <MultiCheckboxField
                  label="Highest stages reached (select all that apply)"
                  value={f('highest_stage_reached')}
                  onChange={(v) => set('highest_stage_reached', v)}
                  options={['negotiation conflict','coercion/control','physical violence','sexual violence','robbery/theft','weapon involvement','confinement/prevented exit','substance administration/intoxication','movement/control','threats/intimidation','mixed severe harm','unknown']}
                />
                <FieldRow label="Turning point / key shift" value={f('turning_point')} onChange={(v) => set('turning_point', v)} type="select" options={['no clear turning point','boundary tested','refusal ignored','payment or service dispute escalated','pressure increased','verbal aggression escalated','deception or agreement shift','location shift imposed','isolation increased','exit blocked or movement controlled','physical force applied','weapon implied or produced','sexual assault initiated','robbery initiated','substance administered or intoxication became relevant','third party entered or intervened','other']} provenance={prov('turning_point')} onMarkReviewed={() => markReviewed('turning_point')} helper="The moment the encounter changed in nature or intensity. May precede or coincide with the escalation point." />
                <FieldRow label="Escalation point" value={f('escalation_point')} onChange={(v) => set('escalation_point', v)} type="select" options={['no clear escalation','refusal ignored','pressure increased','threat introduced','movement imposed','isolation increased','exit blocked','physical force first used','weapon introduced','sexual violence initiated','robbery initiated','substance administration / intoxication identified','other']} suggested={s('escalation_point')} onAcceptSuggestion={() => acceptSuggestion('escalation_point')} provenance={prov('escalation_point')} onMarkReviewed={() => markReviewed('escalation_point')} helper="The first clear step-change toward harm or control. Code the most analytically significant shift, not every increase in pressure." />
                <FieldRow label="Resolution / endpoint" value={f('resolution_endpoint')} onChange={(v) => set('resolution_endpoint', v)} type="select" options={['victim/survivor escaped','victim/survivor left voluntarily','suspect left','victim/survivor forced out of vehicle','victim/survivor pushed or thrown out of vehicle','victim/survivor forced out of residence','victim/survivor pushed or thrown out of residence','left at unknown location','assault completed','robbery completed','both parties separated / encounter ended','third-party interruption','police/security interruption','unknown','other']} provenance={prov('resolution_endpoint')} onMarkReviewed={() => markReviewed('resolution_endpoint')} helper="How the encounter physically ended — the mechanism of separation, not the aftermath." />
                <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '2px 0 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span>Field distinctions for the sections below:</span>
                  <span>· <strong style={{ fontWeight: 600, color: 'var(--text-2)' }}>Key quotes</strong> — verbatim phrases from the report that justify coding.</span>
                  <span>· <strong style={{ fontWeight: 600, color: 'var(--text-2)' }}>Coder notes</strong> — analyst observations about coding choices.</span>
                  <span>· <strong style={{ fontWeight: 600, color: 'var(--text-2)' }}>Uncertainty notes</strong> — missing, conflicting, or ambiguous details.</span>
                </div>
                {(() => {
                  const state = provenance['summary_analytic'] ?? 'unset';
                  const isAnalyst = state === 'analyst_filled' || state === 'reviewed';
                  const provLabel = isAnalyst ? 'Analyst entered' : state === 'ai_suggested' ? 'System generated' : f('summary_analytic') ? 'Source unknown' : null;
                  return provLabel ? (
                    <div style={{ fontSize: 10.5, marginBottom: 2, paddingLeft: 2 }}>
                      <span style={{ fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                        background: isAnalyst ? 'var(--green-pale)' : 'var(--amber-pale)',
                        color: isAnalyst ? 'var(--green)' : 'var(--amber)',
                        border: `1px solid ${isAnalyst ? 'var(--green-border)' : 'var(--amber-border)'}` }}>
                        {provLabel}
                      </span>
                    </div>
                  ) : null;
                })()}
                <FieldRow label="Analytic summary (coded)" value={f('summary_analytic')} onChange={(v) => set('summary_analytic', v)} type="textarea" suggested={s('summary_analytic')} onAcceptSuggestion={() => acceptSuggestion('summary_analytic')} placeholder="Brief coded summary of the sequence, turning point, and outcome. Do not add interpretation beyond the report." provenance={prov('summary_analytic')} onMarkReviewed={() => markReviewed('summary_analytic')} />
                <FieldRow label="Encounter sequence pattern" value={f('sequence_pattern')} onChange={(v) => set('sequence_pattern', v)} type="textarea" placeholder="Describe the overall encounter sequence pattern as derived from coding. Example: contact → negotiation → refusal ignored → movement to vehicle → assault → abandoned at location. Distinct from the auto-generated chain — write this after reviewing all coded stages." provenance={prov('sequence_pattern')} onMarkReviewed={() => markReviewed('sequence_pattern')} helper="Used in Case Summary and cross-case comparison. Missing information must not be treated as absence — use 'unclear' or 'not enough information' for gaps." />
                <FieldRow label="Key quotes" value={f('key_quotes')} onChange={(v) => set('key_quotes', v)} type="textarea" placeholder="Verbatim phrases from the report that justify coding." suggested={s('key_quotes')} onAcceptSuggestion={() => acceptSuggestion('key_quotes')} provenance={prov('key_quotes')} onMarkReviewed={() => markReviewed('key_quotes')} />
                <FieldRow label="Coder notes" value={f('coder_notes')} onChange={(v) => set('coder_notes', v)} type="textarea" placeholder="Analyst observations about coding choices." provenance={prov('coder_notes')} onMarkReviewed={() => markReviewed('coder_notes')} />
                <FieldRow label="Uncertainty notes" value={f('uncertainty_notes')} onChange={(v) => set('uncertainty_notes', v)} type="textarea" placeholder="Missing, conflicting, or ambiguous details." suggested={s('uncertainty_notes')} onAcceptSuggestion={() => acceptSuggestion('uncertainty_notes')} provenance={prov('uncertainty_notes')} onMarkReviewed={() => markReviewed('uncertainty_notes')} />

                <SectionPanel title="Topic-Specific Excerpts" fieldKeys={['stage_excerpt','behaviour_excerpt','environment_excerpt','movement_excerpt','uncertainty_excerpt']} fields={fields} defaultCollapsed>
                  <FieldRow label="Stage excerpt" value={f('stage_excerpt')} onChange={(v) => set('stage_excerpt', v)} type="textarea" placeholder="Verbatim text supporting stage coding." provenance={prov('stage_excerpt')} onMarkReviewed={() => markReviewed('stage_excerpt')} />
                  <FieldRow label="Behaviour excerpt" value={f('behaviour_excerpt')} onChange={(v) => set('behaviour_excerpt', v)} type="textarea" placeholder="Verbatim text supporting behaviour coding." provenance={prov('behaviour_excerpt')} onMarkReviewed={() => markReviewed('behaviour_excerpt')} />
                  <FieldRow label="Environment excerpt" value={f('environment_excerpt')} onChange={(v) => set('environment_excerpt', v)} type="textarea" placeholder="Verbatim text supporting environment / setting coding." provenance={prov('environment_excerpt')} onMarkReviewed={() => markReviewed('environment_excerpt')} />
                  <FieldRow label="Movement excerpt" value={f('movement_excerpt')} onChange={(v) => set('movement_excerpt', v)} type="textarea" placeholder="Verbatim text supporting mobility coding." provenance={prov('movement_excerpt')} onMarkReviewed={() => markReviewed('movement_excerpt')} />
                  <FieldRow label="Uncertainty excerpt" value={f('uncertainty_excerpt')} onChange={(v) => set('uncertainty_excerpt', v)} type="textarea" placeholder="Verbatim text illustrating ambiguity or data limitation." provenance={prov('uncertainty_excerpt')} onMarkReviewed={() => markReviewed('uncertainty_excerpt')} />
                </SectionPanel>

                <SectionPanel title="Optional Text Scan / Analyst Support" fieldKeys={[]} fields={fields} defaultCollapsed>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10, fontStyle: 'italic' }}>
                    Text scan outputs are suggestions only. Coding decisions must be reviewed and confirmed by the analyst.
                  </div>
                  <NlpSignalsPanel nlp={nlp} onSetField={(field, value) => set(field as keyof Report, value)} reportId={report?.report_id} getFieldValue={(field) => f(field as keyof Report)} />
                  <EscalationArc esc={nlp.escalation ?? {}} />
                  <WeatherCard w={weather} />
                  {!isNew && (
                    <ParseViewer narrative={narrative} reportId={report?.report_id} />
                  )}
                </SectionPanel>
              </div>
            )}

            {activeTab === 'gis' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 10, padding: '10px 14px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  GIS outputs reflect coded and geocoded fields only. Cases with vague or uncertain location information should be coded as approximate or not mappable rather than forced into precise spatial analysis.
                </div>
                <div style={{ marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <FieldRow label="Mappable status" value={f('mappable_status')} onChange={(v) => set('mappable_status', v)} type="select" options={['mappable','approximate','not mappable','withheld/sensitive','not reviewed']} provenance={prov('mappable_status')} onMarkReviewed={() => markReviewed('mappable_status')} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowGisMap(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 12px', borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                      color: 'var(--text-1)', fontSize: 12, fontFamily: 'DM Sans, sans-serif',
                      cursor: 'pointer', fontWeight: 500,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                      <line x1="9" y1="3" x2="9" y2="18"/>
                      <line x1="15" y1="6" x2="15" y2="21"/>
                    </svg>
                    Open Map
                  </button>
                  </div>
                </div>
                {([
                  {
                    heading: 'INITIAL CONTACT POINT',
                    rawKey:    'initial_contact_address_raw' as const,
                    normKey:   'initial_contact_address_normalized' as const,
                    locTypeKey:'initial_contact_location_type' as const,
                    precKey:   'initial_contact_precision' as const,
                    srcKey:    'initial_contact_source' as const,
                    confKey:   'initial_contact_confidence' as const,
                    geoStatKey:'initial_contact_geocoding_status' as const,
                    notesKey:  'initial_contact_analyst_notes' as const,
                    latKey:    'lat_initial' as const,
                    lonKey:    'lon_initial' as const,
                  },
                  {
                    heading: 'INCIDENT POINT',
                    rawKey:    'incident_address_raw' as const,
                    normKey:   'incident_address_normalized' as const,
                    locTypeKey:'incident_location_type' as const,
                    precKey:   'incident_precision' as const,
                    srcKey:    'incident_source' as const,
                    confKey:   'incident_confidence' as const,
                    geoStatKey:'incident_geocoding_status' as const,
                    notesKey:  'incident_analyst_notes' as const,
                    latKey:    'lat_incident' as const,
                    lonKey:    'lon_incident' as const,
                  },
                  {
                    heading: 'DESTINATION POINT',
                    rawKey:    'destination_address_raw' as const,
                    normKey:   'destination_address_normalized' as const,
                    locTypeKey:'destination_location_type' as const,
                    precKey:   'destination_precision' as const,
                    srcKey:    'destination_source' as const,
                    confKey:   'destination_confidence' as const,
                    geoStatKey:'destination_geocoding_status' as const,
                    notesKey:  'destination_analyst_notes' as const,
                    latKey:    'lat_destination' as const,
                    lonKey:    'lon_destination' as const,
                  },
                ]).map((loc) => {
                  // Destination point only relevant when movement is present/possible
                  const movPres = f('movement_present');
                  if (loc.heading === 'DESTINATION POINT' && movPres === 'no') return null;
                  const lat = fields[loc.latKey] as number | null;
                  const lon = fields[loc.lonKey] as number | null;
                  const hasCoords = lat != null && lon != null && (Math.abs(lat) > 0.001 || Math.abs(lon) > 0.001);
                  return (
                    <div key={loc.heading} style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{
                        padding: '6px 12px',
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                        color: 'var(--text-3)', background: 'var(--surface-2)',
                        borderBottom: '1px solid var(--border)',
                      }}>{loc.heading}</div>
                      <div style={{ padding: '6px 12px' }}>
                        <FieldRow label="Raw address / source location" value={f(loc.rawKey)} onChange={(v) => set(loc.rawKey, v)} placeholder="Use the location exactly as reported, even if incomplete." provenance={prov(loc.rawKey)} onMarkReviewed={() => markReviewed(loc.rawKey)} />
                        <FieldRow label="Normalized address" value={f(loc.normKey)} onChange={(v) => set(loc.normKey, v)} placeholder="Use standardized address only when needed for geocoding." provenance={prov(loc.normKey)} onMarkReviewed={() => markReviewed(loc.normKey)} />
                        <FieldRow label="Location type" value={f(loc.locTypeKey)} onChange={(v) => set(loc.locTypeKey, v)} type="select" options={['residence','SRO','hostel / shelter','street / public area','hotel / motel','bar / club / lounge','massage parlour / spa','escort agency','vehicle','park / open space','vacant lot','commercial building','industrial / warehouse','alley / lane','transit hub','unknown','other']} provenance={prov(loc.locTypeKey)} onMarkReviewed={() => markReviewed(loc.locTypeKey)} />
                        <FieldRow label="Precision" value={f(loc.precKey)} onChange={(v) => set(loc.precKey, v)} type="select" options={['exact address','intersection','block','venue / landmark','street segment','park / open space','neighbourhood','municipality only','unknown']} provenance={prov(loc.precKey)} onMarkReviewed={() => markReviewed(loc.precKey)} helper="How precisely does this coordinate represent where the event occurred? Separate from confidence in the source." />
                        <FieldRow label="Source" value={f(loc.srcKey)} onChange={(v) => set(loc.srcKey, v)} type="select" options={['report narrative','structured report field','analyst geocoded','Google Maps / geocoder','inferred from context','unknown']} provenance={prov(loc.srcKey)} onMarkReviewed={() => markReviewed(loc.srcKey)} />
                        <FieldRow label="Confidence" value={f(loc.confKey)} onChange={(v) => set(loc.confKey, v)} type="select" options={['high','medium','low','unknown']} provenance={prov(loc.confKey)} onMarkReviewed={() => markReviewed(loc.confKey)} helper="How confident are you that this location is accurate? Separate from coordinate precision." />
                        <FieldRow label="Geocoding status" value={f(loc.geoStatKey)} onChange={(v) => set(loc.geoStatKey, v)} type="select" options={['not attempted','geocoded','partially geocoded','failed','not enough information','withheld / too sensitive']} provenance={prov(loc.geoStatKey)} onMarkReviewed={() => markReviewed(loc.geoStatKey)} helper="Whether a geographic coordinate has been assigned and how." />
                        <FieldRow label="Analyst notes" value={f(loc.notesKey)} onChange={(v) => set(loc.notesKey, v)} type="textarea" placeholder="Notes on location uncertainty, source quality, or geocoding issues." provenance={prov(loc.notesKey)} onMarkReviewed={() => markReviewed(loc.notesKey)} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                          {([
                            [loc.latKey, 'Latitude'],
                            [loc.lonKey, 'Longitude'],
                          ] as [keyof Report, string][]).map(([key, label]) => (
                            <div key={String(key)}>
                              <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>{label}</label>
                              <input
                                type="number" step="0.000001"
                                value={(fields[key] as number | null) ?? ''}
                                onChange={(e) => set(key, e.target.value ? parseFloat(e.target.value) : null)}
                                placeholder="not geocoded"
                                style={{
                                  width: '100%', padding: '4px 8px', borderRadius: 5,
                                  border: '1px solid var(--border)', background: 'var(--surface)',
                                  fontSize: 12, fontFamily: 'DM Sans, monospace', color: 'var(--text-1)', outline: 'none',
                                }}
                                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                              />
                              {!hasCoords && (fields[key] as number | null) != null && (
                                <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>0.000000 detected — clear if not geocoded.</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'summary' && (
              <SummaryTab
                fields={fields}
                analystName={analystName}
                analystSummary={analystSummary}
                tags={tags}
                reportId={report?.report_id}
              />
            )}
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

      {showGisMap && (
        <GisMapModal
            fields={fields}
            onClose={() => setShowGisMap(false)}
            onGeocode={(updates) => setFields((f) => ({ ...f, ...updates }))}
          />
      )}
    </div>
  );
}

