
"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  DoorOpen,
  DoorClosed,
  PlusCircle,
  FileDown,
  TrendingDown,
  Wallet,
  Landmark,
  Banknote,
  CreditCard,
  BookUser,
} from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, setDoc, deleteDoc, doc, DocumentData, query, orderBy, serverTimestamp, getDocs, where, updateDoc } from "firebase/firestore";
import { useUser } from "@/app/(app)/layout";
import { mapDocTo } from "@/lib/mappers";

// Interfaces
interface Sale {
  id: string;
  total: number;
  paymentMethod: "Efectivo" | "Tarjeta" | "Transferencia" | "Cuenta Corriente";
  timestamp: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  timestamp: string;
}

interface CashSession {
  id: string;
  user: string;
  openingTime: string;
  initialAmount: number;
  sales: Sale[];
  expenses: Expense[];
  closingTime?: string;
  countedTotals?: Record<string, number>;
  observations?: string;
}

const openBoxSchema = z.object({
  initialAmount: z.coerce
    .number()
    .min(0, "El monto inicial no puede ser negativo."),
});
type OpenBoxFormData = z.infer<typeof openBoxSchema>;

const expenseSchema = z.object({
  description: z.string().min(3, "La descripción es requerida."),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero."),
});
type ExpenseFormData = z.infer<typeof expenseSchema>;

const closeBoxSchema = z.object({
  countedEfectivo: z.coerce.number().min(0),
  countedTarjeta: z.coerce.number().min(0),
  countedTransferencia: z.coerce.number().min(0),
  observations: z.string().optional(),
});
type CloseBoxFormData = z.infer<typeof closeBoxSchema>;

