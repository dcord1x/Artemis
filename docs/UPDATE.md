Add 1 



Objective

Redesign the “Research” tab in VIRGO to function as a central analytic workspace that aggregates and surfaces key patterns across cases in real time.

This is not a static dashboard. It should actively support research analysis and pattern identification.

Core Purpose
The Research tab should allow the user to:

see patterns across all coded cases
identify recurring behavioural sequences
examine situational conditions across stages
observe spatial trends and movement
quickly move between high-level patterns and individual cases
Required Functionality
1. Pattern Summary (Top Section)
Display:

most common behavioural stage sequences
most frequent escalation points
counts or simple frequencies (no complex stats needed)
Goal: immediate visibility of how encounters are unfolding across cases

2. Situational Conditions Overview
Aggregate across all cases:

visibility patterns
guardianship presence/absence
isolation levels
control indicators
Allow filtering:

by stage (e.g., show conditions at escalation only)
3. Spatial Overview
embedded map showing:
incident locations
movement where available
allow filtering by:
stage
condition
time (if available)
4. Movement / Transition Patterns
show common transitions:
public → vehicle
vehicle → private location
highlight where escalation tends to occur relative to movement
5. Case Linkage View
Surface possible connections across reports:

repeated vehicles
repeated locations
repeated behavioural patterns
Important:

label as “potential linkage”
do not imply confirmation
6. Drill-Down Capability
From any pattern or summary:

click → view underlying cases
maintain link back to original narrative
7. Filters (Critical)
Allow filtering across:

stage
condition
location type
presence of movement
time range
The Research tab should update dynamically based on filters.

8. Research Notes Panel
allow user to write and save analytic notes
optionally tag notes to patterns or cases
9. Export Connection
allow selected patterns or filtered views to be pushed directly into:
Bulletin / Report Output module
Design Constraints
keep layout clean and analytical
avoid “dashboard clutter”
prioritize readability and logic over visuals
no unnecessary graphs or gimmicks
Conceptual Framing (important for Claude)
This tab should function as:

a live synthesis layer
where structured data becomes interpretable patterns
supporting qualitative + spatial analysis
NOT:

a static report
a generic dashboard
a visualization tool without analytic purpose
One-line summary for Claude
“The Research tab should act as a central analytic workspace that aggregates coded case data into interpretable patterns across behavioural stages, situational conditions and spatial movement, while allowing drill-down into individual reports.”



Add 2





Objective

Add an applied output module to VIRGO that converts coded case data into structured analytic bulletins (PDF export), including geospatial maps, behavioural patterns and cross-case insights.

This is not just reporting. It should translate structured analysis into usable outputs.

Core Functionality

Create a “Bulletin / Report Output” module with the following capabilities:

1. Report Generation Interface
Add a “Generate Report” or “Create Bulletin” option
Allow user to select:
date range
subset of cases (all / filtered)
location filter (optional)
type of report (quick summary vs full bulletin)
2. Structured Output Sections
Each generated report should include:

A. Overview Summary

number of reports included
time range
basic distribution (by location type, if available)
B. Geospatial Output

map of incident locations
if possible: distinguish:
initial contact locations
destination locations
if movement exists:
simple path or connection (optional, do not over-engineer)
C. Behavioural Patterns

most common stage sequences (e.g., contact → negotiation → movement → escalation)
frequency of escalation points
notable behavioural indicators (e.g., deception, pressure, sudden escalation)
D. Situational Conditions

summary of:
visibility levels
guardianship presence/absence
isolation patterns
highlight common patterns linked to escalation
E. Movement / Spatial Dynamics

% of cases involving movement
common transitions (e.g., public → vehicle → private)
note any consistent patterns
F. Case Linkage Indicators

repeated descriptors across cases:
vehicle
location
behaviour pattern
flag possible links (no automated certainty claims)
G. Analyst Notes Section

optional free-text field
user can add interpretation before export
3. Output Format
Export as clean, structured PDF
Keep design simple:
headings
bullet summaries
embedded map image
Avoid over-designed visuals
4. Data Handling Requirements
Pull only from already coded data
Do not attempt to “interpret” beyond structured inputs
If data is missing:
omit or mark as “not available”
5. System Integration
The module must:

use existing coded fields (stages, conditions, locations)
not require re-entry of data
maintain linkage:
stage → condition → location
6. Future-Proofing (important)
Design so that:

additional variables can be added later
report sections can expand without breaking structure
7. Constraints
Do NOT:

call it “CompStat” in the system
over-automate interpretation
introduce predictive or scoring features
require perfect data completeness
8. Naming
Use neutral naming:

“Generate Bulletin”
“Analytic Summary Report”
“Case Pattern Report”
Avoid:

“Intelligence tool”
“CompStat”
“AI analysis”
9. Goal
The output should allow a user to quickly answer:

What patterns are emerging?
Where are incidents occurring?
How are encounters unfolding?
Are there repeat behaviours or possible linkages?
This should feel like a structured analyst briefing, not a dashboard dump.