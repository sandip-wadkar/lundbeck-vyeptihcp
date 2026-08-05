/**
 * Page View tracking for EDS. Ported from AEM AMS pageview.js.
 * Payload shape (event/eventInfo/pageInfo/meta/campaignInfo) is kept
 * identical to AMS so the existing AEP Tags rules/data elements match.
 *
 * EDS differences vs AMS:
 *  - No `data-page-name` attribute → sourced from getMetadata()/og:title.
 *  - Not fired on DOMContentLoaded → call pushPageViewEvent() from a load phase.
 *  - error.js is optional (guarded dynamic import) until it's ported.
 */

import { getMetadata } from './aem.js';
import { pushToAdobeDataLayer, DATA_LAYER_CONFIG } from './datalayer.js';

/** Converts false, undefined, null, or whitespace-only strings to null. */
function toNullIfEmpty(value) {
  if (value === false || value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

/**
 * Resolves the page name in EDS. Prefers an authored `page-name` meta,
 * then og:title, then document.title. Also mirrors it onto
 * body[data-page-name] so Tag data elements reading the attr still work.
 */
function resolvePageName() {
  const name = getMetadata('page-name')
    || getMetadata('og:title')
    || document.title;
  const clean = toNullIfEmpty(name);
  if (clean && document.body) document.body.dataset.pageName = clean;
  return clean;
}

/** Reads page-level information from the document and current URL. */
function getPageDetails() {
  return {
    name: resolvePageName(),
    title: toNullIfEmpty(document.title),
    path: toNullIfEmpty(window.location.pathname),
    hash: toNullIfEmpty(window.location.hash),
    url: toNullIfEmpty(window.location.href),
    language: toNullIfEmpty(document.documentElement.lang) || 'en-us',
  };
}

/**
 * Reads CID from sessionStorage or the current URL query param and
 * persists it for cross-page campaign tracking.
 * CID format: channel_id_siteId_placementId_creativeId_journeyStage
 */
function getCampaignFromSession() {
  const qp = new URLSearchParams(window.location.search).get('cid');
  const urlCid = qp ? decodeURIComponent(qp).trim().toLowerCase() : null;
  const cid = urlCid || sessionStorage.getItem('__cid');
  if (cid) sessionStorage.setItem('__cid', cid);

  const parts = cid ? cid.split('_') : [];
  return {
    campaignCID: cid,
    campaignChannel: parts[0] || null,
    campaignID: parts[1] || null,
    campaignSiteID: parts[2] || null,
    campaignPlacementID: parts[3] || null,
    campaignCreativeID: parts[4] || null,
    campaignJourneyStage: parts[5] || null,
  };
}

/** Builds and pushes the pageView event, then fires post-pageView trackers. */
export function pushPageViewEvent() {
  const pageDetails = getPageDetails();
  const pageUrl = pageDetails.url ? pageDetails.url.split(/[?#]/)[0] : null;
  const botScore = window.digitalData?.page?.botScore ?? null;

  pushToAdobeDataLayer({
    event: DATA_LAYER_CONFIG.pageEvents.PAGE_VIEW,
    eventInfo: { eventName: DATA_LAYER_CONFIG.pageMeta.eventName },
    pageInfo: {
      pageName: pageDetails.name,
      pageTitle: pageDetails.title,
      pageUrl: toNullIfEmpty(pageUrl),
      pagePath: pageDetails.path,
      pageFragment: pageDetails.hash,
      previousPageUrl: toNullIfEmpty(document.referrer),
      pageQueryString: toNullIfEmpty(window.location.search),
      language: pageDetails.language,
    },
    meta: {
      siteName: toNullIfEmpty(window.location.origin),
      botScore,
      timeStamp: new Date().toISOString(),
    },
    campaignInfo: getCampaignFromSession(),
  });

  // Optional: fire 404 tracking if error.js has been ported. Guarded so a
  // missing module or downstream failure never breaks pageView.
  import('./error.js')
    .then((m) => m.maybePushPageNotFoundError?.())
    .catch(() => { /* error.js not present yet — ignore */ });
}
