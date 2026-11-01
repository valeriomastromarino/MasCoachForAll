import type { CapacitorConfig } from "@capacitor/cli";

// The Android app wraps the single-file build (`npm run build:file` → dist-file/index.html): it works with no network.
const config: CapacitorConfig = {
  appId: "it.mascoachforall.app",
  appName: "MasCoach",
  webDir: "dist-file",
  backgroundColor: "#12151f",
  android: { allowMixedContent: false },
};

export default config;
