import assert from "node:assert/strict";
import test from "node:test";
import { getBiometricEnableErrorMessage } from "../src/biometric-errors.js";

test("biometric setup errors explain common authenticator failures safely", () => {
  assert.match(
    getBiometricEnableErrorMessage({ name: "NotAllowedError" }),
    /canceled or timed out/,
  );
  assert.match(
    getBiometricEnableErrorMessage({ name: "NotSupportedError" }),
    /doesn't support biometric setup/,
  );
  assert.match(
    getBiometricEnableErrorMessage({ name: "SecurityError" }),
    /HTTPS or localhost/,
  );
});

test("unknown setup errors use a safe password-fallback message", () => {
  const message = getBiometricEnableErrorMessage(
    new Error("sensitive native diagnostic"),
  );

  assert.match(message, /password sign-in is unchanged/);
  assert.doesNotMatch(message, /sensitive native diagnostic/);
});
