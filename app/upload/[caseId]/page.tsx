import type { Metadata } from "next";
import { Suspense } from "react";
import { PhoneUploadPage } from "@/components/upload/phone-upload";

export const metadata: Metadata = { title: "Add documents · CargoOS" };

// The case id is read inside <Suspense>, so the page shell still prerenders (Cache Components).
async function PhoneForCase({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <PhoneUploadPage caseId={decodeURIComponent(caseId)} />;
}

// The phone page the QR code opens: its own small layout, no app frame.
export default function Page({ params }: { params: Promise<{ caseId: string }> }) {
  return (
    <Suspense>
      <PhoneForCase params={params} />
    </Suspense>
  );
}
