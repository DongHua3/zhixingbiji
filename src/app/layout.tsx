import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google';
import { Toaster } from "sonner";
import "./globals.css";
import "./demo-styles.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

export const metadata: Metadata = {
  title: "知行笔记 (ZhiXing Notes)",
  description: "知行合一，学以致知；知行合一，学以致用",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`antialiased ${plusJakartaSans.variable} ${spaceGrotesk.variable}`}>
        {children}
        <Toaster 
          position="top-center"
          expand={true}
          visibleToasts={3}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: 'w-[380px] flex items-center justify-center p-4 border-[3px] border-black shadow-[6px_6px_0px_0px_#000] font-bold text-base bg-white mb-4 tracking-wide',
              success: '!bg-[var(--neo-green)] !text-black',
              error: '!bg-[var(--neo-pink)] !text-black',
              warning: '!bg-[var(--neo-yellow)] !text-black',
              info: '!bg-[var(--neo-blue)] !text-white',
            }
          }}
        />
      </body>
    </html>
  );
}
