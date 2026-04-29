Please do a methods-alignment refinement pass on the program so it clearly supports the analyst workflow and directly reflects the research design. Keep the existing architecture, database, and core screens intact. This is not a rebuild. It is a structured redesign of the workflow and interface logic so the program makes clearer sense for analyst use and better matches what the research is actually trying to determine. The current app already includes structured coding, stage sequencing, NLP signals, mapping, research outputs, and case comparison, so this pass should build on that foundation rather than replacing it.  

Core goal

The program should clearly support this analytic flow:

read the narrative → code key facts → reconstruct the encounter as a sequence → identify turning points and stage transitions → compare recurring patterns across cases

The tool should feel like a human-led workflow for organizing and analyzing raw community-generated harm reports, not like a generic dashboard and not like a partially automated scoring system.

1. Remove the current escalation score as a main feature

Please remove the current NLP escalation score / 5 from the main coding interface and from any place where it appears as a central analytic field.

Why

It does not align cleanly with the methodology and it is creating confusion. It currently mixes:

NLP-detected signals
stage progression
severity logic
and harm flags
into one number that is not transparent enough and is not necessary for the method.

Replace it with clearer fields

Instead of a single escalation score, the program should emphasize:

Escalation point
Turning point / key shift
Highest stage reached
Resolution / endpoint
Early escalation indicators present
These are more defensible and more directly tied to the research design.

2. Make the encounter sequence the main analytic object

The research is about how harm unfolds across the encounter, not just what outcome occurred.

Please make the program more explicitly organize each case as a sequence across stages such as:

initial contact
negotiation
movement
isolation
control/coercion
violence
exit/resolution
The current stage system already exists. What is missing is clearer synthesis and clearer presentation of that sequence to the analyst.  

Add a case-level sequence summary

For each case, generate a concise structured encounter summary from the coded fields and/or stage entries, for example:

Contact → Negotiation → Movement → Coercion → Physical violence → Exit
Contact → Negotiation → Agreement shift → Sexual assault → Escape
Rules:

use analyst-coded values first
if provisional NLP is referenced, label it clearly
do not invent missing stages
keep the sequence readable and analyst-facing
This summary should be visible on the case screen and exportable for research use.

3. Add a “highest stage reached” field

Please add a clearer field that captures the highest level the encounter reached.

Suggested options:

no clear escalation
negotiation conflict
coercion/control
physical violence
sexual violence
robbery/theft
mixed severe harm
unknown
This is more useful than the current score because it reflects the actual structure of the encounter rather than compressing it into an opaque number.

4. Strengthen the concept of the turning point

The method depends on identifying where the harmful interaction changed.

Please add or refine a field called something like:

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
This should be treated as a major analytic field because it helps answer how the interaction changed, not just how it ended.

5. Keep escalation point and resolution / endpoint, but define them clearly

Please keep:

Escalation point
Resolution / endpoint
But make the definitions and UI clearer.

Escalation point

This should refer to the moment where the encounter clearly became more harmful or coercive.

Resolution / endpoint

This should refer to how the encounter ended, for example:

victim escaped
offender left
assault completed
robbery completed
third-party interruption
unknown
other
Do not mix escalation and endpoint logic together.

6. Add early escalation indicators as a structured checklist, not a score

Instead of a numeric early escalation score being prominent, use structured indicators such as:

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
This aligns better with the methodology because it helps identify how escalation developed rather than hiding it inside one number.

7. Make stage transitions visible and analyzable across cases

The research is not just about which stages exist. It is about what tends to happen after certain stages.

Please add cross-case outputs that summarize transitions such as:

refusal → pressure
movement → isolation
negotiation → agreement shift
isolation → violence
payment dispute → robbery
threat → physical force
physical force → exit/escape
This should be a major research output because it directly supports the question of how harm unfolds across the encounter.

8. Add environmental transition logic, not just static environment fields

The current environment/location coding is useful, but the method needs more emphasis on change in setting, not just final setting.

Please add analytic summaries for:

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

The current program still feels partly like a large form. Please make the workflow feel more sequential and analyst-centered.

Desired coding flow

The case screen should support this order:

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

Please keep NLP, but make its role clearer.

NLP should be presented as:

provisional signal
candidate indicator
review aid
It should not dominate the main logic of the coding workflow, and it should not be represented as a core analytic conclusion.

Where NLP contributes, label it clearly as:

NLP signal
provisional
analyst review required
11. Make the research outputs speak the language of the method

Please revise the research output sections so they reflect the actual research questions.

Outputs should answer questions like:

How often did harm intensify after movement?
How often did refusal precede coercion?
How often did the setting become more private before violence?
How often did robbery follow sexual or physical coercion?
What were the most common encounter pathways?
What environmental shifts were most common before escalation?
The outputs should feel like direct extensions of the methods chapter, not generic dashboard summaries.

12. Prioritize cleaning and organizing raw community-generated data

The tool should clearly foreground its core role:
cleaning, structuring, organizing, and analyzing messy community-generated harm reports

That means the workflow should emphasize:

preserving source text
structured extraction
human-led coding
uncertainty handling
provenance
clear analyst interpretation
This is more important than any opaque analytic score.

13. Strengthen uncertainty handling

Please make uncertainty more explicit not just in GIS, but across interpretive coding.

Useful distinctions:

directly stated
probable
inferred
unresolved / unclear
This matters because the source material is narrative and often incomplete. The program should support careful interpretation rather than forcing false certainty.

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
Those are already important assets of the program.  

15. Summary of the redesign intent

The program should make immediate sense to an analyst using it for this research.

It should not feel like:

a generic coding form
a dashboard with extra features
or a partially automated scoring tool
It should feel like:
a human-led workflow for turning disorganized narrative harm reports into structured behavioural, situational, sequence-based, and geospatial data for research and pattern analysis

Priority implementation list

Must do now

remove the main escalation score
add highest stage reached
add or refine turning point / key shift
clarify escalation point vs resolution / endpoint
generate case-level encounter sequence summaries
improve analyst workflow order on the coding screen
Next

add cross-case stage transition outputs
add environmental transition outputs
improve uncertainty handling across fields
demote NLP to a more clearly supportive role
Later

refine exports around sequence/transition analysis
add method-specific research summary views
strengthen analyst guidance and next-best-step cues
Final standard

At the end of this pass, the analyst should be able to use the program and immediately understand:

what happened in the case
how the encounter unfolded
where the harmful shift occurred
how it ended
and how this case can be compared to broader patterns across the dataset
That is the standard the workflow should now be built around.