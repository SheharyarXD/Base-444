import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Guards the customer-facing copy against claims the platform cannot back up.
//
// This has been a recurring defect rather than a hypothetical one: Phase 2
// removed a "Background-checked and insured" banner because neither existed,
// and this pass found the Terms still claiming "While we vet contractors",
// the home page promising "Quality Guaranteed" while the Terms disclaimed
// exactly that, and two paragraphs naming a different product entirely.
//
// A failure here does not necessarily mean the copy is wrong — it means a
// claim was introduced that needs a real feature behind it, or needs
// rewording. Read the comment on the matching rule before editing it.

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..");

// src/components/ui is unmodified shadcn primitives — no product copy.
const SKIP_DIRS = new Set(["ui", "node_modules"]);

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) collect(full, out);
    } else if (/\.(jsx?|tsx?)$/.test(entry) && !/\.test\./.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = collect(SRC).map((f) => ({ path: f, text: readFileSync(f, "utf8") }));

/** Strip // and /* *\/ comments so rationale comments don't trip the rules. */
function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// A disclaimer is the opposite of a claim: "Linked does not background-check
// providers" must pass, while "we background-check every provider" must fail.
// So a match is only reported when the words immediately before it are not a
// negation. Without this the rules punish the very sentences that fix them.

// Written with plain string checks rather than a regex: an earlier version of
// this helper was generated with an escape that produced a literal control
// character instead of a word boundary, and silently never matched.
const NEGATORS = ["not", "never", "no", "cannot", "without", "doesn't"];

function isNegated(before) {
  // Only the current sentence counts — a negation two sentences earlier says
  // nothing about this claim.
  const sentence = before.slice(before.lastIndexOf(".") + 1).toLowerCase();
  return NEGATORS.some((w) => sentence.split(/[^a-z']+/).includes(w));
}

function findClaim(pattern) {
  const hits = [];
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  for (const { path, text } of files) {
    const stripped = codeOnly(text);
    for (const m of stripped.matchAll(global)) {
      const before = stripped.slice(Math.max(0, m.index - 80), m.index);
      if (isNegated(before)) continue;
      hits.push(`${path.replace(SRC, "src")}: ${m[0].slice(0, 80)}`);
    }
  }
  return hits;
}

describe("customer-facing trust claims", () => {
  it("never claims the platform vets, screens, or background-checks providers", () => {
    // Nothing in the platform performs any of these. Providers submit license
    // and business details; a reviewer marks the submission verified. That is
    // a document review, not vetting or a background check.
    expect(findClaim(/\b(we\s+vet|background[- ]?check(ed)?|we\s+screen|fully\s+vetted)\b/i)).toEqual([]);
  });

  it("never claims provider insurance is verified or provided", () => {
    // There is no insurance field, no insurance upload, and no insurance
    // check anywhere in the product.
    expect(findClaim(/\b(insured|insurance\s+verified|verified\s+insurance)\b/i)).toEqual([]);
  });

  it("never guarantees workmanship or quality, which the Terms explicitly disclaim", () => {
    expect(findClaim(/\b(quality\s+guaranteed|guaranteed\s+quality|workmanship\s+guarantee)\b/i)).toEqual([]);
  });

  it("refers to the product by its actual name", () => {
    // Two Terms paragraphs named a different product outright.
    expect(findClaim(/\bInstant (does not|provides)\b/)).toEqual([]);
  });

  it("does not point users at the retired contractor directory", () => {
    // Browsing was deliberately retired in favour of map-driven discovery;
    // /browse only survives as a redirect. Copy must not advertise it.
    expect(findClaim(/\bbrowse page\b/i)).toEqual([]);
  });
});

describe("Terms & Conditions content", () => {
  const terms = files.find((f) => f.path.endsWith("Disclaimer.jsx"));

  it("exists", () => {
    expect(terms).toBeTruthy();
  });

  it("states the platform does not employ or supervise providers", () => {
    expect(terms.text).toMatch(/does not employ/i);
  });

  it("discloses location tracking, which the product now performs", () => {
    expect(terms.text).toMatch(/Location Tracking/);
    expect(terms.text).toMatch(/on the way/i);
  });

  it("tells users location sharing stops when the job ends", () => {
    expect(terms.text).toMatch(/completed or cancelled/i);
  });

  it("does not claim location history is retained, since none is kept", () => {
    expect(terms.text).toMatch(/do not keep a location history/i);
  });
});

describe("paid plans reflect what the product delivers", () => {
  const plans = files.find((f) => f.path.endsWith("Plans.jsx")).text;

  // Extracted with plain string slicing rather than a multi-line regex:
  // generating one here has twice produced a literal newline inside the
  // pattern and broken the file.
  function offeredIds() {
    const key = 'const plansByType = {';
    const from = plans.indexOf(key) + key.length;
    const body = plans.slice(from, plans.indexOf('};', from));
    return new Set((body.match(/"[a-z_]+"/g) || []).map((x) => x.slice(1, -1)));
  }

  // Each of these grants a flag in the purchase-completion function. A plan is
  // only honest to sell if something in the app then reads that flag.
  it("does not offer subscriptions whose entitlement nothing reads", () => {
    const offered = offeredIds();
    // user.plan is written by these two and read by nothing.
    expect(offered.has("handyman_pro")).toBe(false);
    expect(offered.has("business_pro")).toBe(false);
  });

  it("still offers the add-ons that do deliver", () => {
    const offered = offeredIds();
    // is_priority -> highlighted map marker; featured_until -> profile badge;
    // is_verified_pro -> Pro badge. All three have real consumers.
    expect(offered.has("priority_booking")).toBe(true);
    expect(offered.has("featured_listing")).toBe(true);
    expect(offered.has("verified_pro")).toBe(true);
  });

  it("keeps the withdrawn plans defined so existing subscribers still work", () => {
    // Removing the definitions would break checkout lookup and cancellation
    // for anyone already paying.
    expect(plans).toMatch(/id: "handyman_pro"/);
    expect(plans).toMatch(/id: "business_pro"/);
  });

  it("advertises no feature line for a plan that is not offered", () => {
    for (const pid of ["handyman_pro", "business_pro"]) {
      const seg = plans.slice(plans.indexOf(`id: "${pid}"`));
      const feats = seg.slice(seg.indexOf("features: ["), seg.indexOf("]", seg.indexOf("features: [")));
      expect(feats.match(/"[^"]+"/g)).toBeNull();
    }
  });
});
