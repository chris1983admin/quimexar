
"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  UserPlus,
  PackagePlus,
  DollarSign,
  Undo2,
  HandCoins,
  Trash2,
  Package,
  MapPin,
  Phone,
  Pencil,
  Info,
  ArrowLeft,
  Minus,
  Plus,
  Printer
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import Image from "next/image";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, DocumentData, query, increment } from "firebase/firestore";
import { mapDocTo } from "@/lib/mappers";

// Interfaces
interface Product {
  id: string;
  name: string;
  stock: number;
  price: number;
  image: string;
  dataAiHint?: string;
}
interface AssignedProduct {
  productId: string;
  name: string;
  quantity: number;
}
interface SellerSaleItem {
  productId: string;
  quantity: number;
  price: number; // Final discounted price per unit
  originalPrice: number;
  discountPercentage: number;
}
interface SellerSale {
  id: string;
  items: SellerSaleItem[];
  total: number;
  timestamp: string;
}
interface SellerReturn {
  id: string;
  productId: string;
  quantity: number;
  reason: "No vendido" | "Dañado";
  timestamp: string;
}
interface Seller {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  assignedStock: AssignedProduct[];
  sales: SellerSale[];
  returns: SellerReturn[];
  balance: number; // This will represent the value of stock held
}
type AssignmentCartItem = {
  item: Product;
  quantity: number;
};
type SaleCartItem = {
    item: (ReturnType<typeof calculateSellerStock>[number]);
    quantity: number;
}


// Zod Schemas
const newSellerSchema = z.object({
  name: z.string().min(2, "El nombre es requerido."),
  address: z.string().optional(),
  phone: z.string().optional(),
});
const returnSchema = z.object({
  productId: z.string().min(1, "Seleccione un producto."),
  quantity: z.coerce.number().int().positive("La cantidad debe ser positiva."),
  reason: z.enum(["No vendido", "Dañado"]),
});
const paymentSchema = z.object({
  amount: z.coerce.number().positive("El monto debe ser mayor a cero."),
});

const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20, 25, 30];

function QuantityInput({ value, onChange, max }: { value: number; onChange: (newValue: number) => void; max?: number; }) {
  const increment = () => {
    if (max === undefined || value < max) {
      onChange(value + 1);
    }
  };
  const decrement = () => onChange(Math.max(0, value - 1));
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let num = parseInt(e.target.value, 10);
    if (isNaN(num)) num = 0;
    if (max !== undefined) num = Math.min(num, max);
    onChange(num);
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
        max={max}
      />
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={increment} disabled={max !== undefined && value >= max}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}


