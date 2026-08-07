import type { Metadata } from "next";
import "../src/styles.css";

export const metadata: Metadata = {
  title: "今天穿什么",
  description: "只用你真实拥有、当前能穿的衣物，给出今天的一套穿搭和原因。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
