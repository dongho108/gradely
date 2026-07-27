import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.NODE_ENV === "production" ? "Gradely" : "Gradely (dev)",
  description: "교사를 위한 AI 자동 채점 서비스",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=Fira+Code:wght@400;500;600&display=swap"
        />
      </head>
      <body className="antialiased bg-[#ECFEFF] text-[#164E63]">
        {children}
      </body>
    </html>
  );
}
