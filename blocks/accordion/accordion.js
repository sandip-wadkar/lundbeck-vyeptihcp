import { moveInstrumentation } from '../../scripts/scripts.js';
import { buildPictureContentFromImageCell } from '../../scripts/utils.js';

function isEmpty(cell) {
  return !cell || (!cell.firstElementChild && !cell.textContent.trim());
}

function buildAccordionItem(row, label, body) {
  const li = document.createElement('li');
  li.className = 'accordion-item';
  moveInstrumentation(row, li);
  if (label) li.append(label);
  if (body) li.append(body);

  if (label) {
    label.className = 'accordion-item-label';

    // Convention: author bolds the lead phrase; the remaining inline content
    // becomes the "detail", which is collapsed on mobile and revealed on tablet up.
    const labelText = label.querySelector('p') || label;
    const lead = labelText.querySelector(':scope > strong, :scope > b');
    if (lead && lead.nextSibling) {
      const detail = document.createElement('span');
      detail.className = 'accordion-item-label-detail';
      let node = lead.nextSibling;
      while (node) {
        const next = node.nextSibling;
        detail.append(node);
        node = next;
      }
      if (detail.textContent.trim()) labelText.append(detail);
    }
  }
  if (body) {
    body.className = 'accordion-item-body';
    // merges adjacent-image runs into art-direction pictures; other content stays put
    if (body.querySelector('picture')) body.replaceChildren(buildPictureContentFromImageCell(body));
  }

  // The whole card toggles the item; clicks inside the open body are ignored
  // so links stay clickable and body text stays selectable.
  li.addEventListener('click', (e) => {
    if (body && body.contains(e.target)) return;
    li.classList.toggle('active');
  });

  return li;
}

// Drops any tracked depth >= the given depth, since a new item at that depth
// starts a fresh nesting branch and stale deeper tracking no longer applies.
function truncateDepth(map, depth) {
  [...map.keys()].filter((k) => k >= depth).forEach((k) => map.delete(k));
}

export default function decorate(block) {
  const rootUl = document.createElement('ul');
  const sublistAtDepth = new Map();
  const lastItemAtDepth = new Map();

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const depth = cells.findIndex((cell) => !isEmpty(cell));
    if (depth === -1) return;

    // eslint-disable-next-line secure-coding/detect-object-injection -- `depth` is a bounded array index from findIndex(), not an untrusted string key; no prototype pollution risk
    const li = buildAccordionItem(row, cells[depth], cells[depth + 1]);
    const parentItem = depth > 0 ? lastItemAtDepth.get(depth - 1) : null;
    const parentBody = parentItem?.querySelector(':scope > .accordion-item-body');

    if (depth === 0 || !parentBody) {
      // depth 0, or malformed authoring (nested row with no parent) — top level.
      rootUl.append(li);
      sublistAtDepth.clear();
      lastItemAtDepth.clear();
      lastItemAtDepth.set(0, li);
    } else {
      let ul = sublistAtDepth.get(depth);
      if (!ul || !parentBody.contains(ul)) {
        ul = document.createElement('ul');
        ul.className = 'accordion-sublist';
        parentBody.append(ul);
        sublistAtDepth.set(depth, ul);
      }
      ul.append(li);
      truncateDepth(lastItemAtDepth, depth);
      lastItemAtDepth.set(depth, li);
    }
  });

  block.textContent = '';
  block.append(rootUl);
}
