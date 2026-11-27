import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  AccessControl,
  NativeBiometric,
} from "@capgo/capacitor-native-biometric";
import { createDesktopWebAuthn } from "./desktop-webauthn.js";
import { createBiometricService } from "./biometric-service.js";
import { detectWebPlatform } from "./web-platform.js";

function getWebPlatform() {
  if (Capacitor.isNativePlatform()) return null;
  return detectWebPlatform({
    userAgentDataPlatform: globalThis.navigator?.userAgentData?.platform,
    navigatorPlatform: globalThis.navigator?.platform,
    userAgent: globalThis.navigator?.userAgent,
    maxTouchPoints: globalThis.navigator?.maxTouchPoints,
  });
}

const desktopWebAuthn = createDesktopWebAuthn({
  publicKeyCredential: globalThis.PublicKeyCredential,
  credentials: globalThis.navigator?.credentials,
  origin: globalThis.location?.origin ?? "",
  rpId: globalThis.location?.hostname ?? "",
  secureContext: globalThis.isSecureContext === true,
  platform: getWebPlatform(),
});

export const biometric = createBiometricService({
  nativeBiometric: NativeBiometric,
  preferences: Preferences,
  isNativePlatform: () => Capacitor.isNativePlatform(),
  getWebPlatform,
  desktopWebAuthn,
  accessControl: AccessControl.BIOMETRY_CURRENT_SET,
});
