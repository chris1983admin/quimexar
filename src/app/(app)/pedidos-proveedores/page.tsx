
"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useToast } from "@/hooks/use-toast";
import {
  PlusCircle,
  Pencil,
  Trash2,
  FileText,
  ArrowLeft,
  PackagePlus,
  Copy,
  ChevronDown
} from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, DocumentData, query } from "firebase/firestore";
import { mapDocTo } from "@/lib/mappers";

// Interfaces
interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface SupplierOrderItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

interface SupplierOrder {
  id: string;
  sequentialId: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  items: SupplierOrderItem[];
  total: number;
  observations?: string;
  status: "Borrador" | "Confirmado" | "En tránsito" | "Recibido" | "Recibido (Parcial)";
  receivedDate?: string;
  receivedItems?: { name: string; quantity: number; unit: string }[];
}

interface GeneralStockItem {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    supplier?: string;
    entryDate: string;
    notes?: string;
}

// Zod Schemas
const supplierSchema = z.object({
  name: z.string().min(2, "El nombre es requerido."),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email inválido.").optional().or(z.literal("")),
  address: z.string().optional(),
});
type SupplierFormData = z.infer<typeof supplierSchema>;

const orderItemSchema = z.object({
    name: z.string().min(2, "El nombre es requerido."),
    quantity: z.coerce.number().positive("La cantidad debe ser mayor a 0."),
    unit: z.string().min(1, "La unidad es requerida."),
    price: z.coerce.number().min(0, "El precio no puede ser negativo."),
});

const orderSchema = z.object({
    orderDate: z.string().min(1, "La fecha es requerida."),
    observations: z.string().optional(),
    items: z.array(orderItemSchema).min(1, "El pedido debe tener al menos un ítem."),
});
type OrderFormData = z.infer<typeof orderSchema>;

const receiveOrderItemSchema = z.object({
  name: z.string(),
  unit: z.string(),
  orderedQuantity: z.number(),
  receivedQuantity: z.coerce.number().min(0, "La cantidad no puede ser negativa."),
});
const receiveOrderSchema = z.object({
  items: z.array(receiveOrderItemSchema),
});
type ReceiveOrderFormData = z.infer<typeof receiveOrderSchema>;


