# Pixel Art for Ben's Site

## Start with an anchor

- Write the anchor before drawing anything and keep it in the experiment's working notes. The anchor locks grid size, palette, colour budget, outline rule, one light source, and the layer list. Use the template in [references/anchor.md](references/anchor.md).

- Give the piece a subject before giving it a pattern. A meadow, a skyline, a tree, a wordmark. Abstract fields that only react have failed on this site twice, so a piece with no subject does not get built.

- Start at the smallest grid that can carry the subject, then grow only if detail is missing. Judge every pass at 1x, the size a visitor actually sees.

## Draw like a pixel artist

- Draw in clusters, continuous blobs of one colour. Use as few clusters as possible. Delete single isolated pixels or merge them into a neighbour cluster, unless one is a deliberate detail such as a bird or a star.

- Build shade ramps that shift hue, not only brightness. Push shadows cooler toward blue and purple with lower saturation, and highlights warmer toward yellow with higher saturation. Avoid pure black and pure white inside the art, use the ramp's own tinted dark and light ends.

- Keep lines clean. Use even step sizes on diagonals and let curve steps grow or shrink gradually. Remove doubles, the extra corner pixel that makes a line two pixels thick in one spot. Watch for banding, shade bands of equal width hugging each other, and break it by changing a band length by one or two pixels.

- Outline with the darkest shade of the thing being outlined, lighter where the light hits. Never outline everything in one flat dark colour.

- Shade form, not outlines. Pick one light source, keep flat faces one colour, and use two to four shade steps on rounded forms. Shading that follows the outline on every side reads as pillow shading and flattens the piece.

- Use dithering as seasoning, not the dish. Dither only between two neighbouring ramp shades, only on large, still, low contrast areas such as sky and water. Keep small subjects and anything that changes state as flat clusters. Leave some areas undithered so the dithered areas have contrast to play against.

- Compose scenes back to front, sky, far layer, mid layer, foreground subject, and block each layer in flat colour before adding any detail or dither.

## Build it deterministically

- Draw in code, as data plus a renderer, or as a build script that is the artwork. Edit the script and rerun it, never hand-edit an exported image.

- Keep the palette as data in one place, names and hex values together, and draw only from it. Famous palette names are fine as a starting point, but the hex values in the file are what count. Site palette values live in [references/site-palette.md](references/site-palette.md).

- Seed all variation. No unseeded randomness at render time, so every render of the same code is the same picture and a critique pass can be trusted.

- Convert photographs or generated images with a script, in this order: downscale with nearest neighbour first, then quantise to the palette, then clean stray pixels. Quantising before the downscale misaligns the dither with the final grid.

## Run the loop

- Render, look at the render, critique it against [references/critique-checklist.md](references/critique-checklist.md), fix the worst thing, and render again. Run at least three passes before showing Ben anything.

- Score the final pass against the checklist. Ship to Ben only at a pass, and report the weak spots honestly with the demo instead of hiding them.

- Look the way the checklist says: at 1x, as a solid black silhouette, and in greyscale. A piece that fails the silhouette or cold read test gets redesigned, not polished.

## Ben's site rules

- Obey the pixel rule without exception. Pixels sit on a fixed grid and light in place in discrete steps on a tick. No drift, no sliding, no transforms that move pixels, no opacity fades. The pointer may carry velocity, pixels may not. Shade changes are whole-cell swaps to another palette colour on the tick.

- Leave the profile portrait and its styling completely alone. Ben prefers it as it is. Treat it as the house standard instead: a strong subject, dither used for tone, and a scrambled block reveal.

- Fit the site's own system. Use its theme variables and accent family first, keep both light and dark themes working or make the piece a fixed ink and paper piece like the portrait, respect reduced motion with a single static render, and keep the DOM and cell cost modest, because a 16,000 cell field already proved too heavy.

- Take creative direction from subjects and moods, the way the Ghibli meadow direction replaced the abstract margin field. Nature, layers of landscape, grass as tuft clusters, and quiet empty sky are the current reference point.

## Present the result

- Present each finished experiment as its own demo with a screenshot and a GIF, the branch and commit, what the critique passes fixed, and the honest caveats.

- Pair every demo with a tappable multiple choice menu, merge, cut, keep parked, so Ben can answer with one tap. Never send a demo without its menu.

- Push, open PRs, merge, or cut only on Ben's explicit call for that experiment, and use the `gh` CLI for GitHub work.

## Available connectors

- [GitHub](/opt/hatch/connectors/github/CONNECTOR.md) for the site repo, though Ben's standing rule is to drive GitHub through the `gh` CLI rather than the MCP tools.

- Use `muse.connector_search` to find other connectors and `muse.skill_search` to find related skills.

- If nothing here fits, look on the web for a maintained API or MCP server and set it up with [Custom Connectors and MCPs](/opt/muse/skills/custom-connector-setup/SKILL.md), or build a custom connector.
