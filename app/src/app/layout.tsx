import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/lib/wagmi";
import { CursorGlow } from "@/components/CursorGlow";
import { RouteSweep } from "@/components/RouteSweep";
import "@/styles/globals.css";

const sans = Sora({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spark | Pay once. Unlock credit.",
  description:
    "We verify your payment so credit can open. No paperwork chase. Credit on Creditcoin after verified payment.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.png", type: "image/png" }, { url: "/brand/logo.png", type: "image/png" }] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">
        <CursorGlow />
        <RouteSweep />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
