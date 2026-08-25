import { getBlockId } from '../../scripts/scripts.js';
import { loadScript } from '../../scripts/aem.js';

/**
 * Coverage Finder block — mounts the MMIT `<coverage-finder>` web component.
 *
 * The source site renders this interactive coverage-lookup tool by loading a vendor
 * clientlib that self-registers a custom element (`customElements.define('coverage-finder', …)`),
 * then placing `<coverage-finder token="…">`. It CANNOT be an iframe: the vendor exposes no
 * standalone embeddable URL and the source page sets X-Frame-Options. So we replicate the
 * source: load the vendor script, then mount the element with its authored token.
 *
 * Authored content (rows, each a single cell):
 *   Row 1: the vendor script URL (a link or plain text)
 *   Row 2: the JWT token string for this product/client (public client-side config)
 * Both are read from the block DOM — never hard-coded here — so authors can update them.
 */
export default async function decorate(block) {
  const blockId = getBlockId('coverage-finder');
  block.setAttribute('id', blockId);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-label', 'Coverage Finder');

  const rows = [...block.children];
  const cellText = (row) => (row ? row.textContent.trim() : '');
  const firstLink = (row) => (row ? row.querySelector('a[href]') : null);

  // Row 1: vendor script URL (prefer an anchor href, else the trimmed text).
  const scriptRow = rows[0];
  const scriptUrl = (firstLink(scriptRow) && firstLink(scriptRow).getAttribute('href'))
    || cellText(scriptRow);

  // Row 2: token (JWT config for this product/client).
  const token = cellText(rows[1]);

  block.textContent = '';

  if (!scriptUrl) return;

  const mount = document.createElement('coverage-finder');
  if (token) mount.setAttribute('token', token);
  block.append(mount);
    await loadScript(scriptUrl, { async: '' });
}
