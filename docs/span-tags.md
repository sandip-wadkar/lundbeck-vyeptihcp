# Span Tags

Lets authors apply CSS classes to inline text using a `[[classes]content]` bracket syntax directly in document content. The transformation runs automatically during page load — no block configuration required.

---

## 1. Authoring

### 1.1 Basic syntax

Write `[[classname]text]` anywhere inside a heading, paragraph, or list item:

```
Normal text [[color-secondary]highlighted text] and back to normal.
```

Renders as:

```html
<p>Normal text <span class="color-secondary">highlighted text</span> and back to normal.</p>
```

Multiple classes are comma-separated, with no spaces:

```
[[hide-mobile,color-secondary]this text is hidden on mobile and styled]
```

### 1.2 With bold content

Place the brackets in the surrounding plain text; apply bold formatting only to the content inside:

```
For assistance, call [[color-secondary]**1-833-4-VYEPTI**]
```

The brackets themselves are not bold. Only the content (`**1-833-4-VYEPTI**`) is bold.

### 1.3 With italic content

Apply italic to the content inside the brackets only:

```
Read [[color-secondary]*the full prescribing information*] before use.
```

When the entire expression including the brackets is italicised in the document editor, the result is the same — both rendering patterns are handled automatically.

> **Warning:** this only applies when the bracket expression stays within a single line. If the content spans a line break (`<br>`), keep the literal `[[` and `]` characters in **plain, unformatted text** — do not let bold or italic formatting cover the bracket characters themselves. See [1.7a Multi-line content](#17a-multi-line-content).

### 1.4 With a link

```
Call [[color-secondary][1-833-4-VYEPTI](tel:+18334893784)] for support.
```

### 1.5 Inside a list item

The syntax works identically inside list items:

```
- Standard item
- [[color-secondary]highlighted item]
- Standard item
```

### 1.6 Whitespace tolerance

A single space between the class bracket and the content, or before the closing bracket, is accepted:

```
[[color-secondary] text]     ← space after the class bracket
[[color-secondary]text ]     ← space before the closing bracket
```

### 1.7 What works and what does not

| Pattern | Result |
|---------|--------|
| `[[color-secondary]text]` | ✅ single class |
| `[[hide-mobile,color-secondary]text]` | ✅ multiple classes |
| `[[color-secondary]**bold**]` | ✅ bold content |
| `*[[color-secondary]italic]*` | ✅ italic content |
| `[[color-secondary][link](https://example.com)]` | ✅ linked content |
| `[[Color-Secondary]text]` | ❌ uppercase — not matched in bold/italic/link patterns |
| `[[my_class]text]` | ❌ underscore — not matched in bold/italic/link patterns |
| `[color-secondary]text]` | ❌ single opening bracket — not matched |
| `[[color secondary]text]` | ❌ space in class name — not matched |
| `**[[color-secondary]text**<br>more]` | ❌ bracket inside bold, spanning a line break — not matched, see [1.7a](#17a-multi-line-content) |
| `[[color-secondary]:phone: call now]` | ❌ colon icon notation inside the brackets — not matched, see [1.7b](#17b-interaction-with-colon-icon-notation) |

> **Class name rule for bold, italic, and link content:** use lowercase letters, digits, and hyphens only (`a–z`, `0–9`, `-`). When the content is plain text with no formatting, uppercase letters and underscores are also accepted.

### 1.7a Multi-line content

The bracket expression can span a line break, wrapping everything in between — including the `<br>` itself — in the class span:

```
[[color-secondary]Helix is the fastest way to publish,
create,
and serve websites]
```

Renders as one continuous span across all three lines:

```html
<p><span class="color-secondary">Helix is the fastest way to publish,<br>create,<br>and serve websites</span></p>
```

**The opening `[[classes]` and the closing `]` must stay in plain, unformatted text — never inside a bold, italic, or link run — when the expression spans a line break.** If the brackets fall inside `**bold**`, `*italic*`, or a link on a multi-line expression, the pattern is ignored and the literal brackets are left in the rendered text. This is a stricter rule than the single-line case in [1.2](#12-with-bold-content) and [1.3](#13-with-italic-content), where formatting can safely cover the bracket characters.

```
✅ [[color-secondary]plain text before,
still plain,
and after]

❌ **[[color-secondary]bold text before**,
still plain,
and after]
```

### 1.7b Interaction with colon-icon notation

`:icon-name:` notation (e.g. `:search:`, `:phone:`) is converted to an icon `<span>` earlier in the page-decoration pipeline, before bracket span tags are processed. Do not place colon-icon notation inside a bracket expression's content — by the time the bracket syntax is evaluated, the colon notation is already gone, replaced with an icon element that the bracket syntax does not know how to wrap:

```
❌ [[color-secondary]:phone: call now]
```

Keep colon-icon notation outside the brackets instead:

```
✅ :phone: [[color-secondary]call now]
```

---

## 2. Developer

### 2.1 Where the code lives

The system is implemented in the `/* === SPAN TAGS === */` section of `scripts/scripts.js`. Two functions are exported:

| Export | Purpose |
|--------|---------|
| `decorateSpanTags(element)` | Main entry point — runs all passes on the given element |
| `applySpanTags(text)` | String utility — converts bracket patterns in plain text to an HTML string |

### 2.2 How it is invoked

`decorateSpanTags` is called from `decorateMain()` so it runs during the eager phase, before the LCP paint:

```javascript
// scripts/scripts.js
export function decorateMain(main) {
  decorateIconsAndBullets(main); // converts :icon-name: to <span class="icon ..."> first
  // ...
  decorateSpanTags(main);
}
```

It processes all `h1`–`h6`, `p`, and `li` elements within the given element.

**Ordering matters:** `decorateIconsAndBullets` (which calls `decorateColonIcons`) runs before `decorateSpanTags`. Any `:icon-name:` notation is already replaced with an icon `<span>` by the time any span-tag pass runs. That icon `<span>` is not in `SPLIT_INLINE_TAGS`, so none of the three passes below treat it as pass-through content — a bracket expression whose content includes colon-icon notation will fail to match in all three passes and be left as literal text (see [1.7b](#17b-interaction-with-colon-icon-notation)).

### 2.3 Pass 1 — single text node

Handles `[[classes]text]` patterns contained entirely within one text node — the common case when the content has no inline formatting.

A `TreeWalker` finds text nodes that contain `[[`. Each matching node is replaced in place with a `DocumentFragment` containing the transformed `<span>` elements and any surrounding plain text. Malformed or invalid patterns are left unchanged.

**Class name validation:** `[a-zA-Z0-9_-]+`

### 2.4 Pass 2 — split-boundary

When an author applies bold, italic, or link formatting to the content inside the brackets, EDS renders that content as a `<strong>`, `<em>`, or `<a>` element — splitting the bracket expression across adjacent sibling nodes. Two structural variants are handled in a single pass:

**Pattern A** — only the content is formatted; brackets remain in surrounding text nodes:

```
"prefix[[classes]"  →  <strong>content</strong>  →  "]suffix"
         ↑ text node                                   ↑ text node
```

Example source: `[[color-secondary]**1-833-4-VYEPTI**]`

**Pattern B** — the entire expression including brackets is formatted (e.g. the author italicised everything):

```
<em>[[</em>  →  "classes"  →  <em>]content]</em>
               ↑ text node
```

Example source: `*[[color-secondary]italic text]*`

Both patterns produce: `<span class="classes"><inline>content</inline></span>`

Eligible inline elements: `<strong>`, `<em>`, `<a>`, `<br>`.

**Class name validation (both patterns):** `[a-z0-9-]+` (lowercase letters, digits, hyphens — stricter than Pass 1 because the class names are read from DOM text nodes that may be affected by browser normalisation).

### 2.5 Pass 3 — multi-node span

Pass 2 only matches a fixed 3-node window (`text, one inline element, text`) where the opening bracket sits at the very end of the preceding text node. It can't handle content that spans **more than one** inline element (e.g. two `<br>` line breaks) or where the opening bracket isn't immediately adjacent to the first inline element. Pass 3 generalises this using the `Range` API:

1. Scan the block's direct child nodes for a text node containing a `[[classes]` opener whose closing `]` is *not* in the same node.
2. Walk forward through the following siblings, allowing any mix of plain text and `SPLIT_INLINE_TAGS` elements (`<strong>`, `<em>`, `<a>`, `<br>`) to pass through, until a `]` is found in a later text node.
3. Build a `Range` from just after the opener to just before that `]`, `extractContents()` it, wrap the extracted fragment in a `<span>` (or hoist alignment classes onto the block element), and reinsert it at the same position.

This is what allows a bracket expression to wrap content broken up by `<br>`:

```
[[color-secondary]line one<br>line two<br>line three]
```

**Limitation:** this pass only inspects text nodes that are *direct children* of the block element (`<p>`, `<li>`, etc.) — it does not look inside `<strong>`, `<em>`, or `<a>` elements for bracket markers, it only treats them as opaque pass-through content. If the literal `[[` or `]` characters end up inside one of those elements (i.e. bold/italic formatting covers the brackets themselves) in a multi-node expression, Pass 3 will not find them and the brackets are left as literal text. This is why authors must keep the bracket characters in plain text for multi-line expressions (see [1.7a](#17a-multi-line-content)).

**Class name validation:** `[a-z0-9-]+`, same as Pass 2.

### 2.6 Attribute cleanup

After all three passes, a cleanup step strips residual bracket syntax from attributes that EDS generates automatically before the JS transformation runs:

- **`aria-label` and `title` on `<a>` elements** — bracket syntax is replaced with the plain text content; any resulting double spaces are collapsed.
- **Heading `id` attributes** — re-derived from the heading's clean `textContent` using EDS slugification (lowercase, spaces become hyphens, non-alphanumeric characters removed).

### 2.7 `applySpanTags(text)` — string utility

For use when building HTML strings in block decorators rather than transforming existing DOM nodes:

```javascript
import { applySpanTags } from '../../scripts/scripts.js';

const html = applySpanTags('Call [[color-secondary]1-833-4-VYEPTI] for support.');
// → 'Call <span class="color-secondary">1-833-4-VYEPTI</span> for support.'
```

Content is HTML-escaped before insertion. Uses the same `[a-zA-Z0-9_-]+` validation as Pass 1.

### 2.8 Adding new utility classes

Add selectors to `styles/styles.css`. No JS changes are required — any valid class name an author writes in the brackets is applied automatically.

```css
/* styles/styles.css */
.color-secondary {
  color: var(--brand-secondary);
  --link-color: var(--brand-secondary);
}
```
