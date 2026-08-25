import { moveInstrumentation, getBlockId } from '../../scripts/scripts.js';
import { buildPictureContentFromImageCell } from '../../scripts/utils.js';

/**
 * Slugifies tab label text into a URL-safe anchor id: lowercase, non-alphanumeric
 * runs collapsed to a single hyphen, leading/trailing hyphens trimmed.
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  // The first replace collapses any run of non-alphanumeric characters into a single
  // hyphen, so at most one leading/trailing hyphen can remain — no `+` needed here.
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * @param {Element} row
 * @param {Element | null} tablist
 */
function isTabRowCandidate(row, tablist) {
  if (row === tablist || row.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  if (row.matches('.tabs-dropdown-panel[role="tabpanel"]')) {
    return true;
  }
  return !!(row.firstElementChild && row.firstElementChild.children.length > 0);
}

/**
 * Rebuilds tab buttons and panel ids/indexes when tab items are added or removed (e.g. in
 * Universal Editor). Unlike the plain `tabs` block, button/panel ids are derived from the
 * slugified tab label text (not a generated counter), so the URL hash a tab writes matches
 * the label a user clicked.
 * @param {Element} block
 */
export function resyncTabsDropdownBlock(block) {
  const tablist = block.querySelector(':scope > .tabs-dropdown-list');
  if (!tablist) {
    return;
  }

  if (block.firstElementChild !== tablist) {
    block.insertBefore(tablist, block.firstElementChild);
  }

  const rows = [...block.children].filter((c) => isTabRowCandidate(c, tablist));
  const MAX_TAB_ITEMS = 200;
  if (rows.length > MAX_TAB_ITEMS) {
    return;
  }

  const existingButtons = [...tablist.children];
  if (existingButtons.length > rows.length) {
    tablist.replaceChildren(...existingButtons.slice(0, rows.length));
  } else if (existingButtons.length < rows.length) {
    const fragment = document.createDocumentFragment();
    const toAdd = rows.length - existingButtons.length;
    for (let b = 0; b < toAdd; b += 1) {
      const btn = document.createElement('button');
      btn.className = 'tabs-dropdown-tab';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('type', 'button');
      fragment.append(btn);
    }
    tablist.append(fragment);
  }

  const usedSlugs = new Set();
  rows.forEach((row, i) => {
    const button = tablist.children[i];
    let labelText;

    if (!row.matches('.tabs-dropdown-panel[role="tabpanel"]')) {
      const tabCell = row.firstElementChild;
      if (!tabCell || !tabCell.children.length) {
        return;
      }
      labelText = tabCell.textContent;
      tabCell.remove();
      button.textContent = labelText;
      if (button.firstElementChild) {
        moveInstrumentation(button.firstElementChild, null);
      }

      // merges adjacent-image runs into art-direction pictures; other content stays put
      const contentCell = row.firstElementChild;
      if (contentCell && contentCell.querySelector('picture')) {
        contentCell.replaceChildren(buildPictureContentFromImageCell(contentCell));
      }
    } else {
      labelText = button.textContent;
    }

    let slug = slugify(labelText) || `tab-${i + 1}`;
    while (usedSlugs.has(slug)) {
      slug = `${slug}-2`;
    }
    usedSlugs.add(slug);

    const panelId = `${slug}-panel`;

    row.className = 'tabs-dropdown-panel';
    row.id = panelId;
    row.setAttribute('data-tab-index', String(i));
    row.setAttribute('aria-labelledby', slug);
    row.setAttribute('role', 'tabpanel');

    button.id = slug;
    button.setAttribute('aria-controls', panelId);
    button.setAttribute('aria-selected', 'false');
    button.dataset.slug = slug;
  });
}

/**
 * Activates the tab at `index`: shows its panel, marks its button selected, closes the
 * mobile fake-select list, and — for user-driven activations — pushes the tab's slug onto
 * the URL as a hash, without scrolling, since the tab is already in view.
 * @param {Element} block
 * @param {Element} tablist
 * @param {number} index
 * @param {{ updateHash?: boolean }} [options] Set `updateHash: false` for the initial,
 *   page-load activation so a default or deep-linked tab doesn't rewrite the URL.
 */
function activateTab(block, tablist, index, { updateHash = true } = {}) {
  const buttons = [...tablist.querySelectorAll(':scope > button.tabs-dropdown-tab')];
  const panels = [...block.querySelectorAll(':scope > .tabs-dropdown-panel')];
  if (!buttons[index] || !panels[index]) {
    return;
  }

  panels.forEach((panel, i) => {
    panel.setAttribute('aria-hidden', String(i !== index));
  });
  buttons.forEach((btn, i) => {
    btn.setAttribute('aria-selected', String(i === index));
  });
  tablist.classList.remove('is-open');

  if (updateHash) {
    const { slug } = buttons[index].dataset;
    // eslint-disable-next-line secure-coding/no-insecure-comparison -- comparing the public URL hash fragment to a tab slug, not a secret
    if (slug && window.location.hash !== `#${slug}`) {
      window.history.pushState(null, '', `#${slug}`);
    }
  }
}

/**
 * @param {Element} block
 * @param {Element} tablist
 */
function ensureTablistClickDelegation(block, tablist) {
  if (tablist.dataset.tabsDropdownClickDelegated === 'true') {
    return;
  }
  tablist.dataset.tabsDropdownClickDelegated = 'true';
  tablist.addEventListener('click', (e) => {
    const button = e.target.closest('button.tabs-dropdown-tab');
    if (!button || !tablist.contains(button)) {
      return;
    }
    const buttons = [...tablist.querySelectorAll(':scope > button.tabs-dropdown-tab')];
    const index = buttons.indexOf(button);
    const isOpen = tablist.classList.contains('is-open');

    // Mobile fake-select: tapping the already-active trigger while closed just opens
    // the list of other options — it doesn't re-select (a no-op) or scroll-jump.
    if (button.getAttribute('aria-selected') === 'true' && !isOpen) {
      tablist.classList.add('is-open');
      return;
    }

    activateTab(block, tablist, index);
  });
}

export default async function decorate(block) {
  const blockId = getBlockId('tabs-dropdown');
  block.setAttribute('id', blockId);
  block.setAttribute('aria-label', `tabs-dropdown-${blockId}`);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Tabs');

  let tablist = block.querySelector(':scope > .tabs-dropdown-list');
  if (!tablist) {
    tablist = document.createElement('div');
    tablist.className = 'tabs-dropdown-list';
    tablist.setAttribute('role', 'tablist');
    tablist.id = `tablist-${blockId}`;
    block.prepend(tablist);
  }

  ensureTablistClickDelegation(block, tablist);
  resyncTabsDropdownBlock(block);

  const buttons = [...tablist.querySelectorAll(':scope > button.tabs-dropdown-tab')];
  const hashSlug = window.location.hash.slice(1);
  // eslint-disable-next-line secure-coding/no-insecure-comparison -- matching the public URL hash fragment against a tab slug, not a secret
  const deepLinkIndex = buttons.findIndex((btn) => btn.dataset.slug === hashSlug);
  activateTab(block, tablist, deepLinkIndex !== -1 ? deepLinkIndex : 0, { updateHash: false });
}
