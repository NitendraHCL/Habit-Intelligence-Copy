"use client";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";
import { usePageAccess } from "@/lib/hooks/usePageAccess";

export default function AHCActionPlanPage() {
  usePageAccess("/portal/ahc/action-plan");
  return (
    <PageWrapper
      title="AHC Action Plan"
      subtitle="Annual Health Check recommended actions and follow-ups"
    >
      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-6">
            <ClipboardCheck size={32} className="text-violet-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">AHC Dashboard</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            This section integrates with the Annual Health Check platform.
            Connect to your AHC provider to view analytics.
          </p>
          <Button className="bg-violet-600 hover:bg-violet-700">
            Connect Platform
          </Button>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
