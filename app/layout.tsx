import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "恋爱教练";

export const metadata: Metadata = {
  title: {
    default: `${siteName} · AI 约会与关系教练`,
    template: `%s · ${siteName}`,
  },
  description:
    "以场景为单位的 AI 恋爱教练：从自我建设、开口、聊天、邀约，到关系维持与冲突处理，给出可执行的具体做法。",
  keywords: ["恋爱教练", "约会建议", "沟通技巧", "关系维护", "AI 对话"],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

const themeBootstrap = `(function(){try{var t=localStorage.getItem("lc-theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="dark"||(!t&&d)){document.documentElement.classList.add("dark");}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
