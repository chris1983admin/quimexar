
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DollarSign, Users, ShoppingCart, Briefcase, BarChart2 } from "lucide-react";
import { Overview } from "@/components/dashboard/overview";
import { RecentSales } from "@/components/dashboard/recent-sales";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, DocumentData, query, orderBy, limit } from "firebase/firestore";
import { mapDocTo } from "@/lib/mappers";

// Interfaces for the data we'll be loading
interface Sale { total: number; timestamp: string; }
interface Order { total: number; createdAt: string; status: string; }
interface Customer { id: string; name: string; }
interface Seller { id: string; name: string; balance: number; }
interface Invoice { id: string; customerName: string; total: number; date: string; }
interface CashSession { sales: Sale[]; }
interface RecentSale { name: string; email: string; amount: string; avatar: string; }

export default function DashboardPage() {
  const [isMounted, setIsMounted] = useState(false);
  
  const [stats, setStats] = useState({
    totalRevenue: 0,
    newCustomers: 0,
    pendingOrders: 0,
    sellersBalance: 0,
  });
  const [salesByMonth, setSalesByMonth] = useState<{name: string, total: number}[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [totalSalesCount, setTotalSalesCount] = useState(0);

  useEffect(() => {
    // --- Data Listeners ---
    const unsubCashHistory = onSnapshot(collection(db, "caja-history"), (snapshot) => {
        const cashHistory: CashSession[] = snapshot.docs.map(doc => mapDocTo<CashSession>(doc));
        const ordersQuery = query(collection(db, "orders"));
        onSnapshot(ordersQuery, (ordersSnapshot) => {
            const orders: Order[] = ordersSnapshot.docs.map(doc => mapDocTo<Order>(doc));
            const cashSales = cashHistory.flatMap(session => session.sales);
            const allSales = [...cashSales.map(s => ({...s, createdAt: s.timestamp})), ...orders];
      
            const totalRevenue = allSales.reduce((sum, sale) => sum + sale.total, 0);
            setTotalSalesCount(allSales.length);
            setStats(prev => ({...prev, totalRevenue}));

             // Process sales for chart
            const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
            const monthlyData: { [key: string]: number } = {};

            allSales.forEach(sale => {
                const date = new Date(sale.createdAt);
                if(!isNaN(date.getTime())) {
                    const year = date.getFullYear();
                    const month = date.getMonth();
                    const monthKey = `${monthNames[month]} ${year}`;
                    if (!monthlyData[monthKey]) monthlyData[monthKey] = 0;
                    monthlyData[monthKey] += sale.total;
                }
            });

            const twelveMonthsAgo = new Date();
            twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
            twelveMonthsAgo.setDate(1);

            const chartData = Array.from({length: 12}, (_, i) => {
                const d = new Date(twelveMonthsAgo.getFullYear(), twelveMonthsAgo.getMonth() + i, 1);
                const name = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
                return { name, total: monthlyData[name] || 0 };
            });

            setSalesByMonth(chartData);
            setStats(prev => ({...prev, pendingOrders: orders.filter(o => o.status === 'Pendiente').length}));
        });
    });

    const unsubCustomers = onSnapshot(collection(db, "customers"), (snapshot) => {
        setStats(prev => ({...prev, newCustomers: snapshot.size}));
    });
    
    const unsubSellers = onSnapshot(collection(db, "sellers"), (snapshot) => {
        const sellers: Seller[] = snapshot.docs.map(doc => mapDocTo<Seller>(doc));
        const sellersBalance = sellers.reduce((sum, seller) => sum + seller.balance, 0);
        setStats(prev => ({...prev, sellersBalance}));
    });

    const recentInvoicesQuery = query(collection(db, "invoices"), orderBy("date", "desc"), limit(5));
    const unsubInvoices = onSnapshot(recentInvoicesQuery, (snapshot) => {
        const invoices: Invoice[] = snapshot.docs.map(doc => mapDocTo<Invoice>(doc));
        const lastFiveSales = invoices.map(inv => {
            const nameParts = inv.customerName.split(' ');
            const avatar = (nameParts[0]?.[0] || '') + (nameParts[1]?.[0] || '');
            return {
                name: inv.customerName,
                email: `${inv.customerName.toLowerCase().replace(/\s/g, '.')}@email.com`,
                amount: `+$${inv.total.toFixed(2)}`,
                avatar: avatar.toUpperCase(),
            }
        });
        setRecentSales(lastFiveSales);
    });

    setIsMounted(true);
    
    return () => {
        unsubCashHistory();
        unsubCustomers();
        unsubSellers();
        unsubInvoices();
    }
  }, []);

  if (!isMounted) {
    return <div className="flex justify-center items-center h-full"><BarChart2 className="h-10 w-10 animate-pulse"/></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/reportes">
          <Card className="hover:shadow-lg transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Ventas Totales
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.totalRevenue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                De {totalSalesCount} transacciones totales
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/clientes">
          <Card className="hover:shadow-lg transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Clientes Registrados
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{stats.newCustomers}</div>
              <p className="text-xs text-muted-foreground">
                Total de clientes en el sistema
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/pedidos">
          <Card className="hover:shadow-lg transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pedidos Pendientes</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{stats.pendingOrders}</div>
              <p className="text-xs text-muted-foreground">
                Pendientes de cobro y reparto
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/vendedores">
          <Card className="hover:shadow-lg transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saldo Vendedores</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.sellersBalance.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Valor de mercadería asignada</p>
            </CardContent>
          </Card>
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Resumen de Ventas</CardTitle>
             <CardDescription>
              Ingresos de los últimos 12 meses.
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <Overview data={salesByMonth} />
          </CardContent>
        </Card>
        <Card className="col-span-4 lg:col-span-3">
          <CardHeader>
            <CardTitle>Ventas Recientes</CardTitle>
            <CardDescription>
              Últimas 5 facturas generadas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecentSales data={recentSales} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
