
"use client";

import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { useUser } from "@/app/(app)/layout";
import { Icons } from "@/components/icons";

export default function UserNav() {
  const { state } = useSidebar();
  const router = useRouter();
  const currentUser = useUser();

  if (!currentUser) {
      return null;
  }
  
  const avatarFallback = currentUser.username?.charAt(0).toUpperCase() || "U";
  const avatarSrc = currentUser.avatar || `https://i.pravatar.cc/150?u=${currentUser.email}`;
  const isLogoAvatar = avatarSrc === 'logo';

  const UserAvatar = () => (
    <Avatar className="h-8 w-8">
      {isLogoAvatar ? (
        <Icons.logo className="h-8 w-8 text-primary p-1" />
      ) : (
        <>
          <AvatarImage src={avatarSrc} alt={`@${currentUser.username}`} />
          <AvatarFallback>{avatarFallback}</AvatarFallback>
        </>
      )}
    </Avatar>
  );

  if (state === "collapsed") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <UserAvatar />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{currentUser.username}</p>
              <p className="text-xs leading-none text-muted-foreground">{currentUser.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => router.push('/configuracion')}>Configuración</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex w-full items-center justify-between rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent">
       <div className="flex items-center gap-2 overflow-hidden">
        <UserAvatar />
        <div className="flex flex-col truncate">
            <span className="font-medium">{currentUser.username}</span>
            <span className="text-xs text-muted-foreground">{currentUser.email}</span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuItem onClick={() => router.push('/configuracion')}>Configuración</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
