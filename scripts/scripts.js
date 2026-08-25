/* eslint-disable secure-coding/no-insecure-comparison
-- this is browser-side EDS code, not Node server auth logic. Not secret material; public DOM/content metadata validation. */
import {
  buildBlock,
  createOptimizedPicture,
  decorateBlock,
  loadBlock,
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateBlocks,
  decorateTemplateAndTheme,
  getMetadata,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  readBlockConfig,
  toClassName,
  loadScript,
} from './aem.js';
import {
  createArtDirectionPicture,
  DEFAULT_BLOCK_SINGLE_PICTURE_BREAKPOINTS,
} from './utils.js';
/** Max sections/children to process (CWE-770). */
const MAX_SECTIONS = 100;
const MAX_SECTION_CHILDREN = 200;

/**
 * Site-wide outbound link policy (same rules everywhere — main, header, footer, fragments).
 *
 * | Link type                         | New tab | Exit modal |
 * |-----------------------------------|---------|------------|
 * | Same-site                         | No      | No         |
 * | /modals/*                         | No      | No (content modal) |
 * | PDF                               | Yes     | No         |
 * | Trusted partner hosts (Lundbeck…) | Yes     | No         |
 * | All other external http(s)        | Yes     | Yes        |
 */
const TRUSTED_HOSTS = [
  'lundbeck.com',
  'lundbeck-tools.com',
  'aem.page',
  'aem.live',
];

