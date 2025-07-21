
"use client";

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isPast, isWithinInterval, addDays } from 'date-fns';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, DocumentData } from 'firebase/firestore';
import { mapDocTo } from '@/lib/mappers';

// Interfaces from other modules (simplified for this hook)
interface Product { id: string; name: string; stock: number; }
interface Invoice { id: string; sequentialId: string; type: string; dueDate: string; status: 'Pendiente' | "Pagada" | "Vencida" | "Anulada"; }

// Notification Interface
export interface Notification {
  id: string;
  type: 'low-stock' | 'invoice-due' | 'invoice-overdue';
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  href?: string;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

export const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const LOW_STOCK_THRESHOLD = 10;
const DUE_SOON_DAYS = 3;

export function useProvideNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
      const unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => {
          setProducts(snapshot.docs.map(doc => mapDocTo<Product>(doc)));
      });
      const unsubInvoices = onSnapshot(collection(db, "invoices"), (snapshot) => {
          setInvoices(snapshot.docs.map(doc => mapDocTo<Invoice>(doc)));
      });

      return () => {
          unsubProducts();
          unsubInvoices();
      };
  }, []);

  const saveNotifications = useCallback((updatedNotifications: Notification[]) => {
    setNotifications(updatedNotifications);
    try {
      // Keep only non-read notifications in localStorage to avoid clutter
      const unread = updatedNotifications.filter(n => !n.read);
      localStorage.setItem('app-notifications', JSON.stringify(unread));
    } catch (e) {
      console.error("Failed to save notifications", e);
    }
  }, []);

  const generateNotifications = useCallback(() => {
    let currentNotifications: Notification[] = [];
     try {
      const stored = localStorage.getItem('app-notifications');
      currentNotifications = stored ? JSON.parse(stored) : [];
    } catch (e) {
      currentNotifications = [];
    }
    
    let newNotifications: Notification[] = [];
    const existingNotificationIds = new Set(currentNotifications.map(n => n.id));

    // 1. Low Stock Notifications
    products.forEach(product => {
      const notificationId = `low-stock-${product.id}`;
      if (product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD && !existingNotificationIds.has(notificationId)) {
        newNotifications.push({
          id: notificationId,
          type: 'low-stock',
          title: 'Bajo Stock',
          description: `El producto "${product.name}" tiene solo ${product.stock} unidades.`,
          timestamp: new Date().toISOString(),
          read: false,
          href: '/productos'
        });
      }
    });

    // 2. Invoice Notifications
    const today = new Date();
    invoices.forEach(invoice => {
        if (invoice.status === 'Pendiente') {
            const dueDate = new Date(invoice.dueDate);
            const notificationIdOverdue = `invoice-overdue-${invoice.id}`;
            const notificationIdDueSoon = `invoice-due-${invoice.id}`;

            if (isPast(dueDate) && !existingNotificationIds.has(notificationIdOverdue)) {
                newNotifications.push({
                    id: notificationIdOverdue,
                    type: 'invoice-overdue',
                    title: 'Factura Vencida',
                    description: `La factura ${invoice.type}-${invoice.sequentialId} ha vencido.`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    href: '/facturacion'
                });
            } else if (!isPast(dueDate) && isWithinInterval(dueDate, { start: today, end: addDays(today, DUE_SOON_DAYS) }) && !existingNotificationIds.has(notificationIdDueSoon)) {
                 newNotifications.push({
                    id: notificationIdDueSoon,
                    type: 'invoice-due',
                    title: 'Factura por Vencer',
                    description: `La factura ${invoice.type}-${invoice.sequentialId} vence pronto.`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    href: '/facturacion'
                });
            }
        }
    });

    if (newNotifications.length > 0) {
      const updated = [...newNotifications, ...currentNotifications].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      saveNotifications(updated);
    } else {
      setNotifications(currentNotifications);
    }
  }, [saveNotifications, products, invoices]);

  useEffect(() => {
    // Generate immediately on first load after data is available
    if (products.length > 0 || invoices.length > 0) {
        generateNotifications();
    }
    // Then set interval for periodic checks
    const interval = setInterval(() => {
        if (products.length > 0 || invoices.length > 0) {
            generateNotifications();
        }
    }, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, [generateNotifications, products, invoices]);


  const markAsRead = (id: string) => {
    const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n);
    saveNotifications(updated);
  };

  const markAllAsRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    saveNotifications(updated);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, unreadCount, markAsRead, markAllAsRead };
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
