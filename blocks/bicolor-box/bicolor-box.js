import { getBlockId } from '../../scripts/scripts.js';

/**
 * Bicolor box — rounded two-tone info box: a brand-color header banner
 * fused directly to a light body panel below it (no gap between them).
 *
 * Authoring rows (positional):
 *   1. header cell — either:
 *      - a lead sentence/CTA (a single paragraph), shown as an h3, or
 *      - a stat-box list: an li per column — the first li is the large
 *        stat number (h1), remaining li's are description text (p) — the
 *        block auto-detects this shape and lays the columns out in a row
 *   2. body cell — citation/remaining text, shown on the light band
 *
 * @param {HTMLElement} block
 */

/** Max characters scanned when splitting a stat value into number + unit (CWE-606/770). */
const MAX_STAT_VALUE_LENGTH = 40;

/** Splits "82%" into a leading numeric run and a trailing unit, e.g. ["82", "%"]. */
function splitStatValue(text) {
  const trimmed = text.trim().slice(0, MAX_STAT_VALUE_LENGTH);
  let end = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    if (!/[\d.,]/.test(trimmed[i])) break;
    end = i + 1;
  }
  return [trimmed.slice(0, end), trimmed.slice(end)];
}

function buildStatColumns(list) {
  const items = [...list.children];
  return items.map((li, index) => {
    if (index === 0) {
      const value = document.createElement('h1');
      value.className = 'bicolor-box-stat-value';
      const [number, unit] = splitStatValue(li.textContent);
      value.append(document.createTextNode(number));
      if (unit) {
        const unitEl = document.createElement('span');
        unitEl.className = 'bicolor-box-stat-unit';
        unitEl.textContent = unit;
        value.append(unitEl);
      }
      return value;
    }
    const description = document.createElement('p');
    description.className = 'bicolor-box-stat-description';
    description.append(...li.childNodes);
    return description;
  });
}

export default function decorate(block) {
  const blockId = getBlockId('bicolor-box');
  block.setAttribute('id', blockId);
  block.setAttribute('aria-label', `bicolor-box-${blockId}`);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Bicolor box');

  const [headerRow, bodyRow] = [...block.children];

  const header = document.createElement('div');
  header.className = 'bicolor-box-header';

  const statList = headerRow?.firstElementChild?.querySelector(':scope > ul');
  if (statList) {
    block.classList.add('stat-box');
    header.append(...buildStatColumns(statList));
  } else {
    if (headerRow?.firstElementChild) header.append(...headerRow.firstElementChild.childNodes);
    const headerPara = header.querySelector('p');
    if (headerPara) {
      const heading = document.createElement('h3');
      heading.className = 'bicolor-box-title';
      heading.append(...headerPara.childNodes);
      headerPara.replaceWith(heading);
    }
  }

  const body = document.createElement('div');
  body.className = 'bicolor-box-body';
  if (bodyRow?.firstElementChild) body.append(...bodyRow.firstElementChild.childNodes);

  const list = body.querySelector('ul');
  if (list) list.classList.add('bicolor-box-list');

  block.replaceChildren(header, body);
}
