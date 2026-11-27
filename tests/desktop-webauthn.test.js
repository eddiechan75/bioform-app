import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { createDesktopWebAuthn } from "../src/desktop-webauthn.js";

const origin = "https://bioform.example";
const rpId = "bioform.example";
const rawId = Uint8Array.from([1, 2, 3, 4]);

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function derInteger(bytes) {
  let value = Buffer.from(bytes);
  while (value.length > 1 && value[0] === 0 && (value[1] & 0x80) === 0) {
    value = value.subarray(1);
  }
  if ((value[0] & 0x80) !== 0) value = Buffer.concat([Buffer.from([0]), value]);
  return Buffer.concat([Buffer.from([2, value.length]), value]);
}

function rawEcdsaToDer(signature) {
  const bytes = Buffer.from(signature);
  const r = derInteger(bytes.subarray(0, 32));
  const s = derInteger(bytes.subarray(32));
  const content = Buffer.concat([r, s]);
  return Buffer.concat([Buffer.from([0x30, content.length]), content]);
}

async function authenticatorData(flags = 0x05) {
  const data = new Uint8Array(37);
  data.set(
    new Uint8Array(
      await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId)),
    ),
  );
  data[32] = flags;
  return data;
}

function clientData(type, challenge) {
  return new TextEncoder().encode(
    JSON.stringify({
      type,
      challenge: toBase64Url(challenge),
      origin,
      crossOrigin: false,
    }),
  );
}

async function createFakeWebAuthn({
  registrationFlags = 0x05,
  tamperSignature = false,
} = {}) {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicKey = new Uint8Array(
    await webcrypto.subtle.exportKey("spki", keyPair.publicKey),
  );
  let observedAssertion = null;
  const credentials = {
    async create({ publicKey: options }) {
      const authenticator = await authenticatorData(registrationFlags);
      return {
        type: "public-key",
        rawId: rawId.buffer,
        response: {
          clientDataJSON: clientData("webauthn.create", options.challenge),
          getAuthenticatorData: () => authenticator,
          getPublicKey: () => publicKey.buffer,
          getPublicKeyAlgorithm: () => -7,
        },
      };
    },
    async get({ publicKey: options }) {
      const authenticator = await authenticatorData();
      const client = clientData("webauthn.get", options.challenge);
      const clientHash = new Uint8Array(
        await webcrypto.subtle.digest("SHA-256", client),
      );
      const signedData = new Uint8Array(authenticator.length + clientHash.length);
      signedData.set(authenticator);
      signedData.set(clientHash, authenticator.length);
      const signature = new Uint8Array(
        await webcrypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keyPair.privateKey,
          signedData,
        ),
      );
      if (tamperSignature) signature[0] ^= 0x01;
      observedAssertion = {
        options,
        signedData,
        signature,
      };
      return {
        type: "public-key",
        rawId,
        response: {
          authenticatorData: authenticator,
          clientDataJSON: client,
          signature: rawEcdsaToDer(signature),
        },
      };
    },
  };
  return {
    credentials,
    publicKeyCredential: {
      async isUserVerifyingPlatformAuthenticatorAvailable() {
        return true;
      },
    },
    observedAssertion: () => observedAssertion,
  };
}

test("desktop WebAuthn enrollment and unlock verify a fresh local assertion", async () => {
  const fake = await createFakeWebAuthn();
  const desktop = createDesktopWebAuthn({
    ...fake,
    cryptoApi: webcrypto,
    origin,
    rpId,
    secureContext: true,
    desktopPlatform: "windows",
  });
  const user = {
    id: "local-user-1",
    email: "one@example.test",
    fullName: "User One",
  };

  assert.equal(await desktop.isAvailable(), true);
  const enrollment = await desktop.register(user);
  assert.equal(enrollment.userId, user.id);
  assert.equal(enrollment.credentialId, toBase64Url(rawId));
  assert.equal(await desktop.authenticate(enrollment), user.id);
  assert.equal(fake.observedAssertion().options.userVerification, "required");
});

test("desktop WebAuthn requires a secure context and verified user-presence flags", async () => {
  const fake = await createFakeWebAuthn({ registrationFlags: 0x01 });
  const insecure = createDesktopWebAuthn({
    ...fake,
    cryptoApi: webcrypto,
    origin: "http://example.test",
    rpId,
    secureContext: false,
    desktopPlatform: "windows",
  });
  assert.equal(await insecure.isAvailable(), false);

  const desktop = createDesktopWebAuthn({
    ...fake,
    cryptoApi: webcrypto,
    origin,
    rpId,
    secureContext: true,
    desktopPlatform: "windows",
  });
  await assert.rejects(
    desktop.register({
      id: "local-user-1",
      email: "one@example.test",
      fullName: "User One",
    }),
    /user presence/,
  );
});

test("Linux support requires a secure WebAuthn-capable browser but permits external FIDO2 authenticators", async () => {
  const fake = await createFakeWebAuthn();
  const linux = createDesktopWebAuthn({
    ...fake,
    cryptoApi: webcrypto,
    origin,
    rpId,
    secureContext: true,
    desktopPlatform: "linux",
  });
  assert.equal(await linux.isAvailable(), true);

  const insecure = createDesktopWebAuthn({
    ...fake,
    cryptoApi: webcrypto,
    origin: "http://bioform.example",
    rpId,
    secureContext: false,
    desktopPlatform: "linux",
  });
  assert.equal(await insecure.isAvailable(), false);
});

test("desktop WebAuthn rejects tampered authenticator signatures", async () => {
  const fake = await createFakeWebAuthn({ tamperSignature: true });
  const desktop = createDesktopWebAuthn({
    ...fake,
    cryptoApi: webcrypto,
    origin,
    rpId,
    secureContext: true,
    desktopPlatform: "windows",
  });
  const enrollment = await desktop.register({
    id: "local-user-1",
    email: "one@example.test",
    fullName: "User One",
  });

  await assert.rejects(desktop.authenticate(enrollment), /signature did not match/);
});
