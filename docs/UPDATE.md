I want you to redesign the visual organization and UX of my Red Light Alert / VIRGO research coding application. This is a specialized harm-report coding and GIS research tool used to systematically code narrative reports, stage-sequence incidents, map locations, identify patterns, and support research analysis. It is human-led and audit-focused. AI suggestions should never look like they are replacing analyst judgement. They should appear as optional support only.

The dominant colour should be navy, not red. Red should only be used sparingly for true warnings, destructive actions, or urgent violence indicators. The overall visual identity should feel like a professional intelligence analysis platform, a qualitative research workstation, and a cartographic tool. It should not feel like a generic admin dashboard.

Use the following design direction.

Overall visual style:

Use deep navy as the dominant colour. Suggested palette:

Primary navy: #0B1F33
Secondary navy: #12324D
Panel navy: #172A3A
Soft blue: #EAF3FA
Muted map blue: #7FAFD0
Slate text: #2F3A45
Warm ivory background: #F7F4EF
Sand border: #D8D0C3
Muted gold accent: #B38B59
Success green: #2F8F5B
Warning amber: #D89614
Critical red: #A51F1F only for danger or destructive action

The current red active tab underline, red save button, and red section accents should be changed to navy or muted gold. Red should not be the default brand colour.

The app should feel calm, serious, and research-oriented. Use navy headers, ivory/sand work surfaces, soft borders, generous spacing, and clear section hierarchy. Avoid bright white forms stacked tightly together. Avoid excessive red. Avoid too many competing border colours.

Typography:

Use a clean professional sans-serif for interface text. Suggested: Inter, Source Sans 3, or IBM Plex Sans.

Use a more editorial serif only for source narrative blocks or report previews if needed, such as Source Serif or Georgia. The narrative panel can feel more like an evidence document, but the form side should remain clean and functional.

Use clear type hierarchy:

Page title: 20–22px, semibold
Section title: 15–16px, semibold
Field label: 13–14px, medium
Input text: 14–15px
Metadata and provenance labels: 11–12px uppercase or small caps

Application shell:

The app should use a persistent top navigation bar, but it should be visually simplified. The top bar should be navy or off-white with navy text, not cluttered. The logo should sit at far left. Navigation should be grouped by workflow rather than simply listing every feature equally.

Suggested primary navigation:

Import
Code
Cases
Map
Analysis
Research
Bulletin
The active section should be shown with a navy background pill or muted gold underline. Do not use red for active navigation.

The right side of the top bar should show the app principles in small muted text: human-led · auditable · privacy-conscious. This is good and should remain, but it should be visually lighter.

Main coding workspace:

The CodingScreen should be organized as a three-part analyst workstation:

Left panel: Source and case narrative
Centre/top strip: Case status, sequence, and analyst controls
Right/main panel: Structured coding form

The left narrative panel is one of the most important parts of the app. It should feel like the source document or evidence pane. Keep it visually distinct with a dark navy background, but make it more readable.

Left source panel layout:

At the top:
Case ID
Report title
Incident date
Coding status
Word count
Read-only badge

Then the narrative block:
Use a dark navy background with slightly lighter inner card. Text should be large enough to read comfortably. Add line height. The source narrative should not look cramped.

Below the source:
Collapsible sections:
Source document
Analyst transcription
Analyst interpretive summary
Tags
Audit trail

The analyst should always be able to see the source narrative while coding. The left panel should be sticky and independently scrollable.

Case header:

The top case header currently has many controls competing for attention. Reorganize it into clear zones.

Left:
Back/forward case navigation
Case ID
Case count, e.g., 15 / 239
Status pill: Uncoded / In Progress / Coded / Reviewed

Centre:
Report title
Incident date

Right:
Analyst dropdown
Status dropdown
AI Suggest
NLP Analyze
Find Similar
Save
Export

Primary action hierarchy:

Save should be navy, not red.
AI Suggest should be secondary.
NLP Analyze should be secondary.
Find Similar should be secondary.
Export should be tertiary.
Danger actions should be red only if they delete or overwrite.

Tabs and workflow:

The current tabs are useful, but they should be organized in the order analysts actually think through a case. The app’s core data flow is import, code case-level fields, stage-sequence, AI/NLP support, similarity check, analysis/research, bulletin, and export. The tabs should make that logic visible.

