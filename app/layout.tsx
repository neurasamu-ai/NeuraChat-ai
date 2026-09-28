import type { Metadata } from 'next';
import { Inter, Poppins } from 'next/font/google';
import './globals.css';
import ConsoleInterceptor from '@/components/ConsoleInterceptor';
import ThemeManager from '@/components/ThemeManager';
import BackButtonHandler from '@/components/BackButtonHandler';
import SmsInboxBridge from '@/components/SmsInboxBridge';
import DefaultSmsBanner from '@/components/DefaultSmsBanner';
import DefaultDialerBanner from '@/components/DefaultDialerBanner';
import ActiveCallScreen from '@/components/ActiveCallScreen';
import NotificationNavigator from '@/components/NotificationNavigator';
import MissedCallBridge from '@/components/MissedCallBridge';
import SmsStatusBridge from '@/components/SmsStatusBridge';
import ContactsSyncToast from '@/components/ContactsSyncToast';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const poppins = Poppins({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'NeuraChat',
  description: 'Your Neural Communication Hub',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
      <body
        className="bg-black text-white antialiased font-sans h-[100dvh] flex flex-col overflow-hidden"
        suppressHydrationWarning
      >
        <ConsoleInterceptor />
        <ThemeManager />
        <BackButtonHandler />
        <SmsInboxBridge />
        <ActiveCallScreen />
        <NotificationNavigator />
        <MissedCallBridge />
        <SmsStatusBridge />
        <ContactsSyncToast />
        <div className="flex-1 flex flex-col w-full md:max-w-md md:mx-auto relative md:border-x border-zinc-900 shadow-2xl bg-zinc-950 min-h-0">
          <DefaultSmsBanner />
          <DefaultDialerBanner />
          {children}
        </div>
      </body>
    </html>
  );
}
