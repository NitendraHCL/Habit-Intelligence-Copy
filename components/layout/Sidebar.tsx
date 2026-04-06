"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Download,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { navigation, type NavItem } from "@/lib/config/navigation";
import { useWalkthrough } from "@/components/walkthrough/WalkthroughProvider";
import { useAuth } from "@/lib/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SIDEBAR_EXPANDED_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 64;

/* ── Section grouping for nav labels ── */
const sectionLabels: Record<string, string> = {
  "/portal/home": "Main",
  "/portal/ohc": "OHC",
  "/portal/ahc": "AHC",
  "/portal/employee-experience": "Employee Experience",
  "/portal/engagement": "Insights",
};

function getSectionLabel(item: NavItem, index: number): string | null {
  if (index === 0) return "Main";
  if (sectionLabels[item.href] && sectionLabels[item.href] !== "Main")
    return sectionLabels[item.href];
  return null;
}

/* ── Glassmorphism flyout panel for collapsed sidebar ── */
function SubcategoryFlyout({
  item,
  anchorTop,
  onClose,
}: {
  item: NavItem;
  anchorTop: number;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const Icon = item.icon;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
      />
      {/* Glass panel */}
      <div
        ref={panelRef}
        className="fixed z-50 animate-in slide-in-from-left-2 fade-in duration-200"
        style={{
          left: SIDEBAR_COLLAPSED_WIDTH + 8,
          top: Math.max(anchorTop - 12, 80),
          minWidth: 240,
        }}
      >
        <div
          className="rounded-2xl border px-2 py-3 shadow-2xl"
          style={{
            background: "rgba(255,255,255,0.82)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            borderColor: "rgba(255,255,255,0.45)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-3 pb-2.5 mb-1 border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: "rgba(30,64,136,0.08)" }}>
              <Icon className="size-[15px] text-[#1E4088]" />
            </div>
            <span className="text-[14px] font-bold text-[#111827] tracking-[-0.01em]">{item.label}</span>
            <button
              onClick={onClose}
              className="ml-auto rounded-lg p-1 hover:bg-[#F5F6FA] transition-colors"
            >
              <X className="size-3.5 text-[#9CA3AF]" />
            </button>
          </div>

          {/* Subcategory links */}
          <div className="space-y-[2px]">
            {item.children!.map((child) => {
              const ChildIcon = child.icon;
              const isChildActive = !child.external && pathname === child.href;
              const LinkTag = child.external ? "a" : Link;
              const linkProps = child.external
                ? { href: child.href, target: "_blank", rel: "noopener noreferrer", onClick: onClose }
                : { href: child.href, onClick: onClose };
              return (
                <LinkTag
                  key={child.href}
                  {...linkProps as any}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                    "hover:bg-[rgba(30,64,136,0.06)] hover:text-[#1E4088]",
                    isChildActive
                      ? "bg-[rgba(30,64,136,0.08)] text-[#1E4088] font-semibold"
                      : "text-[#4B5563]"
                  )}
                >
                  {isChildActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[16px] rounded-r-[3px] bg-[#1E4088]" />
                  )}
                  <ChildIcon
                    className={cn(
                      "size-[16px] shrink-0",
                      isChildActive ? "text-[#1E4088]" : "opacity-60 group-hover:opacity-100"
                    )}
                  />
                  <span className="truncate">{child.label}</span>
                  {isChildActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#1E4088]" />
                  )}
                </LinkTag>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function NavItemLink({
  item,
  isCollapsed,
  depth = 0,
  onFlyout,
}: {
  item: NavItem;
  isCollapsed: boolean;
  depth?: number;
  onFlyout?: (item: NavItem, top: number) => void;
}) {
  const pathname = usePathname();
  const hasChildren = item.children && item.children.length > 0;
  const isActive =
    pathname === item.href ||
    (hasChildren && item.children!.some((child) => pathname === child.href));
  const isExactActive = pathname === item.href;

  const [isExpanded, setIsExpanded] = useState(isActive);
  const itemRef = useRef<HTMLDivElement>(null);

  // Auto-expand section when navigated to (e.g. during walkthrough)
  useEffect(() => {
    if (isActive && hasChildren) setIsExpanded(true);
  }, [isActive, hasChildren]);

  const Icon = item.icon;

  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded((prev) => !prev);
    }
  };

  const handleCollapsedClick = () => {
    if (isCollapsed && hasChildren && onFlyout) {
      const rect = itemRef.current?.getBoundingClientRect();
      onFlyout(item, rect?.top ?? 200);
    }
  };

  const linkContent = (
    <div
      ref={itemRef}
      {...(item.walkthroughId ? { "data-walkthrough": item.walkthroughId } : {})}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-[10px] px-3 py-[9px] text-[13.5px] font-medium transition-all duration-150",
        "hover:bg-[#F5F6FA] hover:text-[#111827]",
        isExactActive
          ? "bg-[rgba(30,64,136,0.06)] text-[#1E4088] font-semibold"
          : isActive && isCollapsed
          ? "bg-[rgba(30,64,136,0.04)] text-[#1E4088]"
          : "text-[#4B5563]",
        isCollapsed && "justify-center px-0",
        depth > 0 && !isCollapsed && "ml-7 pl-3"
      )}
    >
      {/* Active indicator bar */}
      {isExactActive && !isCollapsed && (
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-[3px] bg-[#1E4088]" />
      )}
      {/* Active dot for collapsed parent with active child */}
      {isActive && isCollapsed && !isExactActive && (
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#1E4088]" />
      )}
      <Icon
        className={cn(
          "size-[18px] shrink-0",
          isExactActive || (isActive && isCollapsed)
            ? "text-[#1E4088] opacity-100"
            : "opacity-[0.65] group-hover:opacity-100"
        )}
      />
      {!isCollapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggle();
              }}
              className="rounded p-0.5 hover:bg-[#E5E7EB]/50"
            >
              {isExpanded ? (
                <ChevronDown className="size-3.5 text-[#9CA3AF]" />
              ) : (
                <ChevronRight className="size-3.5 text-[#9CA3AF]" />
              )}
            </button>
          )}
        </>
      )}
    </div>
  );

  const wrappedLink = hasChildren ? (
    <div>
      {/* Parent items with children */}
      <div
        onClick={isCollapsed ? handleCollapsedClick : handleToggle}
        className="cursor-pointer"
      >
        {linkContent}
      </div>
      {!isCollapsed && isExpanded && (
        <div className="mt-[2px] space-y-[1px]">
          {item.children!.map((child) => (
            <NavItemLink
              key={child.href}
              item={child}
              isCollapsed={isCollapsed}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  ) : item.external ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer">{linkContent}</a>
  ) : (
    <Link href={item.href}>{linkContent}</Link>
  );

  if (isCollapsed && !hasChildren) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{wrappedLink}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return wrappedLink;
}

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [flyout, setFlyout] = useState<{ item: NavItem; top: number } | null>(null);
  const { shouldExpandSidebar } = useWalkthrough();
  const { user, assignedClients, activeClientId, setActiveClientId } = useAuth();
  const activeClient = assignedClients.find((c) => c.id === activeClientId);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);

  // Force sidebar expanded when walkthrough step requires it
  const effectiveCollapsed = shouldExpandSidebar ? false : isCollapsed;

  const handleFlyout = useCallback((item: NavItem, top: number) => {
    setFlyout((prev) => (prev?.item.href === item.href ? null : { item, top }));
  }, []);

  const closeFlyout = useCallback(() => setFlyout(null), []);

  // Close flyout when sidebar expands
  useEffect(() => {
    if (!effectiveCollapsed) setFlyout(null);
  }, [effectiveCollapsed]);

  return (
    <aside
      data-walkthrough="sidebar"
      className="relative flex h-screen flex-col bg-white border-r border-[#E5E7EB] transition-all duration-300 ease-in-out"
      style={{
        width: effectiveCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
        minWidth: effectiveCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
      }}
    >
      {/* Centered edge toggle button */}
      <button
        onClick={() => setIsCollapsed((prev) => !prev)}
        className="absolute top-1/2 -translate-y-1/2 -right-3 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-[#E5E7EB] bg-white shadow-sm hover:bg-[#F5F6FA] hover:shadow transition-all duration-150"
      >
        {effectiveCollapsed ? (
          <ChevronRight className="size-3.5 text-[#6B7280]" />
        ) : (
          <ChevronDown className="size-3.5 text-[#6B7280] -rotate-90" />
        )}
      </button>
      {/* Logo / Brand area */}
      <div
        className={cn(
          "shrink-0 border-b border-[#F3F4F6] px-5 pt-5 pb-4",
          effectiveCollapsed && "flex flex-col items-center px-2 pt-4 pb-3"
        )}
      >
        <Link href="/portal/home" className="flex items-center gap-3">
          <Image
            src="/logos/habit-intelligence-logo.png"
            alt="Habit Intelligence"
            width={36}
            height={36}
            className="shrink-0"
          />
          {!effectiveCollapsed && (
            <div className="flex flex-col">
              <span className="text-[15px] font-bold tracking-[-0.02em] text-[#111827]">
                Habit Intelligence
              </span>
              <span className="text-[11px] font-medium text-[#9CA3AF] tracking-[0.02em] mt-[1px]">
                Analytics Platform
              </span>
            </div>
          )}
        </Link>

        {/* Client selector */}
        {!effectiveCollapsed ? (
          <div className="mt-3.5 relative">
            <button
              onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
              className="w-full flex items-center gap-2.5 rounded-xl bg-[#F5F6FA] px-3 py-2.5 cursor-pointer hover:bg-[#EEEEF2] transition-colors"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1E4088]">
                <span className="text-[10px] font-bold text-white">
                  {(activeClient?.cugName || "?").slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex flex-col min-w-0 text-left">
                <span className="text-[13px] font-semibold text-[#111827] truncate">
                  {activeClient?.cugName || "Select Client"}
                </span>
                {activeClient?.cugCode && (
                  <span className="text-[10px] text-[#9CA3AF] truncate">{activeClient.cugCode}</span>
                )}
              </div>
              <ChevronDown className={cn("size-3.5 text-[#9CA3AF] shrink-0 ml-auto transition-transform", clientDropdownOpen && "rotate-180")} />
            </button>
            {clientDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-[#E5E7EB] rounded-xl shadow-lg max-h-64 overflow-y-auto">
                {assignedClients.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setActiveClientId(c.id); setClientDropdownOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F5F6FA] transition-colors",
                      c.id === activeClientId && "bg-[#EEF2FF]"
                    )}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#1E4088]">
                      <span className="text-[8px] font-bold text-white">{c.cugName.slice(0, 2).toUpperCase()}</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] font-medium text-[#111827] truncate">{c.cugName}</span>
                      {c.cugCode && <span className="text-[10px] text-[#9CA3AF]">{c.cugCode}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#1E4088] cursor-pointer" title={activeClient?.cugName || "Select Client"}>
            <span className="text-[10px] font-bold text-white">
              {(activeClient?.cugName || "?").slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Navigation with section labels */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <nav className={cn("flex flex-col", effectiveCollapsed ? "px-2 py-3" : "")}>
          {navigation.map((item, index) => {
            const sectionLabel = !effectiveCollapsed
              ? getSectionLabel(item, index)
              : null;
            return (
              <div key={item.href}>
                {sectionLabel && (
                  <div className="px-6 pt-4 pb-2">
                    <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9CA3AF]">
                      {sectionLabel}
                    </span>
                  </div>
                )}
                <div className={cn(!effectiveCollapsed && "px-4")}>
                  <NavItemLink item={item} isCollapsed={effectiveCollapsed} onFlyout={handleFlyout} />
                </div>
              </div>
            );
          })}

          {/* Subcategory flyout overlay */}
          {effectiveCollapsed && flyout && flyout.item.children && (
            <SubcategoryFlyout item={flyout.item} anchorTop={flyout.top} onClose={closeFlyout} />
          )}
        </nav>
      </div>

      {/* ── Bottom section: User + Collapse ── */}
      <div className="shrink-0 border-t border-[#F3F4F6]">
        {/* User profile */}
        <div className={cn("px-4 py-3", effectiveCollapsed && "flex justify-center px-2")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "flex items-center gap-2.5 w-full rounded-[10px] px-2 py-2 transition-all duration-150 hover:bg-[#F5F6FA]",
                effectiveCollapsed && "justify-center px-0"
              )}>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src="/avatars/user.png" alt="User" />
                  <AvatarFallback className="text-[11px] font-bold bg-gradient-to-br from-[#E0E7FF] to-[#C7D2FE] text-[#1E4088]">
                    {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "?"}
                  </AvatarFallback>
                </Avatar>
                {!effectiveCollapsed && (
                  <div className="flex flex-col text-left min-w-0">
                    <span className="text-[13px] font-semibold text-[#111827] truncate">{user?.name || "User"}</span>
                    <span className="text-[11px] text-[#9CA3AF]">{user?.role?.replace("_", " ") || ""}</span>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={effectiveCollapsed ? "center" : "end"} side="top" className="w-48">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.href = "/login"; }); }}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Collapse toggle */}
        <div className={cn("px-3 pb-3", effectiveCollapsed && "flex justify-center px-2")}>
          <Button
            variant="ghost"
            size={effectiveCollapsed ? "icon" : "default"}
            onClick={() => setIsCollapsed((prev) => !prev)}
            className={cn(
              "text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F5F6FA] h-8",
              !effectiveCollapsed && "w-full justify-start gap-2"
            )}
          >
            {effectiveCollapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <>
                <PanelLeftClose className="size-4" />
                <span className="text-xs">Collapse</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
