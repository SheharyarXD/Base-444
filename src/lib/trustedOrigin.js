// Origin allow-list for the backend base URL.
//
// Deliberately its own module with no browser dependencies, so it can be unit
// tested directly. app-params.js cannot be imported in a test environment —
// it resolves its parameters at module load and dereferences `window` — and a
// security check that is awkward to test is a security check that drifts.
//
// Why this exists: `app_base_url` is accepted from the query string and
// persisted to storage, and the SDK interpolates it straight into the URLs it
// navigates the browser to (`${appBaseUrl}/login?from_url=...`, and the
// matching sign-out path). Without validation, a link such as
// `?app_base_url=https://attacker.example` sends whoever clicks it to an
// attacker-controlled page at the moment they try to sign in — and because
// the value is stored, it keeps doing so on later visits, long after the
// crafted link itself is gone.

const TRUSTED_HOSTS = ['app.base44.com', 'base44.app'];
const TRUSTED_SUFFIX = '.base44.app';

/**
 * True when `value` is somewhere this app may legitimately treat as its
 * backend.
 *
 * @param {unknown} value        candidate origin, from a URL param or storage
 * @param {string|null} [currentOrigin]  the page's own origin, trusted implicitly
 */
export function isTrustedAppBaseUrl(value, currentOrigin) {
  if (!value || typeof value !== 'string') return false;

  let url;
  try {
    url = new URL(value);
  } catch {
    // Relative or malformed — cannot be a backend origin.
    return false;
  }

  // The app's own origin is trusted by definition. This keeps self-hosted
  // deployments and local development working without enumerating them, and
  // is safe because it is wherever the page is already running.
  if (currentOrigin && url.origin === currentOrigin) return true;

  // Anything else must be https. An http downgrade would put the session
  // token on the wire in clear text.
  if (url.protocol !== 'https:') return false;

  if (TRUSTED_HOSTS.includes(url.hostname)) return true;

  // The leading dot is what makes this a domain check rather than a string
  // check: it matches "anything.base44.app" while rejecting "notbase44.app",
  // and hostname comparison means "base44.app.attacker.example" fails too.
  return url.hostname.endsWith(TRUSTED_SUFFIX);
}
