import type { Metadata } from "next";
import { BillsPage } from "@/components/bills/bills-page";

export const metadata: Metadata = { title: "Bills · CargoOS" };

export default function Page() {
  return <BillsPage />;
}
