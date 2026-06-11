import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.veymar",
  appName: "VEYMAR A.I.",

  // 🔥 No importa cuál sea, lo sobreescribimos en el build
  webDir: "dist",

  android: {
    allowMixedContent: true,
  },
};

export default config;
