/**
 * StageSequencer.tsx
 *
 * Analyst-driven stage coding component.
 * Each stage carries: type · behaviours · conditions · location.
 *
 * Requirements (UPDATE.md):
 *   RQ1 — ordered stage identification
 *   RQ2 — situational conditions per stage (visibility, guardianship, isolation, control)
 *   RQ3 — location + movement type per stage
 *   Behavioural extraction — client behaviours + victim responses per stage
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '../api';
import type { ReportStage } from '../types';

// ── Option definitions (fixed categories for consistency) ────────────────────

const STAGE_TYPES = [
  { value: 'initial_contact', label: 'Initial Contact',
    def: 'The first moment of interaction between offender and victim.' },
  { value: 'negotiation',     label: 'Negotiation',
    def: 'Discussion of terms, services, or payment; may include service refusal.' },
  { value: 'movement',        label: 'Movement',
    def: 'Physical relocation from one place to another — on foot or by vehicle.' },
  { value: 'escalation',      label: 'Escalation',
    def: 'Shift from negotiation to coercion, threats, or violence.' },
  { value: 'outcome',         label: 'Outcome',
    def: 'Resolution: assault completed, victim escaped, offender left, interrupted by third party, etc.' },
];

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  initial_contact: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
  negotiation:     { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
  movement:        { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
  escalation:      { bg: '#FFF1F2', border: '#FECDD3', text: '#BE123C' },
  outcome:         { bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9' },
};

const CLIENT_BEHAVIORS = [
  { value: 'pressure',        label: 'Pressure',
    def: 'Persistent verbal pushing to comply despite resistance or refusal.' },
  { value: 'deception',       label: 'Deception',
    def: 'Lies about payment, services, or intent to obtain compliance.' },
  { value: 'aggression',      label: 'Aggression',
    def: 'Intimidating tone, verbal abuse, or threatening body language.' },
  { value: 'payment_dispute', label: 'Payment dispute',
    def: 'Refusing to pay, demanding return of money, or altering payment terms mid-encounter.' },
  { value: 'condom_refusal',  label: 'Condom refusal',
    def: 'Refusing to use a condom or removing it without consent (stealthing).' },
  { value: 'other',           label: 'Other',
    def: 'Client behaviour not captured by the above categories.' },
];

const VICTIM_RESPONSES = [
  { value: 'resistance',    label: 'Resistance',
    def: 'Active verbal or physical refusal or push-back.' },
  { value: 'compliance',    label: 'Compliance',
    def: 'Giving in — under pressure, fear, or coercion.' },
  { value: 'exit_attempt',  label: 'Exit attempt',
    def: 'Tried to leave or escape the situation.' },
  { value: 'negotiation',   label: 'Negotiation',
    def: 'Attempted to renegotiate terms or de-escalate.' },
  { value: 'other',         label: 'Other',
    def: 'Victim response not captured above.' },
];

const VISIBILITY_OPTS = [
  { value: 'public',        label: 'Public',
    def: 'Clearly visible to passersby — street, open parking lot, transit stop.' },
  { value: 'semi_public',   label: 'Semi-public',
    def: 'Visible but with reduced foot traffic — quiet side street, parking structure.' },
  { value: 'semi_private',  label: 'Semi-private',
    def: 'Interior space accessible to others — hotel lobby, bar, car in traffic.' },
  { value: 'private',       label: 'Private',
    def: 'Enclosed space with no bystanders — apartment, parked car, alley.' },
  { value: 'unknown',       label: 'Unknown', def: 'Visibility cannot be determined from the report.' },
];

const GUARDIANSHIP_OPTS = [
  { value: 'present',  label: 'Present',
    def: 'Capable guardians (other people, security, police) were nearby and able to intervene.' },
  { value: 'reduced',  label: 'Reduced',
    def: 'Guardians present but unlikely to notice or intervene (distant, distracted).' },
  { value: 'absent',   label: 'Absent',
    def: 'No capable guardians were present.' },
  { value: 'delayed',  label: 'Delayed',
    def: 'Help was only available after a delay (e.g., called but not yet arrived).' },
  { value: 'unknown',  label: 'Unknown', def: 'Guardianship cannot be determined.' },
];

const ISOLATION_OPTS = [
  { value: 'not_isolated',       label: 'Not isolated',
    def: 'Victim had access to support, witnesses, or escape routes.' },
  { value: 'partially_isolated', label: 'Partially isolated',
    def: 'Some isolation — limited exit options or reduced social support.' },
  { value: 'isolated',           label: 'Isolated',
    def: 'Victim was separated from support networks, witnesses, and exit options.' },
  { value: 'unknown',            label: 'Unknown', def: 'Isolation level cannot be determined.' },
];

const CONTROL_OPTS = [
  { value: 'victim',    label: 'Victim',
    def: 'Victim controlled the space, transport, or movement at this stage.' },
  { value: 'offender',  label: 'Offender',
    def: 'Offender controlled the space, transport, or movement.' },
  { value: 'shared',    label: 'Shared',
    def: 'Control was shared or unclear between parties.' },
  { value: 'unclear',   label: 'Unclear', def: 'Cannot determine who controlled the situation.' },
];

const LOCATION_TYPE_OPTS = [
  { value: 'public',      label: 'Public',      def: 'Open, publicly accessible space.' },
  { value: 'semi_public', label: 'Semi-public', def: 'Accessible but with limited visibility or access.' },
  { value: 'private',     label: 'Private',     def: 'Enclosed space, not visible or accessible to the public.' },
  { value: 'unknown',     label: 'Unknown',     def: 'Cannot determine location type.' },
];

const MOVEMENT_TYPE_OPTS = [
  { value: 'none',    label: 'None (starting point)',
    def: 'No movement to reach this location — this is the initial meeting point.' },
  { value: 'walk',    label: 'Walked',   def: 'Movement on foot.' },
  { value: 'vehicle', label: 'Vehicle',  def: 'Movement by car, truck, rideshare, motorcycle, or other vehicle.' },
  { value: 'unknown', label: 'Unknown',  def: 'Movement occurred but the mode is unclear.' },
];

// ── Tooltip helper ────────────────────────────────────────────────────────────

function DefTooltip({ def }: { def: string }) {
  return (
    <span
      title={def}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: '50%',
        border: '1px solid var(--border)', background: 'var(--surface-2)',
        color: 'var(--text-3)', fontSize: 9.5, fontWeight: 700,
        cursor: 'help', flexShrink: 0, marginLeft: 4,
      }}
    >?</span>
  );
}

// ── Field label ───────────────────────────────────────────────────────────────

function FieldLabel({ label, def }: { label: string; def?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
        letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      {def && <DefTooltip def={def} />}
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────

function StageSelect({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; def: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', padding: '5px 8px', fontSize: 12.5,
        border: '1px solid var(--border)', borderRadius: 4,
        background: 'var(--bg)', color: value ? 'var(--text-1)' : 'var(--text-3)',
        cursor: 'pointer',
      }}
    >
      <option value="">{placeholder ?? '— select —'}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Checkbox group ────────────────────────────────────────────────────────────

function CheckboxGroup({
  options, value, onChange,
}: {
  options: { value: string; label: string; def: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (code: string) => {
    if (value.includes(code)) {
      onChange(value.filter((c) => c !== code));
    } else {
      onChange([...value, code]);
    }
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
      {options.map((o) => (
        <label
          key={o.value}
          title={o.def}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer',
            padding: '3px 0',
          }}
        >
          <input
            type="checkbox"
            checked={value.includes(o.value)}
            onChange={() => toggle(o.value)}
            style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

// ── Single stage card ─────────────────────────────────────────────────────────

const ICON_BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 4, border: 'none', background: 'transparent',
  color: 'var(--text-3)', cursor: 'pointer', borderRadius: 3,
  flexShrink: 0,
};

function StageCard({
  stage, index, total,
  onUpdate, onDelete, onMoveUp, onMoveDown,
}: {
  stage: ReportStage;
  index: number;
  total: number;
  onUpdate: (id: number, patch: Partial<ReportStage>) => void;
  onDelete: (id: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const colors = STAGE_COLORS[stage.stage_type] ?? {
    bg: 'var(--surface-2)', border: 'var(--border)', text: 'var(--text-2)',
  };
  const typeLabel = STAGE_TYPES.find((t) => t.value === stage.stage_type)?.label ?? stage.stage_type;
  const typeDef   = STAGE_TYPES.find((t) => t.value === stage.stage_type)?.def ?? '';

  const set = (patch: Partial<ReportStage>) => onUpdate(stage.id, patch);

  return (
    <div style={{
      border: `1px solid ${colors.border}`,
      borderRadius: 6, background: 'var(--bg)',
      marginBottom: 8,
    }}>
      {/* Card header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        background: colors.bg,
        borderRadius: expanded ? '6px 6px 0 0' : 6,
        cursor: 'pointer',
      }}
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Order badge */}
        <span style={{
          flexShrink: 0, width: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%', background: colors.border, color: colors.text,
          fontSize: 11, fontWeight: 700,
        }}>
          {index + 1}
        </span>

        {/* Stage type badge */}
        <span title={typeDef} style={{
          fontSize: 12, fontWeight: 600, color: colors.text,
          background: colors.bg, border: `1px solid ${colors.border}`,
          padding: '2px 8px', borderRadius: 4, cursor: 'help',
        }}>
          {typeLabel || <span style={{ fontStyle: 'italic', opacity: 0.6 }}>— no type —</span>}
        </span>

        {/* Completion indicator */}
        {(() => {
          const filled = [
            stage.stage_type, stage.visibility, stage.guardianship,
            stage.isolation_level, stage.control_type, stage.location_type,
          ].filter(Boolean).length;
          const total = 6;
          return (
            <span style={{ fontSize: 10.5, color: filled === total ? 'var(--green)' : 'var(--text-3)', marginLeft: 2 }}>
              {filled}/{total} fields
            </span>
          );
        })()}

        <div style={{ flex: 1 }} />

        {/* Reorder buttons */}
        <button
          title="Move up"
          onClick={(e) => { e.stopPropagation(); onMoveUp(index); }}
          disabled={index === 0}
          style={{ ...ICON_BTN, opacity: index === 0 ? 0.3 : 1 }}
        >
          <ArrowUp size={13} />
        </button>
        <button
          title="Move down"
          onClick={(e) => { e.stopPropagation(); onMoveDown(index); }}
          disabled={index === total - 1}
          style={{ ...ICON_BTN, opacity: index === total - 1 ? 0.3 : 1 }}
        >
          <ArrowDown size={13} />
        </button>

        {/* Delete */}
        <button
          title="Delete stage"
          onClick={(e) => { e.stopPropagation(); onDelete(stage.id); }}
          style={{ ...ICON_BTN, color: 'var(--red, #DC2626)' }}
        >
          <Trash2 size={13} />
        </button>

        {/* Expand toggle */}
        <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Stage type selector */}
          <div>
            <FieldLabel label="Stage type" def="Select the type of event that characterises this stage." />
            <StageSelect
              value={stage.stage_type}
              onChange={(v) => set({ stage_type: v })}
              options={STAGE_TYPES}
            />
          </div>

          {/* ── Behaviours ─────────────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)',
              letterSpacing: '0.03em', marginBottom: 10, textTransform: 'uppercase' }}>
              Behaviours
            </div>

            <div style={{ marginBottom: 10 }}>
              <FieldLabel
                label="Client behaviours"
                def="What did the offender do at this stage? Select all that apply."
              />
              <CheckboxGroup
                options={CLIENT_BEHAVIORS}
                value={stage.client_behaviors ?? []}
                onChange={(v) => set({ client_behaviors: v })}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <FieldLabel
                label="Victim responses"
                def="How did the victim respond at this stage? Select all that apply."
              />
              <CheckboxGroup
                options={VICTIM_RESPONSES}
                value={stage.victim_responses ?? []}
                onChange={(v) => set({ victim_responses: v })}
              />
            </div>

            <div>
              <FieldLabel
                label="Turning point / notes"
                def="Describe any key shift or turning point at this stage (e.g. shift from negotiation to coercion). Free text."
              />
              <textarea
                value={stage.turning_point_notes ?? ''}
                onChange={(e) => set({ turning_point_notes: e.target.value })}
                placeholder="Describe turning point or key behaviours (optional)"
                rows={2}
                style={{
                  width: '100%', padding: '6px 8px', fontSize: 12.5,
                  border: '1px solid var(--border)', borderRadius: 4,
                  background: 'var(--bg)', color: 'var(--text-1)',
                  resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* ── Conditions ─────────────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)',
              letterSpacing: '0.03em', marginBottom: 10, textTransform: 'uppercase' }}>
              Situational Conditions
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>

              <div>
                <FieldLabel
                  label="Visibility"
                  def="How visible was this interaction to bystanders?"
                />
                <StageSelect
                  value={stage.visibility}
                  onChange={(v) => set({ visibility: v })}
                  options={VISIBILITY_OPTS}
                />
              </div>

              <div>
                <FieldLabel
                  label="Guardianship"
                  def="Were capable guardians present or able to intervene?"
                />
                <StageSelect
                  value={stage.guardianship}
                  onChange={(v) => set({ guardianship: v })}
                  options={GUARDIANSHIP_OPTS}
                />
              </div>

              <div>
                <FieldLabel
                  label="Isolation"
                  def="Was the victim separated from support networks and exit routes?"
                />
                <StageSelect
                  value={stage.isolation_level}
                  onChange={(v) => set({ isolation_level: v })}
                  options={ISOLATION_OPTS}
                />
              </div>

              <div>
                <FieldLabel
                  label="Control"
                  def="Who controlled the space, transport, and movement at this stage?"
                />
                <StageSelect
                  value={stage.control_type}
                  onChange={(v) => set({ control_type: v })}
                  options={CONTROL_OPTS}
                />
              </div>

            </div>
          </div>

          {/* ── Location ───────────────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)',
              letterSpacing: '0.03em', marginBottom: 10, textTransform: 'uppercase' }}>
              Location
            </div>

            <div style={{ marginBottom: 10 }}>
              <FieldLabel
                label="Location description"
                def="Brief descriptive label for this location (e.g. 'street corner', 'parked car', 'hotel room')."
              />
              <input
                type="text"
                value={stage.location_label ?? ''}
                onChange={(e) => set({ location_label: e.target.value })}
                placeholder="e.g. street corner, parked car, hotel room"
                style={{
                  width: '100%', padding: '5px 8px', fontSize: 12.5,
                  border: '1px solid var(--border)', borderRadius: 4,
                  background: 'var(--bg)', color: 'var(--text-1)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
              <div>
                <FieldLabel
                  label="Location type"
                  def="Is this location public, semi-public, or private?"
                />
                <StageSelect
                  value={stage.location_type}
                  onChange={(v) => set({ location_type: v })}
                  options={LOCATION_TYPE_OPTS}
                />
              </div>
              <div>
                <FieldLabel
                  label="Movement to here"
                  def="How did the victim arrive at this stage's location?"
                />
                <StageSelect
                  value={stage.movement_type_to_here}
                  onChange={(v) => set({ movement_type_to_here: v })}
                  options={MOVEMENT_TYPE_OPTS}
                />
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}


// ── Main StageSequencer ───────────────────────────────────────────────────────

export default function StageSequencer({ reportId }: { reportId: string }) {
  const [stages, setStages] = useState<ReportStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const debounceRefs = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Load stages on mount
  useEffect(() => {
    api.getStages(reportId)
      .then((data) => setStages(data.sort((a, b) => a.stage_order - b.stage_order)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reportId]);

  // ── Add stage ───────────────────────────────────────────────────────────────
  const addStage = async (type: string) => {
    const nextOrder = stages.length > 0 ? Math.max(...stages.map((s) => s.stage_order)) + 1 : 1;
    const created = await api.createStage(reportId, {
      stage_type: type,
      stage_order: nextOrder,
      client_behaviors: [],
      victim_responses: [],
    });
    setStages((prev) => [...prev, created]);
    setShowTypeMenu(false);
  };

  // ── Delete stage ─────────────────────────────────────────────────────────────
  const deleteStage = async (id: number) => {
    await api.deleteStage(reportId, id);
    setStages((prev) => prev.filter((s) => s.id !== id));
  };

  // ── Reorder ──────────────────────────────────────────────────────────────────
  const reorder = useCallback(async (newStages: ReportStage[]) => {
    const reindexed = newStages.map((s, i) => ({ ...s, stage_order: i + 1 }));
    setStages(reindexed);
    await api.reorderStages(reportId, reindexed.map((s) => ({ id: s.id, stage_order: s.stage_order })));
  }, [reportId]);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...stages];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    reorder(next);
  };

  const moveDown = (index: number) => {
    if (index === stages.length - 1) return;
    const next = [...stages];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    reorder(next);
  };

  // ── Debounced update ─────────────────────────────────────────────────────────
  const handleUpdate = (id: number, patch: Partial<ReportStage>) => {
    // Optimistic local update
    setStages((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));

    // Debounce API call (800ms)
    if (debounceRefs.current[id]) clearTimeout(debounceRefs.current[id]);
    debounceRefs.current[id] = setTimeout(() => {
      api.updateStage(reportId, id, patch).catch(() => {});
    }, 800);
  };

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13, fontStyle: 'italic' }}>
        Loading stages…
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            Stage Sequence
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            Break this report into ordered stages. Each stage carries behaviours, conditions, and location.
          </div>
        </div>

        {/* Add stage button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowTypeMenu((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 5,
              border: '1px solid var(--accent-border, var(--accent))',
              background: 'var(--accent-pale, #EFF6FF)',
              color: 'var(--accent)', fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={13} />
            Add Stage
          </button>

          {showTypeMenu && (
            <div style={{
              position: 'absolute', top: '110%', right: 0, zIndex: 50,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              minWidth: 200, padding: '4px 0',
            }}>
              {STAGE_TYPES.map((t) => {
                const colors = STAGE_COLORS[t.value];
                return (
                  <button
                    key={t.value}
                    onClick={() => addStage(t.value)}
                    title={t.def}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '8px 14px',
                      border: 'none', background: 'transparent',
                      fontSize: 12.5, color: 'var(--text-1)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: colors?.text ?? 'var(--text-3)', flexShrink: 0,
                    }} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Validation warning */}
      {stages.length === 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px', borderRadius: 6,
          border: '1px solid #FDE68A', background: '#FFFBEB',
          color: '#92400E', fontSize: 12.5, marginBottom: 14,
        }}>
          <span style={{ flexShrink: 0, fontSize: 16 }}>⚠</span>
          <div>
            <strong>No stages defined.</strong> Reports should be broken into ordered stages before
            marking as coded. Add at least: <em>Initial Contact → Negotiation → Escalation → Outcome</em>.
          </div>
        </div>
      )}

      {/* Stage cards */}
      {stages.map((stage, index) => (
        <StageCard
          key={stage.id}
          stage={stage}
          index={index}
          total={stages.length}
          onUpdate={handleUpdate}
          onDelete={deleteStage}
          onMoveUp={moveUp}
          onMoveDown={moveDown}
        />
      ))}

      {/* Sequence summary strip */}
      {stages.length > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          padding: '10px 14px', borderRadius: 6,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          marginTop: 4,
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)',
            letterSpacing: '0.04em', textTransform: 'uppercase', marginRight: 4 }}>
            Sequence:
          </span>
          {stages.map((s, i) => {
            const colors = STAGE_COLORS[s.stage_type];
            const label = STAGE_TYPES.find((t) => t.value === s.stage_type)?.label ?? s.stage_type;
            return (
              <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  fontSize: 11.5, padding: '2px 8px', borderRadius: 4,
                  background: colors?.bg ?? 'var(--surface-2)',
                  border: `1px solid ${colors?.border ?? 'var(--border)'}`,
                  color: colors?.text ?? 'var(--text-2)',
                  fontWeight: 500,
                }}>
                  {label || '?'}
                </span>
                {i < stages.length - 1 && (
                  <span style={{ color: 'var(--text-3)', fontSize: 12 }}>→</span>
                )}
              </span>
            );
          })}
        </div>
      )}

    </div>
  );
}
