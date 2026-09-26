import type { Signal } from "../types.js";
import { isEmulatedDom } from "./native.js";

/**
 * Reads ambient browser signals that frequently differ on automation stacks.
 *
 * These are the cheapest and least invasive checks, but they are also the
 * easiest for an adversary to spoof, so none of them should be treated as
 * conclusive on their own.
 */

const AUTOMATION_UA = /(headlesschrome|headless|puppeteer|playwright|phantomjs|electron|slimerjs|selenium|webdriver)/i;
const SOFTWARE_RENDERER = /(swiftshader|llvmpipe|softpipe|software rasterizer|mesa|virtualbox|vmware|parallels)/i;

function readUnmaskedRenderer(win: Window): string | null {
  try {
    const doc = win.document;
    if (!doc || typeof doc.createElement !== "function") return null;
    const canvas = doc.createElement("canvas");
    const ctx = (canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!ctx) return null;
    const ext = ctx.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return null;
    const value = ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export function collectEnvironmentSignals(win: Window): Signal[] {
  const out: Signal[] = [];
  const nav = win.navigator;
  if (!nav) return out;

  const ua = typeof nav.userAgent === "string" ? nav.userAgent : "";
  const isChromiumUa = /chrome|crios|edg/i.test(ua);

  if (nav.webdriver === true) {
    out.push({
      id: "environment.webdriver_flag",
      category: "environment",
      severity: 1,
      automated: true,
      detail: "navigator.webdriver is true",
    });
  }

  const uaMatch = AUTOMATION_UA.exec(ua);
  if (uaMatch) {
    out.push({
      id: "environment.automation_user_agent",
      category: "environment",
      severity: 0.95,
      automated: true,
      detail: `user agent advertises "${uaMatch[0]}"`,
    });
  }

  const chromeObject = (win as unknown as { chrome?: unknown }).chrome;
  if (isChromiumUa && !chromeObject) {
    out.push({
      id: "environment.missing_chrome_object",
      category: "environment",
      severity: 0.5,
      automated: false,
      detail: "Chromium user agent but window.chrome is absent",
    });
  }

  const plugins = nav.plugins;
  if (plugins && plugins.length === 0 && !/mobile|android|iphone/i.test(ua) && ua.length > 0) {
    out.push({
      id: "environment.no_plugins",
      category: "environment",
      severity: 0.3,
      automated: false,
      detail: "desktop user agent with an empty plugin list",
    });
  }

  const mimes = nav.mimeTypes;
  if (mimes && mimes.length === 0 && !/mobile|android|iphone/i.test(ua) && ua.length > 0) {
    out.push({
      id: "environment.no_mimetypes",
      category: "environment",
      severity: 0.2,
      automated: false,
      detail: "desktop user agent with no registered MIME types",
    });
  }

  if (Array.isArray(nav.languages) && nav.languages.length === 0) {
    out.push({
      id: "environment.no_languages",
      category: "environment",
      severity: 0.4,
      automated: false,
      detail: "navigator.languages is empty",
    });
  }

  // Emulated DOMs have no GPU and log a noisy "not implemented" error when
  // asked for a canvas context, so skip the probe entirely there.
  const renderer = isEmulatedDom(win) ? null : readUnmaskedRenderer(win);
  if (renderer && SOFTWARE_RENDERER.test(renderer)) {
    out.push({
      id: "environment.software_renderer",
      category: "environment",
      severity: 0.5,
      automated: false,
      detail: `WebGL renderer reports "${renderer}"`,
    });
  }

  const screen = win.screen;
  if (screen) {
    const outerW = win.outerWidth;
    const outerH = win.outerHeight;
    const degenerateScreen = (screen.width === 0 && screen.height === 0) || (screen.availWidth === 0 && screen.availHeight === 0);
    if (degenerateScreen || (outerW === 0 && outerH === 0)) {
      out.push({
        id: "environment.degenerate_viewport",
        category: "environment",
        severity: 0.35,
        automated: false,
        detail: "zero-sized screen or outer window metrics",
      });
    }
  }

  const hc = nav.hardwareConcurrency;
  if (typeof hc === "number" && hc === 0) {
    out.push({
      id: "environment.zero_cores",
      category: "environment",
      severity: 0.25,
      automated: false,
      detail: "navigator.hardwareConcurrency reports 0",
    });
  }

  if (isChromiumUa && typeof nav.pdfViewerEnabled !== "boolean") {
    out.push({
      id: "environment.missing_pdf_viewer_flag",
      category: "environment",
      severity: 0.25,
      automated: false,
      detail: "Chromium user agent without navigator.pdfViewerEnabled",
    });
  }

  const touchPoints = nav.maxTouchPoints;
  if (typeof touchPoints === "number" && touchPoints === 0 && /mobile|android|iphone/i.test(ua)) {
    out.push({
      id: "environment.touch_ua_without_touch",
      category: "environment",
      severity: 0.2,
      automated: false,
      detail: "mobile user agent with zero touch points",
    });
  }

  return out;
}
