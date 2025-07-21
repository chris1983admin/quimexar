
"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, addDays, isPast } from "date-fns";
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
  FilePlus2,
  Receipt,
  Printer,
  CircleDollarSign,
  History,
  Download,
  Send,
  PlusCircle,
  CheckCircle,
} from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, doc, DocumentData, query, writeBatch, where } from "firebase/firestore";
import { mapDocTo } from "@/lib/mappers";

// Interfaces
interface BillableItem {
  id: string;
  date: string;
  customerId: string;
  customerName: string;
  items: { productName: string; quantity: number; price: number }[];
  total: number;
  type: "pos-sale" | "delivery-order";
  invoiced: boolean;
  invoiceId?: string;
}

interface Payment {
  id: string;
  date: string;
  amount: number;
  method: "Efectivo" | "Tarjeta" | "Transferencia" | "Cheque";
}

interface Invoice {
  id: string;
  type: "A" | "B" | "C" | "Ticket";
  sequentialId: string;
  customerId: string;
  customerName: string;
  date: string;
  dueDate: string;
  items: { description: string; quantity: number; price: number; total: number }[];
  total: number;
  status: "Pendiente" | "Pagada" | "Vencida" | "Anulada";
  payments: Payment[];
  sourceSaleIds: string[];
}

interface Client {
  id: string;
  name: string;
  type: "Consumidor Final" | "Empresa";
}

interface Expense {
    id: string;
    description: string;
    category: string;
    amount: number;
    dueDate: string;
    status: 'Pendiente' | 'Pagado';
    paymentDate?: string;
}

// Zod Schemas
const generateInvoiceSchema = z.object({
  customerId: z.string().min(1, "Debe seleccionar un cliente."),
  invoiceType: z.enum(["A", "B", "C", "Ticket"]),
  issueDate: z.string(),
  dueDate: z.string(),
  selectedSales: z.array(z.string()).min(1, "Debe seleccionar al menos una venta."),
});
const registerPaymentSchema = z.object({
  amount: z.coerce.number().positive("El monto debe ser mayor a cero."),
  date: z.string().min(1, "La fecha es requerida."),
  method: z.enum(["Efectivo", "Tarjeta", "Transferencia", "Cheque"]),
});
const expenseSchema = z.object({
    description: z.string().min(3, "La descripción es requerida."),
    category: z.string().min(2, "La categoría es requerida."),
    amount: z.coerce.number().positive("El monto debe ser mayor a cero."),
    dueDate: z.string().min(1, "La fecha de vencimiento es requerida."),
});

