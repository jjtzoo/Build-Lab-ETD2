import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SupportRail } from "@/components/SupportRail";
import { SITE_NAME, SITE_URL } from "@/lib/siteConfig";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

const DEFAULT_DESCRIPTION =
  "Plan around your anchor tower. Explore recommended support, keystone routes, coverage, and synergy.";

const OG_IMAGE = {
  url: "/branding/buildlab-icon.png",
  width: 1254,
  height: 1254,
  alt: SITE_NAME,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Element TD 2 | Build Lab",
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "JJ Toledo" }],
  creator: "JJ Toledo (jjtzoo)",
  keywords: [
    "Element TD 2",
    "ETD2",
    "build calculator",
    "tower defense",
    "build guide",
    "theorycraft",
  ],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Element TD 2 | Build Lab",
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary",
    title: "Element TD 2 | Build Lab",
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      style={
        {
          "--font-sans": sans.style.fontFamily,
          "--font-mono": mono.style.fontFamily,
        } as React.CSSProperties
      }
    >
      <body>
        {children}
        <SupportRail />
      </body>
    </html>
  );
}
