import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Element TD 2 · Build Lab",
  description: "Shape your Element TD 2 lineup, discover your best next tower, and plan a stronger continuation."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
