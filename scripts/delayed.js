// add delayed functionality here
import { loadScript } from './aem.js';
import { pushPageViewEvent } from './pageview.js';
import { initLinkTracking } from './linktracking.js';
import { initScrollDepthTracking } from './observers.js';

// CookieInformation consent management platform (same CMP as www.vyepti.com)
async function loadConsentManager() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('martech') === 'off') return;

  window.cookieInformationCustomConfig = {
    acceptFrequency: 365,
    declineFrequency: 365,
  };

  await loadScript('https://policy.app.cookieinformation.com/uc.js', {
    id: 'CookieConsent',
    'data-culture': 'EN',
    type: 'text/javascript',
  });
}

loadConsentManager();
// Fire Page View once the page is idle and AEP Tags is ready.
pushPageViewEvent();
initLinkTracking();
initScrollDepthTracking();
