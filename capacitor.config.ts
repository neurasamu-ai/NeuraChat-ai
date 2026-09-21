import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.neurasamu.build.chat',
  appName: 'NeuraChat',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  }
};

export default config;
