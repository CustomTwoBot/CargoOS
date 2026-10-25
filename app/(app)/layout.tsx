import { Suspense } from "react";
import { AppFrame } from "@/components/app/app-frame";
import { BillsProvider } from "@/components/app/bills-provider";

// Every signed-in page shares one BillsProvider, so a bill keeps its state while you move between pages.
// The frame reads the URL (usePathname), so it streams in under Suspense.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <BillsProvider>
        <AppFrame>{children}</AppFrame>
      </BillsProvider>
    </Suspense>
  );
}
