
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { Plus, Minus, Package, Banknote, CreditCard, Landmark, BookUser, Printer } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, updateDoc, addDoc, query, where, getDocs, writeBatch, increment, DocumentData } from "firebase/firestore";
import { mapDocTo } from "@/lib/mappers";

// Interfaces
interface Product {
  id: string;
  name: string;
  code: string;
  type: "Propio" | "Tercero";
  stock: number;
  unit: string;
  price: number;
  brand?: string;
  image: string;
  dataAiHint?: string;
}

interface Combo {
    id: string;
    name: string;
    price: number;
    image: string;
    dataAiHint?: string;
    products: { productId: string, quantity: number }[];
    active: boolean;
}

interface Customer {
  id: string;
  name: string;
}

type SaleableItem = (Product & { isCombo?: false }) | (Combo & { isCombo: true });
type CartItem = {
  item: SaleableItem;
  quantity: number;
};

const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20, 25, 30];

function QuantityInput({ value, onChange }: { value: number, onChange: (newValue: number) => void }) {
  const increment = () => onChange(value + 1);
  const decrement = () => onChange(Math.max(0, value - 1));
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = parseInt(e.target.value, 10);
    onChange(isNaN(num) ? 0 : num);
  };

  return (
    <div className="flex items-center gap-1 rounded-md border">
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={decrement}>
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        className="h-8 w-12 border-none bg-transparent text-center shadow-none [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        value={value}
        onChange={handleChange}
      />
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={increment}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}


