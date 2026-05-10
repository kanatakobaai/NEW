import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "補助金申請書AI - IT導入補助金の申請書を自動生成",
  description:
    "会社情報と課題を入力するだけで、採択率の高いIT導入補助金申請書を自動生成。中小企業・フリーランスの補助金申請をAIが強力サポート。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
