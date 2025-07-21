"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar";
import UserNav from "./user-nav";
import { Notifications } from "./notifications";

export default function Header() {
  const { isMobile } = useSidebar();
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 sm:h-16 sm:px-6">
      <SidebarTrigger className="md:hidden" />
      <div className="flex-1" />
      <div className="flex items-center gap-2">
          <Notifications />
          <div className="hidden md:block">
            <UserNav />
          </div>
      </div>
    </header>
  );
}
