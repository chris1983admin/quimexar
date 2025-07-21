
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Pencil, Trash2, Package, X, Percent, Tag, Loader2 } from "lucide-react";
import Image from "next/image";
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
} from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { db } from "@/lib/firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc, query, onSnapshot, DocumentData } from "firebase/firestore";
import { generateProductImage } from "@/ai/flows/generate-product-image-flow";
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

interface ComboProduct {
  productId: string;
  quantity: number;
}

interface Combo {
    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    dataAiHint?: string;
    products: ComboProduct[];
    active: boolean;
}

interface Promotion {
  id: string;
  name: string;
  description: string;
  type: 'buy_x_get_y' | 'percentage_on_second';
  productId: string;
  buyQuantity: number;
  payQuantity?: number;
  discountPercentage?: number;
  active: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const productSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  code: z.string().min(1, "El código es requerido."),
  price: z.coerce.number().positive("El precio debe ser un número positivo."),
  stock: z.coerce.number().int().min(0, "El stock no puede ser negativo."),
  type: z.enum(["Propio", "Tercero"]),
  unit: z.string().min(1, "La unidad es requerida."),
  brand: z.string().optional(),
  image: z.any()
    .optional()
    .refine((files) => !files || files.length === 0 || files?.[0]?.size <= MAX_FILE_SIZE, `El tamaño máximo de la imagen es 5MB.`)
    .refine(
      (files) => !files || files.length === 0 || ACCEPTED_IMAGE_TYPES.includes(files?.[0]?.type),
      "Solo se permiten formatos .jpeg, .jpg, .png y .webp."
    ),
});

const comboSchema = z.object({
    name: z.string().min(3, "El nombre del combo es requerido."),
    description: z.string().optional(),
    price: z.coerce.number().positive("El precio del combo debe ser positivo."),
    products: z.array(z.object({
        productId: z.string().min(1, "Debe seleccionar un producto."),
        quantity: z.coerce.number().int().positive("La cantidad debe ser positiva."),
    })).min(1, "El combo debe tener al menos un producto."),
    image: z.any()
        .optional()
        .refine((files) => !files || files.length === 0 || files?.[0]?.size <= MAX_FILE_SIZE, `El tamaño máximo de la imagen es 5MB.`)
        .refine((files) => !files || files.length === 0 || ACCEPTED_IMAGE_TYPES.includes(files?.[0]?.type), "Solo se permiten formatos .jpeg, .jpg, .png y .webp."),
});

const promotionSchema = z.object({
  name: z.string().min(3, "El nombre es requerido."),
  description: z.string().min(3, "La descripción es requerida."),
  productId: z.string().min(1, "Debe seleccionar un producto."),
  type: z.enum(['buy_x_get_y', 'percentage_on_second']),
  buyQuantity: z.coerce.number().int().positive("Debe ser mayor a 0."),
  payQuantity: z.coerce.number().int().positive("Debe ser mayor a 0.").optional(),
  discountPercentage: z.coerce.number().int().positive("Debe ser mayor a 0.").optional(),
}).refine(data => {
    if (data.type === 'buy_x_get_y') return !!data.payQuantity;
    if (data.type === 'percentage_on_second') return !!data.discountPercentage;
    return false;
}, {
    message: "Debe completar los campos específicos del tipo de promoción.",
    path: ["type"],
});


