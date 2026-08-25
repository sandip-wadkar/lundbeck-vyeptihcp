import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Builds a single card (li) from a block row: moves content into the li and applies
 * cards-card-image / cards-card-body classes to its children.
 * @param {Element} row - A direct child of the cards block (author row)
 * @returns {Element} The card li element
 */
/* eslint-disable import/prefer-default-export */
export function createCard(row) {
  const li = document.createElement('li');
  moveInstrumentation(row, li);
  while (row.firstElementChild) li.append(row.firstElementChild);
  [...li.children].forEach((div) => {
    const pictureCells = [...div.children].filter(
      (child) => child.matches('picture') || child.querySelector('picture'),
    );
    const isImageOnly = pictureCells.length === div.children.length
      && pictureCells.length >= 1
      && pictureCells.length <= 5;
    div.className = isImageOnly ? 'cards-card-image' : 'cards-card-body';
  });
  return li;
}
