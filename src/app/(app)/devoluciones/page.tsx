
"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
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
import { Undo2, PlusCircle } from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, doc, DocumentData, query, increment } from "firebase/firestore";
import { useUser } from "@/app/(app)/layout";
import { mapDocTo } from "@/lib/mappers";

// Interfaces
interface Product {
  id: string;
  name: string;
  stock: number;
}
interface Return {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: string;
  origin: "Cliente" | "Vendedor";
  reenteredStock: boolean;
  observations: string;
  timestamp: string;
  user: string;
}

const returnSchema = z.object({
  productId: z.string().min(1, "Debe seleccionar un producto."),
  quantity: z.coerce.number().int().positive("La cantidad debe ser mayor a cero."),
  reason: z.string().min(3, "El motivo es requerido."),
  origin: z.enum(["Cliente", "Vendedor"], { required_error: "Debe seleccionar un origen." }),
  reenteredStock: z.boolean().default(false),
  observations: z.string().optional(),
});
type ReturnFormData = z.infer<typeof returnSchema>;

export default function DevolucionesPage() {
  const [returns, setReturns] = useState<Return[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState({ product: "all", origin: "all", from: "", to: "" });
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  const currentUser = useUser();
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  const form = useForm<ReturnFormData>({
    resolver: zodResolver(returnSchema),
    defaultValues: {
      productId: "",
      quantity: 1,
      reason: "",
      origin: "Cliente",
      reenteredStock: false,
      observations: "",
    },
  });

  useEffect(() => {
    const unsubReturns = onSnapshot(query(collection(db, "returns")), (snapshot) => {
        setReturns(snapshot.docs.map(doc => mapDocTo<Return>(doc)));
        setLoading(false);
    });

    const unsubProducts = onSnapshot(query(collection(db, "products")), (snapshot) => {
        setProducts(snapshot.docs.map(doc => mapDocTo<Product>(doc)));
    });

    return () => {
        unsubReturns();
        unsubProducts();
    }
  }, []);
  
  const filteredReturns = useMemo(() => {
    return returns
      .filter((ret) => {
        const date = new Date(ret.timestamp);
        const fromDate = filters.from ? new Date(filters.from) : null;
        const toDate = filters.to ? new Date(filters.to) : null;
        if(fromDate) fromDate.setHours(0,0,0,0);
        if(toDate) toDate.setHours(23,59,59,999);
        
        const isProductMatch = filters.product === "all" || ret.productId === filters.product;
        const isOriginMatch = filters.origin === "all" || ret.origin === filters.origin;
        const isDateMatch = (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
        
        return isProductMatch && isOriginMatch && isDateMatch;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [returns, filters]);

  const handleRegisterReturn = async (data: ReturnFormData) => {
    const product = products.find(p => p.id === data.productId);
    if (!product) {
      toast({ variant: "destructive", title: "Producto no encontrado." });
      return;
    }

    const newReturn: Omit<Return, "id"> = {
      productId: data.productId,
      productName: product.name,
      quantity: data.quantity,
      reason: data.reason,
      origin: data.origin,
      reenteredStock: data.reenteredStock,
      observations: data.observations || "",
      timestamp: new Date().toISOString(),
      user: currentUser?.username || "Sistema",
    };

    try {
        if (data.reenteredStock) {
            const productDoc = doc(db, "products", data.productId);
            await updateDoc(productDoc, {
                stock: increment(data.quantity)
            });
        }
        
        await addDoc(collection(db, "returns"), newReturn);
        
        toast({ title: "Devolución Registrada", description: `Se ha registrado la devolución de ${data.quantity} x ${product.name}.` });
    } catch(e) {
        toast({ variant: 'destructive', title: "Error", description: "No se pudo registrar la devolución." });
    }

    setIsReturnDialogOpen(false);
    form.reset();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Gestión de Devoluciones y Roturas</CardTitle>
            <CardDescription>
              Registra y consulta el historial de devoluciones y mercadería dañada.
            </CardDescription>
          </div>
          <Button onClick={() => setIsReturnDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Registrar Devolución
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Select value={filters.product} onValueChange={(v) => setFilters(f => ({ ...f, product: v }))}>
                <SelectTrigger><SelectValue placeholder="Filtrar por producto..." /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos los productos</SelectItem>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filters.origin} onValueChange={(v) => setFilters(f => ({ ...f, origin: v }))}>
                <SelectTrigger><SelectValue placeholder="Filtrar por origen..." /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos los orígenes</SelectItem><SelectItem value="Cliente">Cliente</SelectItem><SelectItem value="Vendedor">Vendedor</SelectItem></SelectContent>
            </Select>
            <Input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
            <Input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha y Hora</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Reingresó a Stock</TableHead>
                <TableHead>Usuario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="h-24 text-center">Cargando...</TableCell></TableRow>
              ) : filteredReturns.length > 0 ? (
                filteredReturns.map((ret) => (
                  <TableRow key={ret.id}>
                    <TableCell>{format(new Date(ret.timestamp), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell className="font-medium">{ret.productName}</TableCell>
                    <TableCell>{ret.quantity}</TableCell>
                    <TableCell>
                       <Badge variant={ret.origin === 'Vendedor' ? 'secondary' : 'outline'}>{ret.origin}</Badge>
                    </TableCell>
                    <TableCell>{ret.reason}</TableCell>
                    <TableCell>
                      {ret.reenteredStock ? (
                        <Badge variant="default">Sí</Badge>
                      ) : (
                        <Badge variant="destructive">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>{ret.user}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="text-center py-10 text-muted-foreground">
                      <Undo2 className="mx-auto h-12 w-12" />
                      <p className="mt-4">No se encontraron devoluciones con los filtros aplicados.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isReturnDialogOpen} onOpenChange={setIsReturnDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Nueva Devolución</DialogTitle>
            <DialogDescription>
              Completa los datos para registrar la devolución de un producto.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleRegisterReturn)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto px-2">
              <FormField control={form.control} name="productId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Producto</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un producto..." /></SelectTrigger></FormControl>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}/>
               <FormField control={form.control} name="quantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad Devuelta</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
               <FormField control={form.control} name="reason" render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl><Input placeholder="Ej: Fallado, vencido, error de envío..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
              <FormField control={form.control} name="origin" render={({ field }) => (
                <FormItem>
                  <FormLabel>Origen de la Devolución</FormLabel>
                   <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value="Cliente">Cliente</SelectItem>
                        <SelectItem value="Vendedor">Vendedor</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}/>
               <FormField
                  control={form.control}
                  name="reenteredStock"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>¿Reingresar a Stock?</FormLabel>
                        <FormDescription>
                          Si se marca, la cantidad devuelta se sumará al stock actual del producto.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                 <FormField control={form.control} name="observations" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Observaciones</FormLabel>
                        <FormControl><Textarea placeholder="Detalles adicionales sobre la devolución..." {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )}/>

              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit">Registrar</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
