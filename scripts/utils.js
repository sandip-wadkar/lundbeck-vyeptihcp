import { createOptimizedPicture, loadScript } from './aem.js';

/**
 * Reads single-bracket syntax from the first child of each block cell div.
 * If a cell's first child is <p><code>[classname]</code></p> or
 * <p><code>[classname-1,classname-2]</code></p>, the class name(s) are
 * added to the cell div and the <p> is removed.
 * @param {Element} block
 */
export function decorateCellClass(block) {
  [...block.children].forEach((row) => {
    [...row.children].forEach((div) => {
      const first = div.firstElementChild;
      if (!first || first.tagName !== 'P' || first.children.length !== 1) return;
      const code = first.firstElementChild;
      if (code.tagName !== 'CODE') return;
      const match = code.textContent.match(/^\[([a-zA-Z0-9_,-]+)\]$/);
      if (!match) return;
      const classes = match[1].split(',').filter(Boolean);
      div.classList.add(...classes);
      first.remove();
    });
  });
}

/**
 * Shared YouTube and Vimeo embed HTML builders.
 * Used by video and embed blocks. Returns HTML strings for DOMPurify or DOM creation.
 *
 * @param {URL} url - Embed URL
 * @param {boolean} [autoplay=false] - Autoplay when visible
 * @param {boolean} [background=false] - Background/ambient mode (muted, loop, no controls)
 * @returns {string} HTML string for the embed wrapper
 */

const IFRAME_WRAPPER_STYLE = 'left: 0; width: 100%; height: 0; position: relative; padding-bottom: 56.25%;';
const IFRAME_STYLE = 'border: 0; top: 0; left: 0; width: 100%; height: 100%; position: absolute;';
const YOUTUBE_ALLOW = 'autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope';

function toPair(k, v) {
  return `${k}=${encodeURIComponent(v)}`;
}

function buildQueryString(params, prefix) {
  const pairs = Object.entries(params).map(([k, v]) => toPair(k, v)).join('&');
  return `${prefix}${pairs}`;
}

function getYoutubeSuffix(autoplay, background) {
  const params = {
    autoplay: autoplay ? '1' : '0',
    mute: background ? '1' : '0',
    controls: background ? '0' : '1',
    disablekb: background ? '1' : '0',
    loop: background ? '1' : '0',
    playsinline: background ? '1' : '0',
  };
  return buildQueryString(params, '&');
}

function getYoutubeVideoId(url) {
  if (url.origin.includes('youtu.be')) {
    const [, vid] = url.pathname.split('/');
    return vid ? encodeURIComponent(vid) : '';
  }
  const v = new URLSearchParams(url.search).get('v');
  return v ? encodeURIComponent(v) : '';
}

function getYoutubeSrc(url, autoplay, background) {
  const vid = getYoutubeVideoId(url);
  const suffix = (background || autoplay) ? getYoutubeSuffix(autoplay, background) : '';
  if (vid) {
    return `https://www.youtube.com/embed/${vid}?rel=0&v=${vid}${suffix}`;
  }
  return `https://www.youtube.com${url.pathname}`;
}

function wrapIframe(src, allow, title) {
  return `<div class="iframe-wrapper" style="${IFRAME_WRAPPER_STYLE}">
<iframe src="${src}" style="${IFRAME_STYLE}" allow="${allow}" allowfullscreen="" scrolling="no" title="${title}" loading="lazy"></iframe>
</div>`;
}

export function getYoutubeEmbedHtml(url, autoplay = false, background = false) {
  const src = getYoutubeSrc(url, autoplay, background);
  return wrapIframe(src, YOUTUBE_ALLOW, 'Content from Youtube');
}

function getVimeoSrc(url, autoplay, background) {
  const [, video] = url.pathname.split('/');
  const params = (background || autoplay)
    ? { autoplay: autoplay ? '1' : '0', background: background ? '1' : '0' }
    : {};
  const suffix = Object.keys(params).length ? buildQueryString(params, '?') : '';
  return `https://player.vimeo.com/video/${video}${suffix}`;
}

