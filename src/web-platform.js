export function detectWebPlatform({
  userAgentDataPlatform = "",
  navigatorPlatform = "",
  userAgent = "",
  maxTouchPoints = 0,
}) {
  const platform = userAgentDataPlatform || navigatorPlatform || userAgent;

  if (/android/i.test(userAgentDataPlatform) || /android/i.test(userAgent)) {
    return "android";
  }
  if (/^Win/i.test(platform)) return "windows";
  if (/^Mac/i.test(platform) && maxTouchPoints <= 1) return "macos";
  if (/^Linux/i.test(platform)) return "linux";
  return null;
}
