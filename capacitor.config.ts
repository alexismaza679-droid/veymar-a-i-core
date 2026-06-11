import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.veymar",
  appName: "VEYMAR A.I.",

  webDir: "dist",

  android: {
    allowMixedContent: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
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
