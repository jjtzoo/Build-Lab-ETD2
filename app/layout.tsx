import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Element TD 2 · Build Lab",
  description: "Full-stack build optimization and mechanics research platform for Element TD 2."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
