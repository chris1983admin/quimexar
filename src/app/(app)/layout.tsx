
"use client";

import { useState, useEffect, type ReactNode, createContext, useContext } from "react";
import Link from "next/link";
import Header from "@/components/layout/header";
import MainNav from "@/components/layout/main-nav";
import UserNav from "@/components/layout/user-nav";
import { Icons } from "@/components/icons";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
} from "@/components/ui/sidebar";
import {
  NotificationsContext,
  useProvideNotifications,
} from "@/hooks/use-notifications";


interface CurrentUser {
    id: string;
    username: string;
    avatar?: string;
    email: string;
}

export const UserContext = createContext<CurrentUser | null>(null);

export const useUser = () => {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
};

function NotificationsProvider({ children }: { children: ReactNode }) {
  const notificationsData = useProvideNotifications();
  return (
    <NotificationsContext.Provider value={notificationsData}>
      {children}
    </NotificationsContext.Provider>
  );
}

// Hardcoded user for single-user mode
const MOCK_USER: CurrentUser = {
  id: "test-user-id-01",
  username: "quimex",
  email: "usuario@quimexar.com",
  avatar: "logo",
};


export default function AppLayout({ children }: { children: React.ReactNode }) {

  return (
    <UserContext.Provider value={MOCK_USER}>
      <NotificationsProvider>
        <SidebarProvider>
          <Sidebar>
            <SidebarHeader>
              <Link href="/dashboard" className="flex items-center gap-2">
                <Icons.logo className="h-8 w-8 text-primary" />
                <span className="text-lg font-semibold">Quimexar</span>
              </Link>
            </SidebarHeader>
            <SidebarContent>
              <MainNav />
            </SidebarContent>
            <SidebarFooter>
              <UserNav />
            </SidebarFooter>
          </Sidebar>
          <div className="flex flex-1 flex-col">
            <Header />
            <SidebarInset>
              <main className="flex-1 p-4 sm:p-6">{children}</main>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </NotificationsProvider>
    </UserContext.Provider>
  );
}
