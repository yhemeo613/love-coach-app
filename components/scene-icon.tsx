"use client";

import {
  CalendarCheck,
  CloudRain,
  Coffee,
  Compass,
  HeartHandshake,
  Home,
  LifeBuoy,
  MessageCircle,
  MessagesSquare,
  Route,
  Shield,
  Sparkle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Compass,
  Sparkles,
  MessageCircle,
  MessagesSquare,
  CalendarCheck,
  Coffee,
  HeartHandshake,
  Home,
  Shield,
  CloudRain,
  Route,
  LifeBuoy,
  Sparkle,
};

export function SceneIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = iconMap[name] ?? Sparkle;
  return <Icon className={className} aria-hidden="true" />;
}
