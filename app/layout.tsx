import type { Metadata } from "next";
import { Host_Grotesk } from "next/font/google";
import { ConvexClientProvider } from "@/components/convex-provider";
import "./globals.css";

const hostGrotesk = Host_Grotesk({
  variable: "--font-host-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CargoOS",
  description: "Checks a freight invoice against what was agreed before you pay it.",
};

// Sets the theme class before first paint so the page doesn't flash (docs/design.md §3.2). "system"
// follows the OS (Settings → Appearance, §0.3).
const themeScript = `try{var t=localStorage.getItem("cargoos.theme");if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hostGrotesk.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full"><ConvexClientProvider>{children}</ConvexClientProvider></body>
    </html>
  );
}