export default function CajaPage() {
  const [session, setSession] = useState<CashSession | null>(null);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpeningDialog, setIsOpeningDialog] = useState(false);
  const [isClosingDialog, setIsClosingDialog] = useState(false);
  const [isExpenseDialog, setIsExpenseDialog] = useState(false);
  const currentUser = useUser();
  const { toast } = useToast();

  const openForm = useForm<OpenBoxFormData>({
    resolver: zodResolver(openBoxSchema),
    defaultValues: { initialAmount: 0 },
  });
  const expenseForm = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
  });
  const closeForm = useForm<CloseBoxFormData>({
    resolver: zodResolver(closeBoxSchema),
  });

  useEffect(() => {
    const qSession = query(collection(db, "caja-sessions"));
    const unsubSession = onSnapshot(qSession, (snapshot) => {
      if (!snapshot.empty) {
        const sessionDoc = snapshot.docs[0];
        setSession(mapDocTo<CashSession>(sessionDoc));
      } else {
        setSession(null);
      }
      setIsMounted(true);
    });

    const qHistory = query(collection(db, "caja-history"), orderBy("closingTime", "desc"));
    const unsubHistory = onSnapshot(qHistory, (snapshot) => {
        setHistory(snapshot.docs.map(doc => mapDocTo<CashSession>(doc)));
    });

    return () => {
        unsubSession();
        unsubHistory();
    };
  }, []);
  
  const expectedTotals = useMemo(() => {
    if (!session) return { Efectivo: 0, Tarjeta: 0, Transferencia: 0, "Cuenta Corriente": 0, Total: 0, Gastos: 0 };
    
    const salesByMethod = session.sales.reduce((acc, sale) => {
        acc[sale.paymentMethod] = (acc[sale.paymentMethod] || 0) + sale.total;
        return acc;
    }, {} as Record<string, number>);

    const totalExpenses = session.expenses.reduce((acc, expense) => acc + expense.amount, 0);

    return {
        Efectivo: (salesByMethod['Efectivo'] || 0),
        Tarjeta: (salesByMethod['Tarjeta'] || 0),
        Transferencia: (salesByMethod['Transferencia'] || 0),
        "Cuenta Corriente": (salesByMethod['Cuenta Corriente'] || 0),
        Total: Object.values(salesByMethod).reduce((sum, amount) => sum + amount, 0),
        Gastos: totalExpenses,
    }
  }, [session]);
  
  useEffect(() => {
    if (session && isClosingDialog) {
      const expectedCashInBox = session.initialAmount + expectedTotals.Efectivo - expectedTotals.Gastos;
      const roundedExpectedCash = parseFloat(expectedCashInBox.toFixed(2));
      closeForm.reset({
        countedEfectivo: roundedExpectedCash,
        countedTarjeta: expectedTotals.Tarjeta,
        countedTransferencia: expectedTotals.Transferencia,
        observations: session.observations || "",
      });
    }
  }, [session, isClosingDialog, expectedTotals, closeForm]);

  const handleOpenBox = async (data: OpenBoxFormData) => {
    const activeSessionsQuery = query(collection(db, "caja-sessions"));
    const activeSessionsSnap = await getDocs(activeSessionsQuery);
    if (!activeSessionsSnap.empty) {
      toast({ variant: 'destructive', title: "Error", description: "Ya existe una caja activa." });
      return;
    }

    const newSession: Omit<CashSession, "id"> = {
      user: currentUser?.username || "Usuario Desconocido",
      openingTime: new Date().toISOString(),
      initialAmount: data.initialAmount,
      sales: [],
      expenses: [],
    };
    try {
        await addDoc(collection(db, "caja-sessions"), newSession);
        toast({ title: "Caja Abierta", description: `Se inició la jornada con $${data.initialAmount.toFixed(2)}.` });
        setIsOpeningDialog(false);
        openForm.reset();
    } catch(e) {
        toast({ variant: 'destructive', title: "Error", description: "No se pudo abrir la caja." });
    }
  };
  
  const handleAddExpense = async (data: ExpenseFormData) => {
    if (!session) return;
    const newExpense: Expense = {
        id: `EXP-${Date.now()}`,
        timestamp: new Date().toISOString(),
        ...data,
    };
    try {
        const sessionDoc = doc(db, "caja-sessions", session.id);
        await updateDoc(sessionDoc, {
            expenses: [...session.expenses, newExpense]
        });
        toast({ title: "Gasto Registrado", description: `Se registró un gasto de $${data.amount.toFixed(2)}.` });
        setIsExpenseDialog(false);
        expenseForm.reset();
    } catch (e) {
        toast({ variant: 'destructive', title: "Error", description: "No se pudo registrar el gasto." });
    }
  };

  const handleCloseBox = async (data: CloseBoxFormData) => {
    if (!session) return;

    const closedSession: Omit<CashSession, "id"> = {
        ...session,
        closingTime: new Date().toISOString(),
        countedTotals: {
            Efectivo: data.countedEfectivo,
            Tarjeta: data.countedTarjeta,
            Transferencia: data.countedTransferencia,
        },
        observations: data.observations,
    };
    
    try {
        await setDoc(doc(db, "caja-history", session.id), closedSession);
        await deleteDoc(doc(db, "caja-sessions", session.id));
        toast({ title: "Caja Cerrada", description: "La jornada ha finalizado exitosamente." });
        setIsClosingDialog(false);
    } catch (e) {
        toast({ variant: 'destructive', title: "Error", description: "No se pudo cerrar la caja." });
    }
  };
  
  const differences = useMemo(() => {
    if (!session) {
      return { Efectivo: 0, Tarjeta: 0, Transferencia: 0 };
    }
    const counted = closeForm.getValues();
    const expectedCashInBox =
      session.initialAmount + expectedTotals.Efectivo - expectedTotals.Gastos;
    return {
      Efectivo: counted.countedEfectivo - expectedCashInBox,
      Tarjeta: counted.countedTarjeta - expectedTotals.Tarjeta,
      Transferencia: counted.countedTransferencia - expectedTotals.Transferencia,
    };
  }, [closeForm, expectedTotals, session]);


  if (!isMounted) return <div className="flex justify-center items-center h-full"><Wallet className="h-10 w-10 animate-pulse"/></div>;

  if (!session) {
    return (
      <div className="grid gap-6">
        <Card className="text-center">
            <CardHeader>
                <div className="mx-auto bg-primary/10 p-4 rounded-full w-fit">
                    <DoorClosed className="h-10 w-10 text-primary"/>
                </div>
                <CardTitle>Caja Cerrada</CardTitle>
                <CardDescription>No hay una jornada de caja activa. Para comenzar a registrar ventas, abre una nueva jornada.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button size="lg" onClick={() => setIsOpeningDialog(true)}>
                    <DoorOpen className="mr-2 h-4 w-4" /> Abrir Caja
                </Button>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Historial de Cierres</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader><TableRow><TableHead>Fecha Cierre</TableHead><TableHead>Usuario</TableHead><TableHead className="text-right">Venta Total</TableHead><TableHead className="text-right">Diferencia Efectivo</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {history.length > 0 ? history.map(h => {
                            const totalSales = h.sales.reduce((sum, s) => sum + s.total, 0);
                            const expectedCash = h.sales.filter(s=>s.paymentMethod === "Efectivo").reduce((sum,s)=>sum+s.total,0) + h.initialAmount - h.expenses.reduce((sum,e)=>sum+e.amount,0);
                            const diff = (h.countedTotals?.Efectivo ?? 0) - expectedCash;
                            return (
                            <TableRow key={h.id}>
                                <TableCell>{h.closingTime ? new Date(h.closingTime).toLocaleString('es-AR') : 'N/A'}</TableCell>
                                <TableCell>{h.user}</TableCell>
                                <TableCell className="text-right">${totalSales.toFixed(2)}</TableCell>
                                <TableCell className={`text-right font-medium ${diff !== 0 ? 'text-destructive' : ''}`}>${diff.toFixed(2)}</TableCell>
                            </TableRow>
                        )}) : <TableRow><TableCell colSpan={4} className="text-center h-24">No hay cierres anteriores.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        {/* Dialog para Abrir Caja */}
        <Dialog open={isOpeningDialog} onOpenChange={setIsOpeningDialog}>
            <DialogContent>
                <DialogHeader><DialogTitle>Abrir Nueva Jornada de Caja</DialogTitle><DialogDescription>Ingresa el monto inicial para comenzar.</DialogDescription></DialogHeader>
                <Form {...openForm}>
                <form onSubmit={openForm.handleSubmit(handleOpenBox)} className="space-y-4 py-4">
                    <FormField control={openForm.control} name="initialAmount" render={({ field }) => (<FormItem><FormLabel>Monto inicial en caja (Efectivo)</FormLabel><FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                    <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit">Abrir Caja</Button></DialogFooter>
                </form>
                </Form>
            </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
              <div>
                  <CardTitle>Jornada de Caja Activa</CardTitle>
                  <CardDescription>Abierta por <strong>{session.user}</strong> el {new Date(session.openingTime).toLocaleString('es-AR')}</CardDescription>
              </div>
              <Button variant="destructive" onClick={() => setIsClosingDialog(true)}>Cerrar Caja</Button>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Fondo Inicial</CardTitle><Banknote className="h-4 w-4 text-muted-foreground"/></CardHeader>
                    <CardContent><div className="text-2xl font-bold">${session.initialAmount.toFixed(2)}</div></CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Ventas Totales</CardTitle><Wallet className="h-4 w-4 text-muted-foreground"/></CardHeader>
                    <CardContent><div className="text-2xl font-bold">${expectedTotals.Total.toFixed(2)}</div><p className="text-xs text-muted-foreground">{session.sales.length} transacciones</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Gastos</CardTitle><TrendingDown className="h-4 w-4 text-muted-foreground"/></CardHeader>
                    <CardContent><div className="text-2xl font-bold">${expectedTotals.Gastos.toFixed(2)}</div><p className="text-xs text-muted-foreground">{session.expenses.length} registros</p></CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Efectivo Esperado</CardTitle><Banknote className="h-4 w-4 text-muted-foreground"/></CardHeader>
                    <CardContent><div className="text-2xl font-bold">${(session.initialAmount + expectedTotals.Efectivo - expectedTotals.Gastos).toFixed(2)}</div></CardContent>
                </Card>
          </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Gastos de la Jornada</CardTitle>
                <Button variant="outline" size="sm" onClick={()=>setIsExpenseDialog(true)}><PlusCircle className="mr-2 h-4 w-4"/>Registrar Gasto</Button>
            </CardHeader>
            <CardContent>
                 <Table>
                    <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {session.expenses.length > 0 ? session.expenses.map(exp=>(
                            <TableRow key={exp.id}>
                                <TableCell>{new Date(exp.timestamp).toLocaleTimeString('es-AR')}</TableCell>
                                <TableCell>{exp.description}</TableCell>
                                <TableCell className="text-right">${exp.amount.toFixed(2)}</TableCell>
                            </TableRow>
                        )) : <TableRow><TableCell colSpan={3} className="text-center h-24">No hay gastos registrados.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-1">
        <Card>
            <CardHeader><CardTitle>Ventas de la Jornada</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
                {session.sales.length > 0 ? session.sales.map(sale => (
                    <div key={sale.id} className="flex items-center">
                        <div className="p-2 bg-muted rounded-full mr-3">
                           {sale.paymentMethod === 'Efectivo' && <Banknote className="h-5 w-5 text-muted-foreground"/>}
                           {sale.paymentMethod === 'Tarjeta' && <CreditCard className="h-5 w-5 text-muted-foreground"/>}
                           {sale.paymentMethod === 'Transferencia' && <Landmark className="h-5 w-5 text-muted-foreground"/>}
                           {sale.paymentMethod === 'Cuenta Corriente' && <BookUser className="h-5 w-5 text-muted-foreground"/>}
                        </div>
                        <div className="flex-grow">
                            <p className="font-medium">{sale.paymentMethod}</p>
                            <p className="text-sm text-muted-foreground">{new Date(sale.timestamp).toLocaleTimeString('es-AR')}</p>
                        </div>
                        <div className="font-bold text-lg">${sale.total.toFixed(2)}</div>
                    </div>
                )) : <p className="text-center text-muted-foreground py-10">Aún no hay ventas.</p>}
            </CardContent>
        </Card>
      </div>

       {/* Dialog para Registrar Gasto */}
        <Dialog open={isExpenseDialog} onOpenChange={setIsExpenseDialog}>
            <DialogContent>
                <DialogHeader><DialogTitle>Registrar Gasto</DialogTitle><DialogDescription>Añade un gasto que se descontará del efectivo en caja.</DialogDescription></DialogHeader>
                <Form {...expenseForm}>
                <form onSubmit={expenseForm.handleSubmit(handleAddExpense)} className="space-y-4 py-4">
                    <FormField control={expenseForm.control} name="description" render={({ field }) => (<FormItem><FormLabel>Descripción</FormLabel><FormControl><Input placeholder="Ej: Compra de insumos de limpieza" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={expenseForm.control} name="amount" render={({ field }) => (<FormItem><FormLabel>Monto</FormLabel><FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                    <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit">Registrar Gasto</Button></DialogFooter>
                </form>
                </Form>
            </DialogContent>
        </Dialog>

        {/* Dialog para Cerrar Caja */}
        <Dialog open={isClosingDialog} onOpenChange={setIsClosingDialog}>
            <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Cierre de Caja</DialogTitle><DialogDescription>Verifica los totales y confirma el cierre de la jornada.</DialogDescription></DialogHeader>
                <Form {...closeForm}>
                    <form onSubmit={closeForm.handleSubmit(handleCloseBox)}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                            <div className="space-y-4">
                                <h3 className="font-semibold text-lg">Valores Esperados</h3>
                                <div className="space-y-2 rounded-md border p-4">
                                    <div className="flex justify-between"><span>Fondo Inicial:</span> <span className="font-mono">${session.initialAmount.toFixed(2)}</span></div>
                                    <div className="flex justify-between"><span>+ Ventas en Efectivo:</span> <span className="font-mono">${expectedTotals.Efectivo.toFixed(2)}</span></div>
                                    <div className="flex justify-between"><span>- Gastos:</span> <span className="font-mono text-destructive">-${expectedTotals.Gastos.toFixed(2)}</span></div>
                                    <Separator/>
                                    <div className="flex justify-between font-bold"><span>Total Efectivo Esperado:</span> <span className="font-mono">${(session.initialAmount + expectedTotals.Efectivo - expectedTotals.Gastos).toFixed(2)}</span></div>
                                </div>
                                 <div className="space-y-2 rounded-md border p-4">
                                    <div className="flex justify-between"><span>Ventas con Tarjeta:</span> <span className="font-mono">${expectedTotals.Tarjeta.toFixed(2)}</span></div>
                                    <div className="flex justify-between"><span>Ventas con Transferencia:</span> <span className="font-mono">${expectedTotals.Transferencia.toFixed(2)}</span></div>
                                     <div className="flex justify-between"><span>Ventas en Cta. Cte.:</span> <span className="font-mono">${expectedTotals["Cuenta Corriente"].toFixed(2)}</span></div>
                                </div>
                                <Button type="button" variant="outline" className="w-full" onClick={()=>toast({title: 'Próximamente', description: 'La generación de PDF estará disponible pronto.'})}>
                                    <FileDown className="mr-2 h-4 w-4"/> Descargar Resumen (PDF)
                                </Button>
                            </div>
                            <div className="space-y-4">
                                <h3 className="font-semibold text-lg">Valores Reales (Arqueo)</h3>
                                <FormField control={closeForm.control} name="countedEfectivo" render={({ field }) => (<FormItem><FormLabel>Efectivo Contado</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                <FormField control={closeForm.control} name="countedTarjeta" render={({ field }) => (<FormItem><FormLabel>Total cupones Tarjeta</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                <FormField control={closeForm.control} name="countedTransferencia" render={({ field }) => (<FormItem><FormLabel>Total transferencias</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                
                                <Card>
                                    <CardHeader className="p-4"><CardTitle className="text-base">Diferencias</CardTitle></CardHeader>
                                    <CardContent className="p-4 pt-0 space-y-2">
                                        <div className="flex justify-between"><span>Efectivo:</span> <Badge variant={differences.Efectivo !== 0 ? 'destructive' : 'default'}>${differences.Efectivo.toFixed(2)}</Badge></div>
                                        <div className="flex justify-between"><span>Tarjeta:</span> <Badge variant={differences.Tarjeta !== 0 ? 'destructive' : 'default'}>${differences.Tarjeta.toFixed(2)}</Badge></div>
                                        <div className="flex justify-between"><span>Transferencia:</span> <Badge variant={differences.Transferencia !== 0 ? 'destructive' : 'default'}>${differences.Transferencia.toFixed(2)}</Badge></div>
                                    </CardContent>
                                </Card>

                                <FormField control={closeForm.control} name="observations" render={({ field }) => (<FormItem><FormLabel>Observaciones</FormLabel><FormControl><Textarea placeholder="Notas sobre el cierre..." {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)}/>
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                            <Button type="submit" variant="destructive">Confirmar y Cerrar Caja</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    </div>
  );
}
