
1. Stage identification (RQ1)
Your tool must force you to break each report into stages.

Minimum requirement:

initial contact
negotiation
movement
escalation
outcome
What to build/check:

each report cannot be saved without assigning stages
allow multiple stages per report
allow sequencing (order matters)
Important:
You are not just tagging. You are ordering events.

2. Behavioural extraction (within stages)
Within each stage, your tool must capture what actually happened.

Examples:

client behaviour (pressure, deception, aggression)
victim response (resistance, compliance, exit attempts)
turning points (shift from negotiation → coercion)
What to build/check:

structured fields or tags per stage
ability to attach multiple behaviours to a stage
free text linked to structured coding (do not lose narrative detail)
3. Situational conditions (RQ2)
Your tool must explicitly code environment at each stage.

Core variables (keep these tight):

visibility (public → private)
guardianship (present → absent → delayed)
isolation level
control (who controls space, transport, movement)
What to build/check:

these must be coded per stage, not just per case
must allow change across stages
no skipping allowed
This is critical. Most people get this wrong.

4. Spatial component (RQ3)
Your tool must handle location and movement, not just static points.

Minimum:

start location
subsequent locations
movement type (walk, vehicle, unknown)
What to build/check:

ability to log multiple locations per case
ordered sequence of locations
link locations to stages
Advanced (if possible, not required):

timestamps
approximate distance or direction
5. Cross-case comparison (this is where your contribution lives)
Your tool must let you see patterns across reports.

Not just:

one case at a time
But:

how many cases follow a similar path
where escalation commonly occurs
what conditions are present at escalation
What to build/check:

filtering (e.g., show all cases with vehicle movement)
grouping (cases with similar stage sequences)
ability to export structured data
6. Consistency and rigour (this is what supervisors care about)
You need to make sure your tool produces repeatable coding.

So:

Define your categories clearly:

what counts as “negotiation”
what counts as “escalation”
what counts as “isolation”
Build this into your tool as:

fixed category options (not just free typing)
definitions accessible while coding
7. Link everything together (this is the key difference)
Your tool must connect:

stage → behaviour → conditions → location

If these are separate, your method collapses.

Each stage should carry:

behaviours
situational conditions
location
That’s your analytic unit.

What you do NOT need
You do not need:

machine learning
predictive modelling
complex GIS software inside the tool
a polished interface
This is about structured analysis, not tech sophistication.

Quick self-check
If I asked you:

“Show me 5 cases where escalation occurred after movement into a private location with low guardianship”

Your tool should let you answer that quickly.

If it can’t, it’s not ready.

Bottom line
To make your tool work for your study, it must:

force staged sequencing
capture behaviour within stages
code situational conditions per stage
track movement across locations
allow cross-case comparison
That’s it.