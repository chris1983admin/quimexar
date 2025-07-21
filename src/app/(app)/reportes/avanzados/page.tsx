
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, DocumentData } from "firebase/firestore";
import { mapDocTo } from '@/lib/mappers';

// Data interfaces
interface Seller {
    id: string;
    name: string;
    balance: number;
}
interface Invoice {
    id: string;
    customerId: string;
    customerName: string;
    total: number;
    status: 'Pendiente' | 'Pagada' | 'Vencida' | 'Anulada';
    payments: { amount: number }[];
}
interface Client {
    id: string;
    name: string;
}

export default function AdvancedReportsPage() {
    const [sellers, setSellers] = useState<Seller[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        const unsubSellers = onSnapshot(collection(db, "sellers"), (snapshot) => {
            setSellers(snapshot.docs.map(doc => mapDocTo<Seller>(doc)));
        });
        const unsubInvoices = onSnapshot(collection(db, "invoices"), (snapshot) => {
            setInvoices(snapshot.docs.map(doc => mapDocTo<Invoice>(doc)));
        });
        const unsubClients = onSnapshot(collection(db, "customers"), (snapshot) => {
            setClients(snapshot.docs.map(doc => mapDocTo<Client>(doc)));
        });

        return () => {
            unsubSellers();
            unsubInvoices();
            unsubClients();
        }
    }, []);

    const salesBySeller = useMemo(() => {
        // This report is simplified, as detailed sales are nested. 
        // We'll use the seller's balance as a proxy for this example.
        // A more advanced implementation would aggregate the nested sales array.
        return sellers.map(seller => ({
            name: seller.name,
            total: seller.balance // Using balance as a proxy for "value handled"
        })).filter(s => s.total > 0);
    }, [sellers]);

    const customersWithDebt = useMemo(() => {
        const balances: Record<string, number> = {};
        clients.forEach(c => balances[c.id] = 0);
        invoices.forEach(inv => {
            if (inv.status === "Pendiente" || inv.status === "Vencida") {
                const paidAmount = inv.payments.reduce((sum, p) => sum + p.amount, 0);
                balances[inv.customerId] = (balances[inv.customerId] || 0) + (inv.total - paidAmount);
            }
        });

        return clients
            .map(client => ({ ...client, balance: balances[client.id] || 0 }))
            .filter(client => client.balance > 0)
            .sort((a, b) => b.balance - a.balance);
    }, [invoices, clients]);

    const handleExport = () => {
        toast({
            title: 'Función no disponible',
            description: 'La exportación a Excel y PDF estará disponible próximamente.',
        });
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Reportes Avanzados</CardTitle>
                    <CardDescription>Análisis detallados para una toma de decisiones informada.</CardDescription>
                </CardHeader>
            </Card>

            <Tabs defaultValue="products">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="products">Rendimiento de Productos</TabsTrigger>
                    <TabsTrigger value="sellers">Ventas por Vendedor</TabsTrigger>
                    <TabsTrigger value="customers">Deuda de Clientes</TabsTrigger>
                    <TabsTrigger value="billing">Facturación</TabsTrigger>
                </TabsList>
                
                <TabsContent value="products">
                    <Card>
                        <CardHeader>
                            <CardTitle>Análisis de Productos</CardTitle>
                            <CardDescription>Visualiza los productos más y menos vendidos.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-center text-muted-foreground py-16">
                            <p>Próximamente: Gráficos y tablas de rendimiento de productos.</p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="sellers">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Valor en Stock por Vendedor</CardTitle>
                                <CardDescription>Valor total de la mercadería asignada a cada vendedor.</CardDescription>
                            </div>
                             <Button variant="outline" onClick={handleExport}><FileDown className="mr-2 h-4 w-4" /> Exportar</Button>
                        </CardHeader>
                        <CardContent className="pl-2">
                            <ResponsiveContainer width="100%" height={350}>
                                <BarChart data={salesBySeller}>
                                    <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                    <Tooltip />
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="customers">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Clientes con Saldo Deudor</CardTitle>
                                <CardDescription>Listado de clientes con facturas pendientes de pago.</CardDescription>
                            </div>
                            <Button variant="outline" onClick={handleExport}><FileDown className="mr-2 h-4 w-4" /> Exportar</Button>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Saldo Deudor</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {customersWithDebt.length > 0 ? customersWithDebt.map(client => (
                                        <TableRow key={client.id}>
                                            <TableCell className="font-medium">{client.name}</TableCell>
                                            <TableCell className="text-right font-mono text-destructive">${client.balance.toFixed(2)}</TableCell>
                                        </TableRow>
                                    )) : <TableRow><TableCell colSpan={2} className="h-24 text-center">No hay clientes con deuda.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="billing">
                     <Card>
                        <CardHeader>
                            <CardTitle>Análisis de Facturación</CardTitle>
                            <CardDescription>Visualiza la facturación mensual y la rentabilidad.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-center text-muted-foreground py-16">
                            <p>Próximamente: Gráficos de facturación y margen por producto.</p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
