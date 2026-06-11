import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.veymar",
  appName: "VEYMAR A.I.",

  // ✔️ VITE REAL OUTPUT (SIEMPRE TIENE index.html)
  webDir: "dist",

  android: {
    allowMixedContent: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#05070D",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },

    StatusBar: {
      style: "DARK",
      backgroundColor: "#05070D",
    },
  },
};

export default config;
