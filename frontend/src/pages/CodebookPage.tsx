import { useState } from 'react';
import { Search } from 'lucide-react';

interface CodebookEntry {
  field: string;
  label: string;
  definition: string;
  tab: string;
  level: 'case' | 'stage';
  type: string;
  allowedValues?: string;
  codingRule: string;
  unclearRule: string;
  example?: string;
  methodologicalBasis?: string;
}

const CONCEPT_DEFINITIONS: { term: string; definition: string; methodologicalBasis?: string }[] = [
  {
    term: 'Stage',
    definition: 'A discrete phase of the encounter between the worker and the client, distinguished by a change in activity, location, or interpersonal dynamic. Stages are analyst-coded from the narrative and ordered sequentially. They are not inferred from the absence of description — a stage coded as "absent" reflects that the narrative does not describe it, not that it did not occur.',
    methodologicalBasis: 'Informed by crime scripting approaches. Each stage represents a node in the encounter sequence through which the offender moves. Coding stages allows cross-case comparison of which phases are present, compressed, or absent across the dataset.',
  },
  {
    term: 'Behaviour',
    definition: 'A specific action carried out by the client (offender) or the worker (victim) at a particular stage of the encounter. Behaviours are coded only where the narrative directly describes them or where they are clearly implied by described events. Analyst-inferred behaviours must be marked with the appropriate coding confidence value.',
    methodologicalBasis: 'Informed by situational analysis: behaviour is coded as a response to perceived conditions at a specific stage. Coding client behaviours across stages allows analysis of how situational conditions enable or constrain particular actions.',
  },
  {
    term: 'Situation',
    definition: 'The immediate physical, social, and interactional context surrounding the encounter at a given moment. This includes setting type, visibility, guardianship, and access to assistance. Situational factors shape both offender decision-making and victim vulnerability. Coded at case-level (summary) and stage-level (conditions at each stage).',
    methodologicalBasis: 'Informed by situational analysis and environmental criminology. The convergence of an offender, a potential victim, and absent capable guardianship in a particular setting is the core situational mechanism examined.',
  },
  {
    term: 'Environment',
    definition: 'The physical, spatial, and locational characteristics of where the encounter occurred — including indoor/outdoor status, public/private classification, and specific setting type (e.g., vehicle, park, hotel). Environment provides the physical affordances and constraints within which the situation operates.',
    methodologicalBasis: 'Informed by environmental criminology. The physical environment structures opportunity by determining visibility, accessibility, and the presence or absence of natural surveillance.',
  },
  {
    term: 'Movement',
    definition: 'Any physical relocation that occurred before, during, or after the encounter. Movement is analytically significant where it changed the spatial dynamics, visibility, isolation, or control of the situation. Not all movement is consequential — the analyst should assess whether and how movement altered conditions for harm or escape.',
    methodologicalBasis: 'Informed by spatial and mobility analysis and sex work violence literature. Movement between locations is a mechanism through which offenders can increase control and reduce victim access to assistance.',
  },
  {
    term: 'Relocation',
    definition: 'A movement that resulted in a change of setting type — for example, from a public street to a private vehicle, or from an outdoor location to an indoor space. Relocation is analytically distinct from movement within the same setting because it alters situational conditions in a qualitatively different way.',
    methodologicalBasis: 'Informed by sex work violence literature and spatial analysis. Movement from a more visible to a less visible setting alters guardianship and isolation conditions, and is treated as a distinct category in encounter analysis.',
  },
  {
    term: 'Visibility',
    definition: 'The degree to which the encounter (or a stage of it) was observable by bystanders or third parties capable of providing assistance or deterring harm. Coded on a continuum from public (fully visible) through to private (no possibility of external observation). Visibility is not the same as whether anyone actually observed the encounter.',
    methodologicalBasis: 'Informed by environmental criminology and situational analysis. Observable settings reduce opportunity through natural surveillance. Changes in visibility across stages reflect how encounters move into less observable spaces.',
  },
  {
    term: 'Guardianship',
    definition: 'The presence, proximity, and capacity of individuals who could observe, intervene, or deter harm at a given point in the encounter. Coded as present (capable guardians available), limited/reduced (guardians present but unlikely or unable to intervene), or absent (no possible intervention). Guardianship is not equivalent to anyone being nearby — the capacity to intervene matters.',
    methodologicalBasis: 'Informed by situational analysis and environmental criminology. Absent or reduced guardianship is an enabling situational condition; it does not cause offending but removes a situational constraint.',
  },
  {
    term: 'Isolation',
    definition: 'The degree to which the worker was physically or socially separated from potential support, assistance, or escape routes. Isolation may result from the setting (e.g., a vehicle, a secluded outdoor space), from the offender\'s behaviour (e.g., driving to an unfamiliar location), or from both. Coded as not isolated, partially isolated, or isolated.',
    methodologicalBasis: 'Informed by sex work violence literature and situational analysis. Physical isolation is a mechanism through which conditions for harm are created, and is frequently co-produced with spatial relocation and offender control.',
  },
  {
    term: 'Control',
    definition: 'Who directed or determined the encounter\'s location, movement, or progression at a given point. Coded as worker-controlled (the worker determined what happened), offender-controlled (the client/offender determined what happened), shared, or unclear. Control is analytically distinct from consent — offender control may be asserted covertly or through normalised pressure.',
    methodologicalBasis: 'Informed by situational analysis. Offenders make decisions about where encounters take place and how they progress. Tracking control type across stages allows analysis of how dominance over the encounter shifts.',
  },
  {
    term: 'Escalation',
    definition: 'A change in the encounter dynamic in which the offender\'s behaviour becomes more coercive, harmful, or controlling. Escalation is not a single stage but a transition between stages. It may be preceded by coded cues (pressure after refusal, abrupt tone change, repeated demands). Coded as present or absent at the case level, and implicitly through stage sequence patterns.',
    methodologicalBasis: 'Informed by crime scripting and offence progression analysis. Escalation represents the transition between an early-stage encounter and a violence or coercion stage. Escalation cues support analysis of how encounters shift from negotiation to harm.',
  },
  {
    term: 'Data Quality',
    definition: 'A structured, analyst-led assessment of what the source report makes visible and how suitable it is for different types of coding. Low data quality does not mean a case is excluded from the dataset — it constrains the type and depth of analysis possible. The Codability tab documents what the report supports and what it cannot. Absence of information in a report must not be coded as absence of the event.',
    methodologicalBasis: 'Informed by victim-generated reporting methods. Community-generated reports vary widely in detail, format, and specificity. Transparent documentation of data quality is required for any methodology that draws on these sources.',
  },
  {
    term: 'Stage Visibility',
    definition: 'Whether a specific stage of the encounter is described or implied in the report. Stages may be present (explicitly described), absent (not described; the analyst has assessed that this stage is not present in the narrative), unclear (the narrative references this point in the encounter but without sufficient detail), or not applicable (this stage type does not apply to this case). Stage visibility is distinct from whether the stage occurred — a stage coded as absent in the narrative may still have occurred.',
    methodologicalBasis: 'Informed by crime scripting applied to community-generated reports. Scripts often have missing or compressed stages in victim-generated narratives. Coding stage visibility explicitly prevents treating narrative gaps as substantive absences.',
  },
  {
    term: 'Coding Confidence',
    definition: 'The analyst\'s assessment of how well a coded value reflects the reported information. Applies at both the case level (the overall confidence_level field) and the stage level (coding_confidence per stage). Values range from clear (explicitly stated) through partial (mostly supported) and inferred (implied but not stated) to unclear or not enough information. Coding confidence must be recorded wherever the analyst departs from what is explicitly stated in the narrative.',
    methodologicalBasis: 'Informed by qualitative coding methodology. Uncertainty must be recorded rather than suppressed. A value coded as "inferred" carries different analytic weight than a value coded as "clear", and this distinction must be preserved in outputs.',
  },
];

