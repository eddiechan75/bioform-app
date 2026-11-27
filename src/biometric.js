import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  AccessControl,
  NativeBiometric,
} from "@capgo/capacitor-native-biometric";
import { createDesktopWebAuthn } from "./desktop-webauthn.js";
import { createBiometricService } from "./biometric-service.js";

function getDesktopPlatform() {
  if (Capacitor.isNativePlatform()) return null;
  const platform =
    navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
  if (/^Win/i.test(platform)) return "windows";
  if (/^Mac/i.test(platform) && navigator.maxTouchPoints <= 1) return "macos";
  if (/^Linux/i.test(platform)) return "linux";
  return null;
}

const desktopWebAuthn = createDesktopWebAuthn({
  publicKeyCredential: globalThis.PublicKeyCredential,
  credentials: globalThis.navigator?.credentials,
  origin: globalThis.location?.origin ?? "",
  rpId: globalThis.location?.hostname ?? "",
  secureContext: globalThis.isSecureContext === true,
  desktopPlatform: getDesktopPlatform(),
});

export const biometric = createBiometricService({
  nativeBiometric: NativeBiometric,
  preferences: Preferences,
  isNativePlatform: () => Capacitor.isNativePlatform(),
  getDesktopPlatform,
  desktopWebAuthn,
  accessControl: AccessControl.BIOMETRY_CURRENT_SET,
});
