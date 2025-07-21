
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
  CardFooter
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
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, PackagePlus, Edit, Trash2, Plus, Minus } from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, doc, DocumentData, query } from "firebase/firestore";
import { mapDocTo } from "@/lib/mappers";

// Interfaces
interface GeneralStockItem {
  id: string;
  name: string;
  category: "Insumo" | "Envase" | "Etiqueta";
  quantity: number;
  unit: string;
  supplier?: string;
  entryDate: string;
  notes?: string;
}

interface Product {
  id: string;
  name: string;
  stock: number;
}

const PREDEFINED_CONTAINERS = [
  { name: "Envase 500cc", unit: "Unidades" },
  { name: "Envase 750cc", unit: "Unidades" },
  { name: "Envase 1Lt", unit: "Unidades" },
  { name: "Envase 1.5Lts", unit: "Unidades" },
  { name: "Envase 3Lts", unit: "Unidades" },
  { name: "Envase 5Lts", unit: "Unidades" },
  { name: "Envase 10Lts", unit: "Unidades" },
  { name: "Envase 20Lts", unit: "Unidades" },
  { name: "Envase 50Lts", unit: "Unidades" },
  { name: "Envase 170Lts", unit: "Unidades" },
  { name: "Envase 200Lts", unit: "Unidades" },
  { name: "Bin 1000Lts", unit: "Unidades" },
];

const PREDEFINED_LABELS = [
  { name: "Etiqueta 500cc", unit: "Unidades" },
  { name: "Etiqueta 750cc", unit: "Unidades" },
  { name: "Etiqueta 1Lt", unit: "Unidades" },
  { name: "Etiqueta 1.5Lts", unit: "Unidades" },
  { name: "Etiqueta 3Lts", unit: "Unidades" },
  { name: "Etiqueta 5Lts", unit: "Unidades" },
];


const addStockSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  category: z.enum(["Insumo", "Envase", "Etiqueta"], { required_error: "Debe seleccionar una categoría." }),
  quantity: z.coerce.number().positive("La cantidad debe ser positiva."),
  unit: z.string().min(1, "La unidad es requerida."),
  supplier: z.string().optional(),
  entryDate: z.string().min(1, "La fecha es requerida."),
  notes: z.string().optional(),
});
type AddStockFormData = z.infer<typeof addStockSchema>;

const fractionSchema = z.object({
    amountToFraction: z.coerce.number().positive("La cantidad debe ser positiva."),
    resultingUnits: z.coerce.number().int().positive("El número de unidades debe ser positivo."),
    containerUsage: z.enum(["Tercero", "Propio"], { required_error: "Debe seleccionar el origen del envase." }),
    ownContainerId: z.string().optional(),
    usesLabel: z.boolean().default(false),
}).refine(data => {
    if (data.containerUsage === "Propio" && !data.ownContainerId) {
        return false;
    }
    return true;
}, {
    message: "Debe seleccionar un tipo de envase de su stock.",
    path: ["ownContainerId"],
});
type FractionFormData = z.infer<typeof fractionSchema>;

