import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "穿搭助手｜今天穿什么",
  description: "只用你真实拥有、当前能穿的衣物，给出今天的一套穿搭和原因。",
  openGraph: {
    title: "今天穿什么",
    description: "只用你真实拥有的衣服",
    images: [{ url: "/og.png", width: 1730, height: 909, alt: "今天穿什么" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#5db5fa",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
