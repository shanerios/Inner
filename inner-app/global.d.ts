// global.d.ts
export {};

declare global {
  // Extend the NodeJS global object
  // so TypeScript knows about our custom global property
  namespace NodeJS {
    interface Global {
      __TRACK_URIS?: Record<string, string>;
    }
  }

  // For globalThis in modern TS
  interface Global {
    __TRACK_URIS?: Record<string, string>;
  }

  interface Window {
    __TRACK_URIS?: Record<string, string>;
  }

  var __TRACK_URIS: Record<string, string> | undefined;
}