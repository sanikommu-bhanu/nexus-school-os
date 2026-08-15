import { Home, School, ClipboardList, Sparkles, User, BookOpen, CalendarClock, Users, HeartHandshake } from "lucide-react";
import type { Role } from "@/types";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_CONFIG: Record<Role, NavItem[]> = {
  admin: [
    { href: "/admin", label: "Home", icon: Home },
    { href: "/admin/school", label: "School", icon: School },
    { href: "/admin/operations", label: "Operations", icon: ClipboardList },
    { href: "/admin/ai", label: "AI", icon: Sparkles },
    { href: "/admin/profile", label: "Profile", icon: User },
  ],
  teacher: [
    { href: "/teacher", label: "Home", icon: Home },
    { href: "/teacher/classes", label: "Classes", icon: Users },
    { href: "/teacher/schedule", label: "Schedule", icon: CalendarClock },
    { href: "/teacher/ai", label: "AI", icon: Sparkles },
    { href: "/teacher/profile", label: "Profile", icon: User },
  ],
  student: [
    { href: "/student", label: "Home", icon: Home },
    { href: "/student/learn", label: "Learn", icon: BookOpen },
    { href: "/student/schedule", label: "Schedule", icon: CalendarClock },
    { href: "/student/ai", label: "AI", icon: Sparkles },
    { href: "/student/profile", label: "Profile", icon: User },
  ],
  parent: [
    { href: "/parent", label: "Home", icon: Home },
    { href: "/parent/child", label: "Child", icon: HeartHandshake },
    { href: "/parent/updates", label: "Updates", icon: ClipboardList },
    { href: "/parent/ai", label: "AI", icon: Sparkles },
    { href: "/parent/profile", label: "Profile", icon: User },
  ],
};
