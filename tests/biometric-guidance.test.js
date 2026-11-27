import assert from "node:assert/strict";
import test from "node:test";
import { getBiometricUnavailableMessage } from "../src/biometric-guidance.js";

test("shows only the minimal requirements when biometric unlock is unavailable", () => {
  const message = getBiometricUnavailableMessage({
    isSupported: false,
    isEnabled: false,
    isReserved: false,
  });

  assert.match(message, /directly in a supported browser over HTTPS/);
  assert.match(message, /Android Chrome or iOS Safari on mobile/);
  assert.match(message, /screen lock\/passcode/);
  assert.match(message, /platform authenticator or passkey provider/);
  assert.match(message, /Password sign-in remains available/);
});

test("hides unavailable requirements when support exists or enrollment is active", () => {
  for (const state of [
    { isSupported: true, isEnabled: false, isReserved: false },
    { isSupported: false, isEnabled: true, isReserved: false },
    { isSupported: false, isEnabled: false, isReserved: true },
  ]) {
    assert.equal(getBiometricUnavailableMessage(state), "");
  }
});
