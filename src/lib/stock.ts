import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";

// Tipo de cada producto
export type SellerItem = {
  id: string;
  name: string;
  stock: number;
  price: number;
};

// Consulta a Firestore y devuelve un array de productos
export async function calculateSellerStock(): Promise<SellerItem[]> {
  const querySnapshot = await getDocs(collection(db, "productos"));
  const items: SellerItem[] = [];

  querySnapshot.forEach((doc) => {
    const data = doc.data();
    items.push({
      id: doc.id,
      name: data.name ?? "Sin nombre",
      stock: data.stock ?? 0,
      price: data.price ?? 0,
    });
  });

  return items;
}
