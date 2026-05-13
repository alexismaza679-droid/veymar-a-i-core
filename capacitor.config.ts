import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.veymar",
  appName: "VEYMAR A.I.",
  webDir: "dist",
  server: {
    // Hot-reload desde el preview de Lovable mientras desarrollas.
    // Para una APK 100% offline, comenta este bloque y vuelve a compilar.
    url: "https://80307ab0-68a2-4e5e-9c7e-1c8d378c0022.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
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