function isPdfLink(href) {
  try {
    const { pathname } = new URL(href, window.location);
    return pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

function hostMatches(hostname, hosts) {
  const host = hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * @param {string} href
 * @returns {{ newTab: boolean, exitModal: boolean }}
 */
function getLinkPolicy(href) {
  if (!href || href.includes('/modals/')) {
    return { newTab: false, exitModal: false };
  }

  try {
    const { protocol, hostname } = new URL(href, window.location);
    if (!protocol.startsWith('http')) {
      return { newTab: false, exitModal: false };
    }

    const external = hostname !== window.location.hostname;
    if (!external) {
      return { newTab: false, exitModal: false };
    }

    if (isPdfLink(href) || hostMatches(hostname, TRUSTED_HOSTS)) {
      return { newTab: true, exitModal: false };
    }

    return { newTab: true, exitModal: true };
  } catch {
    return { newTab: false, exitModal: false };
  }
}

function setNewTabAttrs(link) {
  link.target = '_blank';
  const rel = new Set((link.rel || '').split(/\s+/).filter(Boolean));
  rel.add('noopener');
  rel.add('noreferrer');
  link.rel = [...rel].join(' ');
}

/**
 * Applies site-wide link policy to all anchors under root.
 * @param {ParentNode} root
 */
export function decorateLinks(root) {
  root.querySelectorAll('a[href]').forEach((link) => {
    if (getLinkPolicy(link.href).newTab) setNewTabAttrs(link);
  });
}

function autolinkModals(doc) {
  doc.addEventListener('click', async (e) => {
    const anchor = e.target.closest('a');
    if (!anchor || !anchor.href) return;

    if (anchor.href.includes('/modals/')) {
      e.preventDefault();
      const { openModal } = await import(`${window.hlx.codeBasePath}/blocks/modal/modal.js`);
      openModal(anchor.href);
      return;
    }

    if (anchor.closest('.modal')) return;

    if (getLinkPolicy(anchor.href).exitModal) {
      e.preventDefault();
      const { openModal } = await import(`${window.hlx.codeBasePath}/blocks/modal/modal.js`);
      openModal('/modals/exit', anchor.href);
    }
  });
}

/** Keys that must not be used for object/dataset assignment (CWE-915). */
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Returns true if key is safe for plain object or dataset assignment.
 * @param {string} key Property name
 * @returns {boolean}
 */
function isSafeObjectKey(key) {
  return typeof key === 'string' && key.length > 0
    && !UNSAFE_OBJECT_KEYS.has(key)
    && !key.startsWith('__');
}

// DOMPurify loaded once for HTML sanitization (mitigates DOM XSS from contentMap/dataset)
let domPurifyReady = null;

/**
 * Ensures DOMPurify is loaded. Resolves with the script load. Safe to call multiple times.
 * @returns {Promise<void>}
 */
export async function ensureDOMPurify() {
  if (!domPurifyReady) {
    const base = window.hlx?.codeBasePath ?? '';
    domPurifyReady = loadScript(`${base}/scripts/dompurify.min.js`);
  }
  return domPurifyReady;
}

/**
 * Universal Editor use
 * Moves all the attributes from a given elmenet to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveAttributes(from, to, attributes) {
  if (!attributes) {
    // eslint-disable-next-line no-param-reassign
    attributes = [...from.attributes].map(({ nodeName }) => nodeName);
  }
  attributes.forEach((attr) => {
    const value = from.getAttribute(attr);
    if (value) {
      // DA UE doesn't like the ?. operator, but I know it works with Xwalk
    // to?.setAttribute(attr, value);
    // from?.removeAttribute(attr);
      to.setAttribute(attr, value);
      from.removeAttribute(attr);
    }
  });
}

/**
 * Universal Editor use
 * Move instrumentation attributes from a given element to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveInstrumentation(from, to) {
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-')),
  );
}

/* add a block id_number to a block instance (when any decorate(block) defines it)
  to be used for martech tracking, aria-controls, aria-labelledby, etc.
*/
const blockIds = new Map();
export function getBlockId(name) {
  const forBlock = blockIds.get(name) ?? 0;
  blockIds.set(name, forBlock + 1);
  return `${name}_${forBlock}`;
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
}

/**
 * Autoblocks injected during loadLazy (non-critical, not authored in DA).
 */
async function buildLazyAutoBlocks() {
  if (!document.querySelector('.back-to-top')) {
    const block = buildBlock('back-to-top', '');
    document.body.append(block);
    decorateBlock(block);
    await loadBlock(block);
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }

    // auto-embed Brightcove video links (same pattern as fragments: replace the
    // link that contains brightcove.net with an embed block that loads the player).
    // These often sit inside a columns cell — deeper than decorateBlocks' selector
    // reaches — so decorate + load each one explicitly here.
    // Skip blocks that already handle their own Brightcove link (video, video-testimonial):
    // their class names are present in the markup before decoration, so this sweep would
    // otherwise steal the link out from under them before their own decorate() runs.
    const videoLinks = [...main.querySelectorAll('a[href*="players.brightcove.net"]')]
      .filter((a) => !a.closest('.embed, .video, .video-testimonial'));
    videoLinks.forEach((a) => {
      const block = buildBlock('embed', { elems: [a.cloneNode(true)] });
      (a.closest('p') || a).replaceWith(block);
      decorateBlock(block);
      loadBlock(block);
    });
    
    // buildHeroBlock(main); uncomment if autoblocking the hero
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}


/**
 * Hosts considered "local" — links to these open in the same tab.
 * Everything else (plus any PDF) opens in a new tab.
 */
const LOCAL_HOSTS = new Set(['localhost']);
const LOCAL_HOST_SUFFIXES = ['.page', '.live'];

/**
 * @param {URL} url
 * @returns {boolean} true when the URL points at a first-party/local host
 */
function isLocalUrl(url) {
  const host = url.hostname.toLowerCase();
  if (host === window.location.hostname.toLowerCase()) return true;
  if (LOCAL_HOSTS.has(host)) return true;
  return LOCAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Opens external links (and any PDF) in a new tab. First-party links to local
 * hosts keep their default same-tab behavior. In-page anchors and non-http(s)
 * schemes (mailto:, tel:, etc.) are left untouched.
 * @param {Element} element The container element
 */
export function decorateExternalLinks(element) {
  element.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return;

    let url;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    const isPdf = url.pathname.toLowerCase().endsWith('.pdf');
    if (isLocalUrl(url) && !isPdf) return;

    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
}

/** Duration for the in-page anchor smooth scroll (matches xenazineusa.com). */
const ANCHOR_SCROLL_DURATION_MS = 1000;

const anchorEaseInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

/**
 * Smooth-scrolls the window to a target Y with an explicit duration (native
 * smooth scroll speed is not configurable).
 * @param {number} targetY
 * @param {number} duration
 */
function animatedScrollTo(targetY, duration = ANCHOR_SCROLL_DURATION_MS) {
  const start = window.scrollY;
  const distance = targetY - start;
  if (distance === 0) return;
  const startTime = performance.now();

  const step = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    window.scrollTo(0, start + distance * anchorEaseInOutQuad(progress));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * Resolves the in-page target for an anchor click, or null if the link is not
 * a same-page hash link (external, cross-page, or bare "#").
 * @param {HTMLAnchorElement} anchor
 * @returns {HTMLElement|null}
 */
function inPageTarget(anchor) {
  const href = anchor.getAttribute('href');
  if (!href || href === '#' || !href.includes('#')) return null;

  let url;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  // must resolve to the current page (same path) to be an in-page anchor
  if (url.pathname !== window.location.pathname || !url.hash) return null;

  const id = decodeURIComponent(url.hash.substring(1));
  if (!id) return null;
  return document.getElementById(id);
}

/**
 * Delegated smooth-scroll for in-page anchor links (e.g. nav cards that jump to
 * an on-page section). Matches the animated scroll on xenazineusa.com without
 * changing the URL hash (the source site scrolls without updating the URL).
 * Cross-page and external links are left untouched.
 * @param {Document|Element} scope
 */
export function enableSmoothAnchorScroll(scope = document) {
  scope.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = e.target.closest('a[href*="#"]');
    if (!anchor) return;

    const target = inPageTarget(anchor);
    if (!target) return;

    e.preventDefault();
    const scrollMargin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const targetY = target.getBoundingClientRect().top + window.scrollY - scrollMargin;
    animatedScrollTo(targetY);
  });
}

function a11yLinks(main) {
  const links = main.querySelectorAll('a');
  links.forEach((link) => {
    let label = link.textContent;
    if (!label && link.querySelector('span.icon')) {
      const icon = link.querySelector('span.icon');
      label = icon ? icon.classList[1]?.split('-')[1] : label;
    }
    link.setAttribute('aria-label', label);
  });
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
export function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks — skip links wrapping a real content image, but
    // allow decorated icons (e.g. :search: → span.icon > img) inside buttons.
    if (a.querySelector('img:not(.icon img)') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) { // high-impact call-to-action
      a.classList.add('accent');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

/* === SECTIONS === */

/**
 * Rejects values that could break out of a single CSS declaration when set via inline style.
 * @param {string} value Trimmed color value
 * @returns {boolean}
 */
function isSafeBackgroundColorValue(value) {
  if (!value || value.length > 500) return false; // CWE-770
  if (/[;{}<>\n\r]/.test(value)) return false;
  return true;
}

/**
 * Allows https URLs for background images, plus http for localhost during local development.
 * Works with a dynamic media URL too.
 * @param {string} url
 * @returns {boolean}
 */
function isAllowedBackgroundImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim(), window.location.href);
    return u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost');
  } catch {
    return false;
  }
}

/**
 * First string from metadata (handles single link vs array from readBlockConfig).
 * @param {unknown} value
 * @returns {string}
 */
function metaStringValue(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') return value[0];
  return '';
}

/**
 * Sets inline background-color and optionally prepends a decorative .bg-image layer.
 * Keys match section model fields and {@link readBlockConfig}: `background-color`,
 * `background-image` … `background-image-5` (art-direction renditions).
 * @param {HTMLElement} section
 * @param {Record<string, unknown>} meta
 */
function applySectionBackgroundDecorations(section, meta = {}) {
  const color = metaStringValue(meta['background-color']).trim() || metaStringValue(meta.background).trim();
  if (color && isSafeBackgroundColorValue(color)) {
    section.style.setProperty('background', color);
  }

  // background-image may be a comma-separated list when multiple images share one doc cell;
  // background-image-2…5 are individual UE reference fields.
  const bgImageStr = String(meta['background-image'] || '');
  const rawUrls = [
    ...bgImageStr.split(',').map((s) => s.trim()),
    metaStringValue(meta['background-image-2']).trim(),
    metaStringValue(meta['background-image-3']).trim(),
    metaStringValue(meta['background-image-4']).trim(),
    metaStringValue(meta['background-image-5']).trim(),
  ].slice(0, 5).filter((url) => url && isAllowedBackgroundImageUrl(url));

  if (!rawUrls.length) return;

  // localhost never has a valid TLS cert; downgrade https → http so the request succeeds
  const sources = rawUrls.map((url) => {
    const parsed = new URL(url, window.location.href);
    if (parsed.hostname === 'localhost') parsed.protocol = 'http:';
    return { src: parsed.href, alt: '' };
  });

  const bg = document.createElement('div');
  bg.className = 'bg-image';
  const picture = sources.length === 1
    ? createOptimizedPicture(sources[0].src, '', false, DEFAULT_BLOCK_SINGLE_PICTURE_BREAKPOINTS)
    : createArtDirectionPicture(sources, false);
  bg.append(picture);
  section.prepend(bg);
}

/**
 * Decorates all sections in a container element.
 * @param {Element} main The container element
 */
/* eslint-disable sonarjs/cognitive-complexity */
export function decorateSections(main) {
  const sectionEls = main.querySelectorAll(':scope > div');
  const sectionLimit = Math.min(sectionEls.length, MAX_SECTIONS);
  for (let si = 0; si < sectionLimit; si += 1) {
    const section = sectionEls.item(si);
    const wrappers = [];
    let defaultContent = false;
    // Snapshot children so moving nodes during iteration doesn't invalidate indices
    const sectionChildren = [...section.children].slice(0, MAX_SECTION_CHILDREN);
    sectionChildren.forEach((e) => {
      // from the da boilerplate
      if (e.classList.contains('richtext')) {
        e.removeAttribute('class');
        if (!defaultContent) {
          const wrapper = document.createElement('div');
          wrapper.classList.add('default-content-wrapper');
          wrappers.push(wrapper);
          defaultContent = true;
        } // end da boilerplate
      } else if (e.tagName === 'DIV' || !defaultContent) {
        const wrapper = document.createElement('div');
        wrappers.push(wrapper);
        defaultContent = e.tagName !== 'DIV';
        if (defaultContent) wrapper.classList.add('default-content-wrapper');
      }
      wrappers.at(-1)?.append(e);
    });

    // Add wrapped content back
    wrappers.forEach((wrapper) => section.append(wrapper));
    section.classList.add('section');
    section.setAttribute('data-section-status', 'initialized');
    section.style.display = 'none';

    // Process section metadata
    const sectionMeta = section.querySelector('div.section-metadata');
    if (sectionMeta) {
      const meta = readBlockConfig(sectionMeta);
      Object.entries(meta).forEach(([key, value]) => {
        if (key === 'style') {
          const styleStr = typeof value === 'string' ? value : '';
          const styles = styleStr
            .split(',')
            .filter((style) => style)
            .map((style) => toClassName(style.trim()));
          styles.forEach((style) => section.classList.add(style));
        } else if (isSafeObjectKey(key)) {
          section.setAttribute(`data-${key}`, String(value ?? ''));
        }
      });
      sectionMeta.parentNode.remove();
    }

    // Apply background decorations from data-* attributes (set via section-metadata or by the platform)
    applySectionBackgroundDecorations(section, {
      background: section.getAttribute('data-background') || '',
      'background-color': section.getAttribute('data-background-color') || '',
      'background-image': section.getAttribute('data-background-image') || '',
      'background-image-2': section.getAttribute('data-background-image-2') || '',
      'background-image-3': section.getAttribute('data-background-image-3') || '',
      'background-image-4': section.getAttribute('data-background-image-4') || '',
      'background-image-5': section.getAttribute('data-background-image-5') || '',
    });
  }
}

/**
 * Wraps each run of 2+ consecutive sections carrying the `flex` class into its own
 * `.flex-group` container, so CSS can lay them out side-by-side. Operates purely on
 * section elements and their classes — no inspection of inner block types. A run is
 * broken by any non-flex section or the end of main; each run becomes an independent
 * flex context. A lone flex section (no adjacent flex sibling) is left untouched.
 * @param {Element} main The main element
 */
export function groupFlexSections(main) {
  const sections = [...main.querySelectorAll(':scope > .section')].slice(0, MAX_SECTIONS);
  const sectionLimit = Math.min(sections.length, MAX_SECTIONS);
  let i = 0;
  while (i < sectionLimit) {
    if (!sections[i].classList.contains('flex')) {
      i += 1;
    } else {
      let j = i + 1;
      while (j < sectionLimit && sections[j].classList.contains('flex')) {
        j += 1;
      }
      const run = sections.slice(i, j);
      if (run.length > 1) {
        const group = document.createElement('div');
        group.className = 'flex-group';
        group.setAttribute('data-flex-count', String(run.length));
        main.insertBefore(group, run[0]);
        run.forEach((section) => group.append(section));
      }
      i = j;
    }
  }
}

/* === END SECTIONS === */

/** Max lists / items to process for icon bullets (CWE-770). */
const MAX_ICON_BULLET_LISTS = 50;
const MAX_ICON_BULLET_ITEMS = 100;
const MAX_COLON_ICON_TEXT_NODES = 200;

/** Safe icon name from colon notation (e.g. :search:, :mic-30-desktop:). */
const COLON_ICON_NAME = /^[a-z0-9-]+$/;

/**
 * Replaces :icon-name: text with <span class="icon icon-name"> when the pipeline
 * did not (e.g. icon SVG added in code but content not re-published).
 * @param {Element} element Container element
 */
export function decorateColonIcons(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node = walker.nextNode();
  let count = 0;

  while (node && count < MAX_COLON_ICON_TEXT_NODES) {
    if (node.textContent.includes(':')
      && !node.parentElement?.closest('script, style, .icon')) {
      textNodes.push(node);
      count += 1;
    }
    node = walker.nextNode();
  }

  textNodes.forEach((textNode) => {
    const { textContent } = textNode;
    const parts = textContent.split(/:([a-z0-9-]+):/i);
    if (parts.length < 3) return;

    const fragment = document.createDocumentFragment();
    parts.forEach((part, index) => {
      if (index % 2 === 0) {
        if (part) fragment.append(document.createTextNode(part));
      } else if (COLON_ICON_NAME.test(part)) {
        const span = document.createElement('span');
        span.className = `icon icon-${part.toLowerCase()}`;
        fragment.append(span);
      } else {
        fragment.append(document.createTextNode(`:${part}:`));
      }
    });
    textNode.replaceWith(fragment);
  });
}

/**
 * Returns the leading icon in a list item, searching recursively through
 * leading strong/em/a/h6 wrappers at any depth (e.g. em > strong > span.icon,
 * or h6 > span.icon for an H6 "legend" bullet list).
 * @param {HTMLLIElement} li List item element
 * @returns {HTMLSpanElement|null}
 */
function getLeadingListIcon(li) {
  function findIcon(container) {
    let node = container.firstChild;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.trim()) return null;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches('span.icon')) return node;
        if (node.matches('strong, em, a, h6')) return findIcon(node);
        return null;
      } else {
        return null;
      }
      node = node.nextSibling;
    }
    return null;
  }
  return findIcon(li);
}

