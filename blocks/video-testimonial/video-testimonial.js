/* Video Testimonial: text (heading, quote, CTA, disclaimer) + Brightcove video. */

import { getBrightcoveIds, getBrightcoveScriptTag, createBrightcovePlayer } from '../../scripts/utils.js';

/**
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  block.classList.add('emboss');
  const content = block.querySelector(':scope > div > div') ?? block;

  const title = content.querySelector('h3');
  const quote = content.querySelector('h4');
  const smallText = content.querySelector('.small-text');
  const disclaimer = smallText ? smallText.closest('p') : null;

  const anchors = [...content.querySelectorAll('a[href]')];
  const isBrightcove = (a) => {
    try {
      return new URL(a.href).hostname.includes('brightcove');
    } catch {
      return false;
    }
  };
  // CTA = the "watch the video" link; video source = the other Brightcove link.
  const watchLink = anchors.find((a) => /watch the video/i.test(a.textContent));
  const videoAnchor = anchors.find((a) => isBrightcove(a) && a !== watchLink)
    ?? anchors.find(isBrightcove);

  const media = document.createElement('div');
  media.className = 'video-testimonial-media';
  let playerEl = null;
  if (videoAnchor) {
    const ids = getBrightcoveIds(new URL(videoAnchor.href));
    if (ids) {
      playerEl = createBrightcovePlayer(ids, { playsinline: true });
      media.append(playerEl);
      getBrightcoveScriptTag(ids.accountId, ids.playerId, playerEl);
    } else {
      // Unknown provider: keep the link.
      media.append(videoAnchor);
    }
  }

  // Tag text elements for the grid areas.
  if (title) title.classList.add('video-testimonial-title');
  if (quote) quote.classList.add('video-testimonial-quote');
  if (disclaimer) disclaimer.classList.add('video-testimonial-disclaimer');
  if (watchLink) {
    watchLink.classList.add('button', 'primary', 'video-testimonial-cta');
    watchLink.textContent = watchLink.textContent.trim();
  }

  // DOM order = mobile stack order.
  block.textContent = '';
  if (title) block.append(title);
  block.append(media);
  if (quote) block.append(quote);
  if (watchLink) block.append(watchLink);
  if (disclaimer) block.append(disclaimer);

  // CTA plays the inline player; stopPropagation skips the global exit interstitial.
  if (watchLink && playerEl) {
    watchLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      media.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const bigPlay = playerEl.querySelector('.vjs-big-play-button');
      if (bigPlay) bigPlay.click();
      else window.videojs?.getPlayer?.(playerEl.id)?.play();
    });
  }
}
