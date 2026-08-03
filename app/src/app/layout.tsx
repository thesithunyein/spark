import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/lib/wagmi";
import "@/styles/globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-geist" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Spark — Pay once. Unlock credit.",
  description:
    "We verify your payment so credit can open—no paperwork chase. Attestcoin-powered credit on Creditcoin.",
  icons: { icon: [{ url: "/favicon.png", type: "image/png" }, { url: "/brand/logo.png", type: "image/png" }] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
