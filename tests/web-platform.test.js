import assert from "node:assert/strict";
import test from "node:test";
import { detectWebPlatform } from "../src/web-platform.js";

test("detects Android browsers through modern and legacy user agents", () => {
  assert.equal(
    detectWebPlatform({
      userAgentDataPlatform: "Android",
      navigatorPlatform: "Linux armv8l",
      userAgent: "Mozilla/5.0",
    }),
    "android",
  );
  assert.equal(
    detectWebPlatform({
      navigatorPlatform: "Linux armv8l",
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel)",
    }),
    "android",
  );
});

test("retains desktop detection and excludes iPad-style Mac platform reporting", () => {
  assert.equal(
    detectWebPlatform({ navigatorPlatform: "Win32" }),
    "windows",
  );
  assert.equal(
    detectWebPlatform({ navigatorPlatform: "MacIntel", maxTouchPoints: 0 }),
    "macos",
  );
  assert.equal(
    detectWebPlatform({ navigatorPlatform: "MacIntel", maxTouchPoints: 5 }),
    null,
  );
  assert.equal(detectWebPlatform({ navigatorPlatform: "iPhone" }), null);
});
