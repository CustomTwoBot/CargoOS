import { Suspense } from "react";
import { BillPage } from "@/components/bill/bill-page";

// The id is read inside Suspense, so the frame around the bill shows at once on navigation.
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Bill params={params} />
    </Suspense>
  );
}

async function Bill({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BillPage id={decodeURIComponent(id)} />;
}