const CODEBOOK_ENTRIES: CodebookEntry[] = [
  // ── Codability / Data Quality
  {
    field: 'narrative_detail_level', label: 'Narrative Detail Level',
    definition: 'Overall richness and specificity of the narrative. Reflects how much detail the report contains about sequence, behaviour, location, and harm.',
    tab: 'Codability / Data Quality', level: 'case', type: 'select',
    allowedValues: 'low · moderate · high · not reviewed',
    codingRule: 'Code based on the richness of the full narrative, not on whether specific fields were coded.',
    unclearRule: 'Code not reviewed if the narrative has not yet been assessed.',
    methodologicalBasis: 'Informed by victim-generated reporting methods. Community-generated reports range from a single sentence to detailed multi-paragraph accounts. Documenting narrative detail allows sampling decisions and analytic scope to be justified explicitly.',
  },
  {
    field: 'sequence_reconstructable', label: 'Sequence Reconstructable',
    definition: 'Whether a temporal sequence of events can be derived from the report, even if incomplete.',
    tab: 'Codability / Data Quality', level: 'case', type: 'select',
    allowedValues: 'yes · partial · no · unclear · not reviewed',
    codingRule: 'yes = full or mostly full sequence visible; partial = some stages can be ordered; no = no sequence discernible.',
    unclearRule: 'Use unclear if the narrative is ambiguous about whether sequence is present.',
    methodologicalBasis: 'Informed by crime scripting. A reconstructable sequence is the prerequisite for script-level analysis. Cases where the sequence is not reconstructable can still contribute to case-level and situational analysis.',
  },
  {
    field: 'stage_coding_suitability', label: 'Stage Coding Suitability',
    definition: 'Whether the report contains sufficient narrative detail to support staged encounter coding.',
    tab: 'Codability / Data Quality', level: 'case', type: 'select',
    allowedValues: 'full staged coding · partial staged coding · incident-level coding only · not suitable · not reviewed',
    codingRule: 'Full staged coding = 3+ stages can be coded with supporting excerpts. Partial = 1–2 stages. Incident-level = no staged coding possible but case-level fields can be coded.',
    unclearRule: 'Use not reviewed until the narrative has been assessed.',
    methodologicalBasis: 'Informed by crime scripting applied to victim-generated reports. Suitability varies across the dataset; documenting it supports transparent methodological decisions about which cases to include in each type of analysis.',
  },
  {
    field: 'movement_coding_suitability', label: 'Movement Coding Suitability',
    definition: 'Whether the report contains sufficient information to code movement type, timing, and impact.',
    tab: 'Codability / Data Quality', level: 'case', type: 'select',
    allowedValues: 'full · partial · limited · not suitable · not reviewed',
    codingRule: 'Full = movement direction, type, and timing clearly described. Partial = some detail. Limited = movement implied but not described. Not suitable = no movement or no usable description.',
    unclearRule: 'Use not reviewed if movement has not yet been assessed.',
    methodologicalBasis: 'Informed by spatial and mobility analysis. Movement coding requires explicit narrative detail; documenting suitability prevents over-inference from vague spatial references.',
  },
  {
    field: 'location_coding_suitability', label: 'Location Coding Suitability',
    definition: 'Whether the location information is sufficient to geocode or spatially classify the case.',
    tab: 'Codability / Data Quality', level: 'case', type: 'select',
    allowedValues: 'mappable · approximate · descriptive only · not mappable · not reviewed',
    codingRule: 'Mappable = a specific address, intersection, or landmark is stated. Approximate = area or neighbourhood described. Descriptive only = setting type described but no spatial reference. Not mappable = no location information.',
    unclearRule: 'Do not force a case into a more precise category than the narrative supports.',
    methodologicalBasis: 'Informed by spatial analysis methodology. Spatial precision must be assessed and recorded before geocoding. Cases with only descriptive location information cannot be treated as precisely geocodeable.',
  },
  {
    field: 'main_data_limitation', label: 'Main Data Limitation',
    definition: 'The primary factor limiting the depth or scope of coding for this case.',
    tab: 'Codability / Data Quality', level: 'case', type: 'select',
    allowedValues: 'brief narrative · vague location · unclear sequence · warning-only report · third-party report · missing date/time · missing movement detail · missing incident detail · other · none apparent',
    codingRule: 'Code the single most significant limitation. Use other + data_quality_notes for more detail.',
    unclearRule: 'Use none apparent if no significant limitation is identified.',
    methodologicalBasis: 'Informed by victim-generated reporting methods. Explicit documentation of data limitations is required for transparent reporting of what the dataset can and cannot support analytically.',
  },
  // ── Stage-level fields
  {
    field: 'stage_type', label: 'Stage Type',
    definition: 'The type of encounter phase represented by this stage. Defines what activity or dynamic characterises this moment in the encounter.',
    tab: 'Stage Coding', level: 'stage', type: 'select',
    allowedValues: 'initial_contact · negotiation · pickup_meeting · movement_travel · arrival_location · escalation · violence_coercion · exit_escape · aftermath · other · unknown_unclear',
    codingRule: 'Code the type that best describes the dominant activity or dynamic at this stage. Each stage should represent a distinct phase.',
    unclearRule: 'Use unknown_unclear if the narrative describes events at this point but the stage type cannot be determined.',
    methodologicalBasis: 'Informed by crime scripting. Stage types correspond to encounter script nodes. The standardised taxonomy allows cross-case comparison of which stages are present, compressed, or absent across the dataset.',
  },
  {
    field: 'stage_visible', label: 'Stage Visible in Report',
    definition: 'Whether this stage is described or implied in the narrative.',
    tab: 'Stage Coding', level: 'stage', type: 'select',
    allowedValues: 'present · absent · unclear · not_applicable',
    codingRule: 'present = narrative directly describes this phase. absent = no description; analyst is coding absence. unclear = insufficient information to determine. not_applicable = this stage type does not apply to this case.',
    unclearRule: 'Do not treat absent as evidence that the stage did not occur — absent means the narrative does not describe it.',
    example: 'A report describing the outcome but not the initial contact: initial_contact stage coded as absent.',
    methodologicalBasis: 'Informed by crime scripting applied to victim-generated reports. Narrative gaps must not be treated as substantive absences. Coding stage visibility explicitly separates what the report describes from what may have occurred.',
  },
  {
    field: 'stage_certainty', label: 'Stage Certainty',
    definition: 'Analyst confidence that this stage is correctly identified and sequenced.',
    tab: 'Stage Coding', level: 'stage', type: 'select',
    allowedValues: 'clear · partial · inferred · unclear · not_enough_information',
    codingRule: 'clear = explicitly stated in narrative. partial = mostly supported with minor gaps. inferred = implied but not stated. unclear = significant ambiguity. not_enough_information = insufficient narrative to code.',
    unclearRule: 'Use inferred when the stage is analytically reasonable but not directly described.',
    methodologicalBasis: 'Informed by qualitative coding methodology. Coding confidence must be recorded where the analyst departs from what is explicitly stated. Inferred values carry different analytic weight than clear values.',
  },
  {
    field: 'visibility', label: 'Visibility (stage-level)',
    definition: 'The degree to which this stage of the encounter was observable by bystanders or others who could intervene or assist.',
    tab: 'Stage Coding', level: 'stage', type: 'select',
    allowedValues: 'public · semi_public · semi_private · private · unknown',
    codingRule: 'Code based on the location and context at this stage. public = openly visible in a public space. private = no bystanders possible.',
    unclearRule: 'Use unknown if the narrative does not provide enough information.',
    methodologicalBasis: 'Informed by environmental criminology and situational analysis. Visibility is a component of natural surveillance. Changes in visibility across stages show how encounters move into less observable settings.',
  },
  {
    field: 'guardianship', label: 'Guardianship (stage-level)',
    definition: 'Whether capable guardians — people who could observe, deter, or interrupt harm — were present at this stage.',
    tab: 'Stage Coding', level: 'stage', type: 'select',
    allowedValues: 'present · reduced · absent · delayed · unknown',
    codingRule: 'Code the most constraining guardianship state during this stage. absent = no one nearby who could intervene. reduced = guardians nearby but unable or unlikely to intervene.',
    unclearRule: 'Use unknown if the narrative is silent on the presence of others.',
    methodologicalBasis: 'Informed by situational analysis and environmental criminology. Absent or reduced guardianship is an enabling situational condition — it removes a constraint on offending but does not in itself cause it.',
  },
  {
    field: 'isolation_level', label: 'Isolation Level (stage-level)',
    definition: 'The degree to which the worker was separated from potential support, assistance, or escape routes at this stage.',
    tab: 'Stage Coding', level: 'stage', type: 'select',
    allowedValues: 'not_isolated · partially_isolated · isolated · unknown',
    codingRule: 'isolated = worker had no realistic access to help or escape. partially_isolated = access was limited or constrained.',
    unclearRule: 'Use unknown if the narrative provides no information about isolation.',
    methodologicalBasis: 'Informed by sex work violence literature and situational analysis. Isolation is a mechanism through which conditions for harm are created, often co-produced with relocation and offender control over movement.',
  },
  {
    field: 'control_type', label: 'Control (stage-level)',
    definition: 'Who controlled the location, movement, or progression of events at this stage.',
    tab: 'Stage Coding', level: 'stage', type: 'select',
    allowedValues: 'victim · offender · shared · unclear',
    codingRule: 'Code based on who had effective control over where the encounter was, how it proceeded, or whether the worker could leave.',
    unclearRule: 'Use unclear if control is ambiguous or contested in the narrative.',
    methodologicalBasis: 'Informed by situational analysis. Tracking control type across stages allows analysis of how offenders shift dominance over the encounter, including through subtle or normalised pressure.',
  },
  // ── Case-level situation / environment
  {
    field: 'primary_setting_type', label: 'Primary Setting Type',
    definition: 'The general type of setting where the primary incident occurred.',
    tab: 'Incident-Level Coding', level: 'case', type: 'select',
    allowedValues: 'indoor · outdoor · mobile · mixed · unclear · not stated',
    codingRule: 'Code the setting of the most analytically significant part of the encounter (typically where harm occurred).',
    unclearRule: 'Use unclear if the report is ambiguous. Use not stated if the report gives no setting information.',
    methodologicalBasis: 'Informed by environmental criminology and situational analysis. Setting type shapes the opportunity structure of the encounter by determining visibility, guardianship, and access.',
  },
  {
    field: 'visibility_case', label: 'Visibility (case-level)',
    definition: 'Case-level summary of how visible the encounter was to potential bystanders or intervening parties.',
    tab: 'Incident-Level Coding', level: 'case', type: 'select',
    allowedValues: 'visible · limited visibility · not visible · unclear · not stated',
    codingRule: 'Summarise visibility across the encounter, or code for the primary incident location if movement occurred.',
    unclearRule: 'Use not stated if the report provides no information.',
    methodologicalBasis: 'Informed by environmental criminology. Case-level visibility summarises the observability of the encounter for cross-case comparison.',
  },
  {
    field: 'isolation_case', label: 'Isolation (case-level)',
    definition: 'Case-level summary of the worker\'s separation from potential support.',
    tab: 'Incident-Level Coding', level: 'case', type: 'select',
    allowedValues: 'not isolated · partially isolated · isolated · unclear · not stated',
    codingRule: 'Code the most isolated state experienced during the encounter.',
    unclearRule: 'Use not stated if the narrative gives no information about isolation.',
    methodologicalBasis: 'Informed by sex work violence literature and situational analysis. Case-level isolation summarises the degree to which the worker was separated from assistance across the encounter.',
  },
  {
    field: 'guardianship_case', label: 'Guardianship (case-level)',
    definition: 'Case-level summary of whether capable guardians were present, reduced, or absent.',
    tab: 'Incident-Level Coding', level: 'case', type: 'select',
    allowedValues: 'present · limited/reduced · absent · unclear · not stated',
    codingRule: 'Code the most constraining guardianship state during the encounter.',
    unclearRule: 'Use not stated if the narrative provides no information.',
    methodologicalBasis: 'Informed by situational analysis and environmental criminology. Case-level guardianship summarises the availability of capable intervention across the encounter.',
  },
  // ── Mobility
  {
    field: 'movement_pattern_type', label: 'Movement Pattern Type',
    definition: 'A classification of the type of spatial movement that characterised this encounter.',
    tab: 'Mobility / Spatial Sequence', level: 'case', type: 'select',
    allowedValues: 'no movement described · movement unclear · movement within same area · public/street to vehicle · public/street to secluded outdoor location · public/street to residence/private indoor location · vehicle-based encounter · movement across neighbourhood · movement across municipality · post-incident drop-off/stranding · multiple-stage movement · other',
    codingRule: 'Code the most analytically significant movement pattern. If multiple movements occurred, code the most consequential.',
    unclearRule: 'Use movement unclear if movement is implied but not described.',
    methodologicalBasis: 'Informed by spatial and mobility analysis and sex work violence literature. Movement from street to vehicle or private space alters situational conditions. The pattern type taxonomy supports cross-case classification for both sequence and spatial analysis.',
  },
  {
    field: 'movement_timing', label: 'Movement Timing',
    definition: 'When movement occurred relative to the encounter sequence.',
    tab: 'Mobility / Spatial Sequence', level: 'case', type: 'select',
    allowedValues: 'before negotiation · after negotiation · before escalation · during escalation · during/after violence · post-incident · unclear · not applicable',
    codingRule: 'Code based on the narrative sequence. Where multiple movements occurred, code the primary or most consequential movement.',
    unclearRule: 'Use unclear if the narrative does not allow the timing to be determined.',
    methodologicalBasis: 'Informed by crime scripting and spatial analysis. When movement occurs in the encounter sequence determines how it relates to escalation and harm — movement before versus during violence has different analytic implications.',
  },
  // ── GIS
  {
    field: 'mappable_status', label: 'Mappable Status',
    definition: 'Whether this case can be geocoded and included in spatial analysis.',
    tab: 'GIS', level: 'case', type: 'select',
    allowedValues: 'mappable · approximate · not mappable · withheld/sensitive · not reviewed',
    codingRule: 'mappable = specific address or intersection is stated. approximate = area or neighbourhood only. not mappable = no usable location. withheld/sensitive = location coded but withheld from spatial output.',
    unclearRule: 'Do not geocode cases with only descriptive location information as if they were mappable.',
    methodologicalBasis: 'Informed by spatial and mobility analysis. Spatial analysis requires geocoded coordinates at known precision. Mappable status controls which cases enter spatial outputs and at what level of precision.',
  },
];

