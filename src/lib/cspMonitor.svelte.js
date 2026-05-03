// Global CSP-violation monitor.
//
// When the workbook runtime serves this page, the daemon attaches a
// strict Content-Security-Policy header. Anything not allow-listed
// (cross-origin script tags, fetches to third-party APIs, fonts from
// CDNs) gets blocked silently from the network's perspective — the
// browser fires a `securitypolicyviolation` event and that's it. Code
// that doesn't know to check for that condition will retry forever.
//
// This module gives every caller one place to ask:
//   1. did we just hit a CSP block on <directive> for <url>?
//   2. show the user a clean, copy-pasteable summary so they can
//      file a useful bug instead of pasting 200 lines of console.
//
// Pattern at call sites:
//
//   try { await fetch(url); }
//   catch (e) {
//     if (cspMonitor.wasBlocked(url)) {
//       // back off — retry won't help until the policy changes
//       return;
//     }
//     throw e;
//   }
//
// The CspViolationsCard component renders the visible surface. It
// mounts only when there's at least one violation, so a clean session
// has zero UI overhead.

class CspMonitor {
  // Deduped by `${directive}::${blockedURI}` so the same blocked URL
  // hammered N times shows up as one row with a count.
  violations = $state(/** @type {Array<{
    directive: string,
    blockedURI: string,
    sourceFile: string | null,
    lineNumber: number | null,
    firstSeen: number,
    lastSeen: number,
    count: number,
  }>} */ ([]));

  // Per-violation suppression: the user clicked "dismiss" on the card.
  // Stored as a Set of dedup keys so dismissed entries stay hidden
  // even when the same violation re-fires (which it will, on every
  // re-render).
  #dismissed = new Set();

  constructor() {
    if (typeof document === "undefined") return;
    // Both document and window receive the event in Chromium; document
    // is the spec-blessed target. Listening on both is harmless.
    document.addEventListener("securitypolicyviolation", (e) => this.#record(e));
  }

  #record(/** @type {SecurityPolicyViolationEvent} */ e) {
    const directive = e.violatedDirective || e.effectiveDirective || "unknown";
    const blockedURI = e.blockedURI || "(inline)";
    const key = `${directive}::${blockedURI}`;
    if (this.#dismissed.has(key)) return;

    const now = Date.now();
    const existing = this.violations.find(
      (v) => v.directive === directive && v.blockedURI === blockedURI,
    );
    if (existing) {
      existing.lastSeen = now;
      existing.count++;
      return;
    }
    this.violations = [
      ...this.violations,
      {
        directive,
        blockedURI,
        sourceFile: e.sourceFile || null,
        lineNumber: e.lineNumber || null,
        firstSeen: now,
        lastSeen: now,
        count: 1,
      },
    ];
  }

  /** Did the page record a CSP block whose blockedURI matches `url`?
   *  Used by callers that want to back off from retry loops when the
   *  failure is structural (CSP) rather than transient (network). */
  wasBlocked(url) {
    if (!url) return false;
    return this.violations.some((v) => {
      // blockedURI is sometimes the full URL, sometimes just origin.
      if (v.blockedURI === url) return true;
      try {
        const u = new URL(url);
        return v.blockedURI === u.origin || url.startsWith(v.blockedURI);
      } catch {
        return false;
      }
    });
  }

  dismiss(directive, blockedURI) {
    const key = `${directive}::${blockedURI}`;
    this.#dismissed.add(key);
    this.violations = this.violations.filter(
      (v) => !(v.directive === directive && v.blockedURI === blockedURI),
    );
  }

  dismissAll() {
    for (const v of this.violations) {
      this.#dismissed.add(`${v.directive}::${v.blockedURI}`);
    }
    this.violations = [];
  }

  /** A compact, copy-pasteable summary suitable for bug reports. */
  formatForClipboard() {
    if (this.violations.length === 0) return "";
    const lines = [
      "Workbook CSP violations",
      "=======================",
      `recorded at: ${new Date().toISOString()}`,
      `page:        ${typeof location !== "undefined" ? location.href : "?"}`,
      `agent:       ${typeof navigator !== "undefined" ? navigator.userAgent : "?"}`,
      "",
    ];
    for (const v of this.violations) {
      lines.push(`- directive:    ${v.directive}`);
      lines.push(`  blocked:      ${v.blockedURI}`);
      if (v.sourceFile) {
        lines.push(`  source:       ${v.sourceFile}${v.lineNumber ? `:${v.lineNumber}` : ""}`);
      }
      lines.push(`  occurrences:  ${v.count}`);
      lines.push("");
    }
    lines.push("Fix path: bundle the dependency at build time, or route the");
    lines.push("call through /wb/<token>/proxy (workbook daemon) instead of");
    lines.push("hitting the third-party origin directly.");
    return lines.join("\n");
  }
}

export const cspMonitor = new CspMonitor();