Suggested CodingScreen tabs:

Overview
Basics
Encounter
Stages
Mobility
Violence & Control
Suspect
GIS
Narrative
Scoring
Summary
I recommend adding a separate Violence & Control tab. Right now important violence indicators risk being buried across Encounter, Narrative, or Scoring. This is analytically important enough to deserve its own tab.

The Stages tab should be visually prominent because the core analytic unit of the study is stage → behaviour → conditions → location. Do not treat it as just another form page.

Tab design:

Use navy text for inactive tabs.
Use a navy filled pill or gold underline for active tab.
Show progress counts beside each tab, but make them visually subtle.
Example: Basics 12/13, Mobility 11/13.
Completed tabs can show a small green check.
Partially complete tabs can show a muted amber dot.
Do not use red for incomplete tabs.

Section panels:

Each section should be a rounded card with:

Section title
Short description of what belongs there
Progress indicator
Collapse/expand control
Fields arranged in a clean grid

Use two-column field layout where appropriate, but avoid overly dense rows. Important interpretive fields should be full-width.

Example:

Date & Time
“Code what the report says about when the incident occurred. Use unknown where the report does not specify.”

Fields:
Incident date
Time exact
Time range
Day of week
Temporal uncertainty

Location sections should clearly distinguish:

Reported location
Inferred location
Geocoded location
Destination location
Location certainty

Field-level UX:

Each field should make provenance clear without overwhelming the screen. Current provenance tags are useful, but they create visual noise when repeated too heavily.

Use a small provenance indicator beside or under the field:

Unset
AI suggested
Analyst filled
Reviewed
NLP flagged

Use consistent colour coding:

Unset: grey
AI suggested: amber
Analyst filled: blue
Reviewed: green
NLP flagged: purple or slate blue

Do not put large bright labels beside every field unless the field is actively selected or flagged. The provenance should be visible, but not visually louder than the actual data.

FieldRow improvements:

Each field row should include:

Label
Input
Small help icon or tooltip
Provenance indicator
Confidence/uncertainty control where relevant
Optional notes icon

For fields with uncertainty, add options like:

Known
Probable
Inferred
Unclear
Unknown

This is especially important for location, sequence, suspect, intoxication, incapacitation, condom use, movement, and violence indicators.

Violence & Control tab:

Create a dedicated tab for violence indicators, coercion indicators, incapacitation, and control dynamics.

Suggested sections:

Physical violence
Fields:
Hit / punched / slapped
Kicked
Dragged
Restrained
Choked / strangled
Weapon present
Forced movement
Physical injury
Medical attention
Other physical violence
Sexual violence and coercion
Fields:
Sexual assault indicated
Condom refusal
Condom removal
Intercourse without agreed protection
Acts outside agreement
Coerced continuation
Payment coercion
Threats linked to sexual access
Incapacitation / substance-related indicators
Fields:
Worker fell asleep
Worker lost consciousness
Worker does not remember events
Worker woke up in unknown place
Worker reports possible drugging
Substance administered without knowledge
Substance suspected after the fact
Unable to consent / impaired awareness
Unknown how worker arrived at location
Control and confinement
Fields:
Blocked exit
Phone taken
Belongings taken
Locked in vehicle/residence
Threatened if leaving
Dragged or moved by force
Offender controlled transportation
Worker escaped
Third-party intervention
Escalation markers
Fields:
Shift from negotiation to coercion
Payment dispute escalated
Location changed before violence
Isolation increased before violence
Guardianship decreased before violence
Offender behaviour changed suddenly
Worker attempted exit before violence
This tab should be analytical, not just a checklist. It should support later pattern analysis.

Stage sequencing UX:

The Stages tab should not look like a regular form. It should look like an event reconstruction board.

Use a horizontal or vertical stage timeline:

Initial Contact → Negotiation → Movement → Escalation → Outcome

Each stage card should include:

Stage type
Stage order
Short location label
Key behaviours
Visibility
Guardianship
Isolation
Control
Movement to this stage
Turning point notes

Allow the analyst to reorder stages by drag-and-drop. Allow duplicate stage types where needed, because real encounters may include multiple movement or escalation points.

