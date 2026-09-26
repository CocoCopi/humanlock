# humanlock

Client-side detection of automated agents and AI computer-use for high-trust flows — test and entrance-exam delivery, account opening, checkout, anything where "is a real person driving this?" matters.

Zero runtime dependencies. Framework-agnostic core with React, Vue, Svelte and vanilla bindings. Signed verdicts for server-side scoring.

---

## Read this before you rely on it

This library **raises the cost of automation and catches the naive majority. It is a layer, not a wall.** Specifically:

- A vision-driven agent — one that looks at screenshots and clicks by coordinate, which is how modern computer-use models operate — sees *exactly the same pixels your user sees*. Nothing client-side can show it a different screen. Honeypots are invisible to it because it never reads the DOM.
- A determined adversary with a real browser profile, real input events, and humanised motion curves bypasses every check here.
- Your client bundle is fully readable and patchable by whoever runs it. **A client verdict is worth nothing on its own.**

What this actually buys you: cheap, decisive detection of headless stacks, script-injected events, driver-synthesised input, DOM-driven agents, and unnaturally rigid motor behaviour — plus a signed evidence trail your server can score. Treat it as one input to a decision, never the decision.

It is **not** a substitute for live proctoring, identity verification, or server-side analysis of answer patterns.

---

## What it looks at

| Category | Examples | Default weight |
| --- | --- | --- |
| `environment` | `navigator.webdriver`, automation user agents, empty plugin lists, software WebGL renderers, zero-sized viewports | 1.0 |
| `integrity` | patched `dispatchEvent` / `getBoundingClientRect` / `isTrusted`, automation globals (`__playwright`, `_phantom`), ChromeDriver DOM markers | 1.2 |
| `input` | events with `isTrusted === false`, pointer motion lacking device deltas | 1.1 |
| `honeypot` | interaction with decoy controls, offscreen form-field traps, decoy removal | 1.6 |
| `behavior` | pointer path straightness, micro-tremor residual, velocity constancy, positional teleports, typing cadence regularity, superhuman key intervals | 1.0 |

Each observation becomes a `Signal` with a severity. Signals are combined per category (probabilistically) and then across categories (weighted) into a `risk` score in `0..1`, plus a `confidence` in how much evidence the score rests on.

---

## Install

```bash
npm install @cococopi/humanlock
```

ESM and CJS builds, TypeScript types included. Node >= 18 if you use the server verifier.

---

## Quick start

### Vanilla

```html
<script type="module">
  import { mount, shouldChallenge } from "@cococopi/humanlock";

  const guard = mount({ sessionKey: window.__HL_SESSION_KEY });

  document.addEventListener("submit", async (event) => {
    event.preventDefault();
    const assessment = guard.assess();
    const trace = await guard.report(); // signed, or null without a sessionKey
    await fetch("/api/session/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trace }),
    });
  });
</script>
```

### React

```tsx
import { useHumanLock } from "@cococopi/humanlock/react";
import { shouldChallenge } from "@cococopi/humanlock";

function StartExam({ sessionKey }: { sessionKey: string }) {
  const { assessment, report } = useHumanLock({ sessionKey });

  const risky = assessment ? shouldChallenge(assessment) : false;
  if (!assessment) return <p>Preparing…</p>;

  return (
    <button disabled={risky} onClick={() => void report()}>
      {risky ? "Verifying your session…" : "Begin"}
    </button>
  );
}
```

### Vue

```vue
<script setup lang="ts">
import { useHumanLock } from "@cococopi/humanlock/vue";

const { assessment, report } = useHumanLock({ sessionKey: window.__HL_SESSION_KEY });
</script>

<template>
  <button :disabled="(assessment?.verdict ?? 'human') !== 'human'" @click="report">
    Begin
  </button>
</template>
```

### Svelte

```svelte
<script lang="ts">
  import { humanlock } from "@cococopi/humanlock/svelte";
  export let sessionKey: string;
</script>

<form use:humanlock={{ sessionKey }} on:submit={onSubmit}>…</form>
```

