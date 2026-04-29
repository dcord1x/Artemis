Please do a GIS capability and visual design upgrade pass on the program. Keep the current architecture, database, and core workflow intact. This is not a rebuild. The goal is to make the mapping side feel much closer to a lightweight research GIS workstation and to make the whole program feel more refined, visually appealing, and modern without losing seriousness.
Overall goals

Strengthen the GIS functionality so it feels closer to QGIS-level research utility.
Make the interface look more polished, sleek, and visually appealing.
Preserve usability and seriousness. Do not make it look flashy, gamified, or like enterprise SAP software.


PART 1: QGIS-like GIS improvements

The current map is useful, but I want it to feel more like a proper analytic GIS workspace for research on movement, place, and harm patterns.

1. Layer logic and map controls

Please strengthen the map so the analyst can work with layers more intentionally.

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
The map should feel like layers are analytic objects, not just display options.

2. Attribute-driven styling

Allow map symbols to be styled by selected variables, for example:

coercion present
physical force
sexual assault
robbery/theft
movement present
highest stage reached
environment type
coding status
Examples:

color by harm type
symbol shape by point type
line style by movement type
intensity by case count
This should help the analyst see patterns, not just points.

3. Better spatial filtering

Expand the current draw-to-filter functionality.

Add support for:

polygon selection
circle/radius selection
rectangle selection
select by boundary layer
filter map + linked stats/results by drawn area
Once a spatial filter is drawn, all linked outputs should update if feasible:

visible cases
stage patterns
research outputs
case counts
4. Spatial query feel

Add lightweight GIS-style query features such as:

show all cases within X meters/km of selected point
show all cases intersecting selected boundary
show all cases with movement crossing neighbourhood/city boundary
show all cases with contact and incident in different areas
show all cases ending in a selected environment type
The user should feel they can interrogate space, not just look at it.

5. Better boundary and contextual layers

Strengthen support for reference geography.

Add support for:

neighbourhood boundaries
municipality boundaries
policing/service zones
custom GeoJSON/KML upload if feasible
labelled overlays that can be turned on/off
These layers should support visual and analytic filtering.

6. Movement pathway analysis

Movement is central to the method. Make movement visually stronger.

Improve:

directional movement lines with arrows
distinguish:
no movement
attempted movement
completed movement
color or style movement lines by:
coercion/control
vehicle use
public-to-private shift
cross-city/cross-neighbourhood movement
Optional if feasible:

simple movement-path clustering or common route summaries
7. Location confidence and uncertainty mapping

This is very important.

Map location confidence explicitly using:

exact vs approximate
stated vs inferred
confidence high / medium / low
unresolved / unknown
Examples:

different symbol outlines
translucency
dashed circles for approximate points
The GIS should not visually imply all locations are equally certain.

8. GIS analyst utility tools

If feasible, add small but useful GIS workstation functions:

measure distance tool
click point to copy coordinates
show coordinate format cleanly
export selected cases only
save current map filter state
reset map workspace button
9. Linked map-to-record workflow

Strengthen map-to-case navigation.

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
10. Research GIS outputs

Add map-linked research views if feasible:

hotspot view by point type
common environment type by area
movement pattern summaries by selected geography
contact-to-incident displacement summaries
cross-boundary case counts
The GIS should support the methodology, not just look good.



PART 2: Make the whole program visually sleeker and more appealing

The program should look:

refined
modern
calm
analytical
visually attractive
It should not look like:

SAP
clunky enterprise software
old administrative forms
overdesigned startup fluff
1. Visual direction

Aim for:

dark, elegant, research-lab feel
cleaner spacing
better typography hierarchy
restrained palette
smoother surfaces/cards
stronger alignment and consistency
The tool should feel premium and serious.

2. Reduce “form software” feeling

Right now some screens still feel like long admin forms.

Improve by:

increasing white space / breathing room
stronger grouping of related fields
fewer harsh box outlines
more card-like structure with subtle depth
cleaner section transitions
less visual noise from borders and helper clutter
3. Better hierarchy

Make the eye immediately understand:

what is the main task
what is secondary
what is provisional
what is confirmed
what is advanced
This means:

stronger headings
quieter metadata
clearer primary action buttons
less competition between toolbars and form sections
4. More elegant component styling

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
5. Better color system

Use a more cohesive and sophisticated palette.

Recommended direction:

deep navy / charcoal base
muted slate / steel secondary tones
one restrained accent color for active states
softer status colors
avoid overly bright enterprise primary colors
Use color to communicate meaning, not decoration.

6. Typography refinement

Improve typography so it feels less generic.

Need:

clear heading hierarchy
elegant but readable feel
better spacing between labels and inputs
less cramped metadata
more polished tab and card titles
7. Smoother interactions

Add polish to interaction states:

cleaner hover states
smoother transitions
nicer expand/collapse behavior
graceful loading states
clearer empty states
more polished toast/confirmation styling
8. Make the map and research outputs feel premium

These are the most visually important areas.

Map should feel like:

an analyst’s workstation
not a default embedded map
Research outputs should feel like:

polished analytical views
not raw dashboard blocks
9. Respect the logo direction

The visual system should align with the current logo:

dark
spatial
layered
serious
refined
feminine in a subtle, intelligent way, not decorative
10. Final design standard

The program should feel like:
a serious, modern, visually refined research platform for structured harm-pattern analysis

It should be:

beautiful enough that someone notices the care
functional enough that it still feels rigorous
sleek without becoming vague
attractive without losing credibility


Priority order

Must do first

stronger GIS layer panel and map controls
better movement/pathway visualization
spatial filtering improvements
location confidence visualization
overall visual hierarchy cleanup
more refined styling of cards, tabs, panels, and controls
Next

attribute-driven map styling
linked map-to-case and map-to-research workflow
boundary layer handling improvements

IMPORTANT: Do not sacrifice clarity or coding speed for aesthetics. Visual refinement should support analyst workflow, not add ornament or reduce information density where the information is functionally important.