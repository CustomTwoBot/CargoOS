import type { Metadata } from "next";
import { StartScreen } from "@/components/onboarding/start-screen";

export const metadata: Metadata = { title: "Set up this screen · CargoOS" };

export default function StartPage() {
  return <StartScreen />;
}
