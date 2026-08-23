import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZeteChat",
  description: "A small, readable AI chat starter built by Zetemora.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
