import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist fonts load karo â€” Vercel ka official typeface hai
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// SEO metadata â€” Push2Prod branding ke saath
export const metadata: Metadata = {
  title: "Push2Prod",
  description: "Deploy your projects with Push2Prod",
};

import { Providers } from "./providers";
import { auth, signIn, signOut } from "@/auth";
import UserDropdown from "@/components/UserDropdown";
import ThemeToggle from "@/components/ThemeToggle";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {/* Top navigation bar â€” pure server component, koi client JS nahi */}
          <nav className="sticky top-0 z-50 w-full border-b border-border-hairline bg-card-bg/80 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
              {/* Logo â€” Vercel triangle ke saath brand name */}
              <a
                href="/projects"
                className="flex items-center gap-2 text-text-ink font-semibold text-base tracking-tight transition-opacity hover:opacity-80"
              >
                <span className="text-lg">â–²</span>
                <span>Push2Prod</span>
              </a>

              {/* Nav links â€” right side mein aligned */}
              <div className="flex items-center gap-4">
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
                
                <div className="w-px h-4 bg-border-hairline mx-2"></div>
                <ThemeToggle />

                {session?.user ? (
                  <UserDropdown user={session.user} />
                ) : (
                  <form action={async () => {
                    'use server';
                    await signIn('github');
                  }}>
                    <button type="submit" className="text-sm font-medium bg-text-ink text-background px-3 py-1.5 rounded-md hover:opacity-80 transition-opacity ml-2">
                      Sign In with GitHub
                    </button>
                  </form>
                )}
              </div>
            </div>
          </nav>

          {/* Page content yahan render hoga */}
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
