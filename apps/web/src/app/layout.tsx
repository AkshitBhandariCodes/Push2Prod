import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist fonts load karo — Vercel ka official typeface hai
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// SEO metadata — Vercel-Pro branding ke saath
export const metadata: Metadata = {
  title: "Vercel-Pro",
  description: "Deploy your projects with Vercel-Pro",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Top navigation bar — pure server component, koi client JS nahi */}
        <nav className="sticky top-0 z-50 w-full border-b border-border-hairline bg-card-bg/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
            {/* Logo — Vercel triangle ke saath brand name */}
            <a
              href="/projects"
              className="flex items-center gap-2 text-text-ink font-semibold text-base tracking-tight transition-opacity hover:opacity-80"
            >
              <span className="text-lg">▲</span>
              <span>Vercel-Pro</span>
            </a>

            {/* Nav links — right side mein aligned */}
            <div className="flex items-center gap-6">
              <a
                href="/projects"
                className="text-sm text-text-mute hover:text-text-ink transition-colors duration-150"
              >
                Projects
              </a>
              <a
                href="/health"
                className="text-sm text-text-mute hover:text-text-ink transition-colors duration-150"
              >
                Health
              </a>
              <a
                href="/database-debug"
                className="text-sm text-text-mute hover:text-text-ink transition-colors duration-150"
              >
                Debug
              </a>
            </div>
          </div>
        </nav>

        {/* Page content yahan render hoga */}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