/**
 * Turns list items that start with an icon into icon-bullet lists.
 * Run after {@link decorateIcons}. Scoped to lists that match the icon-bullet pattern.
 * @param {Element} element Container element
 */
export function iconsToBullets(element) {
  const lists = [...element.querySelectorAll(
    'ul:has(> li > .icon, > li > :is(strong, em, a) > .icon, '
    + '> li > :is(strong, em) > :is(strong, em) > .icon, > li > h6 > .icon)',
  )].slice(0, MAX_ICON_BULLET_LISTS);

  lists.forEach((ul) => {
    const items = [...ul.querySelectorAll(':scope > li')].slice(0, MAX_ICON_BULLET_ITEMS);
    let decorated = 0;

    items.forEach((li) => {
      const icon = getLeadingListIcon(li);
      if (!icon) return;

      icon.classList.add('icon-bullet');
      li.classList.add('icon-bullet-item');
      const img = icon.querySelector('img');
      if (img) {
        img.loading = 'eager';
        img.width = 24;
        img.height = 24;
      }

      // Ensure icon is a direct child of li (extracts it from strong/em/a wrappers)
      if (icon.parentElement !== li) {
        li.insertBefore(icon, li.firstChild);
      }

      // Wrap all remaining siblings in a single span so flex gap only applies once
      const after = [];
      let sibling = icon.nextSibling;
      while (sibling) {
        after.push(sibling);
        sibling = sibling.nextSibling;
      }
      if (after.length > 0) {
        const textSpan = document.createElement('span');
        textSpan.className = 'icon-bullet-text';
        after.forEach((n) => textSpan.append(n));
        li.append(textSpan);
      }

      decorated += 1;
    });

    if (decorated > 0 && decorated === items.length) {
      ul.classList.add('icon-bullets');
    }
  });
}