export default function VendedoresPage() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isNewSellerDialogOpen, setIsNewSellerDialogOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);
  const [sellerForAction, setSellerForAction] = useState<Seller | null>(null);
  const [actionType, setActionType] = useState<"return" | "payment" | null>(null);
  const [assigningToSeller, setAssigningToSeller] = useState<Seller | null>(null);
  const [sellingForSeller, setSellingForSeller] = useState<Seller | null>(null);

  const [assignmentCart, setAssignmentCart] = useState<AssignmentCartItem[]>([]);
  const [itemQuantities, setItemQuantities] = useState<{ [key: string]: number }>({});
  const [assignmentDiscounts, setAssignmentDiscounts] = useState<{ [key: string]: number }>({});
  const [isDirectSale, setIsDirectSale] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [saleCart, setSaleCart] = useState<SaleCartItem[]>([]);
  const [saleItemQuantities, setSaleItemQuantities] = useState<{ [key: string]: number }>({});
  const [saleDiscounts, setSaleDiscounts] = useState<{ [key: string]: number }>({});
  const [saleSearchTerm, setSaleSearchTerm] = useState("");
  
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const newSellerForm = useForm<z.infer<typeof newSellerSchema>>({ resolver: zodResolver(newSellerSchema), defaultValues: { name: "", address: "", phone: "" } });
  const returnForm = useForm<z.infer<typeof returnSchema>>({ resolver: zodResolver(returnSchema), defaultValues: { productId: "", quantity: 1, reason: "No vendido" } });
  const paymentForm = useForm<z.infer<typeof paymentSchema>>({ resolver: zodResolver(paymentSchema), defaultValues: { amount: 0 } });

  const calculateSellerStock = useMemo(() => {
    return (seller: Seller | null, localProducts: Product[]) => {
        if (!seller) return [];
        const stockMap = new Map<string, { name: string; quantity: number; price: number, image: string, dataAiHint?: string }>();

        seller.assignedStock.forEach(item => {
            const productInfo = localProducts.find(p => p.id === item.productId);
            if (productInfo) {
                const currentQty = stockMap.get(item.productId)?.quantity || 0;
                stockMap.set(item.productId, { name: item.name, quantity: currentQty + item.quantity, price: productInfo.price, image: productInfo.image, dataAiHint: productInfo.dataAiHint });
            }
        });

        seller.sales.forEach(sale => {
            sale.items.forEach(item => {
                if(stockMap.has(item.productId)) {
                    stockMap.get(item.productId)!.quantity -= item.quantity;
                }
            });
        });

        seller.returns.forEach(ret => {
            if (stockMap.has(ret.productId)) {
                const currentProduct = stockMap.get(ret.productId);
                if (currentProduct) {
                  currentProduct.quantity -= ret.quantity;
                }
            }
        });

        return Array.from(stockMap.entries()).map(([productId, data]) => ({ productId, ...data })).filter(p => p.quantity > 0);
    }
  }, []);
  
  useEffect(() => {
    const unsubProducts = onSnapshot(query(collection(db, "products")), (snapshot) => {
        setProducts(snapshot.docs.map(doc => mapDocTo<Product>(doc)));
    });

    const unsubSellers = onSnapshot(query(collection(db, "sellers")), async (snapshot) => {
        const sellersData = snapshot.docs.map(doc => mapDocTo<Seller>(doc));
        // This is async now
        const sellersWithRecalculatedBalance = await Promise.all(sellersData.map(async (seller) => {
            const sellerStock = calculateSellerStock(seller, products);
            const newBalance = sellerStock.reduce((acc, stockItem) => {
                const product = products.find(p => p.id === stockItem.productId);
                return acc + (stockItem.quantity * (product?.price || 0));
            }, 0);

            if (seller.balance !== newBalance) {
                // Update balance in firestore if it's different
                await updateDoc(doc(db, "sellers", seller.id), { balance: newBalance });
            }
            return { ...seller, balance: newBalance };
        }));

        setSellers(sellersWithRecalculatedBalance);
        setLoading(false);
    });

    return () => {
        unsubProducts();
        unsubSellers();
    };
  }, [products, calculateSellerStock]);


  const handleSaveSeller = async (data: z.infer<typeof newSellerSchema>) => {
    try {
        if (editingSeller) {
            await updateDoc(doc(db, "sellers", editingSeller.id), data);
            toast({ title: "Vendedor Actualizado", description: `Se actualizaron los datos de ${data.name}.` });
        } else {
            const newSeller: Omit<Seller, 'id'> = {
                name: data.name,
                address: data.address || "",
                phone: data.phone || "",
                assignedStock: [],
                sales: [],
                returns: [],
                balance: 0,
            };
            await addDoc(collection(db, "sellers"), newSeller);
            toast({ title: "Vendedor Agregado", description: `Se agregó a ${data.name}.` });
        }
    } catch(e) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el vendedor." });
    }

    setIsNewSellerDialogOpen(false);
    setEditingSeller(null);
    newSellerForm.reset();
  };
  
  const handleOpenNewSellerDialog = () => {
    setEditingSeller(null);
    newSellerForm.reset({ name: "", address: "", phone: "" });
    setIsNewSellerDialogOpen(true);
  };

  const handleOpenEditSellerDialog = (seller: Seller) => {
    setEditingSeller(seller);
    newSellerForm.reset(seller);
    setIsNewSellerDialogOpen(true);
  };

  const handleDeleteSeller = async (sellerId: string) => {
    try {
        await deleteDoc(doc(db, "sellers", sellerId));
        toast({ title: "Vendedor Eliminado" });
    } catch(e) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el vendedor." });
    }
  };

  const handleConfirmAssignment = async () => {
    if (!assigningToSeller || assignmentCart.length === 0) return;
  
    // Check stock availability first
    for (const cartItem of assignmentCart) {
      const productInDb = products.find((p) => p.id === cartItem.item.id);
      if (!productInDb || productInDb.stock < cartItem.quantity) {
        toast({
          variant: 'destructive',
          title: 'Stock Insuficiente',
          description: `No hay suficiente stock para ${productInDb?.name}.`,
        });
        return;
      }
    }
    
    try {
        // Deduct from general stock
        for (const cartItem of assignmentCart) {
            const productDocRef = doc(db, "products", cartItem.item.id);
            await updateDoc(productDocRef, {
                stock: increment(-cartItem.quantity)
            });
        }
    
        const sellerDocRef = doc(db, "sellers", assigningToSeller.id);

        if (isDirectSale) {
            const saleItems: SellerSaleItem[] = assignmentCart.map((cartItem) => {
                const product = products.find((p) => p.id === cartItem.item.id)!;
                const discountPercentage = assignmentDiscounts[product.id] || 0;
                const finalPrice = product.price * (1 - discountPercentage / 100);
                return {
                    productId: product.id,
                    quantity: cartItem.quantity,
                    price: finalPrice,
                    originalPrice: product.price,
                    discountPercentage: discountPercentage,
                };
            });
            const calculatedTotal = saleItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
            const newSale: SellerSale = {
                id: `SELLSALE-${Date.now()}`,
                items: saleItems,
                total: calculatedTotal,
                timestamp: new Date().toISOString(),
            };
            
            await updateDoc(sellerDocRef, {
                sales: [...assigningToSeller.sales, newSale]
            });
            toast({ title: 'Venta Directa Registrada', description: `Se registró una venta de $${calculatedTotal.toFixed(2)}.`, });

        } else {
            const assignmentsWithNames = assignmentCart.map((c) => ({
                productId: c.item.id,
                name: products.find((p) => p.id === c.item.id)!.name,
                quantity: c.quantity,
            }));
            
            await updateDoc(sellerDocRef, {
                assignedStock: [...assigningToSeller.assignedStock, ...assignmentsWithNames]
            });
            toast({ title: 'Mercadería Asignada' });
        }
    } catch(e) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo completar la operación.' });
        return;
    }
  
    setAssigningToSeller(null);
    setAssignmentCart([]);
    setItemQuantities({});
    setAssignmentDiscounts({});
    setIsDirectSale(false);
    setSearchTerm('');
  };

  const handleConfirmSale = async () => {
    if (!sellingForSeller || saleCart.length === 0) return;
  
    const saleItems: SellerSaleItem[] = saleCart.map((cartItem) => {
      const baseProductInfo = products.find((p) => p.id === cartItem.item.productId)!;
      const discountPercentage = saleDiscounts[baseProductInfo.id] || 0;
      const finalPricePerUnit = baseProductInfo.price * (1 - discountPercentage / 100);
      return {
        productId: baseProductInfo.id,
        quantity: cartItem.quantity,
        price: finalPricePerUnit,
        originalPrice: baseProductInfo.price,
        discountPercentage: discountPercentage,
      };
    });
  
    const calculatedTotal = saleItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  
    const newSale: SellerSale = {
      id: `SELLSALE-${Date.now()}`,
      items: saleItems,
      total: calculatedTotal,
      timestamp: new Date().toISOString(),
    };
    
    try {
        const sellerDocRef = doc(db, "sellers", sellingForSeller.id);
        await updateDoc(sellerDocRef, {
            sales: [...sellingForSeller.sales, newSale]
        });
        toast({ title: 'Venta Registrada', description: `Se registró una venta de $${calculatedTotal.toFixed(2)}.`, });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar la venta.' });
        return;
    }
  
    setSellingForSeller(null);
    setSaleCart([]);
    setSaleItemQuantities({});
    setSaleDiscounts({});
    setSaleSearchTerm('');
  };
  
  const handleRegisterReturn = async (data: z.infer<typeof returnSchema>) => {
    if (!sellerForAction) return;
    const { productId, quantity, reason } = data;
    const product = products.find(p => p.id === productId);
    if (!product) return;
  
    const sellerToUpdate = sellers.find(s => s.id === sellerForAction.id);
    if (!sellerToUpdate) return;
  
    const availableToReturn = calculateSellerStock(sellerToUpdate, products).find(p => p.productId === productId)?.quantity || 0;
  
    if (quantity > availableToReturn) {
      toast({ variant: "destructive", title: "Cantidad inválida", description: "El vendedor no tiene esa cantidad para devolver." });
      return;
    }
    
    try {
        if (reason === "No vendido") {
            const productDocRef = doc(db, "products", productId);
            await updateDoc(productDocRef, {
                stock: increment(quantity)
            });
        }
        
        const sellerDocRef = doc(db, "sellers", sellerForAction.id);
        const newReturn: SellerReturn = { id: `RET-${Date.now()}`, productId, quantity, reason, timestamp: new Date().toISOString() };
        await updateDoc(sellerDocRef, {
            returns: [...sellerForAction.returns, newReturn]
        });

        toast({ title: "Devolución Registrada" });
    } catch(e) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo procesar la devolución." });
        return;
    }
      
    closeDialog();
  };

  const handleReceivePayment = (data: z.infer<typeof paymentSchema>) => {
    if (!sellerForAction) return;
    // This action is currently informational. No DB update needed unless we add a payment history.
    toast({ title: "Pago Recibido", description: `Se registró un pago de $${data.amount.toFixed(2)} de ${sellerForAction.name}.` });
    closeDialog();
  };

  const openActionDialog = (seller: Seller, type: "return" | "payment") => {
    setSellerForAction(seller);
    setActionType(type);
    if (type === "return") {
        returnForm.reset({ productId: "", quantity: 1, reason: "No vendido" });
    }
    if (type === "payment") {
      paymentForm.reset({ amount: 0 });
    }
  };

  const closeDialog = () => {
    setSellerForAction(null);
    setActionType(null);
    returnForm.reset({ productId: "", quantity: 1, reason: "No vendido" });
    paymentForm.reset({ amount: 0 });
  };
  
  const openAssignmentView = (seller: Seller) => {
    setAssignmentCart([]);
    setItemQuantities({});
    setAssignmentDiscounts({});
    setIsDirectSale(false);
    setSearchTerm("");
    setAssigningToSeller(seller);
  };
  
  const openSaleView = (seller: Seller) => {
      setSaleCart([]);
      setSaleItemQuantities({});
      setSaleDiscounts({});
      setSaleSearchTerm("");
      setSellingForSeller(seller);
  };

  const handlePrint = () => {
    window.print();
  };

  // ---- Assignment UI Logic ----
  const filteredProductsForAssignment = useMemo(() => {
    return products.filter(
      (item) => item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  const handleQuantityChange = (itemId: string, newQuantity: number, maxStock?: number) => {
    let quantity = Math.max(0, newQuantity);
    if (maxStock !== undefined) {
        quantity = Math.min(quantity, maxStock);
    }
    setItemQuantities(prev => ({ ...prev, [itemId]: quantity }));
  };
  
  const handleAddToCart = (item: Product) => {
    const quantity = itemQuantities[item.id] || 0;
    if (quantity <= 0) return;

    setAssignmentCart((prevCart) => {
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
  
  const assignmentSummary = useMemo(() => {
    let subtotal = 0;
    let totalSavings = 0;

    assignmentCart.forEach(cartItem => {
      const discount = assignmentDiscounts[cartItem.item.id] || 0;
      const originalPrice = cartItem.item.price;
      
      subtotal += originalPrice * cartItem.quantity;
      totalSavings += (originalPrice * cartItem.quantity) * (discount / 100);
    });

    const total = subtotal - totalSavings;
    return { subtotal, totalSavings, total };
  }, [assignmentCart, assignmentDiscounts]);

  // --- Sale UI Logic ---
  const sellerAvailableStockForSale = useMemo(() => {
    if (!sellingForSeller) return [];
    return calculateSellerStock(sellingForSeller, products);
  }, [sellingForSeller, sellers, products, calculateSellerStock]);

  const filteredSellerStockForSale = useMemo(() => {
    return sellerAvailableStockForSale.filter(
      (item) => item.name.toLowerCase().includes(saleSearchTerm.toLowerCase())
    );
  }, [sellerAvailableStockForSale, saleSearchTerm]);

  const handleSaleQuantityChange = (itemId: string, newQuantity: number, maxStock?: number) => {
    let quantity = Math.max(0, newQuantity);
    if (maxStock !== undefined) {
        quantity = Math.min(quantity, maxStock);
    }
    setSaleItemQuantities(prev => ({ ...prev, [itemId]: quantity }));
  };

  const handleAddToSaleCart = (item: SaleCartItem['item']) => {
    const quantity = saleItemQuantities[item.productId] || 0;
    if (quantity <= 0) return;

    setSaleCart((prevCart) => {
      const existingItem = prevCart.find((cartItem) => cartItem.item.productId === item.productId);
      if (existingItem) {
        return prevCart.map((cartItem) =>
          cartItem.item.productId === item.productId
            ? { ...cartItem, quantity: cartItem.quantity + quantity }
            : cartItem
        );
      } else {
        return [...prevCart, { item, quantity }];
      }
    });
    setSaleItemQuantities(prev => ({ ...prev, [item.productId]: 0 }));
  };

  const saleSummary = useMemo(() => {
    let subtotal = 0;
    let totalSavings = 0;

    saleCart.forEach(cartItem => {
      const discount = saleDiscounts[cartItem.item.productId] || 0;
      const originalPrice = cartItem.item.price;
      subtotal += originalPrice * cartItem.quantity;
      totalSavings += (originalPrice * cartItem.quantity) * (discount / 100);
    });

    const total = subtotal - totalSavings;
    return { subtotal, totalSavings, total };
  }, [saleCart, saleDiscounts]);


  if (assigningToSeller) {
    return (
    <div className="container mx-auto p-4 h-full">
        <div className="flex items-center mb-4 no-print">
            <Button variant="ghost" size="icon" onClick={() => setAssigningToSeller(null)}>
                <ArrowLeft />
            </Button>
            <div className="ml-2">
                <h1 className="text-2xl font-bold">Asignar a {assigningToSeller.name}</h1>
                <p className="text-muted-foreground">Seleccione productos del stock general.</p>
            </div>
        </div>
      
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 h-[calc(100%-80px)]">
            <div className="lg:col-span-2 flex flex-col h-full no-print">
                <div className="mb-4">
                    <Input 
                        placeholder="Buscar productos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="space-y-4 flex-grow overflow-y-auto pr-4">
                    {filteredProductsForAssignment.map((item) => (
                    <Card key={item.id} className="flex items-center p-3 gap-4">
                        <div className="relative w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        <Image src={item.image} alt={item.name} layout="fill" objectFit="cover" data-ai-hint={item.dataAiHint || 'product'} />
                        </div>
                        <div className="flex-grow">
                            <h3 className="font-semibold flex items-center gap-1">{item.name}</h3>
                            <p className="text-sm text-muted-foreground">Stock: {item.stock} | ${item.price.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                        <QuantityInput
                            value={itemQuantities[item.id] || 0}
                            onChange={(newVal) => handleQuantityChange(item.id, newVal, item.stock)}
                            max={item.stock}
                        />
                        <Button onClick={() => handleAddToCart(item)} disabled={(itemQuantities[item.id] || 0) === 0}>Añadir</Button>
                        </div>
                    </Card>
                    ))}
                </div>
            </div>

            <div className="lg:col-span-1">
            <Card className="printable-ticket sticky top-6 flex flex-col h-full">
                <CardHeader>
                <CardTitle>Remito de Asignación</CardTitle>
                <CardDescription>Vendedor: {assigningToSeller.name}</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow space-y-2 overflow-y-auto">
                {assignmentCart.length > 0 ? (
                    assignmentCart.map(cartItem => {
                        const discount = assignmentDiscounts[cartItem.item.id] || 0;
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
                                        onValueChange={(val) => setAssignmentDiscounts(prev => ({...prev, [cartItem.item.id]: Number(val)}))}
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
                    <p>El remito está vacío.</p>
                    </div>
                )}
                </CardContent>
                {assignmentCart.length > 0 && (
                <CardFooter className="flex-col items-stretch p-4 mt-auto border-t">
                    <div className="space-y-2 mb-4">
                         {assignmentSummary.totalSavings > 0 && (
                         <>
                            <div className="flex justify-between text-sm">
                                <span>Subtotal</span>
                                <span>${assignmentSummary.subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-green-600 font-medium">
                                <span>Ahorro total (descuentos)</span>
                                <span>-${assignmentSummary.totalSavings.toFixed(2)}</span>
                            </div>
                            <Separator />
                        </>
                        )}
                        <div className="flex justify-between font-bold text-lg">
                            <span>{isDirectSale ? 'Total Venta' : 'Valor Asignado'}</span>
                            <span>${assignmentSummary.total.toFixed(2)}</span>
                        </div>
                    </div>
                     <div className="flex items-center space-x-2 border p-3 rounded-md mb-4 no-print">
                        <Checkbox id="direct-sale" checked={isDirectSale} onCheckedChange={(checked) => setIsDirectSale(checked as boolean)} />
                        <div className="grid gap-1.5 leading-none">
                            <label
                            htmlFor="direct-sale"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                            {isDirectSale ? 'Registrar como Venta Directa' : 'Asignar como Stock'}
                            </label>
                            <p className="text-sm text-muted-foreground">
                            {isDirectSale ? 'El valor se sumará al saldo del vendedor.' : 'La mercadería se agregará al stock del vendedor.'}
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 no-print">
                      <Button size="lg" variant="outline" className="w-full" onClick={handlePrint}>
                          <Printer className="mr-2 h-4 w-4" />
                          Imprimir
                      </Button>
                      <Button size="lg" className="w-full" onClick={handleConfirmAssignment}>
                          {isDirectSale ? 'Confirmar Venta' : 'Confirmar Asignación'}
                      </Button>
                    </div>
                </CardFooter>
                )}
            </Card>
            </div>
        </div>
    </div>
    )
  }

  if (sellingForSeller) {
    return (
        <div className="container mx-auto p-4 h-full">
            <div className="flex items-center mb-4 no-print">
                <Button variant="ghost" size="icon" onClick={() => setSellingForSeller(null)}>
                    <ArrowLeft />
                </Button>
                <div className="ml-2">
                    <h1 className="text-2xl font-bold">Registrar Venta de {sellingForSeller.name}</h1>
                    <p className="text-muted-foreground">Seleccione productos del stock del vendedor.</p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 h-[calc(100%-80px)]">
                <div className="lg:col-span-2 flex flex-col h-full no-print">
                    <div className="mb-4">
                        <Input 
                            placeholder="Buscar en stock del vendedor..."
                            value={saleSearchTerm}
                            onChange={(e) => setSaleSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="space-y-4 flex-grow overflow-y-auto pr-4">
                        {filteredSellerStockForSale.map((item) => (
                        <Card key={item.productId} className="flex items-center p-3 gap-4">
                            <div className="relative w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                                <Image src={item.image} alt={item.name} layout="fill" objectFit="cover" data-ai-hint={item.dataAiHint || 'product'} />
                            </div>
                            <div className="flex-grow">
                                <h3 className="font-semibold flex items-center gap-1">{item.name}</h3>
                                <p className="text-sm text-muted-foreground">Stock: {item.quantity} | ${item.price.toFixed(2)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <QuantityInput
                                    value={saleItemQuantities[item.productId] || 0}
                                    onChange={(newVal) => handleSaleQuantityChange(item.productId, newVal, item.quantity)}
                                    max={item.quantity}
                                />
                                <Button onClick={() => handleAddToSaleCart(item)} disabled={(saleItemQuantities[item.productId] || 0) === 0}>Añadir</Button>
                            </div>
                        </Card>
                        ))}
                    </div>
                </div>
                <div className="lg:col-span-1">
                <Card className="printable-ticket sticky top-6 flex flex-col h-full">
                    <CardHeader>
                    <CardTitle>Ticket de Venta</CardTitle>
                    <CardDescription>Vendedor: {sellingForSeller.name}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-2 overflow-y-auto">
                    {saleCart.length > 0 ? (
                        saleCart.map(cartItem => {
                            const discount = saleDiscounts[cartItem.item.productId] || 0;
                            const originalLineTotal = cartItem.item.price * cartItem.quantity;
                            const savings = originalLineTotal * (discount / 100);
                            const finalLineTotal = originalLineTotal - savings;

                            return (
                                <div key={cartItem.item.productId} className="space-y-2 border-b pb-2 last:border-b-0">
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
                                        <Label htmlFor={`sale-discount-${cartItem.item.productId}`} className="text-sm">Desc.</Label>
                                        <Select
                                            value={String(discount)}
                                            onValueChange={(val) => setSaleDiscounts(prev => ({...prev, [cartItem.item.productId]: Number(val)}))}
                                        >
                                            <SelectTrigger id={`sale-discount-${cartItem.item.productId}`} className="h-8 text-xs flex-grow">
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
                    {saleCart.length > 0 && (
                    <CardFooter className="flex-col items-stretch p-4 mt-auto border-t">
                        <div className="space-y-2 mb-4">
                            <div className="flex justify-between text-sm">
                                <span>Subtotal</span>
                                <span>${saleSummary.subtotal.toFixed(2)}</span>
                            </div>
                            {saleSummary.totalSavings > 0 && (
                                <div className="flex justify-between text-sm text-green-600 font-medium">
                                    <span>Ahorro total (descuentos)</span>
                                    <span>-${saleSummary.totalSavings.toFixed(2)}</span>
                                </div>
                            )}
                            <Separator />
                            <div className="flex justify-between font-bold text-lg">
                                <span>Total Venta</span>
                                <span>${saleSummary.total.toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 no-print">
                            <Button size="lg" variant="outline" className="w-full" onClick={handlePrint}>
                                <Printer className="mr-2 h-4 w-4" />
                                Imprimir
                            </Button>
                            <Button size="lg" className="w-full" onClick={handleConfirmSale}>
                                Confirmar Venta
                            </Button>
                        </div>
                    </CardFooter>
                    )}
                </Card>
                </div>
            </div>
        </div>
      )
  }


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Gestión de Vendedores</CardTitle>
            <CardDescription>
              Administra vendedores, asigna mercadería y registra sus operaciones.
            </CardDescription>
          </div>
          <Button onClick={handleOpenNewSellerDialog}>
            <UserPlus className="mr-2 h-4 w-4" /> Agregar Vendedor
          </Button>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {sellers.map((seller) => {
            const currentStock = calculateSellerStock(seller, products);
            
            return (
              <Card key={seller.id} className="flex flex-col">
                <CardHeader className="flex-row items-start justify-between">
                  <div>
                    <CardTitle>{seller.name}</CardTitle>
                    <CardDescription>
                      Saldo deudor:{" "}
                      <span className={`font-bold ${seller.balance > 0 ? 'text-destructive' : 'text-green-600'}`}>
                        ${seller.balance.toFixed(2)}
                      </span>
                    </CardDescription>
                  </div>
                  <div className="flex">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEditSellerDialog(seller)}>
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
                          <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminará al vendedor y todo su historial.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteSeller(seller.id)}>
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardHeader>
                <CardContent className="flex-grow space-y-4">
                    <div className="text-sm text-muted-foreground space-y-1">
                        {seller.address && <p className="flex items-center"><MapPin className="mr-2 h-4 w-4 shrink-0" />{seller.address}</p>}
                        {seller.phone && <p className="flex items-center"><Phone className="mr-2 h-4 w-4 shrink-0" />{seller.phone}</p>}
                    </div>
                    {(seller.address || seller.phone) && <Separator />}

                    <p className="text-sm font-medium">Stock Actual del Vendedor</p>
                    <div className="border rounded-md max-h-48 overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Producto</TableHead>
                                    <TableHead className="text-right">Cant.</TableHead>
                                    <TableHead className="text-right">Precio Unit.</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {currentStock.length > 0 ? currentStock.map(item => {
                                    return (
                                        <TableRow key={item.productId}>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                            <TableCell className="text-right font-mono">${item.price.toFixed(2)}</TableCell>
                                        </TableRow>
                                    )
                                }) : <TableRow><TableCell colSpan={3} className="h-24 text-center">Sin stock</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
                <CardFooter className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => openAssignmentView(seller)}><PackagePlus className="mr-2" /> Asignar</Button>
                  <Button onClick={() => openSaleView(seller)}><DollarSign className="mr-2" /> Vender</Button>
                  <Button variant="secondary" onClick={() => openActionDialog(seller, "return")}><Undo2 className="mr-2" /> Devolver</Button>
                  <Button variant="default" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => openActionDialog(seller, "payment")}><HandCoins className="mr-2" /> Cobrar</Button>
                </CardFooter>
              </Card>
            );
          })}
        </CardContent>
      </Card>
      
      {/* Dialog para Nuevo/Editar Vendedor */}
      <Dialog open={isNewSellerDialogOpen} onOpenChange={(open) => {
        setIsNewSellerDialogOpen(open);
        if (!open) {
          setEditingSeller(null);
          newSellerForm.reset();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSeller ? "Editar Vendedor" : "Agregar Nuevo Vendedor"}</DialogTitle>
          </DialogHeader>
          <Form {...newSellerForm}>
            <form onSubmit={newSellerForm.handleSubmit(handleSaveSeller)} className="space-y-4 py-4">
              <FormField control={newSellerForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Nombre completo</FormLabel><FormControl><Input placeholder="Ej: Carlos Rodriguez" {...field} /></FormControl><FormMessage /></FormItem>
              )}/>
               <FormField control={newSellerForm.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>Dirección</FormLabel><FormControl><Input placeholder="Ej: Av. Siempre Viva 742" {...field} /></FormControl><FormMessage /></FormItem>
              )}/>
               <FormField control={newSellerForm.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input placeholder="Ej: 11 2233 4455" {...field} /></FormControl><FormMessage /></FormItem>
              )}/>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit">{editingSeller ? "Guardar Cambios" : "Guardar"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Dialog para Acciones (Devolución y Pago) */}
      <Dialog open={!!sellerForAction} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-lg">
            {sellerForAction && actionType === 'return' && (
                 <>
                <DialogHeader><DialogTitle>Registrar Devolución de {sellerForAction.name}</DialogTitle></DialogHeader>
                <Form {...returnForm}>
                    <form onSubmit={returnForm.handleSubmit(handleRegisterReturn)} className="space-y-4 py-4">
                        <FormField control={returnForm.control} name="productId" render={({ field }) => (
                            <FormItem><FormLabel>Producto a devolver</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..."/></SelectTrigger></FormControl>
                                <SelectContent>{calculateSellerStock(sellerForAction, products).map(p => <SelectItem key={p.productId} value={p.productId}>{p.name} (Tenía: {p.quantity})</SelectItem>)}</SelectContent>
                            </Select><FormMessage/></FormItem>
                        )}/>
                        <FormField control={returnForm.control} name="quantity" render={({ field }) => (
                            <FormItem><FormLabel>Cantidad devuelta</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage/></FormItem>
                        )}/>
                        <FormField control={returnForm.control} name="reason" render={({ field }) => (
                            <FormItem><FormLabel>Motivo</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent><SelectItem value="No vendido">No vendido (vuelve a stock)</SelectItem><SelectItem value="Dañado">Dañado (no vuelve a stock)</SelectItem></SelectContent>
                            </Select><FormMessage/></FormItem>
                        )}/>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Card className="mt-2 bg-muted/50 text-muted-foreground">
                                <CardContent className="p-3 text-xs flex items-center gap-2">
                                  <Info className="h-4 w-4 flex-shrink-0" />
                                  <span>Al registrar una devolución, el stock del vendedor se reducirá.</span>
                                </CardContent>
                              </Card>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>El saldo se ajusta automáticamente según el nuevo valor del stock.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit">Confirmar Devolución</Button></DialogFooter>
                    </form>
                </Form>
                </>
            )}
            {sellerForAction && actionType === 'payment' && (
                 <>
                <DialogHeader><DialogTitle>Recibir Pago de {sellerForAction.name}</DialogTitle><DialogDescription>El saldo deudor representa el valor del stock. Esta acción solo registra el pago.</DialogDescription></DialogHeader>
                <Form {...paymentForm}>
                    <form onSubmit={paymentForm.handleSubmit(handleReceivePayment)} className="space-y-4 py-4">
                        <FormField control={paymentForm.control} name="amount" render={({ field }) => (
                            <FormItem><FormLabel>Monto recibido</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage/></FormItem>
                        )}/>
                        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit">Registrar Pago</Button></DialogFooter>
                    </form>
                </Form>
                </>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
