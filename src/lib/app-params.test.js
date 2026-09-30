import { describe, it, expect } from "vitest";
import { isTrustedAppBaseUrl } from "./trustedOrigin.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// app-params.js cannot simply be imported here: it runs getAppParams() at
// module load and dereferences `window.location.href`, which does not exist in
// vitest's node environment. So this reads the source the same way
// base44/entities/rls.test.js reads the entity JSON — enough to pin the two
// fallback constants, which is where the real risk of drift is.
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "app-params.js"), "utf8");
const appJson = JSON.parse(
  readFileSync(join(here, "..", "..", "base44", ".app.jsonc"), "utf8"),
);

function constant(name) {
  const m = source.match(new RegExp(`export const ${name} = ['"\`]([^'"\`]+)['"\`]`));
  return m ? m[1] : null;
}

describe("app-params fallbacks", () => {
  // Without these, a fresh clone has no backend at all: every .env file is
  // gitignored, so both env vars are undefined and the SDK templated `null`
  // into its URLs — "Sign In" navigated to `null/login`.
  it("declares a fallback app id", () => {
    expect(constant("DEFAULT_APP_ID")).toBeTruthy();
  });

  it("keeps DEFAULT_APP_ID equal to the id in base44/.app.jsonc", () => {
    expect(constant("DEFAULT_APP_ID")).toBe(appJson.id);
  });

  it("declares a fallback app base url that is an absolute https origin", () => {
    const url = constant("DEFAULT_APP_BASE_URL");
    expect(url).toBeTruthy();
    expect(() => new URL(url)).not.toThrow();
    expect(new URL(url).protocol).toBe("https:");
    // A trailing slash would produce "https://host//login", since the SDK
    // templates this directly as `${appBaseUrl}/login`.
    expect(url.endsWith("/")).toBe(false);
  });

  it("applies each fallback only after the param/env lookup, so it never wins over a real value", () => {
    // Precedence must stay: ?app_base_url= > VITE_ env > localStorage > fallback.
    // Passing the fallback as getAppParamValue's `defaultValue` would break
    // that — that function persists and returns defaultValue *before* it
    // consults localStorage, so a platform-supplied origin already in storage
    // would be silently overridden.
    // Whitespace-collapsed, because the || and the constant sit on separate
    // lines. DEFAULT_APP_ID is applied with a trailing ||; the base URL now
    // resolves through resolveAppBaseUrl(), which keeps the same precedence
    // and additionally refuses an origin outside the allow-list.
    const flat = source.replace(/\s+/g, "");
    expect(flat).toContain("||DEFAULT_APP_ID");
    expect(flat).toContain("returnDEFAULT_APP_BASE_URL;");
    for (const name of ["DEFAULT_APP_ID", "DEFAULT_APP_BASE_URL"]) {
      expect(source).not.toMatch(new RegExp(`defaultValue:\s*${name}`));
    }
  });
});

describe("vite dev proxy fallback", () => {
  const viteConfig = readFileSync(join(here, "..", "..", "vite.config.js"), "utf8");

  it("mirrors the same default origin as app-params.js", () => {
    const m = viteConfig.match(/DEFAULT_APP_BASE_URL = ['"]([^'"]+)['"]/);
    expect(m).toBeTruthy();
    expect(m[1]).toBe(constant("DEFAULT_APP_BASE_URL"));
  });

  it("still lets a real .env value take precedence over the default", () => {
    expect(viteConfig).toMatch(/env\.VITE_BASE44_APP_BASE_URL\s*\|\|\s*DEFAULT_APP_BASE_URL/);
  });

  it("proxies /api so AuthContext's relative calls reach a backend", () => {
    // AuthContext calls the relative path `/api/apps/public/...`; with no proxy
    // Vite answers it with index.html and auth fails with an opaque error.
    expect(viteConfig).toMatch(/['"]\/api['"]\s*:/);
    expect(viteConfig).toMatch(/changeOrigin:\s*true/);
  });
});

// The origin allow-list. `app_base_url` is attacker-controllable via the query
// string and is persisted, and the SDK navigates the browser to
// `${appBaseUrl}/login?...` — so an unvalidated value is a phishing redirect
// that survives into later visits.
describe("app_base_url origin validation", () => {
  const APP_ORIGIN = "https://linked-abc123.base44.app";

  it("accepts the platform host", () => {
    expect(isTrustedAppBaseUrl("https://app.base44.com", APP_ORIGIN)).toBe(true);
  });

  it("accepts any app subdomain on the platform domain", () => {
    expect(isTrustedAppBaseUrl("https://linked-abc123.base44.app", APP_ORIGIN)).toBe(true);
  });

  it("accepts the app's own origin, which keeps self-hosted setups working", () => {
    expect(isTrustedAppBaseUrl("http://localhost:5173", "http://localhost:5173")).toBe(true);
  });

  it("rejects an unrelated attacker origin", () => {
    expect(isTrustedAppBaseUrl("https://attacker.example", APP_ORIGIN)).toBe(false);
  });

  it("rejects a lookalike domain that merely ends in the same letters", () => {
    expect(isTrustedAppBaseUrl("https://notbase44.app", APP_ORIGIN)).toBe(false);
    expect(isTrustedAppBaseUrl("https://evilbase44.app", APP_ORIGIN)).toBe(false);
  });

  it("rejects a domain that only contains the trusted name as a prefix", () => {
    expect(isTrustedAppBaseUrl("https://base44.app.attacker.example", APP_ORIGIN)).toBe(false);
  });

  it("rejects a trusted name placed in the path rather than the host", () => {
    expect(isTrustedAppBaseUrl("https://attacker.example/app.base44.com", APP_ORIGIN)).toBe(false);
  });

  it("rejects an http downgrade of a trusted host", () => {
    // Would otherwise expose the session token in transit.
    expect(isTrustedAppBaseUrl("http://app.base44.com", APP_ORIGIN)).toBe(false);
  });

  it("rejects javascript: and data: values", () => {
    expect(isTrustedAppBaseUrl("javascript:alert(1)", APP_ORIGIN)).toBe(false);
    expect(isTrustedAppBaseUrl("data:text/html,<h1>hi</h1>", APP_ORIGIN)).toBe(false);
  });

  it("rejects malformed, empty and non-string values", () => {
    for (const v of ["", "   ", "not a url", null, undefined, 42, {}]) {
      expect(isTrustedAppBaseUrl(v, APP_ORIGIN)).toBe(false);
    }
  });

  it("is applied to the resolved value, not merely exported", () => {
    // Guards against the helper being defined but never wired in.
    expect(source).toMatch(/isTrustedAppBaseUrl\(candidate/);
    expect(source).toMatch(/removeItem\("base44_app_base_url"\)/);
  });
});
