

"use client";

import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Building, MapPin, PlusCircle, Pencil, Trash2, User, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, setDoc, onSnapshot, addDoc, updateDoc, deleteDoc, DocumentData, query, where, getDocs } from "firebase/firestore";
import { mapDocTo } from "@/lib/mappers";

// Schemas
const businessInfoSchema = z.object({
  name: z.string().min(2, "El nombre del negocio es requerido."),
  cuit: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
});

const zoneSchema = z.object({
    name: z.string().min(2, "El nombre de la zona es requerido."),
    deliveryCost: z.coerce.number().min(0, "El costo no puede ser negativo.").optional().default(0),
});

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const userSchema = z.object({
    username: z.string().min(3, "El nombre de usuario es requerido."),
    email: z.string().email("Email inválido."),
    avatar: z.any()
      .optional()
      .refine((files) => !files || files.length === 0 || files?.[0]?.size <= MAX_FILE_SIZE, `El tamaño máximo de la imagen es 2MB.`)
      .refine(
        (files) => !files || files.length === 0 || ACCEPTED_IMAGE_TYPES.includes(files?.[0]?.type),
        "Solo se permiten formatos .jpeg, .jpg, .png y .webp."
      ),
});

type BusinessInfoFormData = z.infer<typeof businessInfoSchema>;
type ZoneFormData = z.infer<typeof zoneSchema>;
type UserFormData = z.infer<typeof userSchema>;

// Interfaces
interface Zone {
    id: string;
    name: string;
    deliveryCost: number;
}
interface AppUser {
    id: string;
    username: string;
    email: string;
    avatar?: string;
}


