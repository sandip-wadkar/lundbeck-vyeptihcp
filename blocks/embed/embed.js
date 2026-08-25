/*
 * Embed Block
 * Show videos and social posts directly on your page
 * https://www.hlx.live/developer/block-collection/embed
 */
import { DOMPURIFY } from '../../scripts/aem.js';
import {
  getYoutubeEmbedHtml, getVimeoEmbedHtml, getBrightcoveIds, createBrightcovePlayer,
  getBrightcoveScriptTag,
} from '../../scripts/utils.js';

// the shared DOMPURIFY profile strips <iframe>; the youtube/vimeo embeds below need it
const IFRAME_DOMPURIFY = {
  ...DOMPURIFY,
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'title'],
};

const loadScript = (url, callback, type) => {
  const head = document.querySelector('head');
  const script = document.createElement('script');
  script.src = url;
  if (type) {
    script.setAttribute('type', type);
  }
  script.onload = callback;
  head.append(script);
  return script;
};

/* Add iframe wrapper to the embed */
const getDefaultEmbed = (url) => `<div class="iframe-wrapper">
    <iframe src="${url.href}" allowfullscreen=""
      scrolling="no" allow="encrypted-media" title="Content from ${url.hostname}" loading="lazy">
    </iframe>
  </div>`;

const embedTwitter = (url) => {
  if (!url.href.startsWith('https://twitter.com')) {
    url.href = url.href.replace('https://x.com', 'https://twitter.com');
  }
  const embedHTML = `<blockquote class="twitter-tweet"><a href="${url.href}"></a></blockquote>`;
  loadScript('https://platform.twitter.com/widgets.js');
  return embedHTML;
};

/* Brightcove: embed the player in-page (load its player script + render a
   <video-js> element) rather than via iframe, so the page's own CSS can style
   the controls (e.g. the big play button) to match the source. */
const embedBrightcove = (block, ids, autoplay) => {
  const videoEl = createBrightcovePlayer(ids, { autoplay, fluid: true });
  block.append(videoEl);
  getBrightcoveScriptTag(ids.accountId, ids.playerId, videoEl);
};

const loadEmbed = (block, link, autoplay) => {
  if (block.classList.contains('embed-is-loaded')) {
    return;
  }

  const embedUrl = new URL(link);

  // Brightcove uses an in-page player (special-cased: it inserts a <video-js>
  // element and loads the player script, rather than returning embed HTML).
  const brightcove = link.includes('players.brightcove.net') ? getBrightcoveIds(embedUrl) : null;
  if (brightcove) {
    block.classList = 'block embed embed-brightcove';
    embedBrightcove(block, brightcove, autoplay);
    block.classList.add('embed-is-loaded');
    return;
  }

  const EMBEDS_CONFIG = [
    {
      match: ['youtube', 'youtu.be'],
      embed: (url, play) => getYoutubeEmbedHtml(url, play),
    },
    {
      match: ['vimeo'],
      embed: (url, play) => getVimeoEmbedHtml(url, play),
    },
    {
      match: ['twitter', 'x.com'],
      embed: embedTwitter,
    },
  ];
  const config = EMBEDS_CONFIG.find((e) => e.match.some((match) => link.includes(match)));
  const url = new URL(link);
  if (config) {
    const embedHtml = config.embed(url, autoplay);
    block.innerHTML = (window.DOMPurify?.sanitize(embedHtml, IFRAME_DOMPURIFY))
      ?? embedHtml;
    block.classList = `block embed embed-${config.match[0]}`;
  } else {
    const defaultHtml = getDefaultEmbed(url);
    block.innerHTML = (window.DOMPurify?.sanitize(defaultHtml,IFRAME_DOMPURIFY))
      ?? defaultHtml;
    block.classList = 'block embed';
  }
  block.classList.add('embed-is-loaded');
};

export default function decorate(block) {
  const placeholder = block.querySelector('picture');
  const link = block.querySelector('a').href;
  block.textContent = '';

  if (placeholder) {
    const wrapper = document.createElement('div');
    wrapper.className = 'embed-placeholder';
    const placeholderHtml = '<div class="embed-placeholder-play"><button type="button" title="Play"></button></div>';
    wrapper.innerHTML = (window.DOMPurify?.sanitize(placeholderHtml, IFRAME_DOMPURIFY))
      ?? placeholderHtml;
    wrapper.prepend(placeholder);
    wrapper.addEventListener('click', () => {
      loadEmbed(block, link, true);
    });
    block.append(wrapper);
  } else {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        loadEmbed(block, link);
      }
    });
    observer.observe(block);
  }
}