/**
 * Wraps icon-bullet lists whose items are H6 headings into a `.legend` — a chart
 * legend pattern (e.g. colored dot + series name) styled as a single row-on-desktop /
 * stacked-on-mobile unit with a shared underline. Runs after {@link iconsToBullets}.
 * @param {Element} element Container element
 */
export function decorateLegends(element) {
  const lists = [...element.querySelectorAll('ul.icon-bullets')]
    .filter((ul) => ul.querySelector(':scope > li h6'));
  lists.forEach((ul) => {
    ul.classList.add('legend');
  });
}

/**
 * Decorates icons and applies icon-bullet styling to qualifying lists.
 * @param {Element} element Container element
 * @param {string} [prefix] Optional prefix for icon src
 */
export function decorateIconsAndBullets(element, prefix = '') {
  decorateColonIcons(element);
  decorateIcons(element, prefix);
  iconsToBullets(element);
  decorateLegends(element);
}

/* === BRACKET TAGS v3 ===
 * Bracket syntax: [[class1,class2]text] → <span class="class1 class2">text</span>
 * Nested section syntax: [#section-id] → cloned content from section-metadata ID.
 * Only alphanumeric, hyphen, and underscore are allowed in class names.
 * Malformed patterns (empty class list, invalid chars) are left unchanged.
 * Alignment classes (center, left, right) are hoisted to the containing element
 * instead of applied to a span.
 */

function parseClasses(raw, classNamePattern = /^[a-zA-Z0-9_-]+$/) {
  const names = raw.split(',').map((c) => c.trim());
  if (names.some((c) => !c || !classNamePattern.test(c))) return [];
  return names;
}

function parseSplitClasses(raw) {
  return parseClasses(raw, /^[a-z0-9-]+$/);
}

const SPLIT_INLINE_TAGS = new Set(['STRONG', 'EM', 'A', 'BR', 'U', 'SUP', 'SUB', 'DEL']);

const ALIGNMENT_CLASSES = new Set(['center', 'center-mobile', 'center-desktop',
  'left', 'left-mobile', 'left-desktop', 'right', 'right-mobile', 'right-desktop']);

const SPAN_TAG_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, li';

const SPLIT_OPEN_RE = /\[\[([a-z0-9,-]+)\]\s*$/;

const SPAN_TAG_RE = /\[\[(?=([^\]]+))\1\](?=([^\]]*))\2\]/g;

const TOOLTIP_OPEN_RE = /\[\[tooltip\]\s*$/;

const NESTED_SECTION_RE = /\[#([^\]]+)\]/g;
const NESTED_SECTION_ONLY_RE = /^\[#([^\]]+)\]$/;

function normalizeNestedSectionId(value) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/^#/, '')
    .replace(/^id\s*=\s*/i, '')
    .trim();
}

function collectTextNodes(element, marker) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    if (!marker || node.nodeValue.includes(marker)) nodes.push(node);
    node = walker.nextNode();
  }
  return nodes;
}

function splitAlignmentClasses(classes) {
  return classes.reduce((groups, c) => {
    if (ALIGNMENT_CLASSES.has(c)) groups.alignClasses.push(c);
    else groups.regularClasses.push(c);
    return groups;
  }, { alignClasses: [], regularClasses: [] });
}

