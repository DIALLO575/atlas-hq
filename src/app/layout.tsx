import type { Metadata, Viewport } from "next";
import { InstallPrompt } from "@/components/install-prompt";
import "./globals.css";
import "./atlas-redesign.css";
import "./apps-redesign.css";
import "./smart-dock.css";

export const metadata: Metadata = {
  title: "Atlas — Agents, apps et missions",
  description: "Votre espace pour coordonner vos agents IA, vos applications et vos missions.",
  applicationName: "Atlas",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Atlas", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#faf9fd",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
