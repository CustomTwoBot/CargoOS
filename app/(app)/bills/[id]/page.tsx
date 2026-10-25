import { Suspense } from "react";
import { BillPage } from "@/components/bill/bill-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <BillPage id={decodeURIComponent(id)} />
    </Suspense>
  );
}