export default function ConfiguracionPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [isZoneDialogOpen, setIsZoneDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const { toast } = useToast();

  const businessForm = useForm<BusinessInfoFormData>({
    resolver: zodResolver(businessInfoSchema),
  });

  const zoneForm = useForm<ZoneFormData>({
    resolver: zodResolver(zoneSchema),
  });
  
  const userForm = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
  });

  useEffect(() => {
    const fetchBusinessInfo = async () => {
        const docRef = doc(db, "settings", "business-info");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            businessForm.reset(docSnap.data());
        }
    };

    const unsubZones = onSnapshot(query(collection(db, "delivery-zones")), (snapshot) => {
        setZones(snapshot.docs.map(doc => mapDocTo<Zone>(doc)));
    });

    const unsubUsers = onSnapshot(query(collection(db, "users")), (snapshot) => {
        setUsers(snapshot.docs.map(doc => mapDocTo<AppUser>(doc)));
    });

    Promise.all([fetchBusinessInfo()]).finally(() => setLoading(false));

    return () => {
        unsubZones();
        unsubUsers();
    }
  }, [businessForm]);

  const handleBusinessInfoSubmit = async (data: BusinessInfoFormData) => {
    try {
      const docRef = doc(db, "settings", "business-info");
      await setDoc(docRef, data, { merge: true });
      toast({
        title: "Datos Guardados",
        description: "La información del negocio ha sido actualizada.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar la información del negocio.",
      });
    }
  };

  const handleOpenZoneDialog = (zone: Zone | null) => {
    setEditingZone(zone);
    zoneForm.reset(zone || { name: "", deliveryCost: 0 });
    setIsZoneDialogOpen(true);
  };
  
  const handleZoneSubmit = async (data: ZoneFormData) => {
    try {
        if (editingZone) {
            await updateDoc(doc(db, "delivery-zones", editingZone.id), data);
            toast({ title: "Zona Actualizada" });
        } else {
            await addDoc(collection(db, "delivery-zones"), data);
            toast({ title: "Zona Creada" });
        }
    } catch(e) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo guardar la zona." });
    }
    setIsZoneDialogOpen(false);
  };

  const handleDeleteZone = async (zoneId: string) => {
    try {
        await deleteDoc(doc(db, "delivery-zones", zoneId));
        toast({ title: "Zona Eliminada" });
    } catch(e) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar la zona." });
    }
  };
  
  const handleOpenUserDialog = (user: AppUser | null) => {
    setEditingUser(user);
    if(user) {
      userForm.reset({
          username: user.username,
          email: user.email,
          avatar: undefined,
      });
    } else {
      // Logic for adding new user is removed as it's handled by Google Sign-In
      toast({ title: "Información", description: "Los nuevos usuarios se agregan automáticamente al iniciar sesión con Google por primera vez."})
    }
    setIsUserDialogOpen(!!user);
  };

  const handleUserSubmit = async (data: UserFormData) => {
    if (!editingUser) return;
    
    let finalAvatar = editingUser.avatar;

    if (data.avatar && data.avatar.length > 0) {
        const file = data.avatar[0];
        try {
            finalAvatar = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = (error) => reject(error);
            });
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo cargar la imagen." });
            return;
        }
    }

    try {
        // Editing an existing user
        const userDataToUpdate: {username: string; avatar?: string;} = {
            username: data.username,
            avatar: finalAvatar || "",
        };
        
        await updateDoc(doc(db, "users", editingUser.id), userDataToUpdate);
        
        toast({ title: "Usuario Actualizado" });

         // Update current user in local storage if they are the one being edited
        const currentUserData = localStorage.getItem('current-user');
        if (currentUserData) {
            const currentUser = JSON.parse(currentUserData);
            if(currentUser.id === editingUser.id) {
                const userDoc = await getDoc(doc(db, "users", editingUser.id));
                if (userDoc.exists()) {
                    const { password, ...userToStore } = userDoc.data();
                    localStorage.setItem('current-user', JSON.stringify({id: userDoc.id, ...userToStore }));
                    window.location.reload();
                }
            }
        }
    } catch (e: any) {
        let description = "No se pudo guardar el usuario.";
        toast({ variant: "destructive", title: "Error", description });
        return;
    }
    
    setIsUserDialogOpen(false);
  };

  const handleDeleteUser = async (userId: string) => {
    try {
        await deleteDoc(doc(db, "users", userId));
        toast({ title: "Usuario Eliminado" });
    } catch (e) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el usuario." });
    }
  };


  return (
    <div className="space-y-6">
       <Card>
            <CardHeader>
                <CardTitle>Configuración General</CardTitle>
                <CardDescription>
                Administra los datos de tu negocio, zonas de entrega y otros parámetros del sistema.
                </CardDescription>
            </CardHeader>
        </Card>
      <Tabs defaultValue="business">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="business"><Building className="mr-2 h-4 w-4"/>Datos del Negocio</TabsTrigger>
          <TabsTrigger value="zones"><MapPin className="mr-2 h-4 w-4"/>Zonas de Entrega</TabsTrigger>
          <TabsTrigger value="users"><User className="mr-2 h-4 w-4"/>Usuarios y Permisos</TabsTrigger>
        </TabsList>
        
        <TabsContent value="business">
          <Card>
            <CardHeader>
              <CardTitle>Información del Negocio</CardTitle>
              <CardDescription>
                Estos datos pueden ser utilizados en facturas y otros documentos.
              </CardDescription>
            </CardHeader>
            <Form {...businessForm}>
              <form onSubmit={businessForm.handleSubmit(handleBusinessInfoSubmit)}>
                <CardContent className="space-y-4">
                  <FormField
                    control={businessForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre o Razón Social</FormLabel>
                        <FormControl><Input placeholder="Quimexar S.R.L." {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={businessForm.control}
                        name="cuit"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>CUIT / CUIL</FormLabel>
                            <FormControl><Input placeholder="30-12345678-9" {...field} value={field.value || ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={businessForm.control}
                        name="phone"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Teléfono</FormLabel>
                            <FormControl><Input placeholder="11-2233-4455" {...field} value={field.value || ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                  </div>
                  <FormField
                    control={businessForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dirección Fiscal</FormLabel>
                        <FormControl><Input placeholder="Av. Siempre Viva 742, Springfield" {...field} value={field.value || ''} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={businessForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email de Contacto</FormLabel>
                        <FormControl><Input type="email" placeholder="contacto@empresa.com" {...field} value={field.value || ''} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
                <CardFooter>
                  <Button type="submit">Guardar Cambios</Button>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </TabsContent>

        <TabsContent value="zones">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
                <div>
                    <CardTitle>Zonas de Entrega</CardTitle>
                    <CardDescription>
                        Define las zonas a las que realizas entregas y sus costos asociados.
                    </CardDescription>
                </div>
                <Button onClick={() => handleOpenZoneDialog(null)}>
                    <PlusCircle className="mr-2 h-4 w-4"/> Nueva Zona
                </Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre de la Zona</TableHead>
                            <TableHead className="text-right">Costo de Envío</TableHead>
                            <TableHead className="text-center">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {zones.length > 0 ? zones.map(zone => (
                            <TableRow key={zone.id}>
                                <TableCell className="font-medium">{zone.name}</TableCell>
                                <TableCell className="text-right font-mono">${zone.deliveryCost.toFixed(2)}</TableCell>
                                <TableCell className="text-center space-x-1">
                                    <Button variant="ghost" size="icon" onClick={() => handleOpenZoneDialog(zone)}>
                                        <Pencil className="h-4 w-4"/>
                                    </Button>
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteZone(zone.id)}>
                                        <Trash2 className="h-4 w-4"/>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24">No hay zonas definidas.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
                <div>
                    <CardTitle>Gestión de Usuarios</CardTitle>
                    <CardDescription>
                        Administra los perfiles de los usuarios que han iniciado sesión.
                    </CardDescription>
                </div>
                <Button onClick={() => handleOpenUserDialog(null)}>
                    <PlusCircle className="mr-2 h-4 w-4"/> Nuevo Usuario
                </Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Usuario</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead className="text-center">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.length > 0 ? users.map(user => (
                            <TableRow key={user.id}>
                                <TableCell className="font-medium flex items-center gap-3">
                                    <Avatar>
                                        <AvatarImage src={user.avatar} />
                                        <AvatarFallback>{user.username.charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    {user.username}
                                </TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell className="text-center space-x-1">
                                    <Button variant="ghost" size="icon" onClick={() => handleOpenUserDialog(user)}>
                                        <Pencil className="h-4 w-4"/>
                                    </Button>
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteUser(user.id)}>
                                        <Trash2 className="h-4 w-4"/>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24">No hay usuarios definidos.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Dialog for Zone */}
      <Dialog open={isZoneDialogOpen} onOpenChange={setIsZoneDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{editingZone ? 'Editar' : 'Nueva'} Zona de Entrega</DialogTitle>
            </DialogHeader>
            <Form {...zoneForm}>
                <form onSubmit={zoneForm.handleSubmit(handleZoneSubmit)} className="space-y-4 py-4">
                    <FormField control={zoneForm.control} name="name" render={({field}) => (
                        <FormItem>
                            <FormLabel>Nombre</FormLabel>
                            <FormControl><Input placeholder="Ej: Palermo" {...field}/></FormControl>
                            <FormMessage/>
                        </FormItem>
                    )}/>
                    <FormField control={zoneForm.control} name="deliveryCost" render={({field}) => (
                        <FormItem>
                            <FormLabel>Costo de Envío</FormLabel>
                            <FormControl><Input type="number" placeholder="0.00" {...field}/></FormControl>
                            <FormMessage/>
                        </FormItem>
                    )}/>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                        <Button type="submit">{editingZone ? 'Guardar Cambios' : 'Crear Zona'}</Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog for User */}
      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{editingUser ? 'Editar' : 'Nuevo'} Usuario</DialogTitle>
            </DialogHeader>
            <Form {...userForm}>
                <form onSubmit={userForm.handleSubmit(handleUserSubmit)} className="space-y-4 py-4 max-h-[75vh] overflow-y-auto px-2">
                    {editingUser?.avatar && (
                        <div className="flex items-center justify-center gap-4 p-2 rounded-md bg-muted">
                            <Avatar className="h-16 w-16">
                            <AvatarImage src={editingUser.avatar} alt={editingUser.username} />
                            <AvatarFallback>{editingUser.username.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-muted-foreground">Foto de perfil actual.<br/>Suba una nueva para reemplazarla.</span>
                        </div>
                    )}
                    <FormField control={userForm.control} name="username" render={({field}) => (
                        <FormItem>
                            <FormLabel>Nombre de Usuario</FormLabel>
                            <FormControl><Input placeholder="ej: jorge.perez" {...field}/></FormControl>
                            <FormMessage/>
                        </FormItem>
                    )}/>
                    <FormField control={userForm.control} name="email" render={({field}) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl><Input type="email" placeholder="usuario@dominio.com" {...field} readOnly /></FormControl>
                            <FormMessage/>
                        </FormItem>
                    )}/>
                    <FormField control={userForm.control} name="avatar" render={({ field: { value, onChange, ...fieldProps } }) => (
                        <FormItem>
                            <FormLabel>Foto de Perfil</FormLabel>
                            <FormControl>
                                <Input
                                type="file"
                                accept="image/png, image/jpeg, image/webp"
                                onChange={(event) => { onChange(event.target.files && event.target.files); }}
                                {...fieldProps}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}/>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                        <Button type="submit">{editingUser ? 'Guardar Cambios' : 'Crear Usuario'}</Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