export default function FacturacionPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billableItems, setBillableItems] = useState<BillableItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [actionDialog, setActionDialog] = useState<
    | { type: "generate" }
    | { type: "payment"; invoiceId: string }
    | { type: "statement"; clientId: string }
    | { type: "expense" }
    | null
  >(null);
  const [filters, setFilters] = useState({ client: "all", type: "all", status: "all" });
  const { toast } = useToast();

  const generateInvoiceForm = useForm<z.infer<typeof generateInvoiceSchema>>({
    resolver: zodResolver(generateInvoiceSchema),
    defaultValues: {
      issueDate: format(new Date(), "yyyy-MM-dd"),
      dueDate: format(addDays(new Date(), 30), "yyyy-MM-dd"),
      invoiceType: "B",
    },
  });
  const registerPaymentForm = useForm<z.infer<typeof registerPaymentSchema>>({
    resolver: zodResolver(registerPaymentSchema),
  });
  const expenseForm = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
  });
  
  const customerIdForInvoice = generateInvoiceForm.watch("customerId");
  
  const uninvoicedSalesForSelectedCustomer = useMemo(() => {
    if (!customerIdForInvoice) return [];
    return billableItems.filter(
      (item) => item.customerId === customerIdForInvoice && !item.invoiced
    );
  }, [billableItems, customerIdForInvoice]);
  
  const customerBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    clients.forEach(c => balances[c.id] = 0);
    invoices.forEach(inv => {
      if (inv.status === "Pendiente" || inv.status === "Vencida") {
        const paidAmount = inv.payments.reduce((sum, p) => sum + p.amount, 0);
        balances[inv.customerId] = (balances[inv.customerId] || 0) + (inv.total - paidAmount);
      }
    });
    return balances;
  }, [invoices, clients]);
  
  const filteredInvoices = useMemo(() => {
    let updatedInvoices = invoices.map(inv => {
        if (inv.status === 'Pendiente' && isPast(new Date(inv.dueDate))) {
            return {...inv, status: 'Vencida' as const };
        }
        return inv;
    });

    return updatedInvoices.filter(
      (inv) =>
        (filters.client === "all" || inv.customerId === filters.client) &&
        (filters.type === "all" || inv.type === filters.type) &&
        (filters.status === "all" || inv.status === filters.status)
    ).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoices, filters]);

  const currentClientStatement = useMemo(() => {
    if (actionDialog?.type !== "statement") return null;
    const client = clients.find(c => c.id === actionDialog.clientId);
    if (!client) return null;

    const clientInvoices = invoices.filter(inv => inv.customerId === client.id);
    const transactions = clientInvoices.flatMap(inv => ([
        { type: 'invoice' as const, date: inv.date, description: `Factura ${inv.type}-${inv.sequentialId}`, amount: inv.total, status: inv.status },
        ...inv.payments.map(p => ({ type: 'payment' as const, date: p.date, description: `Pago (${p.method})`, amount: -p.amount }))
    ])).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    return { client, transactions, balance: customerBalances[client.id] || 0 };
  }, [actionDialog, clients, invoices, customerBalances]);
  
  useEffect(() => {
    const unsubInvoices = onSnapshot(query(collection(db, "invoices")), (snapshot) => {
        setInvoices(snapshot.docs.map(doc => mapDocTo<Invoice>(doc)));
    });
    const unsubBillable = onSnapshot(query(collection(db, "billable-items")), (snapshot) => {
        setBillableItems(snapshot.docs.map(doc => mapDocTo<BillableItem>(doc)));
    });
    const unsubClients = onSnapshot(query(collection(db, "customers")), (snapshot) => {
        setClients(snapshot.docs.map(doc => mapDocTo<Client>(doc)));
    });
    const unsubExpenses = onSnapshot(query(collection(db, "expenses")), (snapshot) => {
        setExpenses(snapshot.docs.map(doc => mapDocTo<Expense>(doc)));
    });

    setIsMounted(true);

    return () => {
        unsubInvoices();
        unsubBillable();
        unsubClients();
        unsubExpenses();
    }
  }, []);


  const getStatusVariant = (status: Invoice["status"]): "secondary" | "default" | "destructive" | "outline" => {
    switch (status) {
      case "Pendiente": return "default";
      case "Pagada": return "secondary";
      case "Vencida": return "destructive";
      case "Anulada": return "outline";
      default: return "secondary";
    }
  };

  const handleGenerateInvoice = async (data: z.infer<typeof generateInvoiceSchema>) => {
    const salesToInvoice = billableItems.filter(item => data.selectedSales.includes(item.id));
    if (salesToInvoice.length === 0) return;
    
    const total = salesToInvoice.reduce((sum, item) => sum + item.total, 0);
    const items = salesToInvoice.flatMap(s => s.items.map(i => ({ description: i.productName, quantity: i.quantity, price: i.price, total: i.quantity * i.price })));
    const customer = clients.find(c => c.id === data.customerId)!;

    const newInvoice: Omit<Invoice, "id"> = {
      sequentialId: `${invoices.length + 1}`.padStart(8, '0'),
      type: data.invoiceType,
      customerId: data.customerId,
      customerName: customer.name,
      date: data.issueDate,
      dueDate: data.dueDate,
      items,
      total,
      status: "Pendiente",
      payments: [],
      sourceSaleIds: data.selectedSales
    };
    
    try {
        const batch = writeBatch(db);
        
        const invoiceDocRef = doc(collection(db, "invoices"));
        batch.set(invoiceDocRef, newInvoice);

        data.selectedSales.forEach(saleId => {
            const saleDocRef = doc(db, "billable-items", saleId);
            batch.update(saleDocRef, { invoiced: true, invoiceId: invoiceDocRef.id });
        });

        await batch.commit();
        
        toast({ title: "Factura Generada", description: `Se creó la factura ${newInvoice.type}-${newInvoice.sequentialId}.` });
    } catch(e) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la factura.'})
    }
    
    setActionDialog(null);
    generateInvoiceForm.reset({
        issueDate: format(new Date(), "yyyy-MM-dd"),
        dueDate: format(addDays(new Date(), 30), "yyyy-MM-dd"),
        invoiceType: "B",
    });
  };
  
  const handleRegisterPayment = async (data: z.infer<typeof registerPaymentSchema>) => {
    if (actionDialog?.type !== 'payment') return;
    
    const invoiceToUpdate = invoices.find(inv => inv.id === actionDialog.invoiceId);
    if (!invoiceToUpdate) return;
    
    const newPayment: Payment = { id: `PAY-${Date.now()}`, ...data };
    const updatedPayments = [...invoiceToUpdate.payments, newPayment];
    const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
    const newStatus = totalPaid >= invoiceToUpdate.total ? 'Pagada' : invoiceToUpdate.status;

    try {
        const invoiceDocRef = doc(db, "invoices", actionDialog.invoiceId);
        await updateDoc(invoiceDocRef, {
            payments: updatedPayments,
            status: newStatus
        });
        
        toast({ title: "Pago Registrado", description: `Se registró un pago de $${data.amount.toFixed(2)}.` });
    } catch(e) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar el pago.'})
    }

    setActionDialog(null);
    registerPaymentForm.reset();
  };

  const handleRegisterExpense = async (data: z.infer<typeof expenseSchema>) => {
    const newExpense: Omit<Expense, 'id'> = {
        status: "Pendiente",
        ...data,
    };
    try {
        await addDoc(collection(db, "expenses"), newExpense);
        toast({ title: "Gasto Registrado", description: "Se ha añadido una nueva obligación a la lista."});
    } catch(e) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar el gasto.' });
    }
    
    setActionDialog(null);
    expenseForm.reset();
  };

  const handleMarkExpenseAsPaid = async (expenseId: string) => {
      try {
        const expenseDocRef = doc(db, "expenses", expenseId);
        await updateDoc(expenseDocRef, {
            status: 'Pagado',
            paymentDate: new Date().toISOString()
        });
        toast({ title: "Gasto Pagado", description: "El gasto se ha marcado como pagado."});
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el gasto.' });
    }
  }
  
  if (!isMounted) return <div className="flex justify-center items-center h-full"><Receipt className="h-10 w-10 animate-pulse"/></div>;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="invoices">
        <TabsList className="mb-4 grid grid-cols-3">
          <TabsTrigger value="invoices">Listado de Facturas</TabsTrigger>
          <TabsTrigger value="accounts">Cuentas Corrientes</TabsTrigger>
          <TabsTrigger value="expenses">Gastos y Obligaciones</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Facturación</CardTitle>
                <CardDescription>
                  Gestiona todas las facturas emitidas a tus clientes.
                </CardDescription>
              </div>
              <Button onClick={() => setActionDialog({ type: "generate" })}>
                <FilePlus2 className="mr-2 h-4 w-4" /> Generar Factura
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Select value={filters.client} onValueChange={(v) => setFilters(f => ({ ...f, client: v }))}>
                    <SelectTrigger><SelectValue placeholder="Filtrar por cliente..." /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todos los clientes</SelectItem>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
                 <Select value={filters.type} onValueChange={(v) => setFilters(f => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue placeholder="Filtrar por tipo..." /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todos los tipos</SelectItem><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem><SelectItem value="C">C</SelectItem><SelectItem value="Ticket">Ticket</SelectItem></SelectContent>
                </Select>
                 <Select value={filters.status} onValueChange={(v) => setFilters(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue placeholder="Filtrar por estado..." /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todos los estados</SelectItem><SelectItem value="Pendiente">Pendiente</SelectItem><SelectItem value="Pagada">Pagada</SelectItem><SelectItem value="Vencida">Vencida</SelectItem><SelectItem value="Anulada">Anulada</SelectItem></SelectContent>
                </Select>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>N° Factura</TableHead><TableHead>Cliente</TableHead><TableHead>Fecha</TableHead><TableHead>Vencimiento</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-center">Estado</TableHead><TableHead className="text-center">Acciones</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.type}-{inv.sequentialId}</TableCell>
                      <TableCell>{inv.customerName}</TableCell>
                      <TableCell>{format(new Date(inv.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{format(new Date(inv.dueDate), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-right">${inv.total.toFixed(2)}</TableCell>
                      <TableCell className="text-center"><Badge variant={getStatusVariant(inv.status)}>{inv.status}</Badge></TableCell>
                      <TableCell className="text-center space-x-1">
                        <Button variant="outline" size="sm" onClick={() => setActionDialog({ type: 'payment', invoiceId: inv.id })} disabled={inv.status === 'Pagada' || inv.status === 'Anulada'}>
                          <CircleDollarSign className="mr-2 h-4 w-4" /> Pagar
                        </Button>
                         <Button variant="ghost" size="icon" onClick={() => toast({ title: "Próximamente", description: "La generación de PDF estará disponible pronto." })}>
                          <Printer className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
               {filteredInvoices.length === 0 && <p className="text-center py-10 text-muted-foreground">No se encontraron facturas.</p>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="accounts">
          <Card>
             <CardHeader>
                <CardTitle>Saldos de Clientes</CardTitle>
                <CardDescription>
                  Resume de las deudas de cada cliente basadas en facturas pendientes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                  <Table>
                      <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Saldo Deudor</TableHead><TableHead className="text-center">Acciones</TableHead></TableRow></TableHeader>
                      <TableBody>
                         {clients.filter(c => customerBalances[c.id] > 0).map(client => (
                            <TableRow key={client.id}>
                                <TableCell className="font-medium">{client.name}</TableCell>
                                <TableCell>{client.type}</TableCell>
                                <TableCell className="text-right font-mono text-destructive">${(customerBalances[client.id] || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-center">
                                    <Button variant="outline" size="sm" onClick={() => setActionDialog({ type: 'statement', clientId: client.id })}>
                                        <History className="mr-2 h-4 w-4" /> Ver Estado de Cuenta
                                    </Button>
                                </TableCell>
                            </TableRow>
                         ))}
                      </TableBody>
                  </Table>
                  {clients.filter(c => customerBalances[c.id] > 0).length === 0 && <p className="text-center py-10 text-muted-foreground">No hay clientes con saldos pendientes.</p>}
              </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="expenses">
            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div>
                        <CardTitle>Gestión de Gastos</CardTitle>
                        <CardDescription>Registra y controla tus pagos y obligaciones pendientes.</CardDescription>
                    </div>
                    <Button onClick={() => setActionDialog({type: 'expense'})}><PlusCircle className="mr-2 h-4 w-4"/>Registrar Gasto</Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Descripción</TableHead>
                                <TableHead>Categoría</TableHead>
                                <TableHead>Vencimiento</TableHead>
                                <TableHead className="text-right">Monto</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                                <TableHead className="text-center">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {expenses.length > 0 ? expenses.map(expense => (
                                <TableRow key={expense.id}>
                                    <TableCell className="font-medium">{expense.description}</TableCell>
                                    <TableCell><Badge variant="secondary">{expense.category}</Badge></TableCell>
                                    <TableCell>{format(new Date(expense.dueDate), "dd/MM/yyyy")}</TableCell>
                                    <TableCell className="text-right font-mono">${expense.amount.toFixed(2)}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={expense.status === 'Pagado' ? 'secondary' : 'destructive'}>{expense.status}</Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {expense.status === 'Pendiente' && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="outline" size="sm"><CheckCircle className="mr-2 h-4 w-4" /> Marcar como Pagado</Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader><AlertDialogTitle>Confirmar Pago</AlertDialogTitle><AlertDialogDescription>¿Está seguro que desea marcar este gasto como pagado? Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleMarkExpenseAsPaid(expense.id)}>Confirmar</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                        {expense.status === 'Pagado' && expense.paymentDate && (
                                            <span className="text-xs text-muted-foreground">Pagado el {format(new Date(expense.paymentDate), "dd/MM/yy")}</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24">No hay gastos registrados.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog para Generar Factura */}
      {actionDialog?.type === "generate" && (
        <Dialog open={true} onOpenChange={(open) => !open && setActionDialog(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Generar Nueva Factura</DialogTitle>
              <DialogDescription>Seleccione un cliente y las ventas a facturar.</DialogDescription>
            </DialogHeader>
            <Form {...generateInvoiceForm}>
              <form onSubmit={generateInvoiceForm.handleSubmit(handleGenerateInvoice)} className="space-y-4 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={generateInvoiceForm.control} name="customerId" render={({ field }) => (
                    <FormItem><FormLabel>Cliente</FormLabel>
                      <Select onValueChange={(value) => { field.onChange(value); generateInvoiceForm.setValue('selectedSales', []); }} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un cliente..." /></SelectTrigger></FormControl>
                        <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select><FormMessage />
                    </FormItem>
                  )}/>
                   <FormField control={generateInvoiceForm.control} name="invoiceType" render={({ field }) => (
                    <FormItem><FormLabel>Tipo de Factura</FormLabel>
                       <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem><SelectItem value="C">C</SelectItem><SelectItem value="Ticket">Ticket (X)</SelectItem></SelectContent>
                      </Select><FormMessage />
                    </FormItem>
                  )}/>
                </div>
                
                <Card>
                    <CardHeader><CardTitle className="text-lg">Ventas/Pedidos Pendientes de Facturar</CardTitle></CardHeader>
                    <CardContent className="max-h-64 overflow-y-auto">
                        {customerIdForInvoice ? (
                            uninvoicedSalesForSelectedCustomer.length > 0 ? (
                            <FormField
                                control={generateInvoiceForm.control}
                                name="selectedSales"
                                render={({ field }) => (
                                <div className="space-y-2">
                                    {uninvoicedSalesForSelectedCustomer.map(item => (
                                    <FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value?.includes(item.id)}
                                                onCheckedChange={(checked) => {
                                                    return checked
                                                    ? field.onChange([...(field.value || []), item.id])
                                                    : field.onChange(field.value?.filter((value) => value !== item.id))
                                                }}
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel className="font-normal">
                                               {format(new Date(item.date), 'dd/MM/yyyy')} - {item.type === 'pos-sale' ? 'Venta de Local' : 'Pedido a Domicilio'} - ${item.total.toFixed(2)}
                                            </FormLabel>
                                            <p className="text-xs text-muted-foreground">{item.items.map(i => `${i.quantity}x ${i.productName}`).join(', ')}</p>
                                        </div>
                                    </FormItem>
                                    ))}
                                    <FormMessage />
                                </div>
                                )}
                            />
                            ) : (<p className="text-center text-muted-foreground py-4">Este cliente no tiene items pendientes de facturar.</p>)
                        ) : (<p className="text-center text-muted-foreground py-4">Seleccione un cliente para ver sus items pendientes.</p>)}
                    </CardContent>
                </Card>

                 <div className="grid grid-cols-2 gap-4">
                    <FormField control={generateInvoiceForm.control} name="issueDate" render={({ field }) => (<FormItem><FormLabel>Fecha de Emisión</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={generateInvoiceForm.control} name="dueDate" render={({ field }) => (<FormItem><FormLabel>Fecha de Vencimiento</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                  <Button type="submit">Generar Factura</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

       {/* Dialog para Registrar Pago */}
      {actionDialog?.type === "payment" && (
        <Dialog open={true} onOpenChange={(open) => !open && setActionDialog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Registrar Pago</DialogTitle>
              <DialogDescription>Factura: {invoices.find(i=>i.id===actionDialog.invoiceId)?.type}-{invoices.find(i=>i.id===actionDialog.invoiceId)?.sequentialId}</DialogDescription>
            </DialogHeader>
            <Form {...registerPaymentForm}>
                <form onSubmit={registerPaymentForm.handleSubmit(handleRegisterPayment)} className="space-y-4 py-4">
                    <FormField control={registerPaymentForm.control} name="amount" render={({ field }) => (<FormItem><FormLabel>Monto a Pagar</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={registerPaymentForm.control} name="method" render={({ field }) => (
                        <FormItem><FormLabel>Método de Pago</FormLabel>
                           <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent><SelectItem value="Efectivo">Efectivo</SelectItem><SelectItem value="Tarjeta">Tarjeta</SelectItem><SelectItem value="Transferencia">Transferencia</SelectItem><SelectItem value="Cheque">Cheque</SelectItem></SelectContent>
                          </Select><FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={registerPaymentForm.control} name="date" render={({ field }) => (<FormItem><FormLabel>Fecha de Pago</FormLabel><FormControl><Input type="date" {...field} defaultValue={format(new Date(), "yyyy-MM-dd")} /></FormControl><FormMessage /></FormItem>)} />
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                        <Button type="submit">Registrar Pago</Button>
                    </DialogFooter>
                </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog para Estado de Cuenta */}
      {actionDialog?.type === "statement" && currentClientStatement && (
        <Dialog open={true} onOpenChange={(open) => !open && setActionDialog(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Estado de Cuenta: {currentClientStatement.client.name}</DialogTitle>
            </DialogHeader>
            <div className="py-4 max-h-[60vh] overflow-y-auto">
                <Table>
                    <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Debe</TableHead><TableHead className="text-right">Haber</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {currentClientStatement.transactions.map((tx, i) => (
                           <TableRow key={i}>
                               <TableCell>{format(new Date(tx.date), 'dd/MM/yyyy')}</TableCell>
                               <TableCell>{tx.description}</TableCell>
                               <TableCell className="text-right font-mono text-destructive">{tx.amount > 0 ? `$${tx.amount.toFixed(2)}` : '-'}</TableCell>
                               <TableCell className="text-right font-mono text-green-600">{tx.amount < 0 ? `$${(-tx.amount).toFixed(2)}` : '-'}</TableCell>
                           </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <DialogFooter className="sm:justify-between items-center border-t pt-4">
                <div>
                     <Button variant="outline" className="mr-2" onClick={() => toast({ title: "Próximamente" })}><Download className="mr-2 h-4 w-4"/>Exportar</Button>
                     <Button variant="outline" onClick={() => toast({ title: "Próximamente" })}><Send className="mr-2 h-4 w-4"/>Enviar Recordatorio</Button>
                </div>
                <div className="text-right">
                    <Label>Saldo Actual</Label>
                    <p className="text-2xl font-bold text-destructive">${currentClientStatement.balance.toFixed(2)}</p>
                </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Dialog para Registrar Gasto */}
      {actionDialog?.type === 'expense' && (
        <Dialog open={true} onOpenChange={(open) => !open && setActionDialog(null)}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Registrar Gasto u Obligación</DialogTitle>
                    <DialogDescription>Añada un nuevo gasto para mantener sus finanzas al día.</DialogDescription>
                </DialogHeader>
                <Form {...expenseForm}>
                    <form onSubmit={expenseForm.handleSubmit(handleRegisterExpense)} className="space-y-4 py-4">
                        <FormField control={expenseForm.control} name="description" render={({field}) => (<FormItem><FormLabel>Descripción</FormLabel><FormControl><Input placeholder="Ej: Alquiler de local" {...field}/></FormControl><FormMessage/></FormItem>)}/>
                        <FormField control={expenseForm.control} name="category" render={({field}) => (<FormItem><FormLabel>Categoría</FormLabel><FormControl><Input placeholder="Ej: Alquileres, Servicios, Impuestos" {...field}/></FormControl><FormMessage/></FormItem>)}/>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={expenseForm.control} name="amount" render={({field}) => (<FormItem><FormLabel>Monto</FormLabel><FormControl><Input type="number" step="0.01" {...field}/></FormControl><FormMessage/></FormItem>)}/>
                            <FormField control={expenseForm.control} name="dueDate" render={({field}) => (<FormItem><FormLabel>Fecha de Vencimiento</FormLabel><FormControl><Input type="date" {...field} defaultValue={format(new Date(), "yyyy-MM-dd")} /></FormControl><FormMessage/></FormItem>)}/>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button variant="outline" type="button">Cancelar</Button></DialogClose>
                            <Button type="submit">Guardar Gasto</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
