
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DollarSign, ShoppingCart, Users, AlertTriangle, BarChart2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, DocumentData } from "firebase/firestore";
import { mapDocTo } from '@/lib/mappers';

// Interfaces for the data we'll be loading from Firestore
interface Product { id: string; name: string; stock: number; }
interface Customer { id: string; name: string; }
interface SaleItem { productId: string; quantity: number; price: number; }
interface Sale { total: number; timestamp: string; items?: SaleItem[] }
interface CashSession { sales: Sale[]; }
interface Order { total: number; createdAt: string; items: SaleItem[] }


export default function ReportesPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cashHistory, setCashHistory] = useState<CashSession[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => setProducts(snapshot.docs.map(doc => mapDocTo<Product>(doc))));
    const unsubCustomers = onSnapshot(collection(db, "customers"), (snapshot) => setCustomers(snapshot.docs.map(doc => mapDocTo<Customer>(doc))));
    const unsubCashHistory = onSnapshot(collection(db, "caja-history"), (snapshot) => setCashHistory(snapshot.docs.map(doc => mapDocTo<CashSession>(doc))));
    const unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => setOrders(snapshot.docs.map(doc => mapDocTo<Order>(doc))));
    
    setIsMounted(true);
    
    return () => {
        unsubProducts();
        unsubCustomers();
        unsubCashHistory();
        unsubOrders();
    };
  }, []);

  const allSales = useMemo(() => {
    const cashSales = cashHistory.flatMap(session => session.sales.map(sale => ({...sale, createdAt: sale.timestamp})));
    return [...cashSales, ...orders];
  }, [cashHistory, orders]);

  const stats = useMemo(() => {
    const totalRevenue = allSales.reduce((sum, sale) => sum + sale.total, 0);
    const totalSalesCount = allSales.length;
    const totalCustomers = customers.length;
    const lowStockProductCount = products.filter(p => p.stock > 0 && p.stock <= 10).length;

    return { totalRevenue, totalSalesCount, totalCustomers, lowStockProductCount };
  }, [allSales, customers, products]);

  const salesByMonth = useMemo(() => {
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const monthlyData: { [key: string]: number } = {};

    allSales.forEach(sale => {
      const date = new Date(sale.createdAt || (sale as Sale).timestamp);
      const monthKey = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
      if (!monthlyData[monthKey]) monthlyData[monthKey] = 0;
      monthlyData[monthKey] += sale.total;
    });
    
    const monthOrder = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return Object.entries(monthlyData)
      .map(([name, total]) => {
          const [month, year] = name.split(' ');
          return { name, total, month, year: parseInt(year, 10) };
      })
      .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
      })
      .slice(-12)
      .map(({ name, total }) => ({ name, total }));
  }, [allSales]);

  const salesByDay = useMemo(() => {
    const dailyData: { [key: string]: number } = {};
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 29);

    allSales.forEach(sale => {
        const saleDate = new Date(sale.createdAt || (sale as Sale).timestamp);
        if (saleDate >= thirtyDaysAgo) {
            const dayKey = format(saleDate, 'yyyy-MM-dd');
            if (!dailyData[dayKey]) dailyData[dayKey] = 0;
            dailyData[dayKey] += sale.total;
        }
    });

    const result = Array.from({ length: 30 }).map((_, i) => {
        const date = subDays(today, i);
        const dayKey = format(date, 'yyyy-MM-dd');
        const name = format(date, 'dd/MM', { locale: es });
        return { name, total: dailyData[dayKey] || 0 };
    }).reverse();

    return result;
  }, [allSales]);
  
  const topProducts = useMemo(() => {
      const productSales: { [key: string]: { name: string, quantity: number, revenue: number } } = {};
  
      products.forEach(p => {
          productSales[p.id] = { name: p.name, quantity: 0, revenue: 0 };
      });
  
      const allItems: SaleItem[] = allSales.flatMap(sale => sale.items || []);
  
      allItems.forEach(item => {
          if (item && item.productId && productSales[item.productId]) {
              productSales[item.productId].quantity += item.quantity;
              productSales[item.productId].revenue += item.price * item.quantity;
          }
      });
  
      return Object.values(productSales)
          .filter(p => p.quantity > 0)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);
  
  }, [products, allSales]);

  const lowStockProducts = useMemo(() => {
    return products
        .filter(p => p.stock <= 10)
        .sort((a,b) => a.stock - b.stock);
  }, [products]);


  if (!isMounted) {
    return <div className="flex justify-center items-center h-full"><BarChart2 className="h-10 w-10 animate-pulse"/></div>;
  }

  return (
    <div className="flex flex-col gap-6">
        <Card>
            <CardHeader className="flex-row items-center justify-between">
                <div>
                    <CardTitle>Resumen General de Reportes</CardTitle>
                    <CardDescription>
                    Una vista consolidada de las métricas clave de tu negocio.
                    </CardDescription>
                </div>
                <Link href="/reportes/avanzados">
                    <Button variant="outline" size="lg">
                        <Search className="mr-2 h-4 w-4" /> Ver Reportes Avanzados
                    </Button>
                </Link>
            </CardHeader>
        </Card>
      
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">${stats.totalRevenue.toFixed(2)}</div></CardContent>
            </Card>
            <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Ventas Realizadas</CardTitle><ShoppingCart className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.totalSalesCount}</div></CardContent>
            </Card>
            <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Clientes Registrados</CardTitle><Users className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.totalCustomers}</div></CardContent>
            </Card>
            <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Productos con Bajo Stock</CardTitle><AlertTriangle className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">${stats.lowStockProductCount}</div></CardContent>
            </Card>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Rendimiento de Ventas Mensuales</CardTitle>
                <CardDescription>Total de ingresos generados cada mes durante el último año.</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
                 <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={salesByMonth}>
                        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                        <Tooltip
                          cursor={{ fill: 'hsla(var(--muted))' }}
                          contentStyle={{
                            background: "hsl(var(--background))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "var(--radius)"
                          }}
                        />
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Rendimiento de Ventas Diarias</CardTitle>
                <CardDescription>Total de ingresos generados en los últimos 30 días.</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
                <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={salesByDay}>
                        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                        <Tooltip
                            cursor={{ fill: 'hsla(var(--muted))' }}
                            contentStyle={{
                                background: "hsl(var(--background))",
                                borderColor: "hsl(var(--border))",
                                borderRadius: "var(--radius)"
                            }}
                        />
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <Bar dataKey="total" fill="hsl(var(--accent-foreground))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Productos Más Vendidos</CardTitle>
                    <CardDescription>Top 5 productos por ingresos generados.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-center">Unidades</TableHead><TableHead className="text-right">Ingresos</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {topProducts.length > 0 ? topProducts.map(p => (
                                <TableRow key={p.name}>
                                    <TableCell className="font-medium">{p.name}</TableCell>
                                    <TableCell className="text-center">{p.quantity}</TableCell>
                                    <TableCell className="text-right">${p.revenue.toFixed(2)}</TableCell>
                                </TableRow>
                            )) : <TableRow><TableCell colSpan={3} className="text-center h-24">No hay datos de ventas de productos.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <Card>
                 <CardHeader>
                    <CardTitle>Alerta de Bajo Stock</CardTitle>
                    <CardDescription>Productos con 10 o menos unidades disponibles.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-right">Stock Actual</TableHead></TableRow></TableHeader>
                        <TableBody>
                           {lowStockProducts.length > 0 ? lowStockProducts.map(p => (
                                <TableRow key={p.id}>
                                    <TableCell className="font-medium">{p.name}</TableCell>
                                    <TableCell className="text-right"><Badge variant={p.stock === 0 ? "destructive" : "secondary"}>{p.stock}</Badge></TableCell>
                                </TableRow>
                            )) : <TableRow><TableCell colSpan={2} className="text-center h-24">Ningún producto con bajo stock.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