const ALL_TABS = ['All', ...Array.from(new Set(CODEBOOK_ENTRIES.map(e => e.tab)))];

export default function CodebookPage() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [levelFilter, setLevelFilter] = useState<'all' | 'case' | 'stage'>('all');

  const filtered = CODEBOOK_ENTRIES.filter(e => {
    const matchTab = activeTab === 'All' || e.tab === activeTab;
    const matchLevel = levelFilter === 'all' || e.level === levelFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || e.field.includes(q) || e.label.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q);
    return matchTab && matchLevel && matchSearch;
  });

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'var(--text-3)', marginBottom: 3,
  };
  const valueStyle: React.CSSProperties = {
    fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.5,
  };
  const tagStyle = (color: string, bg: string, border: string): React.CSSProperties => ({
    display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '1px 7px',
    borderRadius: 10, color, background: bg, border: `1px solid ${border}`,
    letterSpacing: '0.04em',
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '16px 24px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>Codebook</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, maxWidth: 700 }}>
          Field definitions, coding rules, and allowed values for the Artemis research coding tool. Adapted to the specific analytic requirements of Bad Date Report research, informed by crime scripting, situational analysis, environmental criminology, and sex work violence literature.
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, padding: '10px 24px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', flex: '1 1 200px', minWidth: 180 }}>
          <Search size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            placeholder="Search fields, labels, definitions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', fontSize: 12.5, color: 'var(--text-1)', outline: 'none', flex: 1, fontFamily: 'inherit' }}
          />
        </div>
        <select
          value={activeTab}
          onChange={e => setActiveTab(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}
        >
          {ALL_TABS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={levelFilter}
          onChange={e => setLevelFilter(e.target.value as 'all' | 'case' | 'stage')}
          style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}
        >
          <option value="all">All levels</option>
          <option value="case">Case-level</option>
          <option value="stage">Stage-level</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{filtered.length} field{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>

        {/* Anti-over-inference note */}
        <div style={{ padding: '10px 14px', borderRadius: 6, borderLeft: '3px solid #F59E0B', background: '#F59E0B0a', border: '1px solid #F59E0B30', marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>Missing information ≠ absence</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
            Community-generated reports do not describe everything that occurred. A stage, behaviour, or condition that is not mentioned in the narrative has not been observed by the analyst — it may or may not have occurred.
            Code <strong>absent</strong> only when the narrative makes clear that this element was not present. Code <strong>unclear</strong> or <strong>not enough information</strong> when the narrative does not address this element.
            Coding limitations must be documented in the <em>Codability / Data Quality tab</em> (main_data_limitation, data_quality_notes) and in the <em>uncertainty_notes</em> field.
          </div>
        </div>

        {/* Case vs stage level clarification */}
        {activeTab === 'All' && !search && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ padding: '12px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', borderTop: '3px solid #2563EB' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>Case-level coding</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
                Fields that apply to the case as a whole — a single value summarising the entire encounter.
                Case-level fields are coded once per report and appear in the main Coding Workspace tabs (Incident, Mobility, Codability, etc.).
                They are used for cross-case comparison and dataset-level analysis.
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, fontStyle: 'italic' }}>Examples: primary_setting_type, movement_pattern_type, narrative_detail_level, visibility_case</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', borderTop: '3px solid #16A34A' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>Stage-level coding</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
                Fields that apply to a specific stage within the encounter. Each stage is a separate record with its own coding.
                Stage-level fields are coded in the Stages tab and represent conditions, behaviours, and dynamics at that particular phase.
                They are used for sequence analysis and within-case comparison.
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, fontStyle: 'italic' }}>Examples: stage_type, visibility (per stage), guardianship (per stage), isolation_level, control_type</div>
            </div>
          </div>
        )}

        {/* Concept definitions */}
        {activeTab === 'All' && !search && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
              Core Concepts
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
              {CONCEPT_DEFINITIONS.map(c => (
                <div key={c.term} style={{ padding: '12px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent, #3B82F6)', marginBottom: 5 }}>{c.term}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: c.methodologicalBasis ? 8 : 0 }}>{c.definition}</div>
                  {c.methodologicalBasis && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, borderTop: '1px dashed var(--border)', paddingTop: 7, marginTop: 4 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', marginRight: 4 }}>Methodological basis:</span>
                      {c.methodologicalBasis}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Field entries */}
        {filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic', paddingTop: 20 }}>No fields match the current filters.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(e => (
              <div key={e.field} style={{ borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11.5, fontWeight: 700, color: 'var(--text-1)' }}>{e.field}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500 }}>{e.label}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={tagStyle(
                      e.level === 'case' ? 'var(--blue, #2563EB)' : 'var(--green, #16A34A)',
                      e.level === 'case' ? 'var(--blue-pale, #EFF6FF)' : 'var(--green-pale, #F0FDF4)',
                      e.level === 'case' ? 'var(--blue-border, #BFDBFE)' : 'var(--green-border, #BBF7D0)',
                    )}>{e.level}-level</span>
                    <span style={tagStyle('var(--text-3)', 'var(--surface-2)', 'var(--border)')}>{e.type}</span>
                    <span style={tagStyle('var(--text-3)', 'var(--surface-2)', 'var(--border)')}>{e.tab}</span>
                  </span>
                </div>
                {/* Body */}
                <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={labelStyle}>Definition</div>
                    <div style={valueStyle}>{e.definition}</div>
                  </div>
                  {e.allowedValues && (
                    <div>
                      <div style={labelStyle}>Allowed Values</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'monospace', lineHeight: 1.6 }}>
                        {e.allowedValues.split(' · ').map(v => (
                          <span key={v} style={{ display: 'inline-block', margin: '1px 3px 1px 0', padding: '1px 5px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 3 }}>{v}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={labelStyle}>Coding Rule</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{e.codingRule}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>Unclear / Missing Rule</div>
                    <div style={{ fontSize: 12, color: 'var(--amber, #D97706)', lineHeight: 1.5 }}>{e.unclearRule}</div>
                  </div>
                  {e.example && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={labelStyle}>Example</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', lineHeight: 1.5, borderLeft: '2px solid var(--border)', paddingLeft: 8 }}>{e.example}</div>
                    </div>
                  )}
                  {e.methodologicalBasis && (
                    <div style={{ gridColumn: '1 / -1', paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                      <div style={labelStyle}>Methodological Basis</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>{e.methodologicalBasis}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