export function getVimeoEmbedHtml(url, autoplay = false, background = false) {
  const src = getVimeoSrc(url, autoplay, background);
  const allow = 'autoplay; fullscreen; picture-in-picture';
  return `<div class="iframe-wrapper" style="${IFRAME_WRAPPER_STYLE}">
<iframe src="${src}" style="${IFRAME_STYLE}" frameborder="0" allow="${allow}" allowfullscreen title="Content from Vimeo" loading="lazy"></iframe>
</div>`;
}

/**
 * Parses account/player/video ids from a Brightcove player link, e.g. the URL produced by
 * Brightcove Studio's "Link" sharing option:
 * https://players.brightcove.net/{accountId}/{playerId}_default/index.html?videoId={videoId}
 * @param {URL} url - Brightcove player link
 * @returns {{accountId: string, playerId: string, videoId: string}|null}
 */
export function getBrightcoveIds(url) {
  const match = url.pathname.match(/^\/(\d+)\/(.+)_default\/index\.html$/);
  const videoId = url.searchParams.get('videoId');
  if (!match || !videoId) return null;
  const [, accountId, playerId] = match;
  return { accountId, playerId, videoId };
}

/**
 * Builds a Brightcove <video-js> element for the given ids. Brightcove's player script
 * (see {@link getBrightcoveScriptTag}) only auto-initializes <video-js> elements present
 * the first time it runs, so this element's id is passed back to that script so it can be
 * initialized explicitly too — needed when the script was already loaded for an earlier player.
 * @param {{accountId: string, playerId: string, videoId: string}} ids
 * @param {Object} [options]
 * @param {boolean} [options.autoplay=false]
 * @param {boolean} [options.playsinline=false] Inline playback on mobile Safari
 * @param {boolean} [options.fluid=false] Responsive sizing handled by the player's own JS
 * @param {boolean} [options.background=false] Ambient mode: loop + muted instead of controls
 * @returns {HTMLElement}
 */
export function createBrightcovePlayer({ accountId, playerId, videoId }, options = {}) {
  const {
    autoplay = false, playsinline = false, fluid = false, background = false,
  } = options;
  const player = document.createElement('video-js');
  player.id = `bc-${accountId}-${videoId}`;
  player.setAttribute('data-account', accountId);
  player.setAttribute('data-player', playerId);
  player.setAttribute('data-embed', 'default');
  player.setAttribute('data-video-id', videoId);
  if (playsinline) player.setAttribute('playsinline', '');
  if (autoplay) player.setAttribute('autoplay', '');
  if (background) {
    player.setAttribute('loop', '');
    player.setAttribute('muted', '');
  } else {
    player.setAttribute('controls', '');
  }
  if (fluid) player.classList.add('vjs-fluid');
  return player;
}

/**
 * Loads the Brightcove player script for the given account and player, then explicitly
 * initializes videoEl. The script is only injected once per account/player combination
 * (loadScript resolves immediately for an already-loaded src), so the explicit init is what
 * makes it safe to add more <video-js> elements for the same account/player after the fact.
 * @param {string} accountId The Brightcove account id
 * @param {string} playerId The Brightcove player id
 * @param {HTMLElement} videoEl The <video-js> element to initialize
 * @returns {Promise<void>}
 */
export async function getBrightcoveScriptTag(accountId, playerId, videoEl) {
  const src = `https://players.brightcove.net/${accountId}/${playerId}_default/index.min.js`;
  await loadScript(src, { async: '' });
  if (window.bc) window.bc(videoEl);
}

/* -------------------------------------------------------------------------- */
/* Responsive picture: up to 5 images per cell (art-direction <picture>) */
/* -------------------------------------------------------------------------- */

const MAX_BLOCK_CELL_IMAGES = 5;

/** Default breakpoints for single-image cells (same defaults as `createOptimizedPicture` in aem.js). */
export const DEFAULT_BLOCK_SINGLE_PICTURE_BREAKPOINTS = [
  { media: '(min-width: 600px)', width: '2000' }, 
  { width: '750' },
];

const ART_DIRECTION_DEFAULT_IMG_WIDTH = '750';

/**
 * Tags that `wrapTextNodes` (aem.js) recognizes as already block-formatted, minus
 * `PICTURE` — a `<p><picture>...</picture></p>` is normal, parser-built markup, but a
 * `<p>` can never legitimately contain any of these via HTML parsing (the parser closes
 * an open `<p>` before them). Finding one here means `wrapTextNodes` forced the *whole*
 * cell into one `<p>` because its first child (e.g. a leading `<blockquote>`) wasn't on
 * its own allow-list — not that this is a genuine single authored paragraph.
 */
