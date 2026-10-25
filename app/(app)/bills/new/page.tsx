import type { Metadata } from "next";
import { Suspense } from "react";
import { NewBillPage } from "@/components/upload/new-bill";

export const metadata: Metadata = { title: "New bill · CargoOS" };

export default function NewBill() {
  return (
    <Suspense>
      <NewBillPage />
    </Suspense>
  );
}
