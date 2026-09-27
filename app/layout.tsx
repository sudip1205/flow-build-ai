import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowBuild-AI",
  description: "Draw a flowchart, pick a language, get working code.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
