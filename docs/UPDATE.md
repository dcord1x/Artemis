Please do the next methods-alignment, analyst-UX, GIS, and data-logic refinement pass on the program. Keep the current architecture, database, and core workflow intact. This is not a rebuild. It is a targeted refinement so the system makes clearer sense to the analyst, aligns directly with the research method, fixes issues found through real use, and improves the visual and GIS experience. The app already has strong foundations including structured coding, stage sequencing, provenance-aware analyst input, GIS, research outputs, and case comparison. This pass should improve clarity, flow, methodological fit, trust, and visual polish. 

Core goal
The program should clearly support this workflow:

read the narrative → code key facts → reconstruct the encounter as a sequence → identify turning points and stage transitions → compare recurring patterns across cases

The tool should feel like a human-led workflow for cleaning, structuring, organizing, and analyzing raw community-generated harm reports, not like a generic dashboard, long admin form, or partially automated scoring system.

1. Remove the current escalation score as a core feature
Problem
The current NLP escalation score / 5 is confusing and does not align cleanly with the methodology. It mixes:

NLP-detected signals
stage progression
severity logic
harm flags
into one number that is not transparent enough and is not necessary for the method.

Required fixes
Remove the current NLP escalation score / 5 from the main coding interface
Remove it from any place where it appears as a central analytic field
Do not present it as a core case-level conclusion
Replace it with clearer fields
Emphasize:

Escalation point
Turning point / key shift
Highest stage reached
Resolution / endpoint
Early escalation indicators present
These are more defensible and more directly tied to the method.

2. Make the encounter sequence the main analytic object
Problem
The research is about how harm unfolds across the encounter, not just what outcome occurred. The current stage system exists, but synthesis and presentation need to be clearer.

Required fixes
Make the program more explicitly organize each case as a sequence across stages such as:

initial contact
negotiation
movement
isolation
control/coercion
violence
exit/resolution
Add a case-level sequence summary
Generate a concise structured encounter summary for each case, for example:

Contact → Negotiation → Movement → Coercion → Physical violence → Exit
Contact → Negotiation → Agreement shift → Sexual assault → Escape
Rules:

use analyst-coded values first
if provisional NLP is referenced, label it clearly
do not invent missing stages
keep the sequence readable and analyst-facing
This summary should be visible on the case screen and exportable.

3. Replace “highest stage reached” single dropdown with multi-select logic
Problem
“Highest stage reached” as a single dropdown is confusing because multiple severe things can happen in one case. The current dropdown forces one label when a case may involve overlapping serious harms.

Required fixes
Replace or redesign Highest stage reached.

Preferred solution
Use a checkbox / multi-select field instead of a single dropdown.

Suggested values:

negotiation conflict
coercion / control
physical violence
sexual violence
robbery / theft
weapon involvement
confinement / prevented exit
substance administration / intoxication
mixed severe harm
unknown
Important logic
allow multiple selections where appropriate
if multiple severe categories are checked, the summary layer can still display a derived label such as mixed severe harm
do not force the analyst to collapse multiple serious events into one dropdown choice
Goal
This field should reflect what actually happened in the case.

4. Strengthen the concept of the turning point
Problem
The method depends on identifying where the harmful interaction changed.

Required fixes
Add or refine a field called:

Turning point
or
Key shift in encounter
Suggested values:

boundary tested
refusal ignored
pressure increased
deception/agreement shift
movement imposed
isolation increased
threat introduced
exit blocked / control asserted
physical force applied
sexual violence initiated
robbery initiated
other
This should be treated as a major analytic field.

5. Keep escalation point and resolution / endpoint, but define them clearly
Problem
Escalation and endpoint are distinct and should not be mixed. Current endpoint options are too narrow.

Required fixes
Keep:

Escalation point
Resolution / endpoint
Escalation point
This should refer to the moment the encounter clearly became more harmful or coercive.

Resolution / endpoint
This should refer to how the encounter ended.

Expand Resolution / endpoint options to include:

victim escaped
victim left voluntarily
offender left
victim forced out of vehicle
victim pushed/thrown out of vehicle
victim forced out of residence
victim pushed/thrown out of residence
left at unknown location
assault completed
robbery completed
both parties separated / encounter ended
third-party interruption
police/security interruption
unknown
other
If needed, allow other with a small supporting text field.

Goal
Resolution / endpoint should reflect realistic endings, especially forced expulsion from space or transport.

6. Add early escalation indicators as a structured checklist, not a score
Problem
A single numeric early escalation score is less useful than explicit indicators.

