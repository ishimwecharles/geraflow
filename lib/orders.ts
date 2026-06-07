import {
  collection,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export type OrderStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "served"
  | "cancelled";

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface CreateOrderInput {
  businessId: string;
  customerName: string;
  tableNumber: string;
  items: OrderItem[];
  totalAmount: number;
}

export async function createOrder(input: CreateOrderInput) {
  const docRef = await addDoc(collection(db, "orders"), {
    businessId: input.businessId,
    customerName: input.customerName,
    tableNumber: input.tableNumber,
    items: input.items,
    totalAmount: input.totalAmount,
    status: "pending",
    estimatedMinutes: null,
    createdAt: serverTimestamp(),
    confirmedAt: null,
    readyAt: null,
    servedAt: null,
  });

  return docRef.id;
}

export async function confirmOrder(orderId: string, estimatedMinutes: number) {
  await updateDoc(doc(db, "orders", orderId), {
    status: "preparing",
    estimatedMinutes,
    confirmedAt: serverTimestamp(),
  });
}

export async function markOrderReady(orderId: string) {
  await updateDoc(doc(db, "orders", orderId), {
    status: "ready",
    readyAt: serverTimestamp(),
  });
}

export async function markOrderServed(orderId: string) {
  await updateDoc(doc(db, "orders", orderId), {
    status: "served",
    servedAt: serverTimestamp(),
  });
}

export async function cancelOrder(orderId: string) {
  await updateDoc(doc(db, "orders", orderId), {
    status: "cancelled",
  });
}