// Descends through single-child wrappers (e.g. a heading whose entire content is one
// <strong>) to find the element whose direct children actually hold the split text/inline
// nodes. Bracket content can be nested one or more levels inside such a wrapper.
function getSplitContainer(el) {
  let container = el;
  while (container.childNodes.length === 1) {
    const [only] = container.childNodes;
    if (only.nodeType !== Node.ELEMENT_NODE || !SPLIT_INLINE_TAGS.has(only.nodeName)) break;
    container = only;
  }
  return container;
}

function applySplitBoundaryPass(container, alignTarget = container) {
  const el = container;
  const children = [...el.childNodes];

  for (let i = 0; i < children.length - 2; i += 1) {
    const prev = children.at(i);
    const mid = children.at(i + 1);
    const next = children.at(i + 2);

    const isPrevText = prev.nodeType === Node.TEXT_NODE;
    const isMidInline = mid.nodeType === Node.ELEMENT_NODE && SPLIT_INLINE_TAGS.has(mid.nodeName);
    const isNextText = next.nodeType === Node.TEXT_NODE;

    if (isPrevText && isMidInline && isNextText) {
      // tooltip branch: [[tooltip]<a href="#" title="...">text</a>]
      // The <a> is replaced entirely — not wrapped — with a <span data-tooltip="...">.
      const isTooltipAnchor = mid.nodeName === 'A'
        && mid.getAttribute('href') === '#'
        && mid.getAttribute('title');
      const tooltipCloseMatch = isTooltipAnchor && TOOLTIP_OPEN_RE.test(prev.nodeValue)
        ? next.nodeValue.match(/^\s*\]/) : null;
      if (tooltipCloseMatch) {
        const span = document.createElement('span');
        span.className = 'tooltip';
        span.dataset.tooltip = mid.getAttribute('title');
        span.textContent = mid.textContent;
        el.insertBefore(span, mid);
        el.removeChild(mid);
        prev.nodeValue = prev.nodeValue.replace(TOOLTIP_OPEN_RE, '');
        next.nodeValue = next.nodeValue.slice(tooltipCloseMatch[0].length);
      } else {
        // Pattern A: "prefix[[classes]" <inline>content</inline> "]suffix"
        const openMatch = prev.nodeValue.match(SPLIT_OPEN_RE);
        const classes = openMatch ? parseSplitClasses(openMatch[1]) : [];
        const closeMatch = openMatch && classes.length ? next.nodeValue.match(/^\s*\]/) : null;
        if (closeMatch) {
          const { alignClasses, regularClasses } = splitAlignmentClasses(classes);
          if (alignClasses.length) alignTarget.classList.add(...alignClasses);
          prev.nodeValue = prev.nodeValue.slice(0, -openMatch[0].length);
          next.nodeValue = next.nodeValue.slice(closeMatch[0].length);
          if (regularClasses.length) {
            const span = document.createElement('span');
            span.className = regularClasses.join(' ');
            span.appendChild(mid);
            el.insertBefore(span, next);
          }
        }
      }
    } else if (!isPrevText && mid.nodeType === Node.TEXT_NODE && !isNextText && next.children.length === 0) {
      // Pattern B: <inline>prefix[[</inline> "classes" <inline>]content]</inline>
      const isPrevInline = prev.nodeType === Node.ELEMENT_NODE && SPLIT_INLINE_TAGS.has(prev.nodeName);
      const isNextInline = next.nodeType === Node.ELEMENT_NODE && SPLIT_INLINE_TAGS.has(next.nodeName);
      const openerText = prev.textContent;
      const closerText = next.textContent;
      const classes = parseSplitClasses(mid.nodeValue);
      if (isPrevInline && isNextInline && openerText.endsWith('[[') && classes.length
        && closerText.startsWith(']') && closerText.endsWith(']')) {
        const { alignClasses, regularClasses } = splitAlignmentClasses(classes);
        if (alignClasses.length) alignTarget.classList.add(...alignClasses);
        next.textContent = closerText.slice(1, -1);
        if (regularClasses.length) {
          const insertRef = next.nextSibling;
          const span = document.createElement('span');
          span.className = regularClasses.join(' ');
          span.appendChild(next);
          el.insertBefore(span, insertRef);
        }
        if (openerText === '[[') el.removeChild(prev);
        else prev.textContent = openerText.slice(0, -2);
        el.removeChild(mid);
      }
    }
  }
}

export function applySpanTags(text) {
  SPAN_TAG_RE.lastIndex = 0;
  return text.replace(SPAN_TAG_RE, (match, raw, content) => {
    const classes = parseClasses(raw);
    if (!classes.length) return match;
    // eslint-disable-next-line secure-coding/no-improper-sanitization
    const safe = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    return `<span class="${classes.join(' ')}">${safe}</span>`;
  });
}

function replaceTextNode(textNode, containingEl) {
  const text = textNode.nodeValue;
  const frag = document.createDocumentFragment();
  let lastIndex = 0;
  let match;

  SPAN_TAG_RE.lastIndex = 0;

  // eslint-disable-next-line no-cond-assign
  while ((match = SPAN_TAG_RE.exec(text)) !== null) {
    const [full, raw, content] = match;
    const classes = parseClasses(raw);

    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (!classes.length) {
      frag.appendChild(document.createTextNode(full));
    } else {
      const { alignClasses, regularClasses } = splitAlignmentClasses(classes);
      if (alignClasses.length && containingEl) containingEl.classList.add(...alignClasses);
      if (regularClasses.length) {
        const span = document.createElement('span');
        span.className = regularClasses.join(' ');
        span.textContent = content;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(content));
      }
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex === 0) return;

  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  textNode.parentNode.replaceChild(frag, textNode);
}

function cleanAttributes(element) {
  element.querySelectorAll('a').forEach((a) => {
    if (a.hasAttribute('title')) {
      const cleaned = a.getAttribute('title').replace(SPAN_TAG_RE, '$2');
      if (cleaned !== a.getAttribute('title')) a.setAttribute('title', cleaned);
    }
    if (a.hasAttribute('aria-label')) {
      const cleaned = a.getAttribute('aria-label')
        .replace(SPAN_TAG_RE, (_, raw, content) => content)
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned !== a.getAttribute('aria-label')) a.setAttribute('aria-label', cleaned);
    }
  });

  element.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((heading) => {
    if (!heading.id) return;
    const slug = heading.textContent
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    if (slug !== heading.id) heading.id = slug;
  });
}

