const unavailableRequirements =
  "Device unlock requires opening this site directly in a supported browser over HTTPS (Android Chrome or iOS Safari on mobile), and configuring a device screen lock/passcode with an available platform authenticator or passkey provider. Password sign-in remains available.";

export function getBiometricUnavailableMessage({
  isSupported,
  isEnabled,
  isReserved,
}) {
  if (isSupported || isEnabled || isReserved) return "";
  return unavailableRequirements;
}
