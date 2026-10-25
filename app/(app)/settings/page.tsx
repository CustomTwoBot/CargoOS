import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "Settings · CargoOS" };

export default function Settings() {
  return <SettingsPage />;
}