function hoistAlignmentAcrossInlines(el) {
  // Handles [[alignment-class]content] where content spans inline elements,
  // causing the opening [[class] and closing ] to land in different text nodes.
  const textNodes = collectTextNodes(el);

  for (let i = 0; i < textNodes.length - 1; i += 1) {
    const node = textNodes[i];
    const text = node.nodeValue;
    const openIdx = text.lastIndexOf('[[');
    if (openIdx === -1) continue; // eslint-disable-line no-continue

    const tail = text.slice(openIdx);
    // If the bracket expression is fully contained in this node, replaceTextNode handles it
    if (/^\[\[[^\]]+\][^\]]*\]/.test(tail)) continue; // eslint-disable-line no-continue

    const classMatch = tail.match(/^\[\[([a-zA-Z0-9_,-]+)\]/);
    if (!classMatch) continue; // eslint-disable-line no-continue

    const classes = parseClasses(classMatch[1]);
    const { alignClasses } = splitAlignmentClasses(classes);
    // Only handle pure-alignment spanning patterns; mixed (alignment + span classes) needs Range API
    if (!alignClasses.length || classes.length !== alignClasses.length) continue; // eslint-disable-line no-continue

    for (let j = i + 1; j < textNodes.length; j += 1) {
      const closeNode = textNodes[j];
      const closeText = closeNode.nodeValue;
      const closeIdx = closeText.indexOf(']');
      if (closeIdx === -1) continue; // eslint-disable-line no-continue

      el.classList.add(...alignClasses);
      node.nodeValue = text.slice(0, openIdx) + tail.slice(classMatch[0].length);
      closeNode.nodeValue = closeText.slice(0, closeIdx) + closeText.slice(closeIdx + 1);
      break;
    }
  }
}

