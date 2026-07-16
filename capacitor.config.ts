import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.routedeelivery',
  appName: 'Route Delivery',
  webDir: 'dist',
  server: {
    url: 'https://routedeelivery.com',
    cleartext: false
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
