import assert from "node:assert/strict";
import test from "node:test";
import { createBiometricService } from "../src/biometric-service.js";

function setup({
  native = true,
  desktop = false,
  available = true,
} = {}) {
  const values = new Map();
  const calls = [];
  const preferences = {
    async get({ key }) {
      return { value: values.get(key) ?? null };
    },
    async set({ key, value }) {
      values.set(key, value);
    },
    async remove({ key }) {
      values.delete(key);
    },
  };
  const nativeBiometric = {
    async isAvailable(options) {
      calls.push(["isAvailable", options]);
      return {
        isAvailable: available,
        strongBiometryIsAvailable: available,
      };
    },
    async setCredentials(options) {
      calls.push(["setCredentials", options]);
    },
    async getSecureCredentials(options) {
      calls.push(["getSecureCredentials", options]);
      return { username: "user-1", password: "mock-biometric-credential" };
    },
    async deleteCredentials(options) {
      calls.push(["deleteCredentials", options]);
    },
  };
  const desktopWebAuthn = {
    async isAvailable() {
      return available;
    },
    async register(user) {
      return {
        platform: "webauthn",
        version: 1,
        userId: user.id,
        credentialId: "credential-id",
        publicKey: "public-key",
        algorithm: -7,
        rpId: "localhost",
        origin: "http://localhost",
      };
    },
    async authenticate(enrollment) {
      return enrollment.userId;
    },
  };
  const biometric = createBiometricService({
    nativeBiometric,
    preferences,
    isNativePlatform: () => native,
    getDesktopPlatform: () => (desktop ? "windows" : null),
    desktopWebAuthn,
    accessControl: 1,
    cryptoApi: { getRandomValues: (bytes) => bytes.fill(7) },
  });
  return { biometric, calls, nativeBiometric, values };
}

test("unsupported web builds do not probe native biometric authentication", async () => {
  const { biometric, calls } = setup({ native: false });

  assert.equal(await biometric.isAvailable(), false);
  await assert.rejects(
    biometric.enable({ id: "user-1", email: "one@example.test", fullName: "User One" }),
    /unavailable in this browser/,
  );
  assert.deepEqual(calls, []);
});

test("enrollment stores random credentials in native protected storage, not preferences", async () => {
  const { biometric, calls, values } = setup();

  await biometric.enable({ id: "user-1", email: "one@example.test", fullName: "User One" });

  const [, stored] = calls.find(([name]) => name === "setCredentials");
  assert.equal(stored.username, "user-1");
  assert.equal(stored.password, "07".repeat(32));
  assert.equal(stored.accessControl, 1);
  assert.equal(stored.authValidityDuration, 0);
  assert.equal(JSON.stringify([...values.values()]).includes(stored.password), false);
  assert.deepEqual(await biometric.getEnrollment(), {
    version: 1,
    platform: "native",
    userId: "user-1",
  });
});

test("unlock requires a protected credential matching the enrollment", async () => {
  const { biometric, calls } = setup();
  await biometric.enable({ id: "user-1", email: "one@example.test", fullName: "User One" });

  assert.equal(await biometric.unlock(), "user-1");
  assert.ok(calls.some(([name]) => name === "getSecureCredentials"));
});

test("disable deletes the protected credential and clears enrollment metadata", async () => {
  const { biometric, calls, values } = setup();
  await biometric.enable({ id: "user-1", email: "one@example.test", fullName: "User One" });
  await biometric.disable("user-1");

  assert.ok(calls.some(([name]) => name === "deleteCredentials"));
  assert.deepEqual([...values.values()], []);
});

test("unavailable biometrics and failed secure reads do not authenticate", async () => {
  const unavailable = setup({ available: false });
  await assert.rejects(
    unavailable.biometric.enable({
      id: "user-1",
      email: "one@example.test",
      fullName: "User One",
    }),
    /not enrolled/,
  );
  assert.equal(unavailable.values.size, 0);

  const { biometric, nativeBiometric, values } = setup();
  await biometric.enable({ id: "user-1", email: "one@example.test", fullName: "User One" });
  nativeBiometric.getSecureCredentials = async () => ({
    username: "user-2",
    password: "mock-biometric-credential",
  });
  await assert.rejects(biometric.unlock(), /does not match/);
  assert.equal(values.size, 1);
});

test("desktop registration persists only public WebAuthn metadata and verifies assertions through the adapter", async () => {
  const { biometric, calls, values } = setup({ native: false, desktop: true });
  const user = { id: "user-1", email: "one@example.test", fullName: "User One" };

  await biometric.getEnrollment();
  await biometric.isAvailable();
  await biometric.enable(user);
  const enrollment = await biometric.getEnrollment();
  assert.equal(enrollment.platform, "webauthn");
  assert.equal(enrollment.userId, user.id);
  assert.equal(JSON.stringify([...values.values()]).includes("private-key"), false);
  assert.equal(await biometric.unlock(), user.id);
  assert.ok(calls.every(([name]) => name !== "getSecureCredentials"));

  await biometric.disable(user.id);
  assert.equal(await biometric.getEnrollment(), null);
});

test("desktop enrollment is not silently rebound to a different account", async () => {
  const { biometric, values } = setup({ native: false, desktop: true });
  await biometric.getEnrollment();
  await biometric.isAvailable();
  await biometric.enable({ id: "user-1", email: "one@example.test", fullName: "User One" });

  await assert.rejects(
    biometric.enable({ id: "user-2", email: "two@example.test", fullName: "User Two" }),
    /another account/i,
  );
  assert.equal(values.size, 1);
});