Required fixes
Use structured early escalation indicators such as:

repeated pressure
abrupt tone change
intimidation present
verbal aggression
payment manipulation/dispute
condom refusal/removal
movement toward greater isolation
deception or bait-and-switch
blocking exit / confinement
substance administration / intoxication
weapon introduced
These should be checklist-style indicators rather than a prominent score.

7. Make stage transitions visible and analyzable across cases
Problem
The method is about what tends to happen after certain stages.

Required fixes
Add cross-case outputs that summarize transitions such as:

refusal → pressure
movement → isolation
negotiation → agreement shift
isolation → violence
payment dispute → robbery
threat → physical force
physical force → exit/escape
This should be a major research output.

8. Add environmental transition logic, not just static environment fields
Problem
The method needs emphasis on change in setting, not just final setting.

Required fixes
Add analytic summaries for:

public → private
public → secluded
outdoor → indoor
vehicle → residence
contact location ≠ incident location
cross-neighbourhood movement
cross-city / cross-municipality movement
These transitions should be visible at both:

case level
aggregate research output level
9. Reorganize the coding workflow so it matches the method
Problem
The current program still partly feels like a large form.

Required fixes
Restructure the coding flow to support this order:

Read source narrative
Code basics and place/time
Code encounter facts
Code movement and environment
Reconstruct sequence/stages
Record turning point and endpoint
Add analyst summary
Use NLP/AI only as review support
Move to next case
UX implications
separate core coding actions from advanced tools
collapse non-current sections more aggressively
make the sequence strip function as navigation
show the next most important incomplete step
reduce clutter from features that are not central during initial coding
10. Demote NLP to a clearly supportive role
Problem
NLP is useful, but should not dominate the coding logic.

Required fixes
Present NLP only as:

provisional signal
candidate indicator
review aid
Where NLP contributes, label it clearly as:

NLP signal
provisional
analyst review required
Do not present NLP as a core analytic conclusion.

11. Make the research outputs speak the language of the method
Problem
Research outputs should answer the actual research questions.

Required fixes
Outputs should answer questions like:

How often did harm intensify after movement?
How often did refusal precede coercion?
How often did the setting become more private before violence?
How often did robbery follow sexual or physical coercion?
What were the most common encounter pathways?
What environmental shifts were most common before escalation?
The outputs should feel like extensions of the methods chapter.

12. Prioritize cleaning and organizing raw community-generated data
Problem
The tool’s core value is not opaque analytics. It is structured organization of messy narrative harm data.

Required fixes
Make the workflow emphasize:

preserving source text
structured extraction
human-led coding
uncertainty handling
provenance
clear analyst interpretation
This is more important than any opaque analytic score.

13. Strengthen uncertainty handling
Problem
The source material is narrative and often incomplete.

Required fixes
Make uncertainty more explicit across interpretive coding, not just GIS.

Useful distinctions:

directly stated
probable
inferred
unresolved / unclear
The program should support careful interpretation rather than false certainty.

14. Keep what is already strong
Do not remove these strengths:

immutable source narrative
provenance tracking
analyst transcription
analyst interpretive summary
stage sequencing
GIS and mapping support
research outputs
exportable structured data
15. Case ordering and date filtering
Problem
Cases are not sorting/filtering in a useful chronological way. It appears there is no clear way to filter by incident dateonly, and current ordering may rely on report/import date instead.

Required fixes
Add a clear option to sort cases by incident date
Make incident date the default chronological sort in case list views unless another sort is explicitly selected
Keep report/import date available, but separate it clearly from incident date
Add dedicated filters for:
incident date from
incident date to
Label incident date and report/import date clearly so analysts do not confuse them
Goal
Analysts should be able to review cases in the actual order incidents occurred.

16. Encounter progression ordering
Problem
Stealthing is appearing at the end of encounter progression, which does not make analytical sense.

Required fixes
Remove stealthing from the end of the default encounter progression chain
Reposition stealthing so it appears where it actually belongs in the sequence, likely:
during sexual assault / sexual boundary violation
or immediately after service/sexual contact begins
Do not treat stealthing like a terminal event or late-stage endpoint
Goal
Encounter progression should reflect actual event logic.

17. Vehicle driver role should be structured
Problem
Vehicle driver role is currently a text input and should be standardized.

Required fixes
Change vehicle driver role from free-text input to a dropdown.

Suggested options:

suspect driving
victim driving
third party driving
rideshare / taxi driver
shared/unclear
unknown
other
If “other” is selected, allow a small supporting text field.

