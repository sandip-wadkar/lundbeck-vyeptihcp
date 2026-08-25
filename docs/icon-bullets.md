# Icon Bullets

Lets authors put an icon in front of a link (or a list of links) using the `:icon-name:`
colon syntax directly in document content. The transformation runs automatically during
page load — no block configuration required. Used on the [VYEPTI Resources page](https://main--lundbeck-vyeptihcp--aemdemos.aem.live/vyepti-resources).

---

## 1. Authoring

### 1.1 Basic syntax

Type `:icon-name:` followed by a space, then the link, at the **start** of a list item:

```
- :download: VYEPTI Access Guide
- :download: Prior Authorization Checklist
```

(Each title is a normal document link.) Renders as a clean list with the icon on the
left of each row and the linked text beside it — no bullet dots:

```html
<ul class="icon-bullets">
  <li class="icon-bullet-item">
    <span class="icon icon-download"><img src="/icons/download.svg"></span>
    <span class="icon-bullet-text"><a href="…">VYEPTI Access Guide</a></span>
  </li>
  …
</ul>
```

### 1.2 The one rule

The icon-bullet layout only activates when **every** item in the list starts with an
icon. If one item is missing its token, the whole list falls back to plain dotted
bullets. Keep icon lists and plain lists separate.

### 1.3 Standalone (not a list)

A single link can also lead with an icon — author it as one paragraph:

```
:play: Office practice manager webinar
```

The icon is centered beside the link text with the same spacing as the bullets.

### 1.4 Available icons

The token maps to an SVG of the same name in [`/icons`](../icons). Icons available today:

| Token                  | Icon                                    | Typical use                     |
| ---------------------- | --------------------------------------- | ------------------------------- |
| `:download:` / `:pdf:` | download arrow in a circle              | links to PDFs / downloadable docs |
| `:connect:`            | paper-airplane "send" in a circle       | VYEPTI CONNECT program links    |
| `:play:`               | play button in a circle                 | video / webinar links           |

To add a new icon, drop a `{name}.svg` into `/icons`, then authors can use `:{name}:`.
Only lowercase letters, numbers, and hyphens are valid in a token.

### 1.5 Two-column layout

To split a set of links into two side-by-side columns (as on the Resources page), wrap
the lists in a **Columns** block with the `resource-list` variant — one icon-bullet list
per column cell:

| Columns (resource-list)         |                              |
| ------------------------------- | ---------------------------- |
| `- :download: Link A`<br>`- :download: Link B` | `- :download: Link C` |

---

## 2. How it works (developer notes)

Three steps run in `scripts/scripts.js` via `decorateIconsAndBullets(main)`:

1. **`decorateColonIcons`** — replaces `:name:` text with `<span class="icon icon-name">`.
2. **`decorateIcons`** (from `scripts/aem.js`) — loads `/icons/{name}.svg` into each span.
   Note this is **SVG-only**: the loader always requests `.svg`, so raster-only assets
   (e.g. a PNG) must be recreated as an SVG before they can be used as a token.
3. **`iconsToBullets`** — for lists where every item leads with an icon, adds
   `.icon-bullets` / `.icon-bullet-item`, extracts the icon to the row start, and wraps
   the rest in `.icon-bullet-text`.

Styling lives in `styles/styles.css` (search `icon bullet lists`). The resource icons
(`download` / `pdf` / `connect` / `play`) render at 32px with a 9px icon-to-text gap to
match the source glyph size — scoped by icon name so the shared `--icon-size` (24px) used
by other icons (search, social) is unaffected.
