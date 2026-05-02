// `wb-fetch` — the agent's only network path.
//
// Registered as a just-bash custom command and made available inside
// the agent's bash sandbox. The agent calls a curl-like CLI:
//
//   wb-fetch [--secret=ID] [--auth-header=NAME] [--auth-format='Key {value}'] \
//            [-X METHOD] [-H 'k: v'] [-d 'body' | --data-binary @file] \
//            [-o /workbook/assets/output.bin] \
//            <url>
//
// Behavior:
//   - Sends a JSON request to the daemon's /wb/<token>/proxy endpoint.
//   - Daemon resolves --secret in the OS keychain, splices into the
//     named header per --auth-format, makes the HTTPS call.
//   - Response with body. If -o is given, writes body to that VFS
//     path (handles base64 binary correctly). Otherwise prints body
//     to stdout — utf8 directly when text, base64 with a
//     "wb-fetch: binary, base64-encoded" prefix line when not.
//
// Why this and not curl? Two reasons:
//   1. just-bash has no native HTTP. There's no curl/wget to expose.
//   2. The whole point of the secrets refactor is that the agent
//      never sees the API key. Forcing the only network path through
//      the daemon proxy enforces that — there's no way for the
//      agent to leak the key by echoing $FAL_API_KEY because
//      there's no $FAL_API_KEY in scope anymore.

import { defineCommand } from "just-bash";

const DAEMON_TOKEN_RE = /^\/wb\/([0-9a-f]{32})\/?/;

function resolveDaemonBinding() {
  if (typeof window === "undefined" || typeof location === "undefined") return null;
  const m = location.pathname.match(DAEMON_TOKEN_RE);
  if (!m) return null;
  return { origin: location.origin, token: m[1] };
}

/** Parse a wb-fetch invocation. Tolerant of either `--flag=value` or
 *  `--flag value` and `-X METHOD` / `-H 'k: v'` / `-d body`.
 *  Anything not a recognized flag is the URL (last positional). */
function parseArgs(args) {
  const out = {
    url: null,
    method: "GET",
    headers: {},
    body: null,
    bodyB64: false,
    auth: null,
    outPath: null,
  };
  let auth = { headerName: "Authorization", format: "{value}", secretId: null };
  let authTouched = false;
  let i = 0;
  function take(opt) {
    if (i + 1 >= args.length) {
      throw new Error(`wb-fetch: ${opt} requires a value`);
    }
    return args[++i];
  }
  while (i < args.length) {
    const a = args[i];
    let key = a, val = null;
    if (a.startsWith("--") && a.includes("=")) {
      const idx = a.indexOf("=");
      key = a.slice(0, idx);
      val = a.slice(idx + 1);
    }
    switch (key) {
      case "-X": case "--request":
        out.method = (val ?? take(key)).toUpperCase(); break;
      case "-H": case "--header": {
        const h = val ?? take(key);
        const idx = h.indexOf(":");
        if (idx <= 0) throw new Error(`wb-fetch: bad header ${JSON.stringify(h)} (use 'name: value')`);
        out.headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
        break;
      }
      case "-d": case "--data": case "--data-raw":
        out.body = val ?? take(key); break;
      case "--data-binary": {
        const v = val ?? take(key);
        // -d/--data accepts @path to load file; --data-binary same.
        if (v.startsWith("@")) {
          out._bodyFromFile = v.slice(1);
        } else {
          out.body = v;
        }
        break;
      }
      case "-o": case "--output":
        out.outPath = val ?? take(key); break;
      case "--secret":
        auth.secretId = val ?? take(key); authTouched = true; break;
      case "--auth-header":
        auth.headerName = val ?? take(key); authTouched = true; break;
      case "--auth-format":
        auth.format = val ?? take(key); authTouched = true; break;
      case "-h": case "--help":
        out._help = true; break;
      default:
        if (a.startsWith("-")) {
          throw new Error(`wb-fetch: unknown flag ${JSON.stringify(a)}`);
        }
        out.url = a;
    }
    i++;
  }
  if (authTouched) {
    if (!auth.secretId) {
      throw new Error("wb-fetch: --auth-header / --auth-format require --secret=ID");
    }
    out.auth = auth;
  }
  return out;
}

