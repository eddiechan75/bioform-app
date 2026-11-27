function toBase64Url(bytes) {
  const data = ArrayBuffer.isView(bytes)
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : null;
  if (!data) throw new TypeError("Expected an ArrayBuffer or typed array.");

  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function concatBytes(first, second) {
  const combined = new Uint8Array(first.length + second.length);
  combined.set(first);
  combined.set(second, first.length);
  return combined;
}

function validRpId(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !/^[\d.]+$/.test(value) &&
    !value.includes(":")
  );
}

function derEcdsaToRaw(signature) {
  const bytes = new Uint8Array(signature);
  if (bytes[0] !== 0x30 || bytes[2] !== 0x02) {
    throw new Error("The authenticator returned an invalid ECDSA signature.");
  }

  let offset = 3;
  const rLength = bytes[offset++];
  const r = bytes.slice(offset, offset + rLength);
  offset += rLength;
  if (bytes[offset++] !== 0x02) {
    throw new Error("The authenticator returned an invalid ECDSA signature.");
  }
  const sLength = bytes[offset++];
  const s = bytes.slice(offset, offset + sLength);

  function toFixedWidthInteger(integer) {
    let value = integer;
    while (value.length > 32 && value[0] === 0) value = value.slice(1);
    if (value.length > 32) {
      throw new Error("The authenticator returned an invalid ECDSA signature.");
    }
    const result = new Uint8Array(32);
    result.set(value, 32 - value.length);
    return result;
  }

  return concatBytes(toFixedWidthInteger(r), toFixedWidthInteger(s));
}

function isValidOrigin(clientDataJSON, challenge, expectedType, origin) {
  const clientData = JSON.parse(new TextDecoder().decode(clientDataJSON));
  return (
    clientData.type === expectedType &&
    clientData.challenge === toBase64Url(challenge) &&
    clientData.origin === origin &&
    clientData.crossOrigin !== true
  );
}

async function validateAuthenticatorData(authenticatorData, rpId, cryptoApi) {
  const data = new Uint8Array(authenticatorData);
  if (data.length < 37) return false;

  const expectedRpIdHash = new Uint8Array(
    await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(rpId)),
  );
  const hasUserPresence = (data[32] & 0x01) !== 0;
  const hasUserVerification = (data[32] & 0x04) !== 0;
  return (
    hasUserPresence &&
    hasUserVerification &&
    expectedRpIdHash.every((byte, index) => byte === data[index])
  );
}

export function createDesktopWebAuthn({
  publicKeyCredential,
  credentials,
  cryptoApi = globalThis.crypto,
  origin,
  rpId,
  secureContext,
  platform,
}) {
  async function isAvailable() {
    if (
      !secureContext ||
      !validRpId(rpId) ||
      !publicKeyCredential ||
      !credentials?.create ||
      !credentials?.get ||
      !cryptoApi?.subtle
    ) {
      return false;
    }

    if (platform === "linux") return true;
    if (
      ["android", "windows", "macos"].includes(platform) &&
      typeof publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable ===
        "function"
    ) {
      return publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return false;
  }

  async function register(user) {
    const challenge = cryptoApi.getRandomValues(new Uint8Array(32));
    const credential = await credentials.create({
      publicKey: {
        challenge,
        rp: { id: rpId, name: "Bioform" },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.email,
          displayName: user.fullName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          ...(platform === "android"
            ? { authenticatorAttachment: "platform" }
            : {}),
          userVerification: "required",
        },
        attestation: "none",
        timeout: 60_000,
      },
    });

    if (
      credential?.type !== "public-key" ||
      !credential.rawId?.byteLength ||
      !credential.response?.getPublicKey ||
      !credential.response.getAuthenticatorData ||
      !credential.response.getPublicKeyAlgorithm
    ) {
      throw new Error("This authenticator does not expose a verifiable public key.");
    }
    if (
      !isValidOrigin(
        credential.response.clientDataJSON,
        challenge,
        "webauthn.create",
        origin,
      )
    ) {
      throw new Error("Authenticator registration did not match this app origin.");
    }
    if (
      !(await validateAuthenticatorData(
        credential.response.getAuthenticatorData(),
        rpId,
        cryptoApi,
      ))
    ) {
      throw new Error("Authenticator registration did not verify user presence.");
    }

    const algorithm = credential.response.getPublicKeyAlgorithm();
    if (algorithm !== -7 && algorithm !== -257) {
      throw new Error("This authenticator uses an unsupported signing algorithm.");
    }
    const publicKey = credential.response.getPublicKey();
    if (!publicKey) throw new Error("The authenticator did not provide a public key.");

    return {
      platform: "webauthn",
      version: 1,
      userId: user.id,
      credentialId: toBase64Url(credential.rawId),
      publicKey: toBase64Url(publicKey),
      algorithm,
      rpId,
      origin,
    };
  }

  async function authenticate(enrollment) {
    if (enrollment.origin !== origin || enrollment.rpId !== rpId) {
      throw new Error("This authenticator enrollment belongs to another app origin.");
    }

    const challenge = cryptoApi.getRandomValues(new Uint8Array(32));
    const credential = await credentials.get({
      publicKey: {
        challenge,
        rpId: enrollment.rpId,
        allowCredentials: [
          {
            id: fromBase64Url(enrollment.credentialId),
            type: "public-key",
          },
        ],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    const response = credential?.response;
    if (!response?.authenticatorData || !response.signature || !response.clientDataJSON) {
      throw new Error("The authenticator returned an incomplete assertion.");
    }
    if (credential.type !== "public-key" || !credential.rawId?.byteLength) {
      throw new Error("The authenticator returned an invalid credential.");
    }
    if (
      !isValidOrigin(response.clientDataJSON, challenge, "webauthn.get", origin) ||
      !(await validateAuthenticatorData(response.authenticatorData, rpId, cryptoApi))
    ) {
      throw new Error("The authenticator assertion did not verify.");
    }

    const clientDataHash = new Uint8Array(
      await cryptoApi.subtle.digest("SHA-256", response.clientDataJSON),
    );
    const signedData = concatBytes(
      new Uint8Array(response.authenticatorData),
      clientDataHash,
    );
    const signature =
      enrollment.algorithm === -7
        ? derEcdsaToRaw(response.signature)
        : new Uint8Array(response.signature);
    const algorithm =
      enrollment.algorithm === -7
        ? { name: "ECDSA", namedCurve: "P-256" }
        : enrollment.algorithm === -257
          ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
          : null;
    if (!algorithm) throw new Error("This authenticator uses an unsupported algorithm.");
    const verificationAlgorithm =
      enrollment.algorithm === -7
        ? { name: "ECDSA", hash: "SHA-256" }
        : { name: "RSASSA-PKCS1-v1_5" };
    const publicKey = await cryptoApi.subtle.importKey(
      "spki",
      fromBase64Url(enrollment.publicKey),
      algorithm,
      false,
      ["verify"],
    );
    const verified = await cryptoApi.subtle.verify(
      verificationAlgorithm,
      publicKey,
      signature,
      signedData,
    );
    if (!verified || toBase64Url(credential.rawId) !== enrollment.credentialId) {
      throw new Error("The authenticator signature did not match this profile.");
    }
    return enrollment.userId;
  }

  return { authenticate, isAvailable, register };
}
