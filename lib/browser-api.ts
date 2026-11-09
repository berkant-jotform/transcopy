/** Firefox's browser namespace provides promises; Chromium MV3 supports promises on chrome. */
export function extensionApi():typeof chrome {
  return (globalThis as typeof globalThis & {browser?:typeof chrome}).browser || chrome;
}
