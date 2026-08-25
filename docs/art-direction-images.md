# Art-Direction Images

Lets authors provide **multiple images in the same cell** so each screen breakpoint shows a different, purpose-cropped image ("art direction") instead of one image simply scaled up or down. Implemented once in `scripts/utils.js` and reused by any block that opts in (currently `hero` and `columns`).

---

## 1. Authoring

### 1.1 Basic idea

Normally an image cell contains a single picture, and it is shown at every breakpoint (just resized). To art-direct instead, place **2 to 5 images in the same cell**, in order from the smallest breakpoint to the largest. Each image is shown only at its own breakpoint and up, so you can crop or choose a different asset per screen size.

### 1.2 How many images

| Images in the cell | Result |
|---|---|
| 0 | Cell content is left exactly as authored — no picture is built. |
| 1 | Standard single responsive image, shown at every breakpoint. |
| 2–5 | Art-direction: each image activates at its own breakpoint (see below). |
| More than 5 | Only the first 5 (in document order) are used — remove extra images if you need fewer breakpoints. |

### 1.3 Order = breakpoint (mobile → widescreen)

Images are read in the order they appear in the cell. The first image is the mobile/base image; each image after it takes over at a larger minimum width:

| Order authored | Applies from | Suggested use |
|---|---|---|
| 1st | base (no minimum — mobile default) | phone |
| 2nd | 768px and up | tablet |
| 3rd | 992px and up | small desktop |
| 4th | 1200px and up | desktop |
| 5th | 1600px and up | wide desktop |

### 1.4 Linking the image(s)

If the **first** image is wrapped in a link (select the image and add a hyperlink), that same link wraps the whole combined picture, so it stays clickable at every breakpoint. Links on the 2nd–5th images, if present, are ignored — only the first image's link is used.

### 1.5 Where this is available

- **Hero**: any image cell (single-panel or dual-panel).
- **Columns**: a column that contains 2–5 images. A column with a single image keeps its normal appearance unchanged.

---

## 2. Developer

### 2.1 Where the code lives

Exported from `scripts/utils.js`:

| Export | Purpose |
|--------|---------|
| `buildPictureContentFromImageCell(cell, options)` | Main entry point — returns a `DocumentFragment` to replace a cell's contents |
| `collectBlockCellImageSources(cell)` | Walks a cell and collects up to 5 `{ src, alt, link }` entries in document order |
| `createArtDirectionPicture(sources, eager)` | Builds one `<picture>` with a `<source media="...">` per breakpoint |
| `DEFAULT_BLOCK_SINGLE_PICTURE_BREAKPOINTS` | Breakpoints used for the single-image case |

Already consumed beyond `hero` and `columns`:

- **Carousel** (`blocks/carousel/carousel.js`) — calls `buildPictureContentFromImageCell` on each slide's image column, same as `hero`/`columns`.
- **Section Backgrounds** (`applySectionBackgroundDecorations` in `scripts/scripts.js`) — a section-metadata field (`background-image` … `background-image-5`) supplies up to 5 image URLs directly (no cell DOM to walk), so it calls `createOptimizedPicture`/`createArtDirectionPicture` directly instead of going through `collectBlockCellImageSources`.

### 2.2 How it works

`collectBlockCellImageSources` recursively walks the cell's descendants in document order and collects up to `MAX_BLOCK_CELL_IMAGES` (5) images, matching either a `<picture>` (using its `<img>`) or a bare `<img>` not already inside a `<picture>`. For the **first** matched image only, it also walks up the ancestor chain (stopping at the cell) looking for a wrapping `<a href>`; links wrapping any later image are not recorded.

`buildPictureContentFromImageCell` then branches on the number of sources found:

- **0** — the cell's original child nodes are returned unchanged.
- **1** — `createOptimizedPicture` builds a standard responsive picture using `DEFAULT_BLOCK_SINGLE_PICTURE_BREAKPOINTS` (`(min-width: 600px)` → width 2000, else width 750).
- **2–5** — `createArtDirectionPicture` builds one `<picture>` with a `<source media="...">` per image (largest breakpoint first, so the browser picks the first matching source), plus a fallback `<img>` for the first/base image.

If the first source has a captured link, the resulting `<picture>` is wrapped in a clone of that `<a>` (preserving attributes like `target`/`rel`), so a single `<a>` surrounds the whole responsive image.

Breakpoint/width mapping used by `createArtDirectionPicture` (see `getArtDirectionSourceMeta`):

| Image order | `media` | CDN `width` |
|---|---|---|
| 1st | *(none — fallback `<img>`)* | 750 |
| 2nd | `(min-width: 768px)` | 992 |
| 3rd | `(min-width: 992px)` | 1200 |
| 4th | `(min-width: 1200px)` | 2000 |
| 5th | `(min-width: 1600px)` | 2560 |

### 2.3 How to use it in a block

```javascript
import { buildPictureContentFromImageCell } from '../../scripts/utils.js';

const built = buildPictureContentFromImageCell(cell);
cell.replaceChildren(built);
```

`options` (all optional): `eagerSingle` (default `true`), `eagerArtDirection` (default `true`), `singlePictureBreakpoints` (default `DEFAULT_BLOCK_SINGLE_PICTURE_BREAKPOINTS`).

### 2.4 Reference implementations

- `blocks/hero/hero.js` — calls it unconditionally on each image cell (single-panel and dual-panel), so 0–5 images are all handled.
- `blocks/columns/columns.js` — only calls it when a column contains a `<picture>` and has between 2 and 5 direct children; a single-image column is left as authored and just gets the `columns-img-col` styling class.

### 2.5 Compatibility

Works with any cell whose images are nested arbitrarily deep (bare `<picture>`/`<img>`, or wrapped in `<p>`, `<a>`, etc.) — `collectBlockCellImageSources` walks the full subtree. It makes no assumptions about surrounding text content and is safe to call on cells with no images.