18. Summary tab logic should reflect coding more cleanly
Problem
The summary view is useful, but generated progression labels, harm labels, and summary text do not always align cleanly with how the case is coded. Some content reads more like imported residue or automatic field assembly than a meaningful case synthesis.

Required fixes
Ensure encounter progression is generated from structured case logic in a defensible order
Ensure summary chips do not place events in implausible sequence order
If “mixed severe harm” is shown, make sure it is derived from actual selected/coded values
Make the summary read as a meaningful analytic synthesis of the case, not as a generic import artifact, placeholder phrase, or mechanically assembled list of labels
If any summary text is system-generated, label it clearly as system-generated rather than presenting it as analyst-authored
19. Public/private coding needs a semi-private option
Problem
Some environments, especially inside a vehicle, are not well captured by a strict public/private field.

Required fixes
Add semi-private as an option where appropriate for public/private or environmental access coding.

Why
A vehicle in public space is often enclosed but still visible and interruptible. It is not always cleanly public or private.

Goal
Avoid forcing analysts into inaccurate binary choices.

20. Analyst note / analytic summary provenance problem
Problem
The case is showing text such as “Incident in Surrey.” in the analyst note / summary area even when no manual text has been entered by the analyst.

This creates confusion about authorship and provenance.

Required fixes
Audit where the Analytic summary / Analyst notes text is coming from.

Check whether it is being populated from:

saved summary_analytic
imported bulletin/extraction text
auto-generated summary logic
stale React/local state from another case
autosave hydration from existing record data
Required UX fix
If text is not manually entered by the analyst, do not present it as if it were analyst-authored.

Clearly distinguish between:

analyst-entered summary
system-generated summary
imported from source
empty/not yet entered
Preferred solution
Use explicit provenance labeling in the summary area such as:

Analyst entered
System generated
Imported from source
Empty
If the field is empty, it should remain visibly empty and not silently prefill with generic phrases like “Incident in Surrey.”

21. Check for stale state / cross-case carryover in summary fields
Problem
There may be stale values carrying across cases or being shown before true analyst input.

Required fixes
verify that summary/note fields reset correctly when navigating between cases
verify that autosave hydration does not inject prior values into new cases
verify that generated summaries do not appear in analyst-only sections
verify that empty cases render empty summary fields
Goal
No case should display unexplained summary text.

22. GIS capability and visual design upgrade
Please also do a GIS capability and visual design upgrade pass. Keep the current architecture, database, and workflow intact. This is not a rebuild. The goal is to make the mapping side feel closer to a lightweight research GIS workstationand make the whole program feel more refined, visually appealing, and modern without losing seriousness.

Overall goals
Strengthen GIS functionality so it feels closer to QGIS-level research utility
Make the interface look more polished, sleek, and visually appealing
Preserve usability and seriousness. Do not make it look flashy, gamified, or like enterprise SAP software
Do not sacrifice clarity or coding speed for aesthetics. Visual refinement should support analyst workflow, not add ornament or reduce information density where functionally important
23. QGIS-like GIS improvements
23.1 Layer logic and map controls
Add or improve:

clear layer panel on the map
toggle layers for:
initial contact points
primary incident points
destination points
movement lines
heatmap
clusters
uploaded boundary layers
better layer ordering and visibility control
opacity control where useful
legend that updates with active layers
23.2 Attribute-driven styling
Allow map symbols to be styled by selected variables, for example:

coercion present
physical force
sexual assault
robbery/theft
movement present
highest stage categories
environment type
coding status
Examples:

color by harm type
symbol shape by point type
line style by movement type
intensity by case count
23.3 Better spatial filtering
Expand draw-to-filter functionality.

Add support for:

polygon selection
circle/radius selection
rectangle selection
select by boundary layer
filter map + linked stats/results by drawn area
If feasible, linked outputs should update:

visible cases
stage patterns
research outputs
case counts
23.4 Spatial query feel
Add lightweight GIS-style query features such as:

show all cases within X meters/km of selected point
show all cases intersecting selected boundary
show all cases with movement crossing neighbourhood/city boundary
show all cases with contact and incident in different areas
show all cases ending in a selected environment type
23.5 Better boundary and contextual layers
Add support for:

neighbourhood boundaries
municipality boundaries
policing/service zones
custom GeoJSON/KML upload if feasible
labelled overlays that can be turned on/off
23.6 Movement pathway analysis
Improve movement visualization:

