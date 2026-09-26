import { describe, expect, it } from "vitest";
import { collectEnvironmentSignals } from "../src/signals/environment.js";

interface MockOptions {
  webdriver?: boolean;
  userAgent?: string;
  plugins?: number;
  mimeTypes?: number;
  languages?: string[];
  chrome?: boolean;
  hardwareConcurrency?: number;
  maxTouchPoints?: number;
  pdfViewerEnabled?: boolean | undefined;
  renderer?: string | null;
}

function mockWindow(options: MockOptions = {}): Window {
  const userAgent =
    options.userAgent ?? "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0 Safari/537.36";
  return {
    navigator: {
      userAgent,
      webdriver: options.webdriver ?? false,
      plugins: { length: options.plugins ?? 3 },
      mimeTypes: { length: options.mimeTypes ?? 2 },
      languages: options.languages ?? ["en-US", "en"],
      hardwareConcurrency: options.hardwareConcurrency ?? 8,
      maxTouchPoints: options.maxTouchPoints ?? 0,
      pdfViewerEnabled: options.pdfViewerEnabled ?? true,
    },
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 },
    outerWidth: 1920,
    outerHeight: 1080,
    chrome: options.chrome === false ? undefined : {},
    document: {
      createElement: () => ({
        getContext: () =>
          options.renderer
            ? {
                getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }),
                getParameter: () => options.renderer,
              }
            : null,
      }),
    },
  } as unknown as Window;
}

const ids = (win: Window) => collectEnvironmentSignals(win).map((s) => s.id);

describe("collectEnvironmentSignals", () => {
  it("flags navigator.webdriver", () => {
    expect(ids(mockWindow({ webdriver: true }))).toContain("environment.webdriver_flag");
  });

  it("flags automation user agents", () => {
    expect(ids(mockWindow({ userAgent: "Mozilla/5.0 HeadlessChrome/130.0" }))).toContain(
      "environment.automation_user_agent",
    );
    expect(ids(mockWindow({ userAgent: "Mozilla/5.0 Chrome/130 Puppeteer" }))).toContain(
      "environment.automation_user_agent",
    );
  });

  it("stays quiet for a plausible desktop browser", () => {
    const found = ids(mockWindow());
    expect(found).not.toContain("environment.webdriver_flag");
    expect(found).not.toContain("environment.automation_user_agent");
    expect(found).not.toContain("environment.no_plugins");
    expect(found).not.toContain("environment.missing_chrome_object");
  });

  it("flags a Chromium UA with no window.chrome", () => {
    expect(ids(mockWindow({ chrome: false }))).toContain("environment.missing_chrome_object");
  });

  it("flags empty plugin and language lists", () => {
    expect(ids(mockWindow({ plugins: 0 }))).toContain("environment.no_plugins");
    expect(ids(mockWindow({ languages: [] }))).toContain("environment.no_languages");
  });

  it("does not apply desktop checks to a mobile UA", () => {
    const found = ids(mockWindow({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", plugins: 0 }));
    expect(found).not.toContain("environment.no_plugins");
  });

  it("flags a software WebGL renderer", () => {
    expect(ids(mockWindow({ renderer: "Google SwiftShader" }))).toContain(
      "environment.software_renderer",
    );
    expect(ids(mockWindow({ renderer: "NVIDIA GeForce RTX 4070" }))).not.toContain(
      "environment.software_renderer",
    );
  });

  it("flags zero cores and a degenerate viewport", () => {
    expect(ids(mockWindow({ hardwareConcurrency: 0 }))).toContain("environment.zero_cores");
    const win = mockWindow();
    (win.screen as unknown as { width: number }).width = 0;
    (win.screen as unknown as { height: number }).height = 0;
    expect(ids(win)).toContain("environment.degenerate_viewport");
  });
});
