import { moveInstrumentation, getBlockId } from '../../scripts/scripts.js';

// Matches the >=1200px tab-strip breakpoint in hero-tabs.css. Below it the block behaves
// like an accordion, where re-clicking the open tab collapses it instead of being a no-op.
const DESKTOP_TABS_QUERY = '(width >= 1200px)';

/**
 * Slugifies tab label text into a URL-safe anchor id: lowercase, non-alphanumeric
 * runs collapsed to a single hyphen, leading/trailing hyphens trimmed.
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Marks `button`'s panel as the active one, deselecting all others.
 * @param {Element} block
 * @param {Element} tablist
 * @param {Element} button
 */
function activateTab(block, tablist, button) {
  const panelId = button.getAttribute('aria-controls');
  const tabpanel = panelId && document.getElementById(panelId);
  if (!tabpanel || !block.contains(tabpanel)) {
    return;
  }

  block.querySelectorAll('[role=tabpanel]').forEach((panel) => {
    panel.setAttribute('aria-hidden', true);
  });
  tablist.querySelectorAll('button.tabs-tab').forEach((btn) => {
    btn.setAttribute('aria-selected', false);
  });
  tabpanel.setAttribute('aria-hidden', false);
  button.setAttribute('aria-selected', true);
}

/**
 * Pushes the active tab's slug onto the URL as a hash, without scrolling — but only at the
 * >=1200px tab-strip breakpoint. Accordion clicks (narrower viewports) never touch the URL,
 * matching the source site's behavior.
 * @param {Element} button
 */
function updateHashForTab(button) {
  if (!window.matchMedia(DESKTOP_TABS_QUERY).matches) {
    return;
  }
  const { slug } = button.dataset;
  // eslint-disable-next-line secure-coding/no-insecure-comparison -- comparing the public URL hash fragment to a tab slug, not a secret
  if (slug && window.location.hash !== `#${slug}`) {
    window.history.pushState(null, '', `#${slug}`);
  }
}

/**
 * @param {Element} block
 * @param {Element} tablist
 */
function ensureTablistClickDelegation(block, tablist) {
  if (tablist.dataset.tabsClickDelegated === 'true') {
    return;
  }
  tablist.dataset.tabsClickDelegated = 'true';
  tablist.addEventListener('click', (e) => {
    const button = e.target.closest('button.tabs-tab');
    if (!button || !tablist.contains(button)) {
      return;
    }
    const panelId = button.getAttribute('aria-controls');
    if (!panelId) {
      return;
    }
    const tabpanel = document.getElementById(panelId);
    if (!tabpanel || !block.contains(tabpanel)) {
      return;
    }

    const isAccordion = !window.matchMedia(DESKTOP_TABS_QUERY).matches;
    if (isAccordion && button.getAttribute('aria-selected') === 'true') {
      tabpanel.setAttribute('aria-hidden', true);
      button.setAttribute('aria-selected', false);
      return;
    }

    activateTab(block, tablist, button);
    updateHashForTab(button);
  });
}

/**
 * @param {Element} row
 * @param {Element | null} tablist
 */
