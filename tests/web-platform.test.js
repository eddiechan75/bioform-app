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

test("retains desktop and detects iPad-style Mac platform reporting", () => {
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
    "ios",
  );
});

test("detects iOS Safari and iPadOS desktop user agents", () => {
  assert.equal(
    detectWebPlatform({
      userAgentDataPlatform: "iOS",
      navigatorPlatform: "iPhone",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    }),
    "ios",
  );
  assert.equal(
    detectWebPlatform({
      navigatorPlatform: "iPad",
      userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)",
    }),
    "ios",
  );
});
