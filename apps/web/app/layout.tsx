import type React from "react";
import { Fraunces, Space_Grotesk } from "next/font/google";
import { Providers } from "./providers";
import { Navbar } from "../components/Navbar";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans"
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif"
});

export const metadata = {
  title: "FORGOOD",
  description: "The Autonomous Agent for Collective Social Impact."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${fraunces.variable}`}>
      <body className="bg-atmosphere min-h-screen">
        <Providers>
          <Navbar />
          <div className="grid-halo min-h-screen">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
