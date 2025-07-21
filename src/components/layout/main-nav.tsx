
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
  ShoppingCart,
  Truck,
  Receipt,
  BarChart,
  Settings,
  CircleDollarSign,
  Warehouse,
  Wallet,
  Briefcase,
  Undo2,
} from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/ventas", icon: CircleDollarSign, label: "Ventas" },
  { href: "/caja", icon: Wallet, label: "Caja" },
  { href: "/pedidos", icon: ShoppingCart, label: "Pedidos" },
  { href: "/vendedores", icon: Briefcase, label: "Vendedores" },
  { href: "/clientes", icon: Users, label: "Clientes" },
  { href: "/productos", icon: Package, label: "Productos" },
  { href: "/stock", icon: Warehouse, label: "Stock" },
  { href: "/devoluciones", icon: Undo2, label: "Devoluciones" },
  { href: "/pedidos-proveedores", icon: Truck, label: "Pedidos a Proveedores" },
  { href: "/facturacion", icon: Receipt, label: "Facturación" },
  { href: "/reportes", icon: BarChart, label: "Reportes" },
  { href: "/configuracion", icon: Settings, label: "Configuración" },
];

export default function MainNav() {
  const pathname = usePathname();
  
  return (
    <SidebarMenu>
      {navItems.map((item) => (
        <SidebarMenuItem key={item.href}>
          <Link href={item.href}>
            <SidebarMenuButton
              isActive={pathname.startsWith(item.href)}
              tooltip={item.label}
            >
              <item.icon />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </Link>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
