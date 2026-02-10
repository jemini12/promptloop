import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Promptly",
    template: "%s | Promptly",
  },
  description: "Schedule AI prompts, preview output, and deliver automated results to Discord or Telegram.",
  applicationName: "Promptly",
  keywords: ["AI automation", "prompt scheduler", "Discord", "Telegram", "workflow"],
  openGraph: {
    title: "Promptly",
    description: "Run AI prompts on your schedule and deliver results automatically.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Promptly",
    description: "Schedule AI prompts and deliver output automatically.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${jetbrainsMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