function QuantityInput({ value, onChange }: { value: number; onChange: (newValue: number) => void; }) {
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

export default function StockPage() {
  const [generalStock, setGeneralStock] = useState<GeneralStockItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [fractioningItem, setFractioningItem] = useState<GeneralStockItem | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [containerQuantities, setContainerQuantities] = useState<Record<string, number>>({});
  const [labelQuantities, setLabelQuantities] = useState<Record<string, number>>({});


  const addForm = useForm<AddStockFormData>({
    resolver: zodResolver(addStockSchema),
    defaultValues: { name: "", category: "Insumo", quantity: 0, unit: "", supplier: "", entryDate: new Date().toISOString().split('T')[0], notes: "" },
  });

  const fractionForm = useForm<FractionFormData>({
    resolver: zodResolver(fractionSchema),
    defaultValues: {
      amountToFraction: 0,
      resultingUnits: 0,
      containerUsage: "Tercero",
      ownContainerId: "",
      usesLabel: false,
    },
  });
  
  const containerUsage = fractionForm.watch("containerUsage");
  const ownContainerId = fractionForm.watch("ownContainerId");
  const amountToFraction = fractionForm.watch("amountToFraction");

  const availableContainers = useMemo(() => {
    return generalStock.filter(item => item.category === "Envase" && item.quantity > 0);
  }, [generalStock]);

  useEffect(() => {
    const q = query(collection(db, "general-stock"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const stockData = snapshot.docs.map(doc => mapDocTo<GeneralStockItem>(doc));
        setGeneralStock(stockData);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching general stock: ", error);
        toast({ variant: "destructive", title: "Error", description: "No se pudo cargar el stock." });
        setLoading(false);
    });

    // We still need products for the fractioning logic, but it should also come from firestore
    const productsQuery = query(collection(db, "products"));
    const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
        const productsData = snapshot.docs.map(doc => mapDocTo<Product>(doc));
        setProducts(productsData);
    });
    
    return () => {
        unsubscribe();
        unsubProducts();
    };
  }, [toast]);

  const handleAddStock = async (data: AddStockFormData) => {
    try {
      await addDoc(collection(db, "general-stock"), data);
      toast({ title: "Item Agregado", description: `Se agregó "${data.name}" al stock general.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el item." });
    }
    setIsAddDialogOpen(false);
    addForm.reset();
  };
  
  const handleFractionSubmit = async (data: FractionFormData) => {
    if (!fractioningItem) return;

    if (data.amountToFraction > fractioningItem.quantity) {
      toast({
        variant: 'destructive',
        title: 'Cantidad Insuficiente',
        description: `No hay suficiente stock de ${fractioningItem.name}.`,
      });
      return;
    }

    try {
      // Handle container and label logic
      if (data.containerUsage === 'Propio') {
        const containerToUse = generalStock.find(item => item.id === data.ownContainerId);
        if (!containerToUse || containerToUse.quantity < data.resultingUnits) {
          toast({ variant: 'destructive', title: 'Envases Insuficientes', description: `No hay suficientes envases de "${containerToUse?.name}".` });
          return;
        }
        // Deduct container stock
        await updateDoc(doc(db, "general-stock", containerToUse.id), { quantity: containerToUse.quantity - data.resultingUnits });

        // Handle label logic ONLY if container is proper
        if (data.usesLabel) {
          const expectedLabelName = containerToUse.name.replace('Envase', 'Etiqueta');
          const labelToUse = generalStock.find(item => item.name === expectedLabelName && item.category === 'Etiqueta');

          if (!labelToUse) {
              toast({ variant: "destructive", title: "Etiqueta no encontrada", description: `No se encontró la etiqueta "${expectedLabelName}" en el stock.` });
              return;
          }

          if (labelToUse.quantity < data.resultingUnits) {
              toast({ variant: "destructive", title: "Etiquetas Insuficientes", description: `No hay suficientes etiquetas de "${labelToUse.name}".` });
              return;
          }

          // Deduct label stock
          await updateDoc(doc(db, "general-stock", labelToUse.id), { quantity: labelToUse.quantity - data.resultingUnits });
        }
      }

      // Update General Stock (raw material)
      await updateDoc(doc(db, "general-stock", fractioningItem.id), { quantity: fractioningItem.quantity - data.amountToFraction });

      toast({
        title: 'Insumo Fraccionado',
        description: `Se descontaron ${data.amountToFraction} ${fractioningItem.unit} de ${fractioningItem.name} y los envases/etiquetas correspondientes.`,
      });

    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el stock.' });
    }
    
    setFractioningItem(null);
    fractionForm.reset();
  };

  const handleContainerQuantityChange = (name: string, quantity: number) => {
    setContainerQuantities(prev => ({ ...prev, [name]: Math.max(0, quantity) }));
  }

  const handleConfirmContainerEntry = async () => {
    const itemsToAdd = PREDEFINED_CONTAINERS
        .filter(c => (containerQuantities[c.name] || 0) > 0)
        .map(c => ({
            name: c.name,
            category: "Envase" as "Envase",
            quantity: containerQuantities[c.name],
            unit: c.unit,
            supplier: "Ingreso Manual",
            entryDate: new Date().toISOString().split('T')[0],
            notes: "",
        }));

    if (itemsToAdd.length === 0) {
        toast({ title: "Nada que agregar", description: "Por favor, especifique una cantidad para al menos un envase." });
        return;
    }
    
    try {
        await Promise.all(itemsToAdd.map(item => addDoc(collection(db, "general-stock"), item)));
        toast({ title: "Envases Agregados", description: "El stock de envases ha sido actualizado." });
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el stock." });
    }
    
    setContainerQuantities({});
  }

  const handleLabelQuantityChange = (name: string, quantity: number) => {
    setLabelQuantities(prev => ({ ...prev, [name]: Math.max(0, quantity) }));
  }

  const handleConfirmLabelEntry = async () => {
    const itemsToAdd = PREDEFINED_LABELS
        .filter(c => (labelQuantities[c.name] || 0) > 0)
        .map(c => ({
            name: c.name,
            category: "Etiqueta" as "Etiqueta",
            quantity: labelQuantities[c.name],
            unit: c.unit,
            supplier: "Ingreso Manual",
            entryDate: new Date().toISOString().split('T')[0],
            notes: "",
        }));

    if (itemsToAdd.length === 0) {
        toast({ title: "Nada que agregar", description: "Por favor, especifique una cantidad para al menos una etiqueta." });
        return;
    }
    
    try {
        await Promise.all(itemsToAdd.map(item => addDoc(collection(db, "general-stock"), item)));
        toast({ title: "Etiquetas Agregadas", description: "El stock de etiquetas ha sido actualizado." });
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el stock." });
    }
    
    setLabelQuantities({});
  }

  return (
    <>
      <Card>
        <CardHeader>
            <CardTitle>Stock</CardTitle>
            <CardDescription>
            Gestiona la materia prima, envases y etiquetas que usas para crear tus productos de venta.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <Tabs defaultValue="insumos">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="insumos">Insumos</TabsTrigger>
                    <TabsTrigger value="envases">Stock de Envases</TabsTrigger>
                    <TabsTrigger value="etiquetas">Stock de Etiquetas</TabsTrigger>
                    <TabsTrigger value="ingresar-envases">Ingresar Envases</TabsTrigger>
                    <TabsTrigger value="ingresar-etiquetas">Ingresar Etiquetas</TabsTrigger>
                </TabsList>
                <TabsContent value="insumos" className="pt-4">
                    <div className="text-right mb-4">
                        <Button onClick={() => setIsAddDialogOpen(true)}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Agregar Insumo
                        </Button>
                    </div>
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Proveedor</TableHead>
                            <TableHead className="text-right">Cantidad Actual</TableHead>
                            <TableHead>Unidad</TableHead>
                            <TableHead>Fecha Ingreso</TableHead>
                            <TableHead className="text-center">Acciones</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {generalStock.filter(i => i.category === 'Insumo').map((item) => (
                            <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>{item.supplier || "-"}</TableCell>
                            <TableCell className="text-right font-mono">{item.quantity.toFixed(2)}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell>{new Date(item.entryDate).toLocaleDateString('es-AR')}</TableCell>
                            <TableCell className="text-center space-x-1">
                                <Button variant="outline" size="sm" onClick={() => { setFractioningItem(item); fractionForm.reset({ amountToFraction: 0, resultingUnits: 0, containerUsage: 'Tercero', ownContainerId: '', usesLabel: false }); }}>
                                <PackagePlus className="mr-2 h-4 w-4" /> Fraccionar
                                </Button>
                                <Button variant="ghost" size="icon" disabled>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                    {generalStock.filter(i => i.category === 'Insumo').length === 0 && (
                        <p className="text-center text-muted-foreground mt-8 py-10">No hay insumos en el stock general.</p>
                    )}
                </TabsContent>
                <TabsContent value="envases">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Proveedor</TableHead>
                            <TableHead className="text-right">Cantidad Actual</TableHead>
                            <TableHead>Unidad</TableHead>
                            <TableHead>Fecha Ingreso</TableHead>
                            <TableHead className="text-center">Acciones</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {generalStock.filter(i => i.category === 'Envase').map((item) => (
                            <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>{item.supplier || "-"}</TableCell>
                            <TableCell className="text-right font-mono">{item.quantity.toFixed(0)}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell>{new Date(item.entryDate).toLocaleDateString('es-AR')}</TableCell>
                            <TableCell className="text-center space-x-1">
                                <Button variant="ghost" size="icon" disabled>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                     {generalStock.filter(i => i.category === 'Envase').length === 0 && (
                        <p className="text-center text-muted-foreground mt-8 py-10">No hay envases en el stock general.</p>
                    )}
                </TabsContent>
                 <TabsContent value="etiquetas">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Proveedor</TableHead>
                            <TableHead className="text-right">Cantidad Actual</TableHead>
                            <TableHead>Unidad</TableHead>
                            <TableHead>Fecha Ingreso</TableHead>
                            <TableHead className="text-center">Acciones</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {generalStock.filter(i => i.category === 'Etiqueta').map((item) => (
                            <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>{item.supplier || "-"}</TableCell>
                            <TableCell className="text-right font-mono">{item.quantity.toFixed(0)}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell>{new Date(item.entryDate).toLocaleDateString('es-AR')}</TableCell>
                            <TableCell className="text-center space-x-1">
                                <Button variant="ghost" size="icon" disabled>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                     {generalStock.filter(i => i.category === 'Etiqueta').length === 0 && (
                        <p className="text-center text-muted-foreground mt-8 py-10">No hay etiquetas en el stock general.</p>
                    )}
                </TabsContent>
                <TabsContent value="ingresar-envases" className="pt-4">
                   <div className="space-y-4 max-w-lg mx-auto">
                        <CardHeader className="p-0 mb-4">
                            <CardTitle>Ingreso Rápido de Envases</CardTitle>
                            <CardDescription>Use los contadores para agregar envases a su stock.</CardDescription>
                        </CardHeader>
                        {PREDEFINED_CONTAINERS.map(container => (
                            <div key={container.name} className="flex items-center justify-between p-3 border rounded-lg">
                                <span className="font-medium">{container.name}</span>
                                <QuantityInput
                                    value={containerQuantities[container.name] || 0}
                                    onChange={(q) => handleContainerQuantityChange(container.name, q)}
                                />
                            </div>
                        ))}
                        <div className="pt-4">
                            <Button className="w-full" onClick={handleConfirmContainerEntry}>Confirmar Ingreso</Button>
                        </div>
                   </div>
                </TabsContent>
                 <TabsContent value="ingresar-etiquetas" className="pt-4">
                   <div className="space-y-4 max-w-lg mx-auto">
                        <CardHeader className="p-0 mb-4">
                            <CardTitle>Ingreso Rápido de Etiquetas</CardTitle>
                            <CardDescription>Use los contadores para agregar etiquetas a su stock.</CardDescription>
                        </CardHeader>
                        {PREDEFINED_LABELS.map(label => (
                            <div key={label.name} className="flex items-center justify-between p-3 border rounded-lg">
                                <span className="font-medium">{label.name}</span>
                                <QuantityInput
                                    value={labelQuantities[label.name] || 0}
                                    onChange={(q) => handleLabelQuantityChange(label.name, q)}
                                />
                            </div>
                        ))}
                        <div className="pt-4">
                            <Button className="w-full" onClick={handleConfirmLabelEntry}>Confirmar Ingreso</Button>
                        </div>
                   </div>
                </TabsContent>
            </Tabs>
        </CardContent>
      </Card>

      {/* Dialog para Agregar Insumo */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar Nuevo Item al Stock</DialogTitle>
            <DialogDescription>
              Complete los datos para registrar un nuevo insumo, envase o etiqueta.
            </DialogDescription>
          </DialogHeader>
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(handleAddStock)} className="space-y-4 py-4">
              <FormField control={addForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Item</FormLabel>
                    <FormControl><Input placeholder="Ej: Jabón Líquido Granel" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
              )}/>
               <FormField
                    control={addForm.control}
                    name="category"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Categoría</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="Insumo">Insumo (Materia Prima)</SelectItem>
                                <SelectItem value="Envase">Envase</SelectItem>
                                <SelectItem value="Etiqueta">Etiqueta</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}/>
              <div className="grid grid-cols-2 gap-4">
                 <FormField control={addForm.control} name="quantity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad</FormLabel>
                    <FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={addForm.control} name="unit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidad</FormLabel>
                    <FormControl><Input placeholder="Ej: Litros, Kg, Unidades" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={addForm.control} name="supplier" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Proveedor</FormLabel>
                        <FormControl><Input placeholder="Ej: Proveedor A" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )}/>
                <FormField control={addForm.control} name="entryDate" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Fecha de Ingreso</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )}/>
              </div>
              <FormField control={addForm.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas Internas</FormLabel>
                    <FormControl><Textarea placeholder="Lote, vencimiento, etc." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
              )}/>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit">Guardar Item</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog para Fraccionar Insumo */}
      {fractioningItem && (
        <Dialog open={!!fractioningItem} onOpenChange={(open) => !open && setFractioningItem(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Fraccionar Insumo: {fractioningItem.name}</DialogTitle>
                    <DialogDescription>
                        Stock actual: <strong>{fractioningItem.quantity.toFixed(2)} {fractioningItem.unit}</strong>.
                        <br />
                        Indique cuánto va a usar y qué producto de venta generará.
                    </DialogDescription>
                </DialogHeader>
                <Form {...fractionForm}>
                    <form onSubmit={fractionForm.handleSubmit(handleFractionSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto px-2">
                        <FormField control={fractionForm.control} name="amountToFraction" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Cantidad a Usar ({fractioningItem.unit})</FormLabel>
                                <FormControl><Input type="number" step="any" placeholder="0.00" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={fractionForm.control} name="resultingUnits" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Unidades Resultantes (para descontar envases)</FormLabel>
                                <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        
                        <FormField
                            control={fractionForm.control}
                            name="containerUsage"
                            render={({ field }) => (
                            <FormItem className="space-y-3 rounded-md border p-4">
                                <FormLabel>Origen del Envase</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                        onValueChange={(value) => {
                                            field.onChange(value);
                                            // Reset dependent fields when changing the radio
                                            fractionForm.setValue('ownContainerId', undefined);
                                            fractionForm.setValue('usesLabel', false);
                                        }}
                                        defaultValue={field.value}
                                        className="flex flex-col space-y-2"
                                    >
                                        <FormItem className="flex items-center space-x-3 space-y-0">
                                            <FormControl><RadioGroupItem value="Tercero" /></FormControl>
                                            <FormLabel className="font-normal">Envase de Tercero / Cliente</FormLabel>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-3 space-y-0">
                                            <FormControl><RadioGroupItem value="Propio" /></FormControl>
                                            <FormLabel className="font-normal">Utilizar Envase Propio (del stock)</FormLabel>
                                        </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />

                        {containerUsage === "Propio" && (
                            <div className="space-y-4 pl-4 border-l-2 ml-1">
                                <FormField
                                    control={fractionForm.control}
                                    name="ownContainerId"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Tipo de Envase Propio</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un envase..." /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {availableContainers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} (Stock: {c.quantity})</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />

                                {ownContainerId && (
                                     <FormField
                                        control={fractionForm.control}
                                        name="usesLabel"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                                <div className="space-y-0.5">
                                                    <FormLabel>¿Utiliza Etiqueta Propia?</FormLabel>
                                                    <FormDescription>
                                                        Se descontará la etiqueta que corresponda.
                                                    </FormDescription>
                                                </div>
                                                <FormControl>
                                                    <Switch
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>
                        )}
                        
                        {amountToFraction > 0 && amountToFraction <= fractioningItem.quantity && (
                            <Card className="bg-muted/50">
                                <CardContent className="p-4 text-sm">
                                    <p>Stock restante de <strong>{fractioningItem.name}</strong> será:</p>
                                    <p className="text-lg font-bold">{(fractioningItem.quantity - amountToFraction).toFixed(2)} {fractioningItem.unit}</p>
                                </CardContent>
                            </Card>
                        )}
                        
                        <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                            <Button type="submit">Confirmar Fraccionamiento</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
      )}
    </>
  );
}
