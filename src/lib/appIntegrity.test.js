import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Structural invariants that no single module owns, and that the other safety
// nets miss: linting here does not flag undefined identifiers, and type
// checking is scoped to src/pages/**/*.jsx plus a little of src/components,
// so src/lib, src/api, src/hooks and most components are outside it.
//
// Each rule below exists because the defect it describes was actually found in
// the code, not because it seemed possible.

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..");
const SKIP_DIRS = new Set(["ui", "node_modules"]);

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) collect(full, out);
    } else if (/\.jsx?$/.test(entry) && !/\.test\./.test(entry)) {
      out.push({ path: full, rel: full.replace(SRC, "src"), text: readFileSync(full, "utf8") });
    }
  }
  return out;
}

const files = collect(SRC);
const read = (rel) => files.find((f) => f.rel.replace(/\\/g, "/") === rel).text;

/** Strip comments so explanatory prose does not satisfy or trip a rule. */
function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("retired contractor directory stays retired", () => {
  // Browsing was replaced by map-driven discovery. The /browse path survives
  // only as a redirect, and that redirect does not carry the query string —
  // so a link like /browse?category=Plumbing silently dropped the category.
  it("no component links to the retired /browse route", () => {
    const offenders = files
      .filter((f) => !f.rel.endsWith("App.jsx"))
      .filter((f) => /to=\{?["'`]\/browse/.test(codeOnly(f.text)))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("App.jsx still redirects /browse rather than 404ing it", () => {
    // Old links and bookmarks should land somewhere sensible.
    const app = read("src/App.jsx");
    expect(app).toMatch(/path="\/browse"/);
    expect(app).toMatch(/jobs-map/);
  });
});

describe("category deep-link", () => {
  const postJob = read("src/pages/PostJob.jsx");

  it("PostJob reads a category from the query string", () => {
    expect(postJob).toContain('searchParams.get("category")');
  });

  it("PostJob accepts only a real category from the query string", () => {
    // An unvalidated value would be submitted as a category the booking
    // record's own list does not permit.
    expect(postJob).toMatch(/SERVICE_CATEGORIES\.includes\(\s*searchParams\.get\("category"\)/);
  });

  it("CategoryCard points at that deep-link", () => {
    expect(read("src/components/CategoryCard.jsx")).toContain("/post-job?category=");
  });
});

describe("screens cannot strand the user on a loading state", () => {
  // Both of these called an async load() with nothing catching a rejection,
  // and cleared the loading flag only on the success path. Any backend error
  // left the page spinning forever, with no message and no way out.
  const SCREENS = [
    "src/pages/Inbox.jsx",
    "src/pages/RealtorDashboard.jsx",
    "src/pages/Bookings.jsx",
    "src/pages/Account.jsx",
  ];

  for (const rel of SCREENS) {
    it(`${rel.split("/").pop()} clears its loading flag on failure as well as success`, () => {
      const code = codeOnly(read(rel));
      // Either a finally block, or an explicit .finally() on the load promise.
      const hasFinally = /\bfinally\s*[({]/.test(code);
      expect(hasFinally).toBe(true);
    });

    it(`${rel.split("/").pop()} handles a failed load rather than throwing`, () => {
      const code = codeOnly(read(rel));
      expect(/\.catch\(|catch\s*\(|catch\s*\{/.test(code)).toBe(true);
    });
  }

  it("RealtorDashboard tolerates a null user instead of throwing on user_type", () => {
    // `me.user_type` threw a TypeError when auth returned nothing, which was
    // the very case the catch needed to survive.
    const code = read("src/pages/RealtorDashboard.jsx");
    expect(code).not.toMatch(/\bme\.user_type\b/);
    expect(code).toMatch(/me\?\.user_type/);
  });
});

describe("every toast call site imports toast", () => {
  // Linting here does not report undefined identifiers, and type checking
  // does not cover src/lib, src/api, src/hooks or most of src/components — so
  // a missing import in those areas would only surface at runtime.
  for (const f of files) {
    const code = codeOnly(f.text);
    if (!/\btoast\.[a-z]/.test(code)) continue;
    it(`${f.rel.split(/[\\/]/).pop()} imports toast`, () => {
      expect(code).toMatch(/import\s*\{[^}]*\btoast\b[^}]*\}\s*from\s*["']sonner["']/);
    });
  }
});
