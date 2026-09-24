import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signup Call Flow — BondScanner Radar",
  description: "Automated signup call processing for BondScanner",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#0c1021', color: '#f1f5f9' }}>
        {children}
      </body>
    </html>
  );
}
