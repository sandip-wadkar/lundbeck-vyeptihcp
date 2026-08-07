/**
 * Global observers for EDS analytics (scroll depth, etc.).
 * Ported from AEM AMS scrollDepth.js. Config (thresholds, throttle,
 * eventName suffix) and payload (scrollInfo.percent) match AMS exactly.
 * Also satisfies scripts/index.js which re-exports './observers.js'.
 */

import { pushToAdobeDataLayer, DATA_LAYER_CONFIG } from './datalayer.js';

const { thresholds, throttleMs, eventNameSuffix } = DATA_LAYER_CONFIG.scrollMeta;
const SCROLL_DEPTH_EVENT = DATA_LAYER_CONFIG.scrollEvents.SCROLL_DEPTH;

/** Builds a scroll-depth payload and forwards it to the Adobe Data Layer. */
function pushScrollDepthEventToDataLayer({ eventType, percent }) {
  pushToAdobeDataLayer({
    event: eventType,
    eventInfo: { eventName: `${percent}${eventNameSuffix}` },
    scrollInfo: { percent },
  });
}

function getScrollPercent() {
  const scrollTop = window.scrollY || window.pageYOffset;
  const docHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.offsetHeight,
    document.body.clientHeight,
    document.documentElement.clientHeight,
  );
  if (!docHeight) return 0;
  const scrolled = ((scrollTop + window.innerHeight) / docHeight) * 100;
  return Math.min(Math.round(scrolled), 100);
}

/** Enables scroll-depth tracking; fires each threshold once per page load. */
export default function initScrollDepthTracking() {
  const triggered = new Set();
  let throttleTimeout = null;

  function checkScrollDepth() {
    const percent = getScrollPercent();
    thresholds.forEach((threshold) => {
      if (percent >= threshold && !triggered.has(threshold)) {
        triggered.add(threshold);
        pushScrollDepthEventToDataLayer({ eventType: SCROLL_DEPTH_EVENT, percent: threshold });
      }
    });
  }

  // Throttle: reading scrollHeight forces layout, so avoid doing it every event.
  function throttledScroll() {
    if (throttleTimeout) return;
    throttleTimeout = setTimeout(() => {
      checkScrollDepth();
      throttleTimeout = null;
    }, throttleMs);
  }

  window.addEventListener('scroll', throttledScroll, { passive: true });
  // Fire once in case the page is already short enough to satisfy a threshold.
  checkScrollDepth();
}