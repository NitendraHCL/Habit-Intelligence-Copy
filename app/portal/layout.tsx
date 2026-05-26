"use client";

import { AuthProvider } from "@/lib/contexts/auth-context";
import { ConfigProvider } from "@/lib/contexts/config-context";
import { FilterProvider } from "@/lib/filter-context";
import { AIPanelProvider } from "@/lib/ai-panel-context";
import { Sidebar } from "@/components/layout/Sidebar";
import AskHabitAI from "@/components/ai/AskHabitAI";
import { WalkthroughProvider } from "@/components/walkthrough/WalkthroughProvider";
import { WalkthroughOverlay } from "@/components/walkthrough/WalkthroughOverlay";
import { WalkthroughTrigger } from "@/components/walkthrough/WalkthroughTrigger";
import { IdleTimer } from "@/components/auth/IdleTimer";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      {/* 60-min inactivity auto-logout — mounted once for the whole portal */}
      <IdleTimer />
      <ConfigProvider>
      <FilterProvider>
        <AIPanelProvider>
          <WalkthroughProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-y-auto bg-[#F5F6FA] p-6">{children}</main>
            </div>
            <AskHabitAI />
            <WalkthroughOverlay />
            <WalkthroughTrigger />
          </WalkthroughProvider>
        </AIPanelProvider>
      </FilterProvider>
      </ConfigProvider>
    </AuthProvider>
  );
}
