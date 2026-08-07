/**
 * Link Interaction Tracking for Vyepti HCP (EDS port).
 * Tracks all anchor clicks and classifies them as Download, Exit, or Other
 * (internal). Uses pushLinkInteractionEventToDataLayer from datalayer.js.
 *
 * AMS→EDS remap: EDS has no .navbar/.header-block/.footer__container, no
 * data-link-name attrs, no logo IDs, no .cmp-link__screen-reader-only spans.
 * Module identity is derived from EDS's semantic <header>/<footer> wrappers
 * and nav-* classes instead.
 */

import { pushLinkInteractionEventToDataLayer } from './datalayer.js';

/** Valid download file extensions. */
const DOWNLOAD_EXTENSIONS = /\.(exe|zip|wav|mp3|mov|mpg|avi|wmv|pdf|doc|docx|xls|xlsx|ppt|pptx)/i;

/** Module name from the anchor's position in the EDS DOM. */
function getModuleName(anchor) {
  if (anchor.closest('.nav-utility')) return 'Utility Navigation Menu';
  if (anchor.closest('header')) return 'Header Section';
  if (anchor.closest('footer')) return 'Footer Section';
  return 'Body Section';
}

/** Module type from the anchor's position in the EDS DOM. */
function getModuleType(anchor) {
  if (anchor.closest('header')) return 'topNavigation';
  if (anchor.closest('footer')) return 'footerNavigation';
  return 'Content';
}

/** Link name from anchor text, falling back to a nested image's alt. */
function getLinkName(anchor) {
  let linkName = (anchor.innerText || anchor.textContent || '').trim();
  if (!linkName) {
    const img = anchor.querySelector('img');
    if (img) linkName = img.getAttribute('alt') || '';
  }
  return linkName;
}

/**
 * Classifies the link type based on the href.
 * - Download: matches a download file extension
 * - Exit: points to an external domain
 * - Other: internal link within the same site
 */
function classifyLinkType(href) {
  if (!href) return 'Other';
  if (DOWNLOAD_EXTENSIONS.test(href)) return 'Download';
  try {
    const url = new URL(href, window.location.origin);
    if (url.hostname !== window.location.hostname) return 'Exit';
  } catch {
    // Malformed URL treated as internal
  }
  return 'Other';
}

/**
 * Single delegated click listener for all link interactions.
 * Capture phase (true) so it fires before any handler that may call
 * stopImmediatePropagation (e.g. external-link interstitials).
 */
export default function initLinkTracking() {
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    const normalizedHref = href ? href.trim().toLowerCase() : '';
    if (!normalizedHref
      || normalizedHref === '#'
      || /^(javascript|data|vbscript):/.test(normalizedHref)) return;

    const linkType = classifyLinkType(href);
    const linkName = getLinkName(anchor);
    const linkUrl = linkType === 'Other'
      ? new URL(href, window.location.origin).href
      : href;

    pushLinkInteractionEventToDataLayer({
      linkName,
      linkUrl,
      linkType,
      moduleName: getModuleName(anchor),
      moduleType: getModuleType(anchor),
    });
  }, true);
}