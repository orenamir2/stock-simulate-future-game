import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Possible — Probability-weighted stock scenarios",
    description: "Turn evidence into 20 probability-weighted three-year stock scenarios.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "Possible", description: "Price the possible, not just the probable.", type: "website", images: [{ url: image, width: 1675, height: 941, alt: "Possible stock scenario engine" }] },
    twitter: { card: "summary_large_image", title: "Possible", description: "Price the possible, not just the probable.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
