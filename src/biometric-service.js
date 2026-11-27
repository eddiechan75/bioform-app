const enrollmentKey = "bioform.biometric.enrollment";
const credentialServer = "com.bioform.mobile.local-unlock";

export function createBiometricService({
  nativeBiometric,
  preferences,
  isNativePlatform,
  getDesktopPlatform,
  desktopWebAuthn,
  accessControl,
  cryptoApi = globalThis.crypto,
}) {
  let enrollmentLoaded = false;
  let cachedEnrollment = null;
  let cachedAvailability = null;

  async function getEnrollment() {
    const { value } = await preferences.get({ key: enrollmentKey });
    if (!value) {
      enrollmentLoaded = true;
      cachedEnrollment = null;
      return null;
    }

    try {
      const enrollment = JSON.parse(value);
      if (
        enrollment.version === 1 &&
        typeof enrollment.userId === "string" &&
        ["native", "webauthn"].includes(enrollment.platform)
      ) {
        enrollmentLoaded = true;
        cachedEnrollment = enrollment;
        return enrollment;
      }
    } catch {
      // An unreadable preference is not an enrollment credential.
    }

    await preferences.remove({ key: enrollmentKey });
    enrollmentLoaded = true;
    cachedEnrollment = null;
    return null;
  }

  async function isAvailable() {
    if (isNativePlatform()) {
      const result = await nativeBiometric.isAvailable({ useFallback: false });
      cachedAvailability = Boolean(
        result.isAvailable && result.strongBiometryIsAvailable,
      );
      return cachedAvailability;
    }
    if (!getDesktopPlatform()) {
      cachedAvailability = false;
      return false;
    }
    cachedAvailability = await desktopWebAuthn.isAvailable();
    return cachedAvailability;
  }

  async function enable(user) {
    if (!user || typeof user.id !== "string" || user.id.length === 0) {
      throw new Error("A signed-in local account is required to enable biometric unlock.");
    }

    if (isNativePlatform()) {
      if (!(await isAvailable())) {
        throw new Error("A supported biometric is not enrolled on this device.");
      }
      const existing = await getEnrollment();
      if (existing && existing.userId !== user.id) {
        throw new Error("Another account already has biometric unlock on this device.");
      }
      if (existing) {
        throw new Error("Biometric unlock is already enabled for this account.");
      }

      const randomCredential = new Uint8Array(32);
      cryptoApi.getRandomValues(randomCredential);
      const credential = Array.from(randomCredential, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      await nativeBiometric.setCredentials({
        username: user.id,
        password: credential,
        server: credentialServer,
        accessControl,
        authValidityDuration: 0,
        title: "Enable Bioform unlock",
        negativeButtonText: "Cancel",
      });

      try {
        await preferences.set({
          key: enrollmentKey,
          value: JSON.stringify({ version: 1, platform: "native", userId: user.id }),
        });
        cachedEnrollment = {
          version: 1,
          platform: "native",
          userId: user.id,
        };
        enrollmentLoaded = true;
      } catch (error) {
        try {
          await nativeBiometric.deleteCredentials({ server: credentialServer });
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Could not save biometric enrollment or remove the native credential.",
          );
        }
        throw error;
      }
      return;
    }

    if (!getDesktopPlatform()) {
      throw new Error("Biometric unlock is unavailable in this browser.");
    }
    if (!enrollmentLoaded || cachedAvailability !== true) {
      throw new Error("Reload Bioform before starting desktop authenticator enrollment.");
    }
    if (cachedEnrollment && cachedEnrollment.userId !== user.id) {
      throw new Error("Another account already has biometric unlock on this device.");
    }
    if (cachedEnrollment) {
      throw new Error("Biometric unlock is already enabled for this account.");
    }

    const enrollmentRequest = desktopWebAuthn.register(user);
    const enrollment = await enrollmentRequest;
    try {
      await preferences.set({
        key: enrollmentKey,
        value: JSON.stringify(enrollment),
      });
      cachedEnrollment = enrollment;
      enrollmentLoaded = true;
    } catch {
      throw new Error(
        "The authenticator was registered, but Bioform could not save its public enrollment details.",
      );
    }
  }

  async function unlock() {
    if (!isNativePlatform()) {
      if (
        !getDesktopPlatform() ||
        !enrollmentLoaded ||
        cachedEnrollment?.platform !== "webauthn"
      ) {
        return null;
      }
      return desktopWebAuthn.authenticate(cachedEnrollment);
    }

    const enrollment = await getEnrollment();
    if (!enrollment) return null;
    if (enrollment.platform !== "native") return null;
    const credential = await nativeBiometric.getSecureCredentials({
      server: credentialServer,
      reason: "Unlock your Bioform profile",
      title: "Bioform",
      subtitle: "Use your device biometrics to continue",
      negativeButtonText: "Cancel",
      maxAttempts: 3,
    });
    if (credential.username !== enrollment.userId || !credential.password) {
      throw new Error("The protected credential does not match this enrollment.");
    }
    return enrollment.userId;
  }

  async function disable(userId) {
    const enrollment = await getEnrollment();
    if (!enrollment || enrollment.userId !== userId) {
      throw new Error("No biometric enrollment exists for this account.");
    }
    if (enrollment.platform === "native") {
      if (!isNativePlatform()) {
        throw new Error("This enrollment must be removed from its mobile app.");
      }
      await nativeBiometric.deleteCredentials({ server: credentialServer });
    } else if (
      enrollment.platform === "webauthn" &&
      (isNativePlatform() || !getDesktopPlatform())
    ) {
      throw new Error("This enrollment must be removed from its desktop browser.");
    }
    await preferences.remove({ key: enrollmentKey });
    cachedEnrollment = null;
    enrollmentLoaded = true;
    return enrollment.platform;
  }

  return { disable, enable, getEnrollment, isAvailable, unlock };
}
