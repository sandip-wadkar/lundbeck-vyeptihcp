import { buildPictureContentFromImageCell } from '../../scripts/utils.js';
import { moveInstrumentation, getBlockId } from '../../scripts/scripts.js';
import { createCard } from '../card/card.js';

export default function decorate(block) {
  const blockId = getBlockId('cards');
  block.setAttribute('id', blockId);
  block.setAttribute('aria-label', `Cards for ${blockId}`);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Cards');

  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    ul.append(createCard(row));
  });
  ul.querySelectorAll('.cards-card-image').forEach((imageCell) => {
    const firstImg = imageCell.querySelector('picture > img');
    imageCell.replaceChildren(
      buildPictureContentFromImageCell(imageCell, { eagerSingle: false }),
    );
    const newImg = imageCell.querySelector('picture > img');
    if (firstImg && newImg) {
      moveInstrumentation(firstImg, newImg);
    }
  });

  const cardCount = ul.children.length;
  if (cardCount === 2 || cardCount === 3) {
    block.classList.add(`cards-${cardCount}-cols`);
  }

  block.textContent = '';
  block.append(ul);
}
