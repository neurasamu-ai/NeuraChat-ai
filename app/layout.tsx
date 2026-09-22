import type { Metadata } from 'next';
import { Inter, Poppins } from 'next/font/google';
import './globals.css';
import ConsoleInterceptor from '@/components/ConsoleInterceptor';
import ThemeManager from '@/components/ThemeManager';

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
    <html lang="en" className={`${inter.variable} ${poppins.variable} dark`}>
      <body
        className="bg-black text-white antialiased font-sans min-h-screen flex flex-col justify-between overflow-x-hidden"
        suppressHydrationWarning
      >
        <ConsoleInterceptor />
        <ThemeManager />
        <div className="flex-1 flex flex-col w-full md:max-w-md md:mx-auto relative md:border-x border-zinc-900 shadow-2xl bg-zinc-950 pb-20">
          {children}
        </div>
      </body>
    </html>
  );
}
