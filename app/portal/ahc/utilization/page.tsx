"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import PageToolbar from "@/components/shared/PageToolbar";
import { usePageAccess } from "@/lib/hooks/usePageAccess";

const EXTERNAL_URL =
  "https://facility.habithealth.com/patient-registration/patient_tab/list?tab_0=patient&p__no=0";

export default function AHCUtilizationPage() {
  usePageAccess("/portal/ahc/utilization");
  useEffect(() => {
    window.open(EXTERNAL_URL, "_blank");
  }, []);

  return (
    <div className="animate-fade-in flex flex-col items-center justify-center py-32 text-center">
      <div className="flex items-center justify-end mb-4 w-full">
        <PageToolbar
          pageSlug="/portal/ahc/utilization"
          pageTitle="AHC Utilization"
          charts={[
            { id: "ahcRedirect", label: "AHC Platform Redirect" },
          ]}
        />
      </div>
      <Loader2 size={28} className="animate-spin text-[#1E4088] mb-4" />
      <p className="text-[14px] font-bold text-[#1A1D2B] mb-1">Redirecting to AHC Platform...</p>
      <p className="text-[13px] text-[#5F6478] max-w-md mb-4">
        The AHC Utilization page is opening in a new tab.
      </p>
      <a
        href={EXTERNAL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-[#1E4088] hover:opacity-90 transition-opacity"
      >
        Open Manually
      </a>
    </div>
  );
}