type ProductFormData = z.infer<typeof productSchema>;
type ComboFormData = z.infer<typeof comboSchema>;
type PromotionFormData = z.infer<typeof promotionSchema>;

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [filters, setFilters] = useState({ name: "" });
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isComboDialogOpen, setIsComboDialogOpen] = useState(false);
  const [isPromotionDialogOpen, setIsPromotionDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const productForm = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", code: "", price: 0, stock: 0, type: "Propio", unit: "", brand: "", image: undefined },
  });
  
  const comboForm = useForm<ComboFormData>({
    resolver: zodResolver(comboSchema),
    defaultValues: { name: "", description: "", price: 0, products: [], image: undefined, },
  });
  
  const promotionForm = useForm<PromotionFormData>({
    resolver: zodResolver(promotionSchema),
    defaultValues: { type: 'buy_x_get_y' }
  });
  const promotionType = promotionForm.watch('type');

  const { fields, append, remove } = useFieldArray({ control: comboForm.control, name: "products" });

  useEffect(() => {
    const fetchCollection = (collectionName: string, setData: (data: any[]) => void, mapper: (doc: DocumentData) => any) => {
        const q = query(collection(db, collectionName));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const items = querySnapshot.docs.map(mapper);
            setData(items);
            setLoading(false);
        }, (error) => {
            console.error(`Error fetching ${collectionName}: `, error);
            toast({ variant: "destructive", title: "Error de Carga", description: `No se pudieron cargar los datos de ${collectionName}.` });
            setLoading(false);
        });
        return unsubscribe;
    };

    const unsubProducts = fetchCollection("products", setProducts, mapDocTo);
    const unsubCombos = fetchCollection("combos", setCombos, mapDocTo);
    const unsubPromotions = fetchCollection("promotions", setPromotions, mapDocTo);

    return () => {
        unsubProducts();
        unsubCombos();
        unsubPromotions();
    };
  }, [toast]);


  const handleOpenProductDialog = (product: Product | null) => {
    if (product) {
      setEditingProduct(product);
      productForm.reset({ ...product, price: product.price, stock: product.stock, image: undefined });
    } else {
      setEditingProduct(null);
      productForm.reset({ name: "", code: "", price: 0, stock: 0, type: "Propio", unit: "", brand: "", image: undefined });
    }
    setIsProductDialogOpen(true);
  };

  const handleOpenComboDialog = (combo: Combo | null) => {
    if (combo) {
        setEditingCombo(combo);
        comboForm.reset({ ...combo, price: combo.price, image: undefined });
    } else {
        setEditingCombo(null);
        comboForm.reset({ name: "", description: "", price: 0, products: [], image: undefined });
    }
    setIsComboDialogOpen(true);
  }

  const handleOpenPromotionDialog = (promotion: Promotion | null) => {
    if (promotion) {
        setEditingPromotion(promotion);
        promotionForm.reset(promotion);
    } else {
        setEditingPromotion(null);
        promotionForm.reset({
            name: "",
            description: "",
            productId: "",
            type: "buy_x_get_y",
            buyQuantity: 2,
            payQuantity: 1,
            discountPercentage: 50,
        });
    }
    setIsPromotionDialogOpen(true);
  };
  
  const handleDeleteProduct = async (productId: string) => {
    try {
      await deleteDoc(doc(db, "products", productId));
      toast({ title: "Producto Eliminado", description: "El producto ha sido eliminado." });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el producto." });
    }
  }
  
  const handleDeleteFromCollection = async (collectionName: string, id: string, name: string) => {
      try {
        await deleteDoc(doc(db, collectionName, id));
        toast({ title: `${collectionName.charAt(0).toUpperCase() + collectionName.slice(1, -1)} Eliminado/a`, description: `Se eliminó "${name}".` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: `No se pudo eliminar.` });
    }
  }

  const onProductSubmit = async (data: ProductFormData) => {
    setIsSubmitting(true);
    let finalImage = editingProduct?.image;

    try {
      if (data.image && data.image.length > 0) {
        const file = data.image[0];
        finalImage = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (error) => reject(error);
        });
      } else if (!editingProduct) {
        // Generate image only for new products without an uploaded image
        toast({ title: "Generando imagen con IA...", description: "Esto puede tardar unos segundos." });
        const result = await generateProductImage({ productName: data.name });
        finalImage = result.imageUrl;
      }

      const dataAiHint = data.name.split(' ').slice(0, 2).join(' ').toLowerCase();
      const { image, ...productData } = data;
      const dataToSave = { ...productData, image: finalImage, dataAiHint };

      if (editingProduct) {
        await updateDoc(doc(db, "products", editingProduct.id), dataToSave);
        toast({ title: "Producto Actualizado", description: `El producto ${data.name} fue actualizado.` });
      } else {
        await addDoc(collection(db, "products"), dataToSave);
        toast({ title: "Producto Creado", description: `El producto ${data.name} fue agregado.` });
      }
      setIsProductDialogOpen(false);
      setEditingProduct(null);
    } catch (error) {
      console.error("Product submission error:", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el producto." });
    } finally {
      setIsSubmitting(false);
    }
  };


  const onComboSubmit = async (data: ComboFormData) => {
    let finalImage = editingCombo?.image || `https://placehold.co/400x300.png`;
    if (data.image && data.image.length > 0) {
        const file = data.image[0];
        try {
            finalImage = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader(); reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = (error) => reject(error);
            });
        } catch (error) { toast({ variant: "destructive", title: "Error", description: "No se pudo cargar la imagen." }); return; }
    }
    const dataAiHint = data.name.split(' ').slice(0, 2).join(' ').toLowerCase();

    const { image, ...comboData } = data;
    const dataToSave = { ...comboData, image: finalImage, dataAiHint };

    try {
        if (editingCombo) {
            await updateDoc(doc(db, "combos", editingCombo.id), dataToSave);
            toast({ title: "Combo Actualizado", description: `El combo ${data.name} ha sido actualizado.` });
        } else {
            await addDoc(collection(db, "combos"), { ...dataToSave, active: true });
            toast({ title: "Combo Creado", description: `El combo ${data.name} ha sido creado.` });
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el combo." });
    }
    setIsComboDialogOpen(false); setEditingCombo(null);
  };
  
  const onPromotionSubmit = async (data: PromotionFormData) => {
    const dataToSave = {
        ...data,
        payQuantity: data.type === 'buy_x_get_y' ? data.payQuantity : undefined,
        discountPercentage: data.type === 'percentage_on_second' ? data.discountPercentage : undefined
    };

    try {
        if (editingPromotion) {
            await updateDoc(doc(db, "promotions", editingPromotion.id), dataToSave);
            toast({ title: "Promoción Actualizada" });
        } else {
            await addDoc(collection(db, "promotions"), { ...dataToSave, active: true });
            toast({ title: "Promoción Creada" });
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo guardar la promoción." });
    }
    setIsPromotionDialogOpen(false); setEditingPromotion(null);
  }

  const calculateComboStock = useCallback((combo: Combo) => {
    if (!combo.products || combo.products.length === 0) return 0;
    const stockLevels = combo.products.map(comboProduct => {
        const product = products.find(p => p.id === comboProduct.productId);
        if (!product || product.stock < comboProduct.quantity) return 0;
        return Math.floor(product.stock / comboProduct.quantity);
    });
    return Math.min(...stockLevels);
  }, [products]);

  const handleToggleStatus = async (collectionName: string, id: string, active: boolean) => {
    try {
        const itemDoc = doc(db, collectionName, id);
        await updateDoc(itemDoc, { active });
        toast({ title: "Estado Actualizado" });
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el estado." });
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) =>
      product.name.toLowerCase().includes(filters.name.toLowerCase()) ||
      product.code.toLowerCase().includes(filters.name.toLowerCase())
    );
  }, [products, filters]);

  if (loading) {
    return <div className="flex justify-center items-center h-full"><Package className="h-10 w-10 animate-pulse"/></div>;
  }

  return (
    <>
      <Tabs defaultValue="products">
        <TabsList className="mb-4 grid w-full grid-cols-3">
          <TabsTrigger value="products">Productos</TabsTrigger>
          <TabsTrigger value="combos">Combos</TabsTrigger>
          <TabsTrigger value="promotions">Promociones</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Gestión de Productos de Venta</CardTitle>
                <CardDescription>Productos finales listos para la venta. Su stock se actualiza al 'fraccionar' desde el módulo de Stock o por ajuste manual.</CardDescription>
              </div>
              <Button onClick={() => handleOpenProductDialog(null)}>
                <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Producto
              </Button>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <Input placeholder="Filtrar por nombre o código..." value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Imagen</TableHead><TableHead>Nombre</TableHead><TableHead>Código</TableHead><TableHead>Tipo</TableHead><TableHead className="text-center">Stock</TableHead><TableHead className="text-right">Precio</TableHead><TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell><div className="relative h-12 w-12 rounded-md overflow-hidden bg-muted"><Image src={product.image} alt={product.name} layout="fill" objectFit="cover" data-ai-hint={product.dataAiHint || 'product'} /></div></TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.code}</TableCell>
                      <TableCell><Badge variant={product.type === 'Propio' ? 'default' : 'secondary'}>{product.type}</Badge></TableCell>
                      <TableCell className="text-center"><Badge variant={product.stock > 0 ? 'outline' : 'destructive'}>{product.stock}</Badge></TableCell>
                      <TableCell className="text-right">${product.price.toFixed(2)}</TableCell>
                      <TableCell className="text-center space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenProductDialog(product)}><Pencil className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>¿Estás seguro?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer. Esto eliminará permanentemente el producto.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteProduct(product.id)}>Eliminar</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="combos">
            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div><CardTitle>Gestión de Combos</CardTitle><CardDescription>Crea paquetes de productos para ofrecer a tus clientes.</CardDescription></div>
                    <Button onClick={() => handleOpenComboDialog(null)}><PlusCircle className="mr-2 h-4 w-4" /> Nuevo Combo</Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-[80px]">Imagen</TableHead><TableHead>Nombre</TableHead><TableHead className="text-right">Precio</TableHead><TableHead className="text-center">Stock Disponible</TableHead><TableHead className="text-center">Estado</TableHead><TableHead className="text-center">Acciones</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {combos.map(combo => (
                                <TableRow key={combo.id}>
                                    <TableCell><div className="relative h-12 w-12 rounded-md overflow-hidden bg-muted"><Image src={combo.image} alt={combo.name} layout="fill" objectFit="cover" data-ai-hint={combo.dataAiHint || 'products package'} /></div></TableCell>
                                    <TableCell className="font-medium">{combo.name}</TableCell>
                                    <TableCell className="text-right">${combo.price.toFixed(2)}</TableCell>
                                    <TableCell className="text-center"><Badge variant={calculateComboStock(combo) > 0 ? 'outline' : 'destructive'}>{calculateComboStock(combo)}</Badge></TableCell>
                                    <TableCell className="text-center"><Switch checked={combo.active} onCheckedChange={(checked) => handleToggleStatus("combos", combo.id, checked)} aria-label="Activar combo" /></TableCell>
                                    <TableCell className="text-center space-x-1">
                                        <Button variant="ghost" size="icon" onClick={() => handleOpenComboDialog(combo)}><Pencil className="h-4 w-4" /></Button>
                                         <AlertDialog>
                                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader><AlertDialogTitle>¿Eliminar combo?</AlertDialogTitle><AlertDialogDescription>Esta acción eliminará el combo "{combo.name}".</AlertDialogDescription></AlertDialogHeader>
                                            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteFromCollection("combos", combo.id, combo.name)}>Eliminar</AlertDialogAction></AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {combos.length === 0 && <p className="text-center text-muted-foreground mt-8">No hay combos creados. ¡Crea el primero!</p>}
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="promotions">
             <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div><CardTitle>Gestión de Promociones</CardTitle><CardDescription>Crea ofertas especiales para tus productos.</CardDescription></div>
                    <Button onClick={() => handleOpenPromotionDialog(null)}><PlusCircle className="mr-2 h-4 w-4" /> Nueva Promoción</Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Producto</TableHead><TableHead>Tipo</TableHead><TableHead className="text-center">Estado</TableHead><TableHead className="text-center">Acciones</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {promotions.map(promo => {
                                const product = products.find(p => p.id === promo.productId);
                                let typeDesc = "";
                                if (promo.type === 'buy_x_get_y') typeDesc = `Lleva ${promo.buyQuantity}, Paga ${promo.payQuantity}`;
                                if (promo.type === 'percentage_on_second') typeDesc = `${promo.discountPercentage}% off en 2da unidad`;
                                return (
                                <TableRow key={promo.id}>
                                    <TableCell className="font-medium">{promo.name}</TableCell>
                                    <TableCell>{product?.name || "Producto no encontrado"}</TableCell>
                                    <TableCell><Badge variant="outline">{typeDesc}</Badge></TableCell>
                                    <TableCell className="text-center"><Switch checked={promo.active} onCheckedChange={(checked) => handleToggleStatus("promotions", promo.id, checked)} aria-label="Activar promoción" /></TableCell>
                                    <TableCell className="text-center space-x-1">
                                        <Button variant="ghost" size="icon" onClick={() => handleOpenPromotionDialog(promo)}><Pencil className="h-4 w-4" /></Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader><AlertDialogTitle>¿Eliminar promoción?</AlertDialogTitle><AlertDialogDescription>Esta acción eliminará la promoción "{promo.name}".</AlertDialogDescription></AlertDialogHeader>
                                            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteFromCollection("promotions", promo.id, promo.name)}>Eliminar</AlertDialogAction></AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            )})}
                        </TableBody>
                    </Table>
                    {promotions.length === 0 && <p className="text-center text-muted-foreground mt-8">No hay promociones creadas. ¡Crea la primera!</p>}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog para Nuevo/Editar Producto */}
      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editingProduct ? "Editar" : "Nuevo"} Producto</DialogTitle><DialogDescription>Complete los datos para {editingProduct ? "actualizar el" : "crear un nuevo"} producto.</DialogDescription></DialogHeader>
          <Form {...productForm}>
            <form onSubmit={productForm.handleSubmit(onProductSubmit)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto px-1">
              <FormField control={productForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nombre del Producto</FormLabel><FormControl><Input placeholder="Ej: Limpiador Multiuso" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <div className="grid grid-cols-2 gap-4">
                  <FormField control={productForm.control} name="code" render={({ field }) => (<FormItem><FormLabel>Código</FormLabel><FormControl><Input placeholder="Ej: LML-1L" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={productForm.control} name="price" render={({ field }) => (<FormItem><FormLabel>Precio</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>
               <div className="grid grid-cols-2 gap-4">
                  <FormField control={productForm.control} name="stock" render={({ field }) => (<FormItem><FormLabel>Stock</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={productForm.control} name="unit" render={({ field }) => (<FormItem><FormLabel>Unidad</FormLabel><FormControl><Input placeholder="Ej: Unidad, Litro, Kg" {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={productForm.control} name="type" render={({ field }) => (<FormItem><FormLabel>Tipo</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un tipo" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Propio">Propio</SelectItem><SelectItem value="Tercero">Tercero</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={productForm.control} name="brand" render={({ field }) => (<FormItem><FormLabel>Marca</FormLabel><FormControl><Input placeholder="Ej: Quimexar" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
              </div>
               <FormField control={productForm.control} name="image" render={({ field: { onChange, ...fieldProps } }) => (<FormItem><FormLabel>Imagen del Producto</FormLabel><FormControl><Input type="file" accept="image/png, image/jpeg, image/webp" onChange={(event) => { onChange(event.target.files && event.target.files);}} {...fieldProps} /></FormControl><FormDescription>{editingProduct ? "Deje en blanco para conservar la imagen actual." : "Deje en blanco para que la IA genere una imagen."}</FormDescription><FormMessage /></FormItem>)} />
              <DialogFooter className="pt-4">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Guardando...' : (editingProduct ? "Guardar Cambios" : "Crear Producto")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Dialog para Nuevo/Editar Combo */}
      <Dialog open={isComboDialogOpen} onOpenChange={setIsComboDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
            <DialogHeader><DialogTitle>{editingCombo ? "Editar" : "Nuevo"} Combo</DialogTitle><DialogDescription>Crea un paquete con varios productos.</DialogDescription></DialogHeader>
            <Form {...comboForm}>
                <form onSubmit={comboForm.handleSubmit(onComboSubmit)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto px-1">
                    <FormField control={comboForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nombre del Combo</FormLabel><FormControl><Input placeholder="Ej: Kit Limpieza Inicial" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={comboForm.control} name="description" render={({ field }) => (<FormItem><FormLabel>Descripción</FormLabel><FormControl><Textarea placeholder="Una breve descripción del combo." {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={comboForm.control} name="price" render={({ field }) => (<FormItem><FormLabel>Precio del Combo</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={comboForm.control} name="image" render={({ field: { value, onChange, ...fieldProps }}) => (<FormItem><FormLabel>Imagen del Combo</FormLabel><FormControl><Input type="file" accept="image/png, image/jpeg, image/webp" onChange={(event) => {onChange(event.target.files && event.target.files)}} {...fieldProps}/></FormControl><FormMessage /></FormItem>)} />
                    </div>

                    <div>
                        <Label>Productos del Combo</Label>
                        <div className="space-y-2 pt-2">
                        {fields.map((field, index) => (
                            <div key={field.id} className="flex items-center gap-2">
                                <FormField control={comboForm.control} name={`products.${index}.productId`} render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar producto..."/></SelectTrigger></FormControl>
                                            <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <FormMessage/>
                                    </FormItem>
                                )}/>
                                <FormField control={comboForm.control} name={`products.${index}.quantity`} render={({ field }) => (
                                    <FormItem><FormControl><Input type="number" placeholder="Cant." className="w-20" {...field} /></FormControl><FormMessage/></FormItem>
                                )}/>
                                <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}><X className="h-4 w-4"/></Button>
                            </div>
                        ))}
                        </div>
                        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => append({ productId: "", quantity: 1 })}>
                           <Package className="mr-2 h-4 w-4"/> Agregar Producto
                        </Button>
                        <FormMessage>{comboForm.formState.errors.products?.message}</FormMessage>
                    </div>

                    <DialogFooter className="pt-4">
                        <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                        <Button type="submit">{editingCombo ? "Guardar Cambios" : "Crear Combo"}</Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
      </Dialog>
      
      {/* Dialog para Nuevo/Editar Promoción */}
      <Dialog open={isPromotionDialogOpen} onOpenChange={setIsPromotionDialogOpen}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>{editingPromotion ? "Editar" : "Nueva"} Promoción</DialogTitle><DialogDescription>Crea una oferta especial para un producto.</DialogDescription></DialogHeader>
            <Form {...promotionForm}>
                <form onSubmit={promotionForm.handleSubmit(onPromotionSubmit)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto px-1">
                    <FormField control={promotionForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nombre</FormLabel><FormControl><Input placeholder="Ej: 2x1 en Lavandina" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={promotionForm.control} name="description" render={({ field }) => (<FormItem><FormLabel>Descripción</FormLabel><FormControl><Input placeholder="Ej: Llevando 2 unidades, paga solo 1." {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={promotionForm.control} name="productId" render={({ field }) => (<FormItem><FormLabel>Producto</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccionar producto..." /></SelectTrigger></FormControl><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    
                    <FormField control={promotionForm.control} name="type" render={({ field }) => (
                        <FormItem><FormLabel>Tipo de Promoción</FormLabel>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-2 gap-4">
                            <FormItem><FormControl><RadioGroupItem value="buy_x_get_y" id="r1" className="peer sr-only" /></FormControl><Label htmlFor="r1" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"><Tag className="mb-3 h-6 w-6" />Lleva X, Paga Y</Label></FormItem>
                            <FormItem><FormControl><RadioGroupItem value="percentage_on_second" id="r2" className="peer sr-only" /></FormControl><Label htmlFor="r2" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"><Percent className="mb-3 h-6 w-6" />% en 2da Unidad</Label></FormItem>
                        </RadioGroup><FormMessage /></FormItem>
                    )} />

                    {promotionType === 'buy_x_get_y' && (
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={promotionForm.control} name="buyQuantity" render={({ field }) => (<FormItem><FormLabel>Cantidad a llevar</FormLabel><FormControl><Input type="number" placeholder="Ej: 2" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={promotionForm.control} name="payQuantity" render={({ field }) => (<FormItem><FormLabel>Cantidad a pagar</FormLabel><FormControl><Input type="number" placeholder="Ej: 1" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                    )}
                    {promotionType === 'percentage_on_second' && (
                        <>
                           <FormField control={promotionForm.control} name="buyQuantity" render={({ field }) => {
                                useEffect(() => {
                                    promotionForm.setValue('buyQuantity', 2);
                                }, [promotionForm]);
                                return (
                                 <FormItem>
                                   <FormLabel>Cantidad a llevar</FormLabel>
                                   <FormControl><Input type="number" {...field} disabled /></FormControl>
                                   <FormDescription>Esta promoción se aplica llevando 2 unidades.</FormDescription>
                                   <FormMessage />
                                 </FormItem>
                                )
                           }}/>
                           <FormField control={promotionForm.control} name="discountPercentage" render={({ field }) => (<FormItem><FormLabel>Porcentaje de Descuento</FormLabel><FormControl><Input type="number" placeholder="Ej: 50" {...field} /></FormControl><FormDescription>Se aplicará sobre la segunda unidad.</FormDescription><FormMessage /></FormItem>)} />
                        </>
                    )}

                    <DialogFooter className="pt-4">
                        <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                        <Button type="submit">{editingPromotion ? "Guardar Cambios" : "Crear Promoción"}</Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