export default function VentasPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartDiscounts, setCartDiscounts] = useState<{ [key: string]: number }>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined);
  const [itemQuantities, setItemQuantities] = useState<{ [key: string]: number }>({});
  const { toast } = useToast();
  
  const [isForDelivery, setIsForDelivery] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState({ name: "", address: "", phone: "" });


  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    const unsubProducts = onSnapshot(query(collection(db, "products")), (snapshot) => setProducts(snapshot.docs.map(doc => mapDocTo<Product>(doc))));
    const unsubCombos = onSnapshot(query(collection(db, "combos")), (snapshot) => setCombos(snapshot.docs.map(doc => mapDocTo<Combo>(doc))));
    const unsubCustomers = onSnapshot(query(collection(db, "customers")), (snapshot) => setCustomers(snapshot.docs.map(doc => mapDocTo<Customer>(doc))));

    return () => {
        unsubProducts();
        unsubCombos();
        unsubCustomers();
    };
  }, []);

  const calculateComboStock = useCallback((combo: Combo) => {
    if (!combo.products || combo.products.length === 0) return 0;
    const stockLevels = combo.products.map(comboProduct => {
        const product = products.find(p => p.id === comboProduct.productId);
        if (!product || product.stock < comboProduct.quantity) return 0;
        return Math.floor(product.stock / comboProduct.quantity);
    });
    return Math.min(...stockLevels);
  }, [products]);

  const saleableItems = useMemo((): SaleableItem[] => {
    const activeProducts: SaleableItem[] = products.map(p => ({...p, isCombo: false, stock: p.stock}));
    const activeCombos: SaleableItem[] = combos
        .filter(c => c.active)
        .map(c => ({...c, isCombo: true, stock: calculateComboStock(c)}))
        .filter(c => c.stock > 0);
    return [...activeProducts, ...activeCombos];
  }, [products, combos, calculateComboStock]);

  const filteredItems = useMemo(() => {
    return saleableItems.filter(
      (item) => item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [saleableItems, searchTerm]);

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    setItemQuantities(prev => ({ ...prev, [itemId]: Math.max(0, newQuantity) }));
  };

  const addToCart = (item: SaleableItem, quantity: number) => {
    if (quantity <= 0) return;
    setCart((prevCart) => {
      const existingItem = prevCart.find((cartItem) => cartItem.item.id === item.id);
      if (existingItem) {
        return prevCart.map((cartItem) =>
          cartItem.item.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + quantity }
            : cartItem
        );
      } else {
        return [...prevCart, { item, quantity }];
      }
    });
    setItemQuantities(prev => ({ ...prev, [item.id]: 0 }));
  };

  const handleAddToCart = (item: SaleableItem) => {
    const quantityToAdd = itemQuantities[item.id] || 0;
    addToCart(item, quantityToAdd);
  };

  const cartSummary = useMemo(() => {
    let subtotal = 0;
    let totalSavings = 0;

    cart.forEach(cartItem => {
      const discount = cartDiscounts[cartItem.item.id] || 0;
      const originalPrice = cartItem.item.price;
      
      subtotal += originalPrice * cartItem.quantity;
      totalSavings += (originalPrice * cartItem.quantity) * (discount / 100);
    });

    const total = subtotal - totalSavings;
    return { subtotal, totalSavings, total };
  }, [cart, cartDiscounts]);

  const updateStock = async () => {
    const batch = writeBatch(db);
    cart.forEach(cartItem => {
        if (cartItem.item.isCombo) {
            const combo = cartItem.item as Combo;
            combo.products.forEach(comboProduct => {
                const productDocRef = doc(db, "products", comboProduct.productId);
                batch.update(productDocRef, { stock: increment(-(comboProduct.quantity * cartItem.quantity)) });
            });
        } else {
            const productDocRef = doc(db, "products", cartItem.item.id);
            batch.update(productDocRef, { stock: increment(-cartItem.quantity) });
        }
    });
    await batch.commit();
  }
  
  const getSaleItemsForStorage = () => {
      return cart.map(ci => {
        const discount = cartDiscounts[ci.item.id] || 0;
        const originalPrice = ci.item.price;
        const finalPrice = originalPrice * (1 - discount / 100);
        return {
            productId: ci.item.id,
            productName: ci.item.name,
            quantity: ci.quantity,
            price: finalPrice,
            originalPrice: originalPrice,
            discountPercentage: discount,
        }
    });
  }

  const registerSaleInCashSession = async (paymentMethod: string) => {
      try {
        const sessionQuery = query(collection(db, "caja-sessions"), where("closingTime", "==", null));
        const sessionSnapshot = await getDocs(sessionQuery);
        
        if (sessionSnapshot.empty) {
            toast({ variant: "destructive", title: "No hay caja activa", description: "Por favor, abra una caja para registrar la venta." });
            return false;
        }
          
        const sessionDoc = sessionSnapshot.docs[0];
        const newSale = {
            id: `VTA-${Date.now()}`,
            total: cartSummary.total,
            paymentMethod,
            timestamp: new Date().toISOString(),
            items: getSaleItemsForStorage(),
        };

        await updateDoc(sessionDoc.ref, {
            sales: [...sessionDoc.data().sales, newSale]
        });

        return true;
      } catch (error) {
          console.error("Failed to register sale in cash session", error);
          toast({ variant: "destructive", title: "Error de Caja", description: "No se pudo registrar la venta en la caja activa." });
          return false;
      }
  };

  const resetSale = () => {
    setCart([]);
    setCartDiscounts({});
    setIsPaymentDialogOpen(false);
    setIsCustomerDialogOpen(false);
    setSelectedCustomerId(undefined);
    setItemQuantities({});
    setIsForDelivery(false);
    setDeliveryInfo({ name: "", address: "", phone: "" });
  }

  const handleProceed = async () => {
    if (cart.length === 0) {
      toast({ variant: 'destructive', title: 'Ticket vacío', description: 'Agrega productos para continuar.' });
      return;
    }

    if (isForDelivery) {
        await handleCreateOrder();
    } else {
        const sessionQuery = query(collection(db, "caja-sessions"), where("closingTime", "==", null));
        const sessionSnapshot = await getDocs(sessionQuery);

        if (sessionSnapshot.empty) {
            toast({ variant: "destructive", title: "Caja Cerrada", description: "Debe abrir una caja para registrar ventas." });
            return;
        }
        setIsPaymentDialogOpen(true);
    }
  }

  const handleFinalizeSale = async (paymentMethod: string) => {
    if (paymentMethod === "Cuenta Corriente") {
        setIsPaymentDialogOpen(false);
        setIsCustomerDialogOpen(true);
        return;
    }

    try {
        await updateStock();
        const success = await registerSaleInCashSession(paymentMethod);
        if (success) {
            toast({ title: "Venta Registrada", description: `La venta por $${cartSummary.total.toFixed(2)} con ${paymentMethod} se ha completado.` });
            resetSale();
        }
    } catch (e) {
         toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el stock o registrar la venta.'})
    }
  };
  
  const handleAddToCustomerAccount = async () => {
    if (!selectedCustomerId) {
        toast({ variant: "destructive", title: "Seleccione un cliente" });
        return;
    }

    try {
        const customer = customers.find(c => c.id === selectedCustomerId);
        if (!customer) throw new Error("Cliente no encontrado");
        
        const billableSale = {
          id: `BS-${Date.now()}`,
          date: new Date().toISOString(),
          customerId: selectedCustomerId,
          customerName: customer.name,
          items: getSaleItemsForStorage(),
          total: cartSummary.total,
          type: "pos-sale" as const,
          invoiced: false,
        };

        await addDoc(collection(db, "billable-items"), billableSale);
        
        await updateStock();
        const success = await registerSaleInCashSession("Cuenta Corriente");
        if(success) {
            toast({ title: "Venta para Cta. Cte.", description: `La venta para ${customer.name} está lista para facturar.` });
            resetSale();
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Error al guardar", description: "No se pudo preparar la venta para facturación." });
    }
  };

  const handleCreateOrder = async () => {
    if (!deliveryInfo.name.trim()) {
        toast({ variant: 'destructive', title: 'Nombre requerido', description: 'Por favor, ingrese el nombre del cliente.' });
        return;
    }
    if (!deliveryInfo.address.trim()) {
        toast({ variant: 'destructive', title: 'Dirección requerida', description: 'Por favor, ingrese una dirección de entrega.' });
        return;
    }

    const fullAddress = deliveryInfo.phone.trim() 
        ? `${deliveryInfo.address} (Tel: ${deliveryInfo.phone})`
        : deliveryInfo.address;

    const newOrder = {
      id: `PED-${Date.now().toString().slice(-6)}`,
      customerName: deliveryInfo.name,
      deliveryAddress: fullAddress,
      items: getSaleItemsForStorage(),
      total: cartSummary.total,
      status: "Pendiente" as const,
      createdAt: new Date().toISOString(),
    };
    
    try {
        await addDoc(collection(db, "orders"), newOrder);
        await updateStock();
        toast({ title: "Pedido Generado", description: `El pedido para ${deliveryInfo.name} ha sido creado y está pendiente de cobro y reparto.` });
        resetSale();
    } catch (error) {
        console.error("Failed to create order", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el pedido.' });
    }
  };


  return (
    <div className="container mx-auto p-4 h-full">
      <div className="no-print">
        <h1 className="text-3xl font-bold text-center mb-2">
          Punto de Venta
        </h1>
        <p className="text-center text-muted-foreground mb-8">Seleccione productos para agregar al ticket.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 h-[calc(100%-120px)]">
        <div className="lg:col-span-2 flex flex-col h-full no-print">
          <div className="mb-4">
            <Input 
                placeholder="Buscar productos o combos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="space-y-4 flex-grow overflow-y-auto pr-4">
            {filteredItems.map((item) => (
              <Card key={item.id} className="flex items-center p-3 gap-4">
                <div className="relative w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                  <Image src={item.image} alt={item.name} layout="fill" objectFit="cover" data-ai-hint={item.dataAiHint || 'product'} />
                </div>
                <div className="flex-grow">
                  <h3 className="font-semibold flex items-center">{item.name} {item.isCombo && <Badge variant="secondary" className="ml-2">Combo</Badge>}</h3>
                  <p className="text-sm text-muted-foreground">Stock: {item.stock} | ${item.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <QuantityInput
                    value={itemQuantities[item.id] || 0}
                    onChange={(newVal) => handleQuantityChange(item.id, newVal)}
                  />
                  <Button onClick={() => handleAddToCart(item)} disabled={(itemQuantities[item.id] || 0) === 0}>Añadir</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="lg:col-span-1">
          <Card id="ticket-content" className="printable-ticket sticky top-6 flex flex-col h-full">
            <CardHeader>
              <CardTitle>Ticket</CardTitle>
              <CardDescription>
                Resumen de la venta actual.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-4 overflow-y-auto">
              {cart.length > 0 ? (
                cart.map(cartItem => {
                    const discount = cartDiscounts[cartItem.item.id] || 0;
                    const originalLineTotal = cartItem.item.price * cartItem.quantity;
                    const savings = originalLineTotal * (discount / 100);
                    const finalLineTotal = originalLineTotal - savings;

                    return (
                        <div key={cartItem.item.id} className="space-y-2 border-b pb-2 last:border-b-0">
                        <div className="flex justify-between items-start">
                            <span className="font-medium pr-2">{cartItem.quantity}x {cartItem.item.name}</span>
                            <div className="text-right">
                                <p className="font-semibold whitespace-nowrap">${finalLineTotal.toFixed(2)}</p>
                                {discount > 0 && (
                                    <p className="text-xs text-muted-foreground line-through">
                                        ${originalLineTotal.toFixed(2)}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 no-print">
                            <Label htmlFor={`discount-${cartItem.item.id}`} className="text-sm">Desc.</Label>
                            <Select
                                value={String(discount)}
                                onValueChange={(val) => setCartDiscounts(prev => ({...prev, [cartItem.item.id]: Number(val)}))}
                                disabled={cartItem.item.isCombo}
                            >
                                <SelectTrigger id={`discount-${cartItem.item.id}`} className="h-8 text-xs flex-grow">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {DISCOUNT_OPTIONS.map(opt => <SelectItem key={opt} value={String(opt)}>{opt}%</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        {discount > 0 && (
                            <div className="text-sm text-primary font-medium">
                                <span>Ahorro: -${savings.toFixed(2)}</span>
                            </div>
                        )}
                        </div>
                    )
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Package className="h-12 w-12 mb-4" />
                  <p>El ticket está vacío.</p>
                </div>
              )}
            </CardContent>
            {cart.length > 0 && (
              <CardFooter className="flex-col items-stretch p-4 mt-auto border-t">
                <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                        <span>Subtotal</span>
                        <span>${cartSummary.subtotal.toFixed(2)}</span>
                    </div>
                    {cartSummary.totalSavings > 0 && (
                        <div className="flex justify-between text-sm text-green-600 font-medium">
                            <span>Ahorro total (descuentos)</span>
                            <span>-${cartSummary.totalSavings.toFixed(2)}</span>
                        </div>
                    )}
                    <Separator />
                    <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>${cartSummary.total.toFixed(2)}</span>
                    </div>
                </div>

                <div className="space-y-4 mb-4 no-print">
                    <Separator />
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="delivery-switch"
                            checked={isForDelivery}
                            onCheckedChange={setIsForDelivery}
                        />
                        <Label htmlFor="delivery-switch">Preparar para reparto a domicilio</Label>
                    </div>
                    {isForDelivery && (
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="delivery-name">Nombre del Cliente</Label>
                                <Input
                                    id="delivery-name"
                                    value={deliveryInfo.name}
                                    onChange={(e) => setDeliveryInfo(prev => ({...prev, name: e.target.value}))}
                                    placeholder="Nombre y Apellido"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="delivery-address">Dirección de Entrega</Label>
                                <Input
                                    id="delivery-address"
                                    value={deliveryInfo.address}
                                    onChange={(e) => setDeliveryInfo(prev => ({...prev, address: e.target.value}))}
                                    placeholder="Calle, Número, Localidad"
                                />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="delivery-phone">Teléfono</Label>
                                <Input
                                    id="delivery-phone"
                                    value={deliveryInfo.phone}
                                    onChange={(e) => setDeliveryInfo(prev => ({...prev, phone: e.target.value}))}
                                    placeholder="Teléfono de contacto (opcional)"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2 no-print">
                    <Button size="lg" variant="outline" className="w-full" onClick={handlePrint}>
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimir
                    </Button>
                    <Button size="lg" className="w-full" onClick={handleProceed}>
                        {isForDelivery ? "Generar Pedido" : "Cobrar"}
                    </Button>
                </div>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>
      
       {isPaymentDialogOpen && (
        <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Finalizar Venta</DialogTitle><DialogDescription>Total a cobrar: <strong>${cartSummary.total.toFixed(2)}</strong>.<br />Seleccione el método de pago para registrar la venta.</DialogDescription></DialogHeader>
                <div className="grid grid-cols-2 gap-4 py-4">
                    <Button variant="outline" onClick={() => handleFinalizeSale("Efectivo")}><Banknote className="mr-2 h-4 w-4" /> Efectivo</Button>
                    <Button variant="outline" onClick={() => handleFinalizeSale("Tarjeta")}><CreditCard className="mr-2 h-4 w-4" /> Tarjeta</Button>
                    <Button variant="outline" onClick={() => handleFinalizeSale("Transferencia")}><Landmark className="mr-2 h-4 w-4" /> Transferencia</Button>
                    <Button variant="outline" onClick={() => handleFinalizeSale("Cuenta Corriente")}><BookUser className="mr-2 h-4 w-4" /> Cta. Cte.</Button>
                </div>
            </DialogContent>
        </Dialog>
    )}

    {isCustomerDialogOpen && (
        <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Asignar a Cuenta Corriente</DialogTitle><DialogDescription>Seleccione el cliente para agregar el total de <strong>${cartSummary.total.toFixed(2)}</strong> a su cuenta corriente para futura facturación.</DialogDescription></DialogHeader>
                 <div className="py-4 space-y-2">
                    <Label>Cliente</Label>
                    <Select onValueChange={setSelectedCustomerId} value={selectedCustomerId}>
                        <SelectTrigger><SelectValue placeholder="Seleccione un cliente..." /></SelectTrigger>
                        <SelectContent>{customers.map(customer => (<SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>))}</SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCustomerDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleAddToCustomerAccount} disabled={!selectedCustomerId}>Confirmar y Finalizar Venta</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )}
    </div>
  );
}