The stage sequence strip should remain visible at the bottom or top of the coding workspace. The current sequence strip is useful, but it should be more informative. Instead of only letters, show compact labels:

A: Approach
N: Negotiation
M: Movement
C: Coercion
V: Violence
E: Exit

For each stage, use subtle icons and tooltips. Do not make this cartoonish. It should feel like analytic event sequencing.

AI and NLP UX:

AI and NLP must remain clearly separate. The app already has two independent systems: Claude suggestions and spaCy NLP signal detection. The UX should reinforce that distinction.

AI Suggest:
Label as “AI Suggest”
Style as optional assistance
Suggestions appear as amber chips
Analyst must accept manually
Accepted suggestions become analyst-filled only after acceptance
Never auto-fill silently

NLP Analyze:
Label as “NLP Signals”
Style as detection/flagging, not interpretation
Use a side panel or drawer showing detected terms and categories
Allow “jump to field” from NLP signal
NLP signals should not overwrite fields

Add an “Assistance Panel” that can slide out from the right. It should include:

AI suggestions pending
NLP signals found
Possible missing fields
Contradictions or uncertainty
Suggested review items

This keeps the main coding form clean.

Case list UX:

The CaseList should function like an analyst queue.

Include filters:

Status
Date range
City
Neighbourhood
Violence indicators
Mobility present
Substance/incapacitation indicators
GIS complete/incomplete
AI suggestions pending
NLP signals present
Possible repeat suspect
Reviewed/not reviewed

Case cards or table rows should show:

Case ID
Date
City/neighbourhood
Status
Key flags
Stage sequence
GIS completeness
Last edited
Analyst

Use table view by default, with optional card view. This is a research database, so table view is appropriate.

Map UX:

The map page should feel like a GIS workstation, not just a plotted map. The app already supports clustering, heatmap, draw-to-filter, boundary layers, Street View, and GeoJSON export. Make these capabilities more visible and organized.

Map layout:

Left filter drawer:
Date range
Incident type
Violence indicator
Stage type
Location certainty
Indoor/outdoor
Public/private
Mobility
Suspect/vehicle
Reviewed status

Main map:
Points
Routes
Clusters
Heatmap
Boundary overlays
Draw-to-filter tools

Right insight drawer:
Selected case summary
Stage sequence
Location details
Open report
Street View
Similar nearby cases
Export selected

Map layer controls should be grouped:

Base map
Case points
Movement routes
Heatmap
Boundaries
Hospitals/reference points
Drawn selection

Do not show hospital names if the user has requested no labels. Use markers only, with internal coordinate accuracy.

Research page UX:

The Research page should look like an analysis workbook. The app has ResearchOutputs with Stage Patterns, Encounter Sequences, Mobility Pathways, Environmental Patterns, Spatial Overview, Case Linkage View, Case Sequence Table, and Research Notes. Organize it with a left-side research navigation and a main analytic panel.

Suggested Research layout:

Left:
Research question shortcuts
Saved filters
Research notes
Export buttons

Main:
Selected analysis tab
Charts/tables
Interpretive notes
Linked cases

Research tabs:

Stage Patterns
Encounter Sequences
Mobility Pathways
Environmental Patterns
Spatial Overview
Case Linkage
Case Sequence Table
Notes

Each tab should answer one research question visually. Avoid generic dashboard clutter.

Analysis dashboard UX:

The Analysis page should be simpler than Research. It should provide fast operational summaries:

Total reports
Coded reports
Reviewed reports
GIS complete
Violence indicators
Mobility present
Substance/incapacitation indicators
Possible repeat suspects
Cases needing review

Use cards, but do not overuse bright colours. Use navy, slate, ivory, and muted accent colours.

Bulletin UX:

The Bulletin page should look like a formal analytic product. Since it generates a structured brief with filters, map, sections A–G, and print-to-PDF, it should feel closer to an intelligence bulletin/report than a dashboard. 

Use:

Document-style preview
Section navigation
Print controls
Export PDF
Date/filter summary
Map snapshot
Analyst notes
Source caveat

The Bulletin page should not look like the coding workspace. It should look like an output product.

Audit and trust UX:

Because the tool is human-led and auditable, make the audit trail accessible but not intrusive. The app’s field provenance system is central: unset / AI suggested / analyst filled / reviewed. 