export default function PedidosProveedoresPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierOrders, setSupplierOrders] = useState<SupplierOrder[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SupplierOrder | null>(null);
  
  const [isReceiveOrderDialogOpen, setIsReceiveOrderDialogOpen] = useState(false);
  const [orderToReceive, setOrderToReceive] = useState<SupplierOrder | null>(null);
  
  const { toast } = useToast();

  const supplierForm = useForm<SupplierFormData>({ resolver: zodResolver(supplierSchema) });
  const orderForm = useForm<OrderFormData>({ resolver: zodResolver(orderSchema) });
  const { fields, append, remove } = useFieldArray({ control: orderForm.control, name: "items" });
  const orderItems = orderForm.watch('items');
  const orderTotal = useMemo(() => {
    return orderItems?.reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0), 0) || 0;
  }, [orderItems]);

  const receiveOrderForm = useForm<ReceiveOrderFormData>({ resolver: zodResolver(receiveOrderSchema) });
  const { fields: receiveFields, replace: replaceReceiveFields } = useFieldArray({ control: receiveOrderForm.control, name: "items" });

  useEffect(() => {
    const unsubSuppliers = onSnapshot(query(collection(db, "suppliers")), (snapshot) => {
        setSuppliers(snapshot.docs.map(doc => mapDocTo<Supplier>(doc)));
    });
    const unsubOrders = onSnapshot(query(collection(db, "supplier-orders")), (snapshot) => {
        setSupplierOrders(snapshot.docs.map(doc => mapDocTo<SupplierOrder>(doc)));
    });

    return () => {
        unsubSuppliers();
        unsubOrders();
    };
  }, []);

  const ordersForSelectedSupplier = useMemo(() => {
    if (!selectedSupplier) return [];
    return supplierOrders.filter(o => o.supplierId === selectedSupplier.id)
                         .sort((a,b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [selectedSupplier, supplierOrders]);
  
  const lastOrderDates = useMemo(() => {
      const dates: Record<string, string> = {};
      supplierOrders.forEach(order => {
          if (!dates[order.supplierId] || new Date(order.orderDate) > new Date(dates[order.supplierId])) {
              dates[order.supplierId] = order.orderDate;
          }
      });
      return dates;
  }, [supplierOrders]);


  // Supplier CRUD
  const handleOpenSupplierDialog = (supplier: Supplier | null) => {
    setEditingSupplier(supplier);
    supplierForm.reset(supplier || { name: "", contactName: "", phone: "", email: "", address: "" });
    setIsSupplierDialogOpen(true);
  };

  const handleSupplierSubmit = async (data: SupplierFormData) => {
    try {
        if (editingSupplier) {
          await updateDoc(doc(db, "suppliers", editingSupplier.id), data);
          toast({ title: "Proveedor Actualizado" });
        } else {
          await addDoc(collection(db, "suppliers"), data);
          toast({ title: "Proveedor Creado" });
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el proveedor." });
    }
    setIsSupplierDialogOpen(false);
  };
  
  // Order CRUD & Status
  const handleOpenOrderDialog = (order: SupplierOrder | null) => {
    setEditingOrder(order);
    if (order) {
        orderForm.reset({
            orderDate: format(new Date(order.orderDate), "yyyy-MM-dd"),
            observations: order.observations,
            items: order.items,
        });
    } else {
        orderForm.reset({
            orderDate: format(new Date(), "yyyy-MM-dd"),
            observations: "",
            items: [{ name: "", quantity: 1, unit: "", price: 0 }]
        });
    }
    setIsOrderDialogOpen(true);
  };

  const handleOrderSubmit = async (data: OrderFormData) => {
    if (!selectedSupplier) return;
    const dataToSave = {
        ...data,
        total: orderTotal,
    };

    try {
        if (editingOrder) {
            await updateDoc(doc(db, "supplier-orders", editingOrder.id), { ...dataToSave, status: "Borrador" });
            toast({ title: "Borrador de Pedido Actualizado" });
        } else {
            const newOrder: Omit<SupplierOrder, "id"> = {
                sequentialId: `${supplierOrders.length + 1}`.padStart(6, '0'),
                supplierId: selectedSupplier.id,
                supplierName: selectedSupplier.name,
                status: "Borrador",
                ...dataToSave
            };
            await addDoc(collection(db, "supplier-orders"), newOrder);
            toast({ title: "Borrador de Pedido Creado" });
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el pedido." });
    }

    setIsOrderDialogOpen(false);
  };
  
  const handleOrderStatusChange = async (orderId: string, newStatus: SupplierOrder['status']) => {
    if (newStatus === "Recibido") {
        const order = supplierOrders.find(o => o.id === orderId);
        if (order) {
            setOrderToReceive(order);
            const formItems = order.items.map(item => ({
                name: item.name,
                unit: item.unit,
                orderedQuantity: item.quantity,
                receivedQuantity: item.quantity,
            }));
            replaceReceiveFields(formItems);
            setIsReceiveOrderDialogOpen(true);
        }
    } else {
        try {
            await updateDoc(doc(db, "supplier-orders", orderId), { status: newStatus });
            toast({ title: `Pedido #${orderId.slice(-4)} actualizado a: ${newStatus}`});
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el estado del pedido." });
        }
    }
  };

  const handleReceiveOrderSubmit = async (data: ReceiveOrderFormData) => {
    if (!orderToReceive) return;

    let isPartial = false;
    const receivedItemsForStock = data.items.filter(item => item.receivedQuantity > 0);
    const receivedItemsForHistory = data.items.map(item => ({ name: item.name, quantity: item.receivedQuantity, unit: item.unit }));

    if (data.items.some(item => item.receivedQuantity < item.orderedQuantity)) {
        isPartial = true;
    }
    
    try {
        const newStockItems: Omit<GeneralStockItem, 'id'>[] = receivedItemsForStock.map(item => ({
            name: item.name,
            quantity: item.receivedQuantity,
            unit: item.unit,
            supplier: orderToReceive.supplierName,
            entryDate: new Date().toISOString().split('T')[0],
            notes: `Ingreso desde pedido a proveedor #${orderToReceive.sequentialId}`,
            category: 'Insumo', // Assuming all received items are insumos for now
        }));
        
        await Promise.all(newStockItems.map(item => addDoc(collection(db, "general-stock"), item)));
        
        const newStatus = isPartial ? "Recibido (Parcial)" : "Recibido";
        await updateDoc(doc(db, "supplier-orders", orderToReceive.id), {
            status: newStatus,
            receivedDate: new Date().toISOString(),
            receivedItems: receivedItemsForHistory,
        });

        toast({ title: "Pedido Recibido", description: "El stock general ha sido actualizado correctamente." });

    } catch(e) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el stock general o el pedido.' });
        return;
    }

    setIsReceiveOrderDialogOpen(false);
    setOrderToReceive(null);
  };


  const handleCopyOrderInfo = (order: SupplierOrder) => {
    if (!selectedSupplier) return;
    
    const itemsText = order.items.map(item => `- ${item.quantity} ${item.unit} de ${item.name}`).join('\n');
    
    let orderInfo = `Pedido a Proveedor: ${selectedSupplier.name}\n`;
    orderInfo += `N° de Pedido: ${order.sequentialId}\n`;
    orderInfo += `Fecha: ${format(new Date(order.orderDate), 'dd/MM/yyyy')}\n\n`;
    orderInfo += `Items:\n${itemsText}`;

    if (order.observations) {
        orderInfo += `\n\nObservaciones:\n${order.observations}`;
    }

    navigator.clipboard.writeText(orderInfo).then(() => {
        toast({
            title: "Pedido Copiado",
            description: "La información del pedido está en el portapapeles.",
        });
    }).catch(err => {
        console.error('Failed to copy: ', err);
        toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo copiar la información.",
        });
    });
  };


  if (selectedSupplier) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setSelectedSupplier(null)}><ArrowLeft className="h-4 w-4" /></Button>
            <div>
                <h1 className="text-2xl font-bold">{selectedSupplier.name}</h1>
                <p className="text-muted-foreground">Gestión de pedidos para este proveedor.</p>
            </div>
        </div>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Pedidos Realizados</CardTitle>
                    <CardDescription>Historial de todos los pedidos a {selectedSupplier.name}.</CardDescription>
                </div>
                <Button onClick={() => handleOpenOrderDialog(null)}><PackagePlus className="mr-2 h-4 w-4"/>Nuevo Pedido</Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader><TableRow><TableHead>N° Pedido</TableHead><TableHead>Fecha</TableHead><TableHead>Items</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-center">Estado</TableHead><TableHead className="text-center">Acciones</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {ordersForSelectedSupplier.length > 0 ? ordersForSelectedSupplier.map(order => (
                            <TableRow key={order.id}>
                                <TableCell className="font-medium">{order.sequentialId}</TableCell>
                                <TableCell>{format(new Date(order.orderDate), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>{order.items.length}</TableCell>
                                <TableCell className="text-right font-mono">${order.total.toFixed(2)}</TableCell>
                                <TableCell className="text-center">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button 
                                          variant="outline" 
                                          className="w-44 justify-between" 
                                          disabled={order.status === 'Recibido' || order.status === 'Recibido (Parcial)'}
                                        >
                                          {order.status}
                                          <ChevronDown className="ml-2 h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent>
                                        <DropdownMenuItem onSelect={() => handleOrderStatusChange(order.id, 'Borrador')}>Borrador</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => handleOrderStatusChange(order.id, 'Confirmado')}>Confirmado</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => handleOrderStatusChange(order.id, 'En tránsito')}>En tránsito</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => handleOrderStatusChange(order.id, 'Recibido')}>Marcar como Recibido...</DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                                <TableCell className="text-center space-x-1">
                                    <Button variant="ghost" size="icon" onClick={() => handleOpenOrderDialog(order)} disabled={order.status === 'Recibido' || order.status === 'Recibido (Parcial)'}><Pencil className="h-4 w-4"/></Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleCopyOrderInfo(order)}><Copy className="h-4 w-4"/></Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow><TableCell colSpan={6} className="h-24 text-center">No hay pedidos para este proveedor.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        <Dialog open={isOrderDialogOpen} onOpenChange={setIsOrderDialogOpen}>
            <DialogContent className="max-w-4xl">
                <DialogHeader><DialogTitle>{editingOrder ? "Editar" : "Nuevo"} Pedido a {selectedSupplier?.name}</DialogTitle></DialogHeader>
                <Form {...orderForm}>
                <form onSubmit={orderForm.handleSubmit(handleOrderSubmit)}>
                <div className="grid gap-4 py-4 md:grid-cols-4">
                    <FormField control={orderForm.control} name="orderDate" render={({ field }) => (<FormItem className="md:col-span-1"><FormLabel>Fecha del Pedido</FormLabel><FormControl><Input type="date" {...field}/></FormControl><FormMessage/></FormItem>)}/>
                    <FormField control={orderForm.control} name="observations" render={({ field }) => (<FormItem className="md:col-span-3"><FormLabel>Observaciones</FormLabel><FormControl><Textarea placeholder="Condiciones de pago, entrega, etc." {...field} value={field.value || ''} /></FormControl><FormMessage/></FormItem>)}/>
                </div>

                <div className="max-h-64 overflow-y-auto pr-2">
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-2/5">Producto</TableHead><TableHead>Cantidad</TableHead><TableHead>Unidad</TableHead><TableHead className="text-right">Precio Unit.</TableHead><TableHead className="text-right">Subtotal</TableHead><TableHead/></TableRow></TableHeader>
                        <TableBody>
                        {fields.map((field, index) => (
                            <TableRow key={field.id}>
                                <TableCell><FormField control={orderForm.control} name={`items.${index}.name`} render={({field}) => <Input placeholder="Nombre del insumo..." {...field}/>}/></TableCell>
                                <TableCell><FormField control={orderForm.control} name={`items.${index}.quantity`} render={({field}) => <Input type="number" className="w-24" {...field}/>}/></TableCell>
                                <TableCell><FormField control={orderForm.control} name={`items.${index}.unit`} render={({field}) => <Input placeholder="Litros, Kg..." className="w-24" {...field}/>}/></TableCell>
                                <TableCell><FormField control={orderForm.control} name={`items.${index}.price`} render={({field}) => <Input type="number" className="text-right w-28" {...field}/>}/></TableCell>
                                <TableCell className="text-right font-mono">${((orderItems?.[index]?.quantity || 0) * (orderItems?.[index]?.price || 0)).toFixed(2)}</TableCell>
                                <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({name: "", quantity: 1, unit: "", price: 0})}>Agregar Fila</Button>
                <Separator className="my-4"/>
                <div className="flex justify-end items-center gap-4">
                    <span className="text-lg font-semibold">Total del Pedido:</span>
                    <span className="text-2xl font-bold font-mono">${orderTotal.toFixed(2)}</span>
                </div>

                <DialogFooter className="mt-6">
                    <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                    <Button type="submit">{editingOrder ? 'Actualizar Borrador' : 'Guardar Borrador'}</Button>
                </DialogFooter>
                </form>
                </Form>
            </DialogContent>
        </Dialog>
      
        <Dialog open={isReceiveOrderDialogOpen} onOpenChange={setIsReceiveOrderDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Registrar Recepción de Pedido #{orderToReceive?.sequentialId}</DialogTitle>
              <DialogDescription>
                Confirme o ajuste las cantidades recibidas. Estas cantidades se sumarán al Stock General.
              </DialogDescription>
            </DialogHeader>
            <Form {...receiveOrderForm}>
              <form onSubmit={receiveOrderForm.handleSubmit(handleReceiveOrderSubmit)}>
                <div className="max-h-96 overflow-y-auto pr-2 mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Producto</TableHead>
                                <TableHead className="text-center">Cant. Pedida</TableHead>
                                <TableHead className="text-center w-40">Cant. Recibida</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {receiveFields.map((field, index) => (
                                <TableRow key={field.id}>
                                    <TableCell className="font-medium">{field.name}</TableCell>
                                    <TableCell className="text-center">{field.orderedQuantity} {field.unit}</TableCell>
                                    <TableCell>
                                        <FormField
                                            control={receiveOrderForm.control}
                                            name={`items.${index}.receivedQuantity`}
                                            render={({ field }) => (
                                                <Input type="number" className="text-center" {...field} />
                                            )}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                <DialogFooter className="mt-6">
                    <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                    <Button type="submit">Confirmar y Actualizar Stock</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Listado de Proveedores</CardTitle>
            <CardDescription>
              Gestiona tus proveedores y sus pedidos.
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenSupplierDialog(null)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Proveedor
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Contacto</TableHead><TableHead>Teléfono</TableHead><TableHead>Último Pedido</TableHead><TableHead className="text-center">Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell>{supplier.contactName || "-"}</TableCell>
                  <TableCell>{supplier.phone || "-"}</TableCell>
                  <TableCell>{lastOrderDates[supplier.id] ? format(new Date(lastOrderDates[supplier.id]), 'dd/MM/yyyy') : 'Nunca'}</TableCell>
                  <TableCell className="text-center space-x-1">
                     <Button variant="outline" size="sm" onClick={() => setSelectedSupplier(supplier)}><FileText className="mr-2 h-4 w-4"/>Ver Pedidos</Button>
                     <Button variant="ghost" size="icon" onClick={() => handleOpenSupplierDialog(supplier)}><Pencil className="h-4 w-4"/></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
        <DialogContent>
            <DialogHeader><DialogTitle>{editingSupplier ? "Editar" : "Nuevo"} Proveedor</DialogTitle></DialogHeader>
            <Form {...supplierForm}>
                <form onSubmit={supplierForm.handleSubmit(handleSupplierSubmit)} className="space-y-4 py-4">
                    <FormField control={supplierForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Razón Social / Nombre</FormLabel><FormControl><Input placeholder="Nombre del proveedor" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={supplierForm.control} name="contactName" render={({ field }) => (<FormItem><FormLabel>Nombre de Contacto</FormLabel><FormControl><Input placeholder="Ej: Juan Pérez" {...field} value={field.value || ''}/></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={supplierForm.control} name="phone" render={({ field }) => (<FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input placeholder="Ej: 11-1234-5678" {...field} value={field.value || ''}/></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={supplierForm.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="contacto@proveedor.com" {...field} value={field.value || ''}/></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={supplierForm.control} name="address" render={({ field }) => (<FormItem><FormLabel>Dirección</FormLabel><FormControl><Input placeholder="Calle, Número, Localidad" {...field} value={field.value || ''}/></FormControl><FormMessage /></FormItem>)} />
                    <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit">Guardar</Button></DialogFooter>
                </form>
            </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