---

## Server-side verification

The client's verdict is untrusted. Verify the signature, then apply your own policy.

```ts
import { verifyTrace } from "@cococopi/humanlock/server";

app.post("/api/session/verify", (req, res) => {
  const result = verifyTrace(req.body.trace, sessionKeyFor(req), {
    maxAgeMs: 5 * 60 * 1000,
    minConfidence: 0.4,
  });

  if (!result.valid) {
    // "low_confidence" means "gather more evidence", not "cheat detected".
    return res.json({ action: result.reason === "low_confidence" ? "observe" : "reject" });
  }

  if (result.payload.verdict === "automated") {
    return res.json({ action: "human_review" });
  }
  return res.json({ action: "allow" });
});
```

`verifyTrace` checks the HMAC, the algorithm tag, freshness, and minimum confidence, and uses a timing-safe comparison. It does **not** prove the client was honest — a user can read their own session key. It proves the payload was not edited or replayed across sessions. Reject reused `nonce` values in your own store to close the replay hole.

---

## Configuration

```ts
createHumanLock({
  sessionKey: "per-session-secret", // required for signed traces
  strictMode: false,                // see the warning below
  observe: { pointer: true, keyboard: true, clipboard: true, focus: true, visibility: true },
  thresholds: { suspicious: 0.35, automated: 0.7 },
  weights: { honeypot: 1.6, integrity: 1.2 },
  honeypots: { enabled: true, count: 3, mode: "invisible", formFieldTrap: true },
  minPointerSamples: 12,
  minKeySamples: 6,
  environmentIntervalMs: 0,
  debug: false,
});
```

### `strictMode`

When `true`, **any** signal marked `automated` short-circuits the verdict to `"automated"`.

It defaults to `false` on purpose. Gating access on single automated-flagged signals — especially motor-precision behaviour scores — reliably fails screen-reader users, keyboard-only users, and people with motor impairments. That is discrimination, and in the US and EU it is an ADA / EAA problem, not just a support-ticket problem. Enable `strictMode` only behind a human review step.

---

## Accessibility

- Honeypots at the default `mode: "invisible"` are removed from the accessibility tree (`aria-hidden`) and from the tab order (`tabindex="-1"`), and are pointer-unreachable. No human can activate them by accident, including assistive-technology users.
- `mode: "visual"` renders decoys a real person *can* see and click. It raises the catch rate against coordinate-driven agents at the cost of confusing real users. Choose deliberately.
- Behavioural scores degrade for users with tremor, low dexterity, or atypical input devices. **Never make a motor score the sole basis for locking someone out**, and provide a human-review path.

---

## Signals reference

Every signal carries `{ id, category, severity, automated, detail }`. Common ids:

- `environment.webdriver_flag`, `environment.automation_user_agent`, `environment.software_renderer`
- `integrity.dispatch_event_patched`, `integrity.get_bounding_client_rect_patched`, `integrity.automation_global`, `integrity.driver_dom_marker`
- `input.synthetic_events`, `input.missing_pointer_delta`
- `honeypot.interacted`, `honeypot.form_field_filled`, `honeypot.removed`
- `behavior.pointer_teleport`, `behavior.pointer_dead_straight`, `behavior.pointer_no_tremor`, `behavior.pointer_constant_velocity`, `behavior.typing_metronomic`, `behavior.typing_superhuman`

Use `debug: true` to log full assessments while integrating.

---

## Performance notes

- The decoy layer adds a fixed handful of hidden nodes and one `MutationObserver`. Negligible.
- Pointer sampling is capped (`BehaviorAnalyzer` retains the most recent 600 samples by default) so long sessions cannot grow memory without bound.
- `assess()` is synchronous and allocation-light; call it on submit rather than on every frame. The React and Vue bindings poll once per second; drop the interval if you only need submit-time evaluation.

---

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

---

## License

MIT