const MULTI_NODE_OPEN_RE = /\[\[([a-z0-9,-]+)\]/;

// Finds a "[[classes]" opener whose closing "]" is not in the same text node, and locates
// that closing "]" across any run of plain text and SPLIT_INLINE_TAGS elements that follows
// (e.g. content broken up by one or more <br>). Used to catch spans that the fixed 3-node
// window in applySplitBoundaryPass can't reach.
function findMultiNodeSpanBoundary(el) {
  const children = [...el.childNodes];
  for (let i = 0; i < children.length; i += 1) {
    const openNode = children.at(i);
    if (openNode.nodeType !== Node.TEXT_NODE) continue; // eslint-disable-line no-continue

    const openMatch = openNode.nodeValue.match(MULTI_NODE_OPEN_RE);
    if (!openMatch) continue; // eslint-disable-line no-continue

    const afterOpen = openMatch.index + openMatch[0].length;
    if (openNode.nodeValue.slice(afterOpen).includes(']')) continue; // eslint-disable-line no-continue

    const classes = parseSplitClasses(openMatch[1]);
    if (!classes.length) continue; // eslint-disable-line no-continue

    for (let j = i + 1; j < children.length; j += 1) {
      const node = children.at(j);
      if (node.nodeType === Node.TEXT_NODE) {
        const closeIdx = node.nodeValue.indexOf(']');
        if (closeIdx !== -1) {
          return {
            openNode, afterOpen, openIndex: openMatch.index, classes, closeNode: node, closeIdx,
          };
        }
      } else if (!SPLIT_INLINE_TAGS.has(node.nodeName)) {
        break;
      }
    }
  }
  return null;
}

function applyMultiNodeSpanTag(container, alignTarget = container) {
  const boundary = findMultiNodeSpanBoundary(container);
  if (!boundary) return false;
  const {
    openNode, afterOpen, openIndex, classes, closeNode, closeIdx,
  } = boundary;

  const range = document.createRange();
  range.setStart(openNode, afterOpen);
  range.setEnd(closeNode, closeIdx);

  const { alignClasses, regularClasses } = splitAlignmentClasses(classes);
  const fragment = range.extractContents();
  if (regularClasses.length) {
    const span = document.createElement('span');
    span.className = regularClasses.join(' ');
    span.appendChild(fragment);
    range.insertNode(span);
  } else {
    range.insertNode(fragment);
  }
  if (alignClasses.length) alignTarget.classList.add(...alignClasses);

  openNode.nodeValue = openNode.nodeValue.slice(0, openIndex);
  closeNode.nodeValue = closeNode.nodeValue.slice(1);
  return true;
}

export function decorateSpanTags(element) {
  element.querySelectorAll(SPAN_TAG_SELECTOR).forEach((el) => {
    if (!el.textContent.includes('[[')) return;

    hoistAlignmentAcrossInlines(el);

    const nodes = collectTextNodes(el, '[[');
    nodes.forEach((n) => replaceTextNode(n, el));

    const container = getSplitContainer(el);
    applySplitBoundaryPass(container, el);

    while (el.textContent.includes('[[')) {
      if (!applyMultiNodeSpanTag(container, el)) break;
    }
  });

  cleanAttributes(element);
}

function collectNestedSectionIds(nodes) {
  const sectionIds = new Set();
  nodes.forEach((node) => {
    let match;
    NESTED_SECTION_RE.lastIndex = 0;
    // eslint-disable-next-line no-cond-assign
    while ((match = NESTED_SECTION_RE.exec(node.nodeValue)) !== null) {
      const sectionId = normalizeNestedSectionId(match[1]);
      if (sectionId) sectionIds.add(sectionId);
    }
  });
  return sectionIds;
}

function getNestedSectionIds(section) {
  const ids = [
    normalizeNestedSectionId(section.dataset.id),
    normalizeNestedSectionId(section.id),
  ].filter(Boolean);

  section.classList.forEach((className) => {
    if (className.startsWith('id-')) {
      const sectionId = normalizeNestedSectionId(className.slice(3));
      if (sectionId) ids.push(sectionId);
    }
  });

  return [...new Set(ids)];
}

function buildNestedSectionMap(main, sectionIds) {
  const sectionMap = new Map();

  main.querySelectorAll('.section').forEach((section) => {
    getNestedSectionIds(section).forEach((sectionId) => {
      if (!sectionIds.has(sectionId) || sectionMap.has(sectionId)) return;

      const content = document.createElement('div');
      [...section.children].forEach((child) => {
        content.appendChild(child.cloneNode(true));
      });
      sectionMap.set(sectionId, { content, element: section });
    });
  });

  return sectionMap;
}

function appendNestedSectionContent(fragment, sectionData) {
  const content = sectionData.content.cloneNode(true);
  const elements = [...content.children];

  elements.forEach((el) => {
    const blocks = el.classList.contains('block') ? [el] : [];
    blocks.push(...el.querySelectorAll('.block'));
    blocks.forEach((block) => block.classList.add('nested-block'));
    fragment.appendChild(el);
  });
}

/**
 * Climbs from an inline wrapper (e.g. <code>) up to the enclosing block
 * element (e.g. <p>) as long as each ancestor's entire content is the
 * placeholder text, so the whole block can be swapped out instead of
 * leaving block-level content (like divs) nested inside it.
 * @param {Element} el The innermost element wrapping the placeholder text
 * @param {string} text The placeholder text
 * @returns {Element} The element to replace
 */
function getNestedSectionOnlyContainer(el, text) {
  let target = el;
  while (target.parentElement
    && target.tagName !== 'P'
    && target.tagName !== 'LI'
    && target.parentElement.textContent.trim() === text.trim()) {
    target = target.parentElement;
  }
  return target;
}

function replaceNestedSectionNode(textNode, sectionMap, usedSectionIds) {
  const text = textNode.nodeValue;
  const parent = textNode.parentElement;
  const onlyMatch = text.trim().match(NESTED_SECTION_ONLY_RE);

  if (parent && onlyMatch && parent.textContent.trim() === text.trim()) {
    const sectionId = normalizeNestedSectionId(onlyMatch[1]);
    const sectionData = sectionMap.get(sectionId);
    if (!sectionData) return;

    const target = getNestedSectionOnlyContainer(parent, text);
    const fragment = document.createDocumentFragment();
    appendNestedSectionContent(fragment, sectionData);
    target.before(fragment);
    target.remove();
    usedSectionIds.add(sectionId);
    return;
  }

  const fragment = document.createDocumentFragment();
  let changed = false;
  let lastIndex = 0;
  let match;

  NESTED_SECTION_RE.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((match = NESTED_SECTION_RE.exec(text)) !== null) {
    const [fullMatch, rawSectionId] = match;
    const sectionId = normalizeNestedSectionId(rawSectionId);
    const sectionData = sectionMap.get(sectionId);

    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (sectionData) {
      appendNestedSectionContent(fragment, sectionData);
      usedSectionIds.add(sectionId);
      changed = true;
    } else {
      fragment.appendChild(document.createTextNode(fullMatch));
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (!changed) return;

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  textNode.replaceWith(fragment);
}

/**
 * Decorates nested sections by replacing [#section-id] placeholders
 * with the content of sections that have matching IDs in their section-metadata.
 * Only sections that are actually used as placeholders are removed from the page.
 * Runs after decorateSections and decorateBlocks so content is already decorated.
 * @param {Element} main The container element
 */
function decorateNestedSections(main) {
  const nodesToProcess = collectTextNodes(main, '[#');
  if (!nodesToProcess.length) return;

  const sectionIds = collectNestedSectionIds(nodesToProcess);
  if (!sectionIds.size) return;

  const sectionMap = buildNestedSectionMap(main, sectionIds);
  if (!sectionMap.size) return;

  const usedSectionIds = new Set();
  nodesToProcess.forEach((node) => {
    if (node.isConnected) {
      replaceNestedSectionNode(node, sectionMap, usedSectionIds);
    }
  });

  usedSectionIds.forEach((sectionId) => {
    sectionMap.get(sectionId)?.element.remove();
  });
}

/* === END BRACKET TAGS === */

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateIconsAndBullets(main);
  buildAutoBlocks(main);
  decorateSections(main);
  groupFlexSections(main);
  decorateBlocks(main);
  decorateNestedSections(main);
  decorateButtons(main);
  a11yLinks(main);
  decorateExternalLinks(main);
  decorateSpanTags(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  // loadThemeSpreadSheetConfig(); uncomment if using theme spreadsheets
  if (getMetadata('breadcrumbs').toLowerCase() === 'true') {
    doc.body.dataset.breadcrumbs = true;
  }
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
  if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
    loadFonts();
  }
}

/** 
 * True for a nested block's wrapper div (`decorateBlocks` in aem.js adds a
 * `{blockName}-wrapper` class to every block's parent) — e.g. the accordion
 * embedded via a `[#tab1]`-style bracket tag inside a tabs-dropdown panel.
 * These must stay out of the trial-data grid entirely: squeezed into its 40%
 * column they'd render far too narrow, and their own deeply-nested pictures
 * could otherwise be mismatched as the "closest" picture to a blockquote.
 * @param {Element} el
 */
function isNestedBlockWrapper(el) {
  return [...el.classList].some((c) => c.endsWith('-wrapper'));
}

/**
 * Moves `startEl` and every later sibling out of their current parent and
 * into a new wrapper div inserted in `startEl`'s place — earlier siblings
 * are left untouched. Returns the wrapper.
 * @param {Element} startEl
 */
function wrapFromChild(startEl) {
  const wrapper = document.createElement('div');
  startEl.before(wrapper);
  while (wrapper.nextSibling) wrapper.append(wrapper.nextSibling);
  return wrapper;
}

/**
 *  * .SECTION.TRIAL-DATA SPECIFIC
 * Within a trial-data stat section, finds a direct-child blockquote and
 * its closest picture-bearing sibling *at or after* it, then wraps the
 * blockquote-onward range in its own grid so CSS can place the pair beside
 * the rest of that range — content before the blockquote is left alone,
 * rendering at the normal full width above the grid. With no blockquote,
 * `allowSolo` lets the closest-to-start picture stand in alone instead,
 * with the *whole* container as the grid (used for the content after a
 * `<hr>` inside a tabs-dropdown panel, which never has its own quote).
 * Any nested block (see `isNestedBlockWrapper`) is excluded from matching
 * and, once a pairing is found, moved out to render full-width after the grid.
 * @param {Element} container
 * @param {{ allowSolo?: boolean }} [options]
 */
function decorateStatPairing(container, { allowSolo = false } = {}) {
  const blockquote = container.querySelector(':scope > blockquote');
  if (!blockquote && !allowSolo) return;

  const children = [...container.children];
  const anchorIndex = blockquote ? children.indexOf(blockquote) : -1;

  let picture;
  let closestDistance = Infinity;
  children.forEach((child, index) => {
    if (child === blockquote || isNestedBlockWrapper(child)) return;
    const distance = anchorIndex === -1 ? index : index - anchorIndex;
    if (distance < 0) return; // before the blockquote — out of range, not a candidate
    const hasPicture = child.tagName === 'PICTURE' || child.querySelector('picture');
    if (!hasPicture) return;
    if (distance < closestDistance) {
      closestDistance = distance;
      picture = child;
    }
  });
  if (!picture) return;

  const gridRoot = blockquote ? wrapFromChild(blockquote) : container;
  const gridChildren = [...gridRoot.children];

  gridRoot.classList.add(blockquote ? 'trial-data-stat-pair' : 'trial-data-stat-solo');
  picture.classList.add('trial-data-stat-pair-picture');
  if (blockquote) blockquote.classList.add('trial-data-stat-pair-quote');

  let insertAfter = gridRoot;
  gridChildren.filter(isNestedBlockWrapper).forEach((wrapper) => {
    insertAfter.after(wrapper);
    insertAfter = wrapper;
  });
}

/**
 *  * .SECTION.TRIAL-DATA SPECIFIC
 * A trial-data stat container (an `.accordion-item-body` or a
 * `.tabs-dropdown-panel > div`) with no direct-child `<hr>` is paired as a
 * whole. Otherwise, an author-inserted `<hr>` splits its content into
 * independent segments (each wrapped in its own `.trial-data-stat-segment`
 * div, order-preserving) — a segment may have no blockquote, so its nearest
 * picture is allowed to stand in alone (see `decorateStatPairing`).
 * @param {Element} container
 */
function decorateStatContainer(container) {
  if (!container.querySelector(':scope > hr')) {
    decorateStatPairing(container);
    return;
  }

  let segmentChildren = [];
  const flushSegment = () => {
    if (!segmentChildren.length) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'trial-data-stat-segment';
    segmentChildren[0].before(wrapper);
    segmentChildren.forEach((child) => wrapper.append(child));
    decorateStatPairing(wrapper, { allowSolo: true });
    segmentChildren = [];
  };
  [...container.children].forEach((child) => {
    if (child.tagName === 'HR') {
      flushSegment();
    } else {
      segmentChildren.push(child);
    }
  });
  flushSegment();
}

/**
 *  * .SECTION.TRIAL-DATA SPECIFIC
 * Trial-data section only: pairs each blockquote with its nearest chart so
 * CSS can lay them beside the rest of the content at wide viewports, in both
 * accordion bodies and tabs-dropdown panels (see `decorateStatContainer`).
 * @param {Element} main The main element
 */
function decorateTrialDataStatPairs(main) {
  const section = main.querySelector('.section.trial-data');
  if (!section) return;

  section.querySelectorAll('.accordion-item-body').forEach(decorateStatContainer);
  section.querySelectorAll('.tabs-dropdown-panel > div').forEach(decorateStatContainer);
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  autolinkModals(doc);

  const main = doc.querySelector('main');
  await loadSections(main);
  decorateTrialDataStatPairs(main);

  enableSmoothAnchorScroll(doc);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  const loadQuickEdit = async (...args) => {
    // eslint-disable-next-line import/no-cycle
    const { default: initQuickEdit } = await import('../tools/quick-edit/quick-edit.js');
    initQuickEdit(...args);
  };

  const addSidekickListeners = (sk) => {
    sk.addEventListener('custom:quick-edit', loadQuickEdit);
  };

  const sk = document.querySelector('aem-sidekick');
  if (sk) {
    addSidekickListeners(sk);
  } else {
    // wait for sidekick to be loaded
    document.addEventListener('sidekick-ready', () => {
    // sidekick now loaded
      addSidekickListeners(document.querySelector('aem-sidekick'));
    }, { once: true });
  }

  (() => {
    const hasQE = new URL(window.location.href).searchParams.has('quick-edit');
    if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());
  })();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));
  await buildLazyAutoBlocks();

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

  const entranceModal = getMetadata('entrance-modal');
  if (entranceModal) {
    import(`${window.hlx.codeBasePath}/blocks/modal/modal.js`)
      .then(({ openModal }) => openModal(entranceModal));
  }
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  const importDelayed = () => import('./delayed.js');

  if ('requestIdleCallback' in window) {
    // prevents INP/TBT issues by only loading when CPU has capacity
    window.requestIdleCallback(importDelayed, { timeout: 3000 });
  } else {
    window.setTimeout(importDelayed, 3000); // fallback 3-second timeout
  }
}

