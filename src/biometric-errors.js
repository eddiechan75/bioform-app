export function getBiometricEnableErrorMessage(error) {
  const name =
    error && typeof error === "object" && "name" in error
      ? error.name
      : "";

  switch (name) {
    case "NotAllowedError":
      return "No authenticator completed setup. It may have been canceled or timed out. Try again, or continue with your password.";
    case "AbortError":
      return "The authenticator canceled setup. Try again, or continue with your password.";
    case "NotSupportedError":
      return "This browser or authenticator doesn't support biometric setup. Password sign-in is still available.";
    case "SecurityError":
      return "Biometric setup requires a supported secure app address. Open Bioform over HTTPS or localhost, or continue with your password.";
    default:
      return "Biometric setup couldn't be completed. Check your device or browser settings and try again; password sign-in is unchanged.";
  }
}
