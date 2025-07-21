
"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, CreditCard, Banknote, Landmark, BookUser, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, doc, updateDoc, query, orderBy, where, getDocs, addDoc, DocumentData } from "firebase/firestore";
import { mapDocTo } from "@/lib/mappers";

interface OrderItem {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
}
interface Order {
  id: string;
  customerName: string;
  deliveryAddress: string;
  items: OrderItem[];
  total: number;
  status: "Pendiente" | "En Reparto" | "Entregado" | "Cancelado";
  createdAt: string;
  customerId?: string;
}

interface Customer {
  id: string;
  name: string;
}

export default function PedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined);
  const [orderForCtaCte, setOrderForCtaCte] = useState<Order | null>(null);


  useEffect(() => {
    const qOrders = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
        setOrders(snapshot.docs.map(doc => mapDocTo<Order>(doc)));
    });
    
    const qCustomers = query(collection(db, "customers"));
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
        setCustomers(snapshot.docs.map(doc => mapDocTo<Customer>(doc)));
    });

    return () => {
        unsubOrders();
        unsubCustomers();
    };
  }, []);

  const getStatusVariant = (status: Order["status"]): "secondary" | "default" | "outline" | "destructive" => {
    switch (status) {
      case "Pendiente":
        return "secondary";
      case "En Reparto":
        return "default";
      case "Entregado":
        return "outline"; 
      case "Cancelado":
        return "destructive";
      default:
        return "secondary";
    }
  };
  
  const handlePaymentInCash = async (order: Order, paymentMethod: string) => {
    try {
      // First, update the order status
      const orderDocRef = doc(db, "orders", order.id);
      await updateDoc(orderDocRef, { status: "Entregado" });
      
      // Then, register the sale in the active cash session
      const sessionQuery = query(collection(db, "caja-sessions"), where("closingTime", "==", null));
      const sessionSnapshot = await getDocs(sessionQuery);
      
      if (!sessionSnapshot.empty) {
        const sessionDoc = sessionSnapshot.docs[0];
        const newSale = {
          id: `VTA-PED-${order.id}`,
          total: order.total,
          paymentMethod: paymentMethod,
          timestamp: new Date().toISOString(),
          items: order.items,
        };
        await updateDoc(sessionDoc.ref, {
            sales: [...sessionDoc.data().sales, newSale]
        });
      }

      toast({
        title: "Cobro Registrado",
        description: `El pedido ${order.id} fue cobrado con ${paymentMethod} y marcado como 'Entregado'.`,
      });

    } catch (error) {
       console.error("Failed to update order status", error);
       toast({
        variant: "destructive",
        title: "Error al guardar",
        description: "No se pudo actualizar el estado del pedido.",
      });
    }

    setIsDialogOpen(false);
    setSelectedOrder(null);
  };

  const handlePayment = (order: Order, paymentMethod: string) => {
    if (paymentMethod === "Cuenta Corriente") {
        setOrderForCtaCte(order);
        setIsDialogOpen(false); // Close payment methods dialog
        setIsCustomerDialogOpen(true); // Open customer select dialog
        return;
    }
    handlePaymentInCash(order, paymentMethod);
  };
  
  const handleAddToCustomerAccount = async () => {
    if (!selectedCustomerId || !orderForCtaCte) {
        toast({ variant: "destructive", title: "Error", description: "Debe seleccionar un cliente." });
        return;
    }

    try {
        const customer = customers.find(c => c.id === selectedCustomerId);
        if (!customer) throw new Error("Cliente no encontrado");

        // Add to billable items for invoicing module
        const billableItem = {
            id: `BO-${orderForCtaCte.id}`,
            date: new Date().toISOString(),
            customerId: selectedCustomerId,
            customerName: customer.name,
            items: orderForCtaCte.items,
            total: orderForCtaCte.total,
            type: 'delivery-order' as const,
            invoiced: false,
        };
        
        await addDoc(collection(db, "billable-items"), billableItem);

        // Update order status
        const orderDocRef = doc(db, "orders", orderForCtaCte.id);
        await updateDoc(orderDocRef, { status: "Entregado", customerId: selectedCustomerId });
        
        toast({
            title: "Pedido listo para facturar",
            description: `El pedido ${orderForCtaCte.id} para ${customer?.name} se marcó como entregado y está pendiente de facturación.`,
        });

    } catch (error) {
        console.error("Failed to save data", error);
        toast({
            variant: "destructive",
            title: "Error al guardar",
            description: "No se pudo actualizar el estado del pedido.",
        });
    }

    setIsCustomerDialogOpen(false);
    setSelectedCustomerId(undefined);
    setOrderForCtaCte(null);
    setSelectedOrder(null);
  };


  const openDialog = (order: Order) => {
    setSelectedOrder(order);
    setIsDialogOpen(true);
  };

  const handleCopyOrderInfo = (order: Order) => {
    const orderInfo = `Pedido: ${order.id}\nCliente: ${order.customerName}\nDirección: ${order.deliveryAddress}\nTotal a cobrar: $${order.total.toFixed(2)}`;
    navigator.clipboard.writeText(orderInfo).then(() => {
        toast({
            title: "Copiado al portapapeles",
            description: "La información del pedido está lista para ser pegada.",
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Gestión de Pedidos</CardTitle>
          <CardDescription>
            Aquí podrás registrar y seguir el estado de los pedidos pendientes de reparto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.id}</TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>{order.deliveryAddress}</TableCell>
                    <TableCell>
                      {new Date(order.createdAt).toLocaleDateString("es-AR")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      ${order.total.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                       <div className="flex items-center justify-center gap-2">
                        {order.status !== "Entregado" && order.status !== "Cancelado" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDialog(order)}
                          >
                            Cobrar
                          </Button>
                        ) : (
                          <span className="inline-block w-[68px] text-center">-</span>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleCopyOrderInfo(order)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                       </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-48 border-2 border-dashed rounded-lg">
              <ShoppingCart className="h-10 w-10 mb-2" />
              <p>No hay pedidos pendientes.</p>
              <p className="text-xs">Los pedidos para reparto aparecerán aquí.</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {selectedOrder && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cobrar Pedido {selectedOrder.id}</DialogTitle>
              <DialogDescription>
                Cliente: {selectedOrder.customerName} <br />
                Total a cobrar: <strong>${selectedOrder.total.toFixed(2)}</strong>.
                <br />
                Seleccione el método de pago para marcar el pedido como 'Entregado'.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <Button variant="outline" onClick={() => handlePayment(selectedOrder, "Efectivo")}>
                  <Banknote className="mr-2 h-4 w-4" /> Efectivo
              </Button>
              <Button variant="outline" onClick={() => handlePayment(selectedOrder, "Tarjeta")}>
                  <CreditCard className="mr-2 h-4 w-4" /> Tarjeta
              </Button>
              <Button variant="outline" onClick={() => handlePayment(selectedOrder, "Transferencia")}>
                  <Landmark className="mr-2 h-4 w-4" /> Transferencia
              </Button>
              <Button variant="outline" onClick={() => handlePayment(selectedOrder, "Cuenta Corriente")}>
                  <BookUser className="mr-2 h-4 w-4" /> Cta. Cte.
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {orderForCtaCte && (
        <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Asignar a Cuenta Corriente</DialogTitle>
                    <DialogDescription>
                       Seleccione el cliente para que el total de <strong>${orderForCtaCte.total.toFixed(2)}</strong> quede pendiente de facturación.
                    </DialogDescription>
                </DialogHeader>
                 <div className="py-4 space-y-2">
                    <Label>Cliente</Label>
                    <Select onValueChange={setSelectedCustomerId} value={selectedCustomerId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Seleccione un cliente..." />
                        </SelectTrigger>
                        <SelectContent>
                            {customers.map(customer => (
                                <SelectItem key={customer.id} value={customer.id}>
                                    {customer.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCustomerDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleAddToCustomerAccount} disabled={!selectedCustomerId}>
                        Confirmar y Marcar Entregado
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}
    </>
  );
}
