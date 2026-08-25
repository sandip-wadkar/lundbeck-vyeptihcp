/*
 * Video Block
 * Show a video referenced by a link
 * https://www.hlx.live/developer/block-collection/video
 */

import { ensureDOMPurify } from '../../scripts/scripts.js';
import { DOMPURIFY } from '../../scripts/aem.js';
import {
  getYoutubeEmbedHtml, getVimeoEmbedHtml, getBrightcoveIds, getBrightcoveScriptTag,
  createBrightcovePlayer,
} from '../../scripts/utils.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// the shared DOMPURIFY profile strips <iframe>; the youtube/vimeo embeds below need it
const IFRAME_DOMPURIFY = {
  ...DOMPURIFY,
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'title'],
};

async function htmlToElement(html) {
  await ensureDOMPurify();
  const temp = document.createElement('div');
  temp.innerHTML = window.DOMPurify.sanitize(html, IFRAME_DOMPURIFY);
  return temp.firstElementChild;
}

function getVideoElement(source, autoplay, background) {
  const video = document.createElement('video');
  video.setAttribute('controls', '');
  if (autoplay) video.setAttribute('autoplay', '');
  if (background) {
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.removeAttribute('controls');
    video.addEventListener('canplay', () => {
      video.muted = true;
      if (autoplay) video.play();
    });
  }

  const sourceEl = document.createElement('source');
  sourceEl.setAttribute('src', source);
  sourceEl.setAttribute('type', `video/${source.split('.').pop()}`);
  video.append(sourceEl);

  return video;
}

const loadVideoEmbed = async (block, link, autoplay, background) => {
  if (block.dataset.embedLoaded === 'true') {
    return;
  }
  const url = new URL(link);

  const isYoutube = link.includes('youtube') || link.includes('youtu.be');
  const isVimeo = link.includes('vimeo');
  // Brightcove iframe hosts use .net; imported/authored links sometimes use non-resolving .com
  const isBrightcove = url.hostname === 'players.brightcove.com' || url.hostname === 'players.brightcove.net';
  const brightcoveIds = isBrightcove ? getBrightcoveIds(url) : null;

  if (isYoutube) {
    const embedWrapper = await htmlToElement(getYoutubeEmbedHtml(url, autoplay, background));
    block.append(embedWrapper);
    embedWrapper.querySelector('iframe').addEventListener('load', () => {
      block.dataset.embedLoaded = true;
    });
  } else if (isVimeo) {
    const embedWrapper = await htmlToElement(getVimeoEmbedHtml(url, autoplay, background));
    block.append(embedWrapper);
    embedWrapper.querySelector('iframe').addEventListener('load', () => {
      block.dataset.embedLoaded = true;
    });
  } else if (brightcoveIds) {
    const { accountId, playerId } = brightcoveIds;
    const playerEl = createBrightcovePlayer(brightcoveIds, { autoplay, playsinline: true, background });
    block.append(playerEl);
    playerEl.addEventListener('canplay', () => {
      block.dataset.embedLoaded = true;
    });
    getBrightcoveScriptTag(accountId, playerId, playerEl);
  } else {
    const videoEl = getVideoElement(link, autoplay, background);
    block.append(videoEl);
    videoEl.addEventListener('canplay', () => {
      block.dataset.embedLoaded = true;
    });
  }
};

export default async function decorate(block) {
  const placeholder = block.querySelector('picture');
  const link = block.querySelector('a').href;
  const titleEl = [...block.querySelectorAll('p')].find(
    (p) => p.textContent.trim() && !p.querySelector('a') && !p.querySelector('picture'),
  );
  const title = titleEl?.textContent.trim();
  block.textContent = '';
  block.dataset.embedLoaded = false;

  const autoplay = block.classList.contains('autoplay');
  if (placeholder) {
    block.classList.add('placeholder');
    const wrapper = document.createElement('div');
    wrapper.className = 'video-placeholder';
    wrapper.append(placeholder);

    if (title || !autoplay) {
      const overlay = document.createElement('div');
      overlay.className = 'video-placeholder-overlay';

      if (title) {
        const titleWrapper = document.createElement('p');
        titleWrapper.className = 'video-placeholder-title';
        titleWrapper.textContent = title;
        overlay.append(titleWrapper);
      }

      if (!autoplay) {
        overlay.insertAdjacentHTML(
          'beforeend',
          '<div class="video-placeholder-play"><button type="button" title="Play"></button></div>',
        );
        overlay.addEventListener('click', () => {
          wrapper.remove();
          loadVideoEmbed(block, link, true, false);
        });
      }
      wrapper.append(overlay);
    }
    block.append(wrapper);
  }

  if (!placeholder || autoplay) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        const playOnLoad = autoplay && !prefersReducedMotion.matches;
        loadVideoEmbed(block, link, playOnLoad, autoplay);
      }
    });
    observer.observe(block);
  }
}
