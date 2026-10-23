import type { Metadata, Viewport } from "next";
import { InstallPrompt } from "@/components/install-prompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATLAS HQ — votre cockpit",
  description: "Le cockpit personnel pour retrouver vos espaces et avancer sereinement.",
  applicationName: "ATLAS HQ",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ATLAS HQ", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#101415",
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