/* DA specific sidekick */
async function loadSidekick() {
  if (document.querySelector('aem-sidekick')) {
    import('../tools/sidekick/sidekick.js');
    return;
  }

  document.addEventListener('sidekick-ready', () => {
    import('../tools/sidekick/sidekick.js');
  });
}

export async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
  loadSidekick();
}

// DA UE Editor support before page load
if (window.location.hostname.includes('ue.da.live')) {
  await import(`${window.hlx.codeBasePath}/ue/scripts/ue.js`).then(({ default: ue }) => ue());
}
loadPage();

/* new DA NX stuff */
const { searchParams, origin } = new URL(window.location.href);
const branch = searchParams.get('nx') || 'main';

/* eslint-disable browser-security/detect-mixed-content -- CWE-311: OWASP:A04-Cryptographic */
export const NX_ORIGIN = branch === 'local' || origin.includes('localhost') ? 'http://localhost:6456/nx' : 'https://da.live/nx';

(async function loadDa() {
  /* eslint-disable import/no-unresolved */
  if (searchParams.get('dapreview')) {
    import('https://da.live/scripts/dapreview.js')
      .then(({ default: daPreview }) => daPreview(loadPage));
  }
  if (searchParams.get('daexperiment')) {
    import(`${NX_ORIGIN}/public/plugins/exp/exp.js`);
  }
}());
