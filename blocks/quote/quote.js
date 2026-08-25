import { getBlockId } from '../../scripts/scripts.js';

export default function decorate(block) {
  const blockId = getBlockId('quote');
  block.setAttribute('id', blockId);
  block.setAttribute('aria-label', `quote-${blockId}`);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Quote');

  const [quotation, attribution, imageRow] = [...block.children].map((c) => c.firstElementChild);
  const blockquote = document.createElement('blockquote');
  // decorate quotation
  quotation.className = 'quote-quotation';
  blockquote.append(quotation);
  // decoration attribution
  if (attribution) {
    attribution.className = 'quote-attribution';
    blockquote.append(attribution);
  }

  const picture = imageRow?.querySelector('picture, img');
  block.innerHTML = '';

  if (picture) {
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'quote-image';
    imageWrapper.append(picture);
    block.append(imageWrapper);

    const content = document.createElement('div');
    content.className = 'quote-content';
    content.append(blockquote);
    block.append(content);
  } else {
    block.append(blockquote);
  }
}