const FORCED_WRAP_TELLTALE_TAGS = new Set(['P', 'PRE', 'UL', 'OL', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/**
 * Undoes a `wrapTextNodes` (aem.js) forced wrap: when a cell's first authored child isn't
 * one of its recognized block tags (e.g. a leading `<blockquote>`), it moves the cell's
 * entire content into one new `<p>`, hiding later siblings — including image runs — one
 * level deeper than callers expect.
 * @param {HTMLElement} cell
 * @returns {HTMLElement} `cell`, or the unwrapped `<p>` if a forced wrap was detected
 */
function unwrapForcedParagraph(cell) {
  const { firstElementChild } = cell;
  const isForcedWrap = cell.children.length === 1
    && firstElementChild.tagName === 'P'
    && [...firstElementChild.children].some((el) => FORCED_WRAP_TELLTALE_TAGS.has(el.tagName));
  return isForcedWrap ? firstElementChild : cell;
}

/**
 * Art-direction `media` + CDN `width` for source index 1..4 (whitelist).
 * @param {number} imageIndex
 * @returns {{ media: string, width: string }}
 */
function getArtDirectionSourceMeta(imageIndex) {
  switch (imageIndex) {
    case 1:
      return { media: '(min-width: 768px)', width: '992' };
    case 2:
      return { media: '(min-width: 992px)', width: '1200' };
    case 3:
      return { media: '(min-width: 1200px)', width: '2000' };
    case 4:
      return { media: '(min-width: 1600px)', width: '2560' };
    default:
      return { media: '(min-width: 768px)', width: '750' };
  }
}

/**
 * Nearest ancestor `<a href>` between `el` and `root` (exclusive), or `null`.
 * @param {Element} el
 * @param {Element} root
 * @returns {HTMLAnchorElement|null}
 */
function findWrappingLink(el, root) {
  let node = el.parentElement;
  while (node && node !== root) {
    if (node.matches('a[href]')) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * True if `node` is a whitespace-only text node (insignificant between authored elements).
 * @param {Node} node
 * @returns {boolean}
 */
function isWhitespaceTextNode(node) {
  return node.nodeType === Node.TEXT_NODE && node.textContent.trim() === '';
}

/**
 * True if `node` renders only an image: a bare `<picture>`/`<img>`, or a wrapper
 * (e.g. `<p>`, `<a>`) containing nothing else but whitespace.
 * @param {Node} node
 * @returns {boolean}
 */
function isImageOnlyNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  if (node.matches('picture, img')) return true;
  if (!node.querySelector('picture, img')) return false;
  return [...node.childNodes].every(
    (child) => isWhitespaceTextNode(child) || isImageOnlyNode(child),
  );
}

/**
 * Walks a block image cell in document order; collects up to five `{ src, alt, link }` entries.
 * `link` (the wrapping `<a>`, if any) is only captured for the first entry — links wrapping
 * any other picture/img are ignored.
 * @param {HTMLElement} cell
 * @returns {{ src: string, alt: string, link: HTMLAnchorElement|null }[]}
 */
export function collectBlockCellImageSources(cell) {
  const out = [];
  const walk = (root) => {
    if (out.length >= MAX_BLOCK_CELL_IMAGES) return;
    [...root.children].forEach((el) => {
      if (out.length >= MAX_BLOCK_CELL_IMAGES) return;
      if (el.matches('picture')) {
        const img = el.querySelector('img[src]');
        if (img) {
          const link = out.length === 0 ? findWrappingLink(el, cell) : null;
          out.push({ src: img.src, alt: img.getAttribute('alt') ?? '', link });
        }
      } else if (el.matches('img[src]')) {
        if (!el.closest('picture')) {
          const link = out.length === 0 ? findWrappingLink(el, cell) : null;
          out.push({ src: el.src, alt: el.getAttribute('alt') ?? '', link });
        }
      } else {
        walk(el);
      }
    });
  };
  walk(cell);
  return out;
}

/**
 * One &lt;picture&gt; with art-direction sources (different authored assets per viewport).
 * Each breakpoint is already a distinct DA-authored rendition, so — unlike
 * `createOptimizedPicture` — no webp alternate is generated per breakpoint; only the
 * originally authored format is used, one &lt;source&gt; per breakpoint.
 * @param {{ src: string, alt: string }[]} sources 2–5 entries
 * @param {boolean} eager loading on the fallback &lt;img&gt;
 * @returns {HTMLPictureElement}
 */
export function createArtDirectionPicture(sources, eager) {
  const capped = sources.slice(0, MAX_BLOCK_CELL_IMAGES);
  const picture = document.createElement('picture');

  for (let i = capped.length - 1; i >= 1; i -= 1) {
    const { src } = capped[i];
    const url = !src.startsWith('http') ? new URL(src, window.location.href) : new URL(src);
    const { origin, pathname } = url;
    const ext = pathname.split('.').pop();
    const { media, width } = getArtDirectionSourceMeta(i);

    const source = document.createElement('source');
    source.setAttribute('media', media);
    source.setAttribute(
      'srcset',
      `${origin}${pathname}?width=${width}&format=${ext}&optimize=medium`,
    );
    picture.append(source);
  }

  const defaultSrc = capped[0].src;
  const defaultAlt = capped[0].alt;
  const url0 = !defaultSrc.startsWith('http')
    ? new URL(defaultSrc, window.location.href)
    : new URL(defaultSrc);
  const { origin, pathname } = url0;
  const ext = pathname.split('.').pop();

  const img = document.createElement('img');
  img.setAttribute('loading', eager ? 'eager' : 'lazy');
  img.setAttribute('alt', defaultAlt);
  img.setAttribute(
    'src',
    `${origin}${pathname}?width=${ART_DIRECTION_DEFAULT_IMG_WIDTH}&format=${ext}&optimize=medium`,
  );
  picture.append(img);

  return picture;
}

/**
 * @typedef {Object} BuildPictureCellOptions
 * @property {boolean} [eagerSingle=true] - `loading` for single-image `createOptimizedPicture` path
 * @property {boolean} [eagerArtDirection=false] - `loading` on fallback &lt;img&gt; in multi-image art-direction path
 * @property {Array<{ media?: string, width: string }>} [singlePictureBreakpoints] - overrides for single-image optimization
 */

/**
 * Builds a fragment for a block image cell, preserving non-image content in place. Each
 * contiguous run of images (whitespace between them is fine) becomes one picture —
 * `createOptimizedPicture` (one image) or art-direction (2–5); other content passes through.
 * Also undoes a `wrapTextNodes` forced wrap (see `unwrapForcedParagraph`) so a leading
 * `<blockquote>` or similar doesn't hide later image runs one level too deep.
 * @param {HTMLElement} cell
 * @param {BuildPictureCellOptions} [options]
 * @returns {DocumentFragment}
 */
export function buildPictureContentFromImageCell(cell, options = {}) {
  const {
    eagerSingle = true,
    eagerArtDirection = false,
    singlePictureBreakpoints = DEFAULT_BLOCK_SINGLE_PICTURE_BREAKPOINTS,
  } = options;

  const frag = document.createDocumentFragment();
  const children = [...unwrapForcedParagraph(cell).childNodes];
  let i = 0;

  while (i < children.length) {
    if (!isImageOnlyNode(children[i])) {
      frag.append(children[i]);
      i += 1;
    } else {
      // gather images adjacent to this one (whitespace allowed between)
      const run = document.createElement('div');
      run.append(children[i]);
      let j = i + 1;
      while (j < children.length
        && (isWhitespaceTextNode(children[j]) || isImageOnlyNode(children[j]))) {
        run.append(children[j]);
        j += 1;
      }

      const sources = collectBlockCellImageSources(run);
      const picture = sources.length === 1
        ? createOptimizedPicture(
          sources[0].src,
          sources[0].alt,
          eagerSingle,
          singlePictureBreakpoints,
        )
        : createArtDirectionPicture(sources, eagerArtDirection);

      const { link } = sources[0];
      if (link) {
        const anchor = link.cloneNode(false);
        anchor.append(picture);
        frag.append(anchor);
      } else {
        frag.append(picture);
      }

      i = j;
    }
  }

  return frag;
}
