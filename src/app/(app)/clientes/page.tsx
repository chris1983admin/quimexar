
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
  DialogClose
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { CircleUserRound, Building, PlusCircle, History, Pencil, Trash2 } from "lucide-react";
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
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, DocumentData, query } from "firebase/firestore";
import { mapDocTo } from "@/lib/mappers";

// Interfaces
interface Client {
  id: string;
  name: string;
  type: "Consumidor Final" | "Empresa";
  cuit?: string;
  address?: string;
  zone?: string;
}

interface Invoice {
  id: string;
  customerId: string;
  total: number;
  status: "Pendiente" | "Pagada" | "Vencida" | "Anulada";
  payments: { amount: number }[];
}

const clientSchema = z.object({
  name: z.string().min(2, "El nombre es requerido."),
  type: z.enum(["Consumidor Final", "Empresa"]),
  cuit: z.string().optional(),
  address: z.string().optional(),
  zone: z.string().optional(),
}).refine(data => {
  if (data.type === "Empresa" && (!data.cuit || data.cuit.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "El CUIT es requerido para clientes de tipo 'Empresa'.",
  path: ["cuit"],
});

type ClientFormData = z.infer<typeof clientSchema>;

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filters, setFilters] = useState({ name: "", cuit: "", zone: "" });
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      type: "Consumidor Final",
      cuit: "",
      address: "",
      zone: "",
    },
  });
  const clientType = form.watch("type");

  useEffect(() => {
    const q = query(collection(db, "customers"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const clientsData = querySnapshot.docs.map(doc => mapDocTo<Client>(doc));
        setClients(clientsData);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching customers: ", error);
        toast({ variant: "destructive", title: "Error de Carga", description: "No se pudieron cargar los clientes." });
        setLoading(false);
    });

    try {
      // Invoices still from localStorage for now
      const storedInvoices = localStorage.getItem("invoices-data");
      if (storedInvoices) setInvoices(JSON.parse(storedInvoices));
    } catch (error) {
      console.error("Failed to load invoices from localStorage", error);
    }
    
    return () => unsubscribe();
  }, [toast]);
  
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

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const filteredClients = useMemo(() => {
    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(filters.name.toLowerCase()) &&
        (client.cuit || "").toLowerCase().includes(filters.cuit.toLowerCase()) &&
        (client.zone || "").toLowerCase().includes(filters.zone.toLowerCase())
    );
  }, [clients, filters]);
  
  const handleClientSubmit = async (data: ClientFormData) => {
    const dataToSave = {
        ...data,
        cuit: data.type === "Empresa" ? data.cuit : "",
    };

    try {
        if (editingClient) {
            const clientDoc = doc(db, "customers", editingClient.id);
            await updateDoc(clientDoc, dataToSave);
            toast({ title: "Cliente Actualizado", description: `Los datos de ${data.name} han sido actualizados.` });
        } else {
            await addDoc(collection(db, "customers"), dataToSave);
            toast({ title: "Cliente Creado", description: `El cliente ${data.name} ha sido agregado.` });
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo guardar la información del cliente." });
    }
    
    setIsClientDialogOpen(false);
    setEditingClient(null);
    form.reset();
  };

  const handleOpenClientDialog = (client: Client | null) => {
    setEditingClient(client);
    if (client) {
      form.reset(client);
    } else {
      form.reset({ name: "", type: "Consumidor Final", cuit: "", address: "", zone: "" });
    }
    setIsClientDialogOpen(true);
  };

  const handleDeleteClient = async (clientId: string) => {
    try {
        await deleteDoc(doc(db, "customers", clientId));
        toast({ title: "Cliente Eliminado", description: "El cliente ha sido eliminado correctamente." });
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el cliente." });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Listado General de Clientes</CardTitle>
              <CardDescription>
                Aquí puedes ver, filtrar y administrar a todos tus clientes.
              </CardDescription>
            </div>
             <Button onClick={() => handleOpenClientDialog(null)}>
                <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Cliente
              </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Input
              name="name"
              placeholder="Filtrar por nombre..."
              value={filters.name}
              onChange={handleFilterChange}
            />
            <Input
              name="cuit"
              placeholder="Filtrar por CUIT..."
              value={filters.cuit}
              onChange={handleFilterChange}
            />
            <Input
              name="zone"
              placeholder="Filtrar por zona..."
              value={filters.zone}
              onChange={handleFilterChange}
            />
          </div>
          {loading ? (
             <div className="text-center text-muted-foreground mt-8">Cargando clientes...</div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>CUIT</TableHead>
                <TableHead>Zona</TableHead>
                <TableHead className="text-right">Saldo Deudor</TableHead>
                <TableHead className="text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>
                    <Badge variant={client.type === 'Empresa' ? 'secondary' : 'outline'}>
                      {client.type === 'Empresa' ? <Building className="mr-1 h-3 w-3" /> : <CircleUserRound className="mr-1 h-3 w-3" />}
                      {client.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{client.cuit || "-"}</TableCell>
                  <TableCell>{client.zone || "-"}</TableCell>
                  <TableCell className="text-right font-mono text-destructive">
                    ${(customerBalances[client.id] || 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenClientDialog(client)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Está seguro de eliminar a {client.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. El cliente se eliminará permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteClient(client.id)}>
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Link href="/facturacion?tab=accounts">
                        <Button variant="outline" size="sm">
                          <History className="h-4 w-4 mr-2" /> Gestionar Saldo
                        </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
          {filteredClients.length === 0 && !loading && (
              <p className="text-center text-muted-foreground mt-8">No se encontraron clientes con los filtros aplicados.</p>
          )}
        </CardContent>
      </Card>
      
       {/* Dialog para Nuevo/Editar Cliente */}
       <Dialog open={isClientDialogOpen} onOpenChange={(open) => { if (!open) { form.reset(); setEditingClient(null); } setIsClientDialogOpen(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Editar Cliente" : "Agregar Nuevo Cliente"}</DialogTitle>
            <DialogDescription>
              Complete los datos para {editingClient ? "actualizar el" : "crear un nuevo"} cliente.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleClientSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre y Apellido / Razón Social</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Juan Pérez" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione un tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Consumidor Final">Consumidor Final</SelectItem>
                        <SelectItem value="Empresa">Empresa</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {clientType === 'Empresa' && (
                <FormField
                  control={form.control}
                  name="cuit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CUIT</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: 30-12345678-9" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Av. Siempre Viva 742" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="zone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zona</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Palermo" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={() => { form.reset(); setEditingClient(null); }}>Cancelar</Button>
                </DialogClose>
                <Button type="submit">{editingClient ? "Guardar Cambios" : "Guardar Cliente"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
