"use client";

import { useNotifications } from "@/hooks/use-notifications";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, CheckCheck, FileWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";


function NotificationIcon({ type }: { type: string }) {
    switch (type) {
        case 'low-stock': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
        case 'invoice-due': return <FileWarning className="h-5 w-5 text-orange-500" />;
        case 'invoice-overdue': return <FileWarning className="h-5 w-5 text-destructive" />;
        default: return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
}

export function Notifications() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 w-4 justify-center rounded-full p-0 text-xs">
              {unreadCount}
            </Badge>
          )}
          <span className="sr-only">Notificaciones</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Card className="border-none shadow-none">
            <CardHeader className="flex-row items-center justify-between p-4 border-b">
                <CardTitle className="text-lg">Notificaciones</CardTitle>
                {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                        <CheckCheck className="mr-2 h-4 w-4"/>
                        Marcar todo como leído
                    </Button>
                )}
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="h-96">
                {notifications.length > 0 ? (
                    notifications.map(n => (
                        <Link key={n.id} href={n.href || '#'} passHref>
                            <div 
                                className={cn(
                                    "flex items-start gap-3 p-4 border-b last:border-b-0 cursor-pointer hover:bg-muted",
                                    !n.read && "bg-primary/5"
                                )}
                                onClick={() => markAsRead(n.id)}
                            >
                                <NotificationIcon type={n.type} />
                                <div className="flex-1 space-y-1">
                                    <p className="font-semibold">{n.title}</p>
                                    <p className="text-sm text-muted-foreground">{n.description}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true, locale: es })}
                                    </p>
                                </div>
                                {!n.read && <div className="h-2.5 w-2.5 rounded-full bg-primary mt-1" />}
                            </div>
                        </Link>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground">
                        <Bell className="h-8 w-8 mb-2"/>
                        <p>No tienes notificaciones</p>
                    </div>
                )}
                </ScrollArea>
            </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}
