import type { Metadata } from "next";
import { Header } from "@/components/app-shell/header";
import { Navigation } from "@/components/app-shell/navigation";
import "./globals.css";
import { AppStateProvider } from "@/components/app-shell/app-state-provider";

export const metadata: Metadata = {
  title: "Element TD 2 · Build Lab",
  description:
    "Full-stack build optimization and mechanics research platform for Element TD 2.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppStateProvider>
          <main className="shell">
            <Header />
            <Navigation />
            {children}
          </main>
        </AppStateProvider>
      </body>
    </html>
  );
}