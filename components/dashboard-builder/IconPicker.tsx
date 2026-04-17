"use client";

import { useState } from "react";
import {
  BarChart3,
  LineChart,
  PieChart,
  Activity,
  Heart,
  Stethoscope,
  Users,
  UserCheck,
  Brain,
  ShieldCheck,
  ClipboardCheck,
  CalendarDays,
  TrendingUp,
  Gauge,
  Target,
  Layers,
  LayoutDashboard,
  FileText,
  Bell,
  Pill,
  Thermometer,
  Microscope,
  Syringe,
  Hospital,
  Ambulance,
  HeartPulse,
  Dumbbell,
  Eye,
  Smile,
  type LucideIcon,
  BarChartHorizontal,
  Wallet,
  BadgeCheck,
  Star,
  Zap,
  Globe,
  Building2,
  Sparkles,
  RefreshCw,
  Handshake,
  CircleDollarSign,
} from "lucide-react";

export const DASHBOARD_ICONS: { name: string; icon: LucideIcon; label: string }[] = [
  { name: "BarChart3", icon: BarChart3, label: "Bar Chart" },
  { name: "LineChart", icon: LineChart, label: "Line Chart" },
  { name: "PieChart", icon: PieChart, label: "Pie Chart" },
  { name: "BarChartHorizontal", icon: BarChartHorizontal, label: "Horizontal Bar" },
  { name: "Activity", icon: Activity, label: "Activity" },
  { name: "TrendingUp", icon: TrendingUp, label: "Trending Up" },
  { name: "Gauge", icon: Gauge, label: "Gauge" },
  { name: "Target", icon: Target, label: "Target" },
  { name: "LayoutDashboard", icon: LayoutDashboard, label: "Dashboard" },
  { name: "Layers", icon: Layers, label: "Layers" },
  { name: "Stethoscope", icon: Stethoscope, label: "Stethoscope" },
  { name: "Heart", icon: Heart, label: "Heart" },
  { name: "HeartPulse", icon: HeartPulse, label: "Heart Pulse" },
  { name: "Hospital", icon: Hospital, label: "Hospital" },
  { name: "Pill", icon: Pill, label: "Pill" },
  { name: "Thermometer", icon: Thermometer, label: "Thermometer" },
  { name: "Microscope", icon: Microscope, label: "Microscope" },
  { name: "Syringe", icon: Syringe, label: "Syringe" },
  { name: "Ambulance", icon: Ambulance, label: "Ambulance" },
  { name: "Brain", icon: Brain, label: "Brain" },
  { name: "Eye", icon: Eye, label: "Eye" },
  { name: "Smile", icon: Smile, label: "Smile" },
  { name: "Dumbbell", icon: Dumbbell, label: "Fitness" },
  { name: "Users", icon: Users, label: "Users" },
  { name: "UserCheck", icon: UserCheck, label: "User Check" },
  { name: "ShieldCheck", icon: ShieldCheck, label: "Shield" },
  { name: "ClipboardCheck", icon: ClipboardCheck, label: "Clipboard" },
  { name: "CalendarDays", icon: CalendarDays, label: "Calendar" },
  { name: "Bell", icon: Bell, label: "Notifications" },
  { name: "FileText", icon: FileText, label: "Report" },
  { name: "Wallet", icon: Wallet, label: "Wallet" },
  { name: "BadgeCheck", icon: BadgeCheck, label: "Verified" },
  { name: "Star", icon: Star, label: "Star" },
  { name: "Zap", icon: Zap, label: "Zap" },
  { name: "Globe", icon: Globe, label: "Globe" },
  { name: "Building2", icon: Building2, label: "Building" },
  { name: "Sparkles", icon: Sparkles, label: "Sparkles" },
  { name: "RefreshCw", icon: RefreshCw, label: "Refresh" },
  { name: "Handshake", icon: Handshake, label: "Handshake" },
  { name: "CircleDollarSign", icon: CircleDollarSign, label: "Revenue" },
];

export function getIconByName(name: string): LucideIcon {
  return DASHBOARD_ICONS.find((i) => i.name === name)?.icon ?? BarChart3;
}

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
}

export default function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const SelectedIcon = getIconByName(value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:border-gray-300 transition-colors w-full"
      >
        <SelectedIcon className="size-4 text-indigo-600" />
        <span className="text-gray-700 flex-1 text-left">
          {DASHBOARD_ICONS.find((i) => i.name === value)?.label ?? value}
        </span>
        <span className="text-gray-400 text-xs">▼</span>
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl p-2 max-h-60 overflow-y-auto">
          <div className="grid grid-cols-5 gap-1">
            {DASHBOARD_ICONS.map((item) => {
              const Icon = item.icon;
              const isSelected = value === item.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    onChange(item.name);
                    setOpen(false);
                  }}
                  title={item.label}
                  className={`flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors ${
                    isSelected
                      ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300"
                      : "hover:bg-gray-100 text-gray-600"
                  }`}
                >
                  <Icon className="size-4" />
                  <span className="text-[8px] leading-tight truncate w-full text-center">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
