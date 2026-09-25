# Inkbound

A browser-based fantasy map maker for worlds, regions, settlements, battlemaps, dungeons, caves, camps and interiors.

**Workflow:** Create → Paint → Populate → Detail → Light → Export

Inkbound runs entirely in the browser. It has no AI features, needs no API keys, and has no paid dependencies. All artwork is drawn procedurally in code: textures, trees, mountains, buildings, props, coastlines, rivers and weather. Projects are stored locally in the browser (IndexedDB), so hosting is just a static site.

## Features

| Area | What's included |
| --- | --- |
| **Dashboard** | Map cards with thumbnail, type, size and last-edited date. Open, rename, duplicate, delete, export an image, or download a portable project file. Import project files. Two built-in test maps from the spec (*Varren's Forest*, *Adventurer Camp*). |
| **New map** | 8 map types (each sets sensible defaults but restricts no tools), size presets from 1920×1080 up to 3840×2160, square/portrait/landscape, custom sizes up to 16384px, style presets and optional seeded starting terrain. |
| **Trace from image** | Load a map exported from another tool, a scan or a sketch as a reference layer (or pick one in *New Map*). *Convert* detects the sea (it follows ink coastlines and ignores glows, grid lines and titles), then creates an editable coastline, snow/forest/rock textures, and scattered forests and mountains in one undo step. The reference image is never exported. |
| **Terrain** | Add, remove, smooth, roughen, expand, contract and flood-fill land/water. Noise-driven edges keep coastlines organic. The mask is vectorised with marching squares in a Web Worker, so coastlines stay crisp at any zoom or export size. Coast styles: painted (ink outline + glow), ink atlas (ripples), soft shoreline, cave walls, hatched dungeon walls. |
| **Texture brush** | 25 procedural tileable textures. Size, opacity, flow, hardness, edge softness, texture scale, rotation and rotation variation. Weighted texture mixing (e.g. 60% soil / 20% moss / …) with noise-eroded tips for gradual blending. Optional clipping to land or water. |
| **Asset library** | 344 procedurally drawn assets. An *Atlas* pack for world/region maps (colour + sepia ink variants) and a *Top-down* pack for nature, 8 architectural collections × 10 building types, camp, dungeon, cave, interior and village props. Search, categories, favourites, recently used, custom collections and PNG/WebP/JPEG import into folders. |
| **Scatter brush** | Weighted random placement with density, spacing, scatter, scale range, rotation variation, edge falloff and colour variation. Optional smart rules: avoid water/roads/buildings, cluster naturally, thin edges, prefer shorelines, align to roads, near mountains, collisions. Seeded and reproducible (*Seed · Randomize · Apply*). One stroke is one undo step. |
| **Paths** | One spline engine with profiles for rivers/streams (meander, taper, width variation, rough banks, reeds/rocks/rapids/islands), roads (dirt, mud, cobblestone, flagstone, trail, snowy trail, ink routes) with ruts, grass, stones, mud and edge wear, walls (stone, palisade, castle with towers, ruined, fence, hedge), borders and cave passages. |
| **Objects** | Select, shift-select, marquee, select all / by layer / by same asset. Move, rotate, uniform and non-uniform resize, flip, duplicate, delete, lock, permanent groups, snapping. Non-destructive tint, hue, saturation, brightness, contrast, temperature, shadow, blur and opacity. |
| **Layers** | Create, rename, reorder (drag & drop), hide, lock, opacity, duplicate, delete, and folders. Automatic depth sorting with Bring Forward / Send Backward / to Front / to Back. Grid, Lighting and Atmosphere are layers, so their position in the stack matters. |
| **Text** | Label presets (continent, nation, region, city, village, mountains, water, road, building), fonts, size, bold/italic/caps, letter and line spacing, alignment, rotation, curved text, colour, outline, shadow and opacity. |
| **Grid** | None, square or hex, with cell size, opacity, thickness, colour, offset and snap. |
| **Lighting** | Presets (dawn, day, golden hour, sunset, twilight, night, moonlight, overcast) plus manual ambient, temperature, contrast, shadow intensity and light direction. Local lights (campfire, torch, lantern, fireplace, window glow, magical) with radius, intensity, colour, falloff and shadow strength. Lighting is non-destructive. |
| **Atmosphere** | Fog, mist, smoke, rain, snow, clouds, dust, embers, fire glow, god rays and a darkness vignette. Each can cover the whole map or a feathered region. |
| **Export** | PNG, JPEG or WebP at 1×, 2× or 4×, with toggles for grid, labels, lighting and effects. The whole map is rendered from scene data (never a viewport screenshot), in strips with progress. PNG uses a streaming encoder, so very large exports avoid browser canvas limits. |
| **Editing** | Undo/redo for nearly everything, including brush strokes, terrain, scatter, layers, lighting and paths. Keyboard shortcuts (press `?` in the editor). Autosave with a save-status indicator, and a save on tab hide/close. Preview mode. |

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run typecheck
npm run build      # static site in dist/
```

## Hosting

`npm run build` produces a static site in `dist/`. It uses relative asset paths, so it works from a domain root or a sub-path. Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3, or nginx.

- **GitHub Pages:** `.github/workflows/deploy-pages.yml` deploys on every push to `main`. In the repository settings, go to *Pages* and set the source to *GitHub Actions*.
- Web fonts load from Google Fonts. Without network access, labels fall back to Georgia/serif.

Maps and imported assets live in the visitor's browser storage. Use **Download project file** from the dashboard (or the Export dialog) to back maps up or move them to another browser. The storage layer is isolated in `src/storage/` so a server backend with accounts can be added later without touching the editor.

## Architecture

```
src/
  core/        rng (seeded), noise (tileable fbm), geometry, colour adjustments, canvas helpers
  model/       project data model (ProjectDoc, layers, scene objects) and map-type presets
  engine/
    assets/    asset registry + sprite cache (one source per asset, rendered per zoom bucket,
               colour-adjusted variants cached) and the procedural art packs
    terrainMask.ts / contour(.worker).ts / terrainRenderer.ts   land/water mask → vector coastline → tile cache
    paintLayer.ts   texture painting with tile-based undo snapshots
    scatter.ts      generic scatter brush (weights, rules, collisions, spatial hash)
    paths.ts        generic spline path engine with rendering profiles
    text.ts, lighting.ts, effects.ts, renderer.ts, objectCache.ts, export.ts, png.ts
  editor/      Editor (document, transactions, history, selection, layers, camera, autosave), library
  tools/       select, terrain, brush, assets, path, text, light, atmosphere
  ui/          React UI: dashboard, editor chrome, panels, dialogs
  samples/     the spec's test maps, built through the same public editor APIs
```

Key design points:

- **Scene, not pixels.** Assets are lightweight instances that reference an asset id plus transform and colour data. Paths, labels, lights and effects are stored as data, and lighting is applied at render time. Only terrain and texture paint are rasters.
- **Immutable objects + transactions.** Every edit replaces objects, so undo commands store references rather than copies. A 500-tree scatter stroke is a single command. Raster edits store only the 128px tiles they touched.
- **Performance.** Terrain and dense object layers render into cached level-of-detail tiles, invalidated only under changed objects. Objects outside the view are culled. Sprites come from a power-of-two resolution cache. Coastline extraction runs in a Web Worker.
