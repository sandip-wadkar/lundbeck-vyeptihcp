import { getBlockId } from '../../scripts/scripts.js';

/**
 * Connect support — the two-tone enrollment banner that follows the VYEPTI
 * CONNECT icon panel: a teal enrollment CTA line, directly fused to a pale-blue
 * note panel (intro + "Note:" + 2-col contact info + fine print). Kept as one
 * block because the two sub-panels are visually fused (no gap — same rounded
 * pill). The lead sentence + 4 support icons that used to lead this block now
 * live in the preceding `cards (icon-feature icon-80)` block within a styled
 * `connect-panel` section.
 *
 * Authoring rows (positional):
 *   1. enroll cell — "download the enrollment form" paragraph
 *   2. note cell — intro + "Note:" paragraphs
 *   3. contact-info row — 2 cells: [fax], [call]
 *   4. fine print cell
 *
 * @param {HTMLElement} block
 */
function cellsOf(row) {
  return row ? [...row.children] : [];
}

export default function decorate(block) {
  const blockId = getBlockId('connect-support');
  block.setAttribute('id', blockId);
  block.setAttribute('aria-label', `connect-support-${blockId}`);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Connect support');

  const rows = [...block.children];
  const [enrollRow, noteRow, colsRow, fineRow] = rows;

  const enroll = document.createElement('div');
  enroll.className = 'connect-support-enroll';
  if (enrollRow?.firstElementChild) enroll.append(...enrollRow.firstElementChild.childNodes);

  const note = document.createElement('div');
  note.className = 'connect-support-note';
  if (noteRow?.firstElementChild) note.append(...noteRow.firstElementChild.childNodes);

  if (colsRow) {
    const cols = document.createElement('div');
    cols.className = 'connect-support-cols';
    cellsOf(colsRow).forEach((cell) => {
      cell.classList.add('connect-support-col');
      cols.append(cell);
    });
    note.append(cols);
  }

  if (fineRow?.firstElementChild) {
    const fine = fineRow.firstElementChild;
    fine.classList.add('connect-support-fine');
    note.append(fine);
  }

  block.replaceChildren(enroll, note);
}
