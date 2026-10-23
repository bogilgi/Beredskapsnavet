import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beredskapsnavet",
  description:
    "Samlat stöd för kommunal krisberedskap och civilt försvar: krigsorganisation, krigsplacering, risk- och sårbarhetsanalys, kontinuitetshantering och lagefterlevnad.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