directional movement lines with arrows
distinguish:
no movement
attempted movement
completed movement
color/style movement lines by:
coercion/control
vehicle use
public-to-private shift
cross-city/cross-neighbourhood movement
Optional if feasible:

simple movement-path clustering
common route summaries
23.7 Location confidence and uncertainty mapping
Map confidence explicitly using:

exact vs approximate
stated vs inferred
confidence high / medium / low
unresolved / unknown
Examples:

different symbol outlines
translucency
dashed circles for approximate points
23.8 GIS analyst utility tools
If feasible, add:

measure distance tool
click point to copy coordinates
clean coordinate display
export selected cases only
save current map filter state
reset map workspace button
23.9 Linked map-to-record workflow
Clicking a point or line should show:

case ID
incident date
key harm flags
location stage type
open case button
street view if available
If feasible, also allow:

select multiple mapped cases
open filtered case list from map selection
23.10 Research GIS outputs
Add map-linked research views if feasible:

hotspot view by point type
common environment type by area
movement pattern summaries by selected geography
contact-to-incident displacement summaries
cross-boundary case counts
24. Make the whole program visually sleeker and more appealing
Desired visual direction
Aim for:

dark, elegant, research-lab feel
cleaner spacing
better typography hierarchy
restrained palette
smoother surfaces/cards
stronger alignment and consistency
The tool should feel premium and serious.

Reduce “form software” feeling
Improve by:

increasing white space / breathing room
stronger grouping of related fields
fewer harsh box outlines
more card-like structure with subtle depth
cleaner section transitions
less visual noise from borders and helper clutter
Better hierarchy
Make the eye immediately understand:

what is the main task
what is secondary
what is provisional
what is confirmed
what is advanced
More elegant component styling
Refine:

buttons
chips
badges
tabs
section panels
dropdowns
field states
map controls
Desired feel:

crisp
intentional
slightly luxurious
but still restrained and serious
Better color system
Use a cohesive and sophisticated palette:

deep navy / charcoal base
muted slate / steel secondary tones
one restrained accent color for active states
softer status colors
avoid overly bright enterprise colors
Typography refinement
Improve:

heading hierarchy
elegant but readable feel
spacing between labels and inputs
less cramped metadata
more polished tab and card titles
Smoother interactions
Add polish to:

hover states
transitions
expand/collapse behavior
loading states
empty states
toast/confirmation styling
Premium map and research output feel
Map should feel like:

an analyst workstation
not a default embedded map
Research outputs should feel like:

polished analytical views
not raw dashboard blocks
Respect the logo direction
Align visuals with the current logo:

dark
spatial
layered
serious
refined
feminine in a subtle, intelligent way, not decorative
Final design standard
The program should feel like:
a serious, modern, visually refined research platform for structured harm-pattern analysis

25. Priority order
Must do now
remove the main escalation score
replace highest stage reached with multi-select logic
refine turning point / key shift
clarify escalation point vs resolution / endpoint
expand resolution / endpoint options
add incident date sorting and filtering
fix stealthing placement in encounter progression
change vehicle driver role to dropdown
fix summary provenance and stale state issues
add semi-private where needed
clean summary tab logic to match coded structure
improve coding workflow order on the coding screen
stronger GIS layer panel and map controls
better movement/pathway visualization
spatial filtering improvements
location confidence visualization
overall visual hierarchy cleanup
more refined styling of cards, tabs, panels, and controls
Next
add cross-case stage transition outputs
add environmental transition outputs
improve uncertainty handling across fields
demote NLP to a more clearly supportive role
attribute-driven map styling
linked map-to-case and map-to-research workflow
boundary layer handling improvements
typography and palette refinement
smoother interactions and transitions
Later
refine exports around sequence/transition analysis
add method-specific research summary views
strengthen analyst guidance and next-best-step cues
advanced spatial query tools
saved map states
research-oriented GIS outputs
multi-select spatial workflows
Final standard
At the end of this pass, the analyst should be able to use the program and immediately understand:

what happened in the case
how the encounter unfolded
where the harmful shift occurred
how it ended
how severe/harm categories co-occurred without forcing false singularity
how this case can be compared to broader patterns across the dataset
and how spatial setting, movement, and uncertainty shape the analysis
The program should make immediate sense to an analyst. It should not feel like a generic coding form, a dashboard with extra features, or a partially automated scoring tool. It should feel like a human-led workflow for turning disorganized narrative harm reports into structured behavioural, situational, sequence-based, and geospatial data for research and pattern analysis.