Add a small “Audit” button in the case header. When clicked, open a side drawer showing:

Field changes
Timestamp
Analyst
Previous value
New value
Provenance
AI/NLP involvement

At the bottom of the coding screen, show only the latest audit event in a small muted footer.

Save and autosave:

Use clear save states:

Saved
Saving...
Unsaved changes
Save failed
Last saved at [time]

Autosave should be visible but subtle. The manual Save button should remain available.

Button hierarchy:

Primary:
Save
Open report
Generate bulletin

Secondary:
AI Suggest
NLP Analyze
Find Similar
Analyze
Geocode
Export selected

Tertiary:
Collapse
Reset filters
Show more
Copy ID

Danger:
Delete case
Clear field
Remove stage
Overwrite

Only danger buttons should use red.

Spacing and layout:

Increase vertical spacing between fields. The current screen is dense. The program handles sensitive, complex material, so the interface should reduce cognitive strain.

Use:

16–24px card padding
12–16px field spacing
Clear section separation
Sticky headers
Independent scrolling panels
Reduced border clutter

Avoid:

Too many small pills
Too many colours
Dense horizontal controls
Repeated labels that compete with the data
Red as a default accent
Overly bright white panels

Information architecture:

The program should follow this logic:

Import source
Confirm duplicate risk
Open case
Read source
Code basic facts
Code encounter and violence indicators
Build stage sequence
Code mobility and GIS
Code suspect details
Run AI/NLP support if desired
Review unresolved fields
Mark coded or reviewed
Analyze across cases
Map patterns
Link similar cases
Generate bulletin/export
The UI should make this flow obvious.

Specific changes to the current screenshot:

Replace red active tab underline with navy or muted gold.
Replace red Save button with navy.
Keep the left source panel dark, but improve contrast and readability.
Make the top case controls less crowded by grouping them.
Move the sequence strip higher or make it more visually integrated with stages.
Reduce the number of bright provenance labels visible at once.
Add a dedicated Violence & Control tab.
Add an Assistance drawer for AI/NLP instead of scattering all suggestions visually.
Give each form section a short explanatory line.
Use a calmer ivory/sand background rather than stark white.
Use red only for critical warnings.
Make progress indicators more subtle and professional.
Make GIS/location certainty more visible.
Make the stage sequence the analytic centre of the case, not a small footer element.
Component-level implementation guidance:

Update Layout.tsx:
Use navy/ivory app shell.
Group navigation by workflow.
Use active nav pill.
Keep logo at left.
Keep principle text at right.

Update CodingScreen.tsx:
Implement three-panel analyst workstation.
Make left source panel sticky.
Group case header controls.
Add tab redesign.
Add Violence & Control tab.
Add Assistance drawer.
Add audit drawer.

Update FieldRow.tsx:
Simplify provenance indicators.
Use compact chips.
Add tooltip support.
Add uncertainty state support.
Add optional notes icon.

Update SectionPanel.tsx:
Use card style with title, description, progress, collapse.
Use consistent spacing.
Use navy/gold accents.

Update StageSequencer.tsx:
Make this a timeline/event reconstruction interface.
Allow clearer stage cards.
Show behaviour → condition → location in each stage.
Use drag reorder.
Keep sequence summary visible.

Update MapView.tsx:
Use left filter drawer, main map, right insight drawer.
Group map layers.
Make draw-to-filter visually discoverable.
Support no-label reference markers.

Update ResearchOutputs.tsx:
Make it a research workbook.
Use left research navigation.
Keep Research Notes visible but not cramped.
Make each tab answer a research question.

Update BulletinOutput.tsx:
Make it look like a formal analytic report.
Use print/PDF layout.
Use section navigation.
Use navy headings and muted borders.

Final goal:

The redesigned app should look like a polished, serious, navy-dominant research and intelligence analysis platform. It should be visually attractive, but the priority is analyst flow, readability, defensible coding, auditability, and fast movement from source narrative to structured research outputs.

Do not make it look like a startup SaaS dashboard. Do not make it look playful. Do not use red as the brand colour. Make it calm, precise, cartographic, and analytical.

My strongest recommendation: “restructure the CodingScreen into a three-panel analyst workstation and convert the design system from red-accented admin UI to navy-dominant research/GIS interface.” That is the real UX upgrade.