const HELP_TEXT = `wb-fetch — daemon-proxied HTTPS for the agent sandbox.

usage: wb-fetch [options] <url>

  -X METHOD              HTTP method (default GET)
  -H 'name: value'       extra request header (repeatable)
  -d, --data BODY        request body (utf8)
  --data-binary @PATH    load body from a file in the VFS
  -o, --output PATH      write response body to PATH instead of stdout
  --secret ID            keychain secret id to splice into the auth header
  --auth-header NAME     header to set with the secret (default Authorization)
  --auth-format TPL      template, '{value}' replaced (default '{value}')
  -h, --help             this message

The agent never sees secret values. They're stored daemon-side and
spliced into the request when --secret is named. Only HTTPS URLs
allowed; the daemon refuses everything else.
`;

export function makeWbFetchCommand() {
  return defineCommand("wb-fetch", async (args, ctx) => {
    let parsed;
    try {
      parsed = parseArgs(args);
    } catch (e) {
      return { stdout: "", stderr: `${e?.message ?? e}\n`, exitCode: 2 };
    }
    if (parsed._help || (!parsed.url && args.length === 0)) {
      return { stdout: HELP_TEXT, stderr: "", exitCode: 0 };
    }
    if (!parsed.url) {
      return { stdout: "", stderr: "wb-fetch: missing url\n", exitCode: 2 };
    }

    // Resolve --data-binary @path against the VFS.
    if (parsed._bodyFromFile) {
      try {
        // ctx.fs is the IFileSystem — readFile returns a string for
        // utf8 content. For binary we'd want bytes; just-bash exposes
        // readFile as utf8 only at the time of writing. Treat the
        // file as utf8 and ship as body. (Phase 2: extend just-bash
        // for binary read, then base64-encode here.)
        parsed.body = await ctx.fs.readFile(parsed._bodyFromFile);
      } catch (e) {
        return {
          stdout: "",
          stderr: `wb-fetch: --data-binary @${parsed._bodyFromFile}: ${e?.message ?? e}\n`,
          exitCode: 1,
        };
      }
    }

    const binding = resolveDaemonBinding();
    if (!binding) {
      return {
        stdout: "",
        stderr: "wb-fetch: not bound to a daemon session (open this workbook via http://127.0.0.1:47119/wb/<token>/)\n",
        exitCode: 1,
      };
    }

    let resp;
    try {
      const r = await fetch(`${binding.origin}/wb/${binding.token}/proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: parsed.url,
          method: parsed.method,
          headers: parsed.headers,
          body: parsed.body,
          body_b64: parsed.bodyB64,
          auth: parsed.auth ?? undefined,
        }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return {
          stdout: "",
          stderr: `wb-fetch: daemon returned ${r.status}: ${txt}\n`,
          exitCode: 1,
        };
      }
      resp = await r.json();
    } catch (e) {
      return {
        stdout: "",
        stderr: `wb-fetch: ${e?.message ?? e}\n`,
        exitCode: 1,
      };
    }

    const upstreamStatus = resp.status ?? 0;
    const upstreamLine = `wb-fetch: HTTP ${upstreamStatus}`;

    if (parsed.outPath) {
      try {
        if (resp.body_b64) {
          // Decode base64 → bytes → utf8-ish for VFS write. just-bash's
          // writeFile is string-only; we hex-encode-as-utf8 by passing
          // the raw byte string. atob() returns a binary string of
          // chars 0-255 which writeFile preserves byte-for-byte when
          // the FS persists as Uint8Array internally.
          const bin = atob(resp.body || "");
          await ctx.fs.writeFile(parsed.outPath, bin);
        } else {
          await ctx.fs.writeFile(parsed.outPath, resp.body || "");
        }
      } catch (e) {
        return {
          stdout: "",
          stderr: `wb-fetch: write ${parsed.outPath}: ${e?.message ?? e}\n`,
          exitCode: 1,
        };
      }
      return {
        stdout: `${upstreamLine}, wrote ${parsed.outPath}\n`,
        stderr: "",
        exitCode: upstreamStatus >= 400 ? 1 : 0,
      };
    }

    if (resp.body_b64) {
      // Print a header line so the agent knows it's binary, then the
      // base64. Most agent skills will use -o for binary so this
      // path exists mainly for debugging.
      return {
        stdout: `${upstreamLine}\nwb-fetch: binary, base64-encoded\n${resp.body || ""}\n`,
        stderr: "",
        exitCode: upstreamStatus >= 400 ? 1 : 0,
      };
    }

    return {
      stdout: (resp.body || "") + (resp.body?.endsWith("\n") ? "" : "\n"),
      stderr: "",
      exitCode: upstreamStatus >= 400 ? 1 : 0,
    };
  });
}
