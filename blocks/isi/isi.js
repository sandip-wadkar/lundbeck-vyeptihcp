/**
 * ISI (Important Safety Information) block.
 *
 * Authored with two rows:
 *   Row 1 – abbreviated content shown in the persistent fixed bottom bar.
 *   Row 2 – full inline content rendered in-page when the section scrolls into view.
 *
 * Behaviour:
 *   • When the ISI **section** is outside the viewport the fixed bar is visible.
 *   • Clicking the "+" expands the bar (adds `.full`); clicking "−" collapses it.
 *   • Once the section scrolls into view the bar hides and the inline content displays.
 *
 * @param {HTMLElement} block
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length < 2) return;

  /* ── 1. Split authored rows ─────────────────────────────────── */
  const abbreviatedRow = rows[0];
  const inlineRow = rows[1];

  /* Mark the inline row so CSS can control its visibility */
  inlineRow.classList.add('isi-inline');

  /* ── 2. Build the fixed bottom bar ──────────────────────────── */
  const bar = document.createElement('div');
  bar.className = 'isi-bar';
  bar.setAttribute('aria-label', 'Important Safety Information');

  /* Pin critical positioning AND a height cap inline so the bar is both fixed
     and bounded the instant it enters the DOM — isi.css/isi-tokens.css load
     async, and decorate() (JS import) typically resolves before that fetch
     completes. Without this, the bar briefly renders at full, unclipped
     content height anchored to bottom:0 (filling most of the viewport), then
     snaps down to the real collapsed height once the stylesheet lands —
     exactly the shift PageSpeed penalizes. 150px matches isi-tokens.css'
     mobile --isi-bar-height and covers the window before that custom
     property resolves. */
  bar.style.position = 'fixed';
  bar.style.left = '0';
  bar.style.right = '0';
  bar.style.bottom = '0';
  bar.style.boxSizing = 'border-box';
  bar.style.overflow = 'hidden';
  bar.style.maxHeight = 'var(--isi-bar-height, 150px)';
  /* Hidden until the next frame so the DOM's initial reflow (fonts, column
     layout, isi.css applying) isn't counted as a layout shift — elements with
     visibility:hidden are excluded from layout-shift scoring. */
  bar.style.visibility = 'hidden';

  /* Move the abbreviated content into the bar */
  const barContent = document.createElement('div');
  barContent.className = 'isi-bar-content';

  /* Re-parent abbreviated children into the bar content wrapper */
  const abbrCells = [...abbreviatedRow.children];
  abbrCells.forEach((cell) => {
    cell.classList.add('isi-bar-col');
    barContent.append(cell);
  });

  /* Toggle button (+/−) */
  const toggle = document.createElement('button');
  toggle.className = 'isi-bar-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Expand safety information');
  toggle.type = 'button';
  const icon = document.createElement('span');
  icon.className = 'isi-bar-toggle-icon';
  toggle.append(icon);

  bar.append(barContent);
  bar.append(toggle);

  /* Remove the now-empty abbreviated row from the block */
  abbreviatedRow.remove();

  /* Append bar to <body> so it sits outside the page flow */
  document.body.append(bar);

  /* ── 3. Expand / collapse toggle ────────────────────────────── */
  const setExpanded = (expanded) => {
    bar.classList.toggle('full', expanded);
    /* Drop the inline CLS-guard cap so the stylesheet's .isi-bar.full rule
       (height: auto, larger max-height) governs the expanded size — an inline
       max-height would out-specify it and block expansion. By the time any
       expand/collapse fires, isi.css has long since loaded. */
    bar.style.removeProperty('max-height');
    bar.style.removeProperty('overflow');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute(
      'aria-label',
      expanded ? 'Collapse safety information' : 'Expand safety information',
    );
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setExpanded(!bar.classList.contains('full'));
  });

  /* Clicking anywhere on the collapsed bar also expands it */
  bar.addEventListener('click', () => {
    if (!bar.classList.contains('full')) setExpanded(true);
  });

  /* Reveal the bar once its initial layout has settled (see the CLS guard in
     step 2). Two RAFs ensure a full style/layout pass has run so no
     post-reveal reflow is scored. */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bar.style.removeProperty('visibility');
    });
  });

  /* ── 4. IntersectionObserver – show/hide the bar ────────────── */
  const section = block.closest('.section');
  if (!section) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        bar.classList.add('isi-bar-hidden');
        setExpanded(false);
      } else {
        bar.classList.remove('isi-bar-hidden');
      }
    },
    { threshold: 0 },
  );

  observer.observe(section);
}
