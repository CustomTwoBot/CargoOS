import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { ConvexClientProvider } from "@/components/convex-provider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "CargoOS · Checked before you pay",
  description: "Checks a freight invoice against what was agreed before you pay it.",
};

// Sets the theme class before first paint so the page doesn't flash. "system" follows the OS (Settings → Appearance).
const themeScript = `try{var t=localStorage.getItem("cargoos.theme");if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full"><ConvexClientProvider>{children}</ConvexClientProvider></body>
    </html>
  );
}