function isTabRowCandidate(row, tablist) {
  if (row === tablist || row.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  return !!(row.firstElementChild && row.firstElementChild.children.length > 0);
}

/**
 * Rebuilds tab buttons and panel ids/indexes when tab items are added or removed (e.g. in Universal Editor).
 *
 * Buttons and panels are kept interleaved inside the tablist (button, panel, button, panel, ...) so CSS alone
 * can lay them out either as a tab-strip with one shared panel row (wide viewports, via CSS grid placement)
 * or as an accordion where each panel sits directly under its own button (narrower viewports, natural
 * document flow) — no resize/JS involvement in that switch.
 * @param {Element} block
 */
export function resyncTabsBlock(block) {
  const tablist = block.querySelector(':scope > .tabs-list');
  if (!tablist) {
    return;
  }

  if (block.firstElementChild !== tablist) {
    block.insertBefore(tablist, block.firstElementChild);
  }

  const blockId = block.getAttribute('id');
  if (!blockId) {
    return;
  }

  const openResource = tablist.querySelector('.tabs-panel[aria-hidden="false"]')
    ?.getAttribute('data-aue-resource');

  const existingPanels = [...tablist.children].filter((c) => c.matches('.tabs-panel[role="tabpanel"]'));
  const newRawRows = [...block.children].filter((c) => isTabRowCandidate(c, tablist));
  const rows = [...existingPanels, ...newRawRows];

  const MAX_TAB_ITEMS = 200;
  if (rows.length > MAX_TAB_ITEMS) {
    return;
  }

  const existingButtons = [...tablist.children].filter((c) => c.matches('button.tabs-tab'));
  const buttons = existingButtons.slice(0, rows.length);
  for (let b = buttons.length; b < rows.length; b += 1) {
    const btn = document.createElement('button');
    btn.className = 'tabs-tab';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('type', 'button');
    buttons.push(btn);
  }

  const usedSlugs = new Set();
  rows.forEach((row, i) => {
    const id = `tabpanel-${blockId}-tab-${i + 1}`;
    const buttonId = `tab-${id}`;
    const button = buttons[i];
    let labelText;

    if (!row.matches('.tabs-panel[role="tabpanel"]')) {
      const tabCell = row.firstElementChild;
      if (!tabCell || !tabCell.children.length) {
        return;
      }
      labelText = tabCell.textContent;
      tabCell.remove();

      row.className = 'tabs-panel';
      row.setAttribute('role', 'tabpanel');

      button.textContent = labelText;
      if (button.firstElementChild) {
        moveInstrumentation(button.firstElementChild, null);
      }
    } else {
      row.className = 'tabs-panel';
      row.setAttribute('role', 'tabpanel');
      labelText = button.textContent;
    }

    row.id = id;
    row.setAttribute('data-tab-index', String(i));
    row.setAttribute('aria-labelledby', buttonId);

    button.id = buttonId;
    button.setAttribute('aria-controls', id);
    button.setAttribute('aria-selected', 'false');

    let slug = slugify(labelText) || `tab-${i + 1}`;
    while (usedSlugs.has(slug)) {
      slug = `${slug}-2`;
    }
    usedSlugs.add(slug);
    button.dataset.slug = slug;
  });

  let activeIdx = 0;
  if (openResource) {
    const idx = rows.findIndex((r) => r.getAttribute('data-aue-resource') === openResource);
    if (idx !== -1) {
      activeIdx = idx;
    }
  }

  rows.forEach((row, i) => {
    row.setAttribute('aria-hidden', String(i !== activeIdx));
  });
  buttons.forEach((btn, i) => {
    btn.setAttribute('aria-selected', String(i === activeIdx));
  });

  const fragment = document.createDocumentFragment();
  rows.forEach((row, i) => {
    fragment.append(buttons[i], row);
  });
  tablist.replaceChildren(fragment);
  tablist.style.setProperty('--tab-count', String(rows.length));

  ensureTablistClickDelegation(block, tablist);
}

/**
 * On load, activates the tab matching the URL hash — but only at the >=1200px tab-strip
 * breakpoint. On narrower viewports the block is an accordion and, like the source site,
 * never reads (or writes) the hash there, so it's left untouched.
 * @param {Element} block
 * @param {Element} tablist
 */
function activateDeepLinkedTab(block, tablist) {
  if (!window.matchMedia(DESKTOP_TABS_QUERY).matches) {
    return;
  }
  const hashSlug = window.location.hash.slice(1);
  if (!hashSlug) {
    return;
  }
  const buttons = [...tablist.querySelectorAll(':scope > button.tabs-tab')];
  // eslint-disable-next-line secure-coding/no-insecure-comparison -- matching the public URL hash fragment against a tab slug, not a secret
  const button = buttons.find((btn) => btn.dataset.slug === hashSlug);
  if (!button || button.getAttribute('aria-selected') === 'true') {
    return;
  }
  activateTab(block, tablist, button);
}

export default async function decorate(block) {
  const blockId = getBlockId('tabs');
  block.setAttribute('id', blockId);
  block.setAttribute('aria-label', `tabs-${blockId}`);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Tabs');

  let tablist = block.querySelector(':scope > .tabs-list');
  if (!tablist) {
    tablist = document.createElement('div');
    tablist.className = 'tabs-list';
    tablist.setAttribute('role', 'tablist');
    tablist.id = `tablist-${blockId}`;
    block.prepend(tablist);
  }

  ensureTablistClickDelegation(block, tablist);
  resyncTabsBlock(block);
  activateDeepLinkedTab(block, tablist);
}
