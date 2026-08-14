/**
 * Store Admin Dashboard Component
 * Panel de administración exclusivo para el dueño del comercio (Multi-Tenant aislado).
 */

import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Package,
  TrendingUp,
  CreditCard,
  Settings,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Shield,
  Layers,
  Search,
  Check,
  X,
  Building2,
  DollarSign,
  Truck,
  Eye,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { Store, Order, Product, Category, OrderStatus, Subscription } from '../types/index.ts';
import { formatCurrency, formatDate } from '../utils/format.ts';
import { api } from '../services/api.ts';

interface StoreAdminDashboardProps {
  store: Store;
  onStoreUpdated: () => void;
  onOpenStorePublic: () => void;
}

export function StoreAdminDashboard({ store, onStoreUpdated, onOpenStorePublic }: StoreAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products' | 'categories' | 'mercadopago' | 'settings' | 'subscription'>('overview');

  // Estados de datos
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [mpStatus, setMpStatus] = useState<{ connected: boolean; mpUserId: string | null; active: boolean; isOAuthConfigured: boolean } | null>(null);
  const [stats, setStats] = useState<{
    totalOrders: number;
    totalSales: number;
    pendingOrders: number;
    confirmedOrders: number;
    totalProducts: number;
    lowStockProducts: number;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Estados de modales
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newCatName, setNewCatName] = useState('');

  // Formulario Producto
  const [pName, setPName] = useState('');
  const [pDescription, setPDescription] = useState('');
  const [pPrice, setPPrice] = useState<number>(0);
  const [pComparePrice, setPComparePrice] = useState<number | undefined>(undefined);
  const [pStock, setPStock] = useState<number>(10);
  const [pMinStock, setPMinStock] = useState<number>(2);
  const [pCategoryId, setPCategoryId] = useState<string>('');
  const [pSku, setPSku] = useState<string>('');
  const [pImage, setPImage] = useState<string>('');
  const [pFeatured, setPFeatured] = useState<boolean>(false);

  // Formulario Configuración Tienda
  const [stName, setStName] = useState(store.name);
  const [stDescription, setStDescription] = useState(store.description || '');
  const [stPhone, setStPhone] = useState(store.phone || '');
  const [stEmail, setStEmail] = useState(store.email || '');
  const [stAddress, setStAddress] = useState(store.address || '');
  const [stColor, setStColor] = useState(store.primaryColor || '#2563eb');
  const [stShippingCost, setStShippingCost] = useState<number>(store.settings?.shippingCost || 0);
  const [stFreeShippingMin, setStFreeShippingMin] = useState<number>(store.settings?.freeShippingMinAmount || 0);
  const [stBankName, setStBankName] = useState(store.settings?.bankDetails?.bankName || '');
  const [stCbu, setStCbu] = useState(store.settings?.bankDetails?.cbuCvu || '');
  const [stAlias, setStAlias] = useState(store.settings?.bankDetails?.alias || '');

  // Estado del simulador de Webhook MP
  const [simulatedOrderId, setSimulatedOrderId] = useState<string>('');
  const [simulatedStatus, setSimulatedStatus] = useState<string>('APPROVED');
  const [isSimulating, setIsSimulating] = useState(false);

  // Cargar datos del comercio
  const loadData = async () => {
    try {
      setIsLoading(true);
      const [ordersData, productsData, catsData, mpData, subData, statsData] = await Promise.all([
        api.getStoreOrders(store.id),
        api.getProductsByStore(store.id),
        api.getCategoriesByStore(store.id),
        api.getMercadoPagoStatus(store.id),
        api.getStoreSubscription(store.id),
        api.getStoreStats(store.id),
      ]);

      setOrders(ordersData);
      setProducts(productsData);
      setCategories(catsData);
      setMpStatus(mpData);
      setSubscription(subData);
      setStats(statsData);

      if (ordersData.length > 0 && !simulatedOrderId) {
        setSimulatedOrderId(ordersData[0].id);
      }
    } catch (err: unknown) {
      console.error('Error cargando datos del comercio:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [store.id]);

  const notify = (msg: string, isErr = false) => {
    if (isErr) {
      setActionError(msg);
      setActionSuccess(null);
    } else {
      setActionSuccess(msg);
      setActionError(null);
    }
    setTimeout(() => {
      setActionSuccess(null);
      setActionError(null);
    }, 4000);
  };

  // Manejar cambio de estado de pedido
  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await api.updateOrderStatus(store.id, orderId, newStatus);
      notify(`Pedido actualizado a estado "${newStatus}".`);
      loadData();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error actualizando pedido', true);
    }
  };

  // Manejar creación / edición de producto
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Partial<Product> = {
        name: pName.trim(),
        description: pDescription.trim(),
        price: Number(pPrice),
        compareAtPrice: pComparePrice ? Number(pComparePrice) : undefined,
        stock: Number(pStock),
        minStock: Number(pMinStock),
        categoryId: pCategoryId || (categories[0]?.id || 'cat-general'),
        categoryName: categories.find((c) => c.id === pCategoryId)?.name || 'General',
        sku: pSku.trim() || undefined,
        images: pImage.trim() ? [pImage.trim()] : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80'],
        featured: pFeatured,
        active: true,
      };

      if (editingProduct) {
        await api.updateProduct(store.id, editingProduct.id, payload);
        notify('Producto actualizado exitosamente.');
      } else {
        await api.createProduct(store.id, payload);
        notify('Nuevo producto agregado al catálogo.');
      }

      setIsProductModalOpen(false);
      setEditingProduct(null);
      loadData();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error guardando producto', true);
    }
  };

  // Abrir modal de nuevo producto
  const openNewProductModal = () => {
    setEditingProduct(null);
    setPName('');
    setPDescription('');
    setPPrice(1000);
    setPComparePrice(undefined);
    setPStock(10);
    setPMinStock(2);
    setPCategoryId(categories[0]?.id || '');
    setPSku('');
    setPImage('');
    setPFeatured(false);
    setIsProductModalOpen(true);
  };

  // Abrir modal de editar producto
  const openEditProductModal = (prod: Product) => {
    setEditingProduct(prod);
    setPName(prod.name);
    setPDescription(prod.description);
    setPPrice(prod.price);
    setPComparePrice(prod.compareAtPrice);
    setPStock(prod.stock);
    setPMinStock(prod.minStock);
    setPCategoryId(prod.categoryId);
    setPSku(prod.sku || '');
    setPImage(prod.images[0] || '');
    setPFeatured(prod.featured);
    setIsProductModalOpen(true);
  };

  // Eliminar producto
  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este producto del catálogo?')) return;
    try {
      await api.deleteProduct(store.id, productId);
      notify('Producto eliminado.');
      loadData();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error eliminando producto', true);
    }
  };

  // Agregar categoría
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await api.createCategory(store.id, { name: newCatName.trim(), active: true });
      setNewCatName('');
      notify('Categoría agregada.');
      loadData();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error creando categoría', true);
    }
  };

  // Conectar Mercado Pago en Modo Sandbox
  const handleConnectDevMP = async () => {
    try {
      await api.connectMercadoPagoDev(store.id);
      notify('Cuenta de Mercado Pago conectada en modo Sandbox.');
      loadData();
      onStoreUpdated();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error conectando Mercado Pago', true);
    }
  };

  // Desconectar Mercado Pago
  const handleDisconnectMP = async () => {
    if (!window.confirm('¿Seguro que deseas desconectar Mercado Pago de este comercio?')) return;
    try {
      await api.disconnectMercadoPago(store.id);
      notify('Mercado Pago ha sido desconectado.');
      loadData();
      onStoreUpdated();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error desconectando Mercado Pago', true);
    }
  };

  // Iniciar flujo OAuth real de Mercado Pago
  const handleStartMPOAuth = async () => {
    try {
      const { url } = await api.getMercadoPagoConnectUrl(store.id);
      window.open(url, '_blank', 'width=600,height=750');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error obteniendo URL de autorización', true);
    }
  };

  // Simular Webhook de pago
  const handleSimulateWebhook = async () => {
    if (!simulatedOrderId) {
      notify('Selecciona un pedido para simular el pago', true);
      return;
    }
    try {
      setIsSimulating(true);
      const res = await api.simulateMercadoPagoWebhook(simulatedOrderId, simulatedStatus);
      notify(`Webhook simulado procesado: Pedido ${res.order.orderNumber} pasó a estado ${res.order.status} (${res.order.paymentStatus}).`);
      loadData();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error en simulador de webhook', true);
    } finally {
      setIsSimulating(false);
    }
  };

  // Guardar configuración de tienda
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateStoreSettings(store.id, {
        name: stName.trim(),
        description: stDescription.trim(),
        phone: stPhone.trim(),
        email: stEmail.trim(),
        address: stAddress.trim(),
        primaryColor: stColor,
        settings: {
          ...store.settings,
          shippingCost: Number(stShippingCost),
          freeShippingMinAmount: Number(stFreeShippingMin),
          bankDetails: {
            bankName: stBankName,
            accountHolder: stName,
            cbuCvu: stCbu,
            alias: stAlias,
          },
        },
      });
      notify('Configuración de la tienda guardada.');
      loadData();
      onStoreUpdated();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error guardando configuración', true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Header del Panel */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-base shadow"
              style={{ backgroundColor: store.primaryColor || '#2563eb' }}
            >
              {store.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">{store.name}</h2>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-medium">
                  {store.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">Tenant ID: {store.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onOpenStorePublic}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
            >
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              <span>Ver Tienda Pública</span>
            </button>
            <button
              onClick={loadData}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition"
              title="Refrescar datos"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Notificaciones */}
        {actionSuccess && (
          <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 text-center text-xs text-emerald-300 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{actionSuccess}</span>
          </div>
        )}
        {actionError && (
          <div className="bg-rose-500/10 border-b border-rose-500/20 px-4 py-2 text-center text-xs text-rose-300 flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Navegación por Pestañas */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1 overflow-x-auto scrollbar-none pt-2">
          {[
            { id: 'overview', label: 'Resumen', icon: TrendingUp },
            { id: 'orders', label: `Pedidos (${orders.length})`, icon: ShoppingBag },
            { id: 'products', label: `Productos (${products.length})`, icon: Package },
            { id: 'categories', label: `Categorías (${categories.length})`, icon: Layers },
            { id: 'mercadopago', label: 'Mercado Pago (0% Comisión)', icon: CreditCard, badge: mpStatus?.connected ? 'Conectado' : 'Pendiente' },
            { id: 'settings', label: 'Configuración', icon: Settings },
            { id: 'subscription', label: 'Plan y Suscripción', icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-btn-${tab.id}`}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 text-xs font-semibold rounded-t-lg flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
                  isActive
                    ? 'border-blue-500 text-blue-400 bg-slate-800/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                      tab.badge === 'Conectado'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido de Pestañas */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        
        {/* ==========================================
            1. PESTAÑA: RESUMEN (OVERVIEW)
            ========================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Tarjetas de Métricas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ventas Totales</span>
                <p className="text-xl font-extrabold text-white">{formatCurrency(stats?.totalSales || 0)}</p>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> 100% para tu comercio (0% comisión)
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Pedidos Totales</span>
                <p className="text-xl font-extrabold text-white">{stats?.totalOrders || 0}</p>
                <span className="text-[10px] text-slate-400">
                  {stats?.pendingOrders || 0} pendientes de despacho
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Productos Activos</span>
                <p className="text-xl font-extrabold text-white">{stats?.totalProducts || 0}</p>
                <span className="text-[10px] text-slate-400">
                  En {categories.length} categorías
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Mercado Pago</span>
                <p className={`text-base font-bold ${mpStatus?.connected ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {mpStatus?.connected ? 'Cuenta Vinculada' : 'No Conectado'}
                </p>
                <span className="text-[10px] text-slate-400">
                  {mpStatus?.connected ? 'Cobros online habilitados' : 'Requiere conectar cuenta'}
                </span>
              </div>
            </div>

            {/* Accesos Rápidos y Últimos Pedidos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Últimos Pedidos */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-blue-400" />
                    Últimos Pedidos
                  </h3>
                  <button
                    onClick={() => setActiveTab('orders')}
                    className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    Ver todos ({orders.length})
                  </button>
                </div>

                {orders.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    Aún no has recibido pedidos en esta tienda.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orders.slice(0, 5).map((ord) => (
                      <div
                        key={ord.id}
                        onClick={() => {
                          setSelectedOrder(ord);
                          setActiveTab('orders');
                        }}
                        className="bg-slate-950 border border-slate-800/80 hover:border-slate-700 p-3 rounded-xl flex items-center justify-between cursor-pointer transition"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{ord.orderNumber}</span>
                            <span className="text-xs text-slate-300">
                              {ord.customer.firstName} {ord.customer.lastName}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">{formatDate(ord.createdAt)}</span>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-bold text-white">{formatCurrency(ord.total)}</p>
                          <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {ord.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Estado de Suscripción Fija */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                    Suscripción Plataforma SaaS
                  </span>
                  <h4 className="text-base font-bold text-white mt-1">
                    {subscription?.planName || 'Plan Comercio Pro (Fijo)'}
                  </h4>
                  <p className="text-2xl font-extrabold text-blue-400 mt-2">
                    {formatCurrency(subscription?.amount || 15000)} / mes
                  </p>
                  
                  <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs text-slate-300">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>0.00% Comisión por Venta</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <Check className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>Catálogo y productos ilimitados</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <Check className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>Integración directa de Mercado Pago</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('subscription')}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition"
                >
                  Ver Detalles de Suscripción
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            2. PESTAÑA: PEDIDOS (ORDERS)
            ========================================== */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Gestión de Pedidos</h3>
              <span className="text-xs text-slate-400">Total: {orders.length} pedidos</span>
            </div>

            {orders.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                <p className="font-semibold text-sm">No hay pedidos registrados en este comercio.</p>
                <p className="text-xs text-slate-500 mt-1">Los clientes pueden hacer compras en la tienda pública.</p>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[10px]">
                      <tr>
                        <th className="p-3.5">Orden</th>
                        <th className="p-3.5">Cliente</th>
                        <th className="p-3.5">Entrega</th>
                        <th className="p-3.5">Pago</th>
                        <th className="p-3.5">Total</th>
                        <th className="p-3.5">Estado Pedido</th>
                        <th className="p-3.5 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {orders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-slate-800/30 transition">
                          <td className="p-3.5 font-bold text-white">
                            {ord.orderNumber}
                            <span className="text-[10px] text-slate-400 block font-normal">
                              {formatDate(ord.createdAt)}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-300">
                            <span className="font-medium text-white block">
                              {ord.customer.firstName} {ord.customer.lastName}
                            </span>
                            <span className="text-[10px] text-slate-400">{ord.customer.email}</span>
                          </td>
                          <td className="p-3.5 text-slate-300">
                            <span className="text-[10px] font-semibold block">{ord.deliveryMethod}</span>
                            {ord.address && (
                              <span className="text-[10px] text-slate-400 block max-w-xs truncate">
                                {ord.address.address}, {ord.address.city}
                              </span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className="text-white font-semibold block">{ord.paymentMethod}</span>
                            <span
                              className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded inline-block mt-0.5 ${
                                ord.paymentStatus === 'APPROVED'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : ord.paymentStatus === 'REJECTED' || ord.paymentStatus === 'CANCELLED'
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {ord.paymentStatus}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold text-white">{formatCurrency(ord.total)}</td>
                          <td className="p-3.5">
                            <select
                              value={ord.status}
                              onChange={(e) => handleUpdateOrderStatus(ord.id, e.target.value as OrderStatus)}
                              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                            >
                              <option value="PENDIENTE">PENDIENTE</option>
                              <option value="CONFIRMADO">CONFIRMADO</option>
                              <option value="PREPARANDO">PREPARANDO</option>
                              <option value="ENVIADO">ENVIADO</option>
                              <option value="ENTREGADO">ENTREGADO</option>
                              <option value="CANCELADO">CANCELADO</option>
                            </select>
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => setSelectedOrder(ord)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg font-medium transition"
                            >
                              Ver Detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* MODAL DETALLE DE ORDEN */}
            {selectedOrder && (
              <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl p-6 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <div>
                      <h4 className="text-base font-bold text-white">Detalle de {selectedOrder.orderNumber}</h4>
                      <span className="text-[10px] text-slate-400">{formatDate(selectedOrder.createdAt)}</span>
                    </div>
                    <button
                      onClick={() => setSelectedOrder(null)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                      <p className="font-semibold text-white">Datos del Cliente:</p>
                      <p className="text-slate-300">{selectedOrder.customer.firstName} {selectedOrder.customer.lastName}</p>
                      <p className="text-slate-400">{selectedOrder.customer.email} • {selectedOrder.customer.phone || 'Sin teléfono'}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="font-semibold text-white">Items del Pedido:</p>
                      {selectedOrder.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-800/40 text-slate-300">
                          <span>{item.quantity}x {item.name}</span>
                          <span className="font-bold text-white">{formatCurrency(item.subtotal)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 flex justify-between items-center text-sm font-bold text-white">
                      <span>Total:</span>
                      <span className="text-blue-400">{formatCurrency(selectedOrder.total)}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={() => setSelectedOrder(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            3. PESTAÑA: PRODUCTOS (CATÁLOGO)
            ========================================== */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Catálogo de Productos</h3>
                <p className="text-xs text-slate-400">Administra los precios, stock e imágenes de tu tienda.</p>
              </div>
              <button
                id="btn-add-product"
                onClick={openNewProductModal}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Producto</span>
              </button>
            </div>

            {products.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                <Package className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                <p className="font-semibold text-sm">Tu catálogo está vacío.</p>
                <p className="text-xs text-slate-500 mt-1">Comienza agregando tu primer producto para empezar a vender.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((prod) => (
                  <div
                    key={prod.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex gap-4 items-center justify-between"
                  >
                    <img
                      src={prod.images[0]}
                      alt={prod.name}
                      className="w-16 h-16 rounded-xl object-cover bg-slate-950 shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] uppercase font-semibold text-blue-400">
                        {prod.categoryName}
                      </span>
                      <h4 className="text-xs font-bold text-white truncate">{prod.name}</h4>
                      <p className="text-xs font-extrabold text-slate-200 mt-0.5">
                        {formatCurrency(prod.price)}
                      </p>
                      <span
                        className={`text-[10px] block mt-1 ${
                          prod.stock <= prod.minStock ? 'text-rose-400 font-bold' : 'text-slate-400'
                        }`}
                      >
                        Stock: {prod.stock} un.
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => openEditProductModal(prod)}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                        title="Editar Producto"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(prod.id)}
                        className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition"
                        title="Eliminar Producto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* MODAL CREAR / EDITAR PRODUCTO */}
            {isProductModalOpen && (
              <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full my-8 overflow-hidden shadow-2xl p-6 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <h4 className="text-base font-bold text-white">
                      {editingProduct ? 'Editar Producto' : 'Crear Nuevo Producto'}
                    </h4>
                    <button
                      onClick={() => setIsProductModalOpen(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleSaveProduct} className="space-y-3 text-xs">
                    <div>
                      <label className="text-slate-300 block mb-1 font-medium">Nombre del Producto *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: Remera Algodón Premium"
                        value={pName}
                        onChange={(e) => setPName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-300 block mb-1 font-medium">Precio de Venta ($ ARS) *</label>
                        <input
                          type="number"
                          required
                          min="0"
                          value={pPrice}
                          onChange={(e) => setPPrice(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-slate-300 block mb-1 font-medium">Precio Anterior (Tachado)</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="Opcional"
                          value={pComparePrice || ''}
                          onChange={(e) => setPComparePrice(e.target.value ? Number(e.target.value) : undefined)}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-slate-300 block mb-1 font-medium">Stock *</label>
                        <input
                          type="number"
                          required
                          min="0"
                          value={pStock}
                          onChange={(e) => setPStock(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-slate-300 block mb-1 font-medium">Alerta Stock Mín.</label>
                        <input
                          type="number"
                          min="0"
                          value={pMinStock}
                          onChange={(e) => setPMinStock(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-slate-300 block mb-1 font-medium">SKU / Código</label>
                        <input
                          type="text"
                          placeholder="REM-01"
                          value={pSku}
                          onChange={(e) => setPSku(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-slate-300 block mb-1 font-medium">Categoría</label>
                      <select
                        value={pCategoryId}
                        onChange={(e) => setPCategoryId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-300 block mb-1 font-medium">URL de Imagen</label>
                      <input
                        type="url"
                        placeholder="https://images.unsplash.com/..."
                        value={pImage}
                        onChange={(e) => setPImage(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-slate-300 block mb-1 font-medium">Descripción</label>
                      <textarea
                        rows={3}
                        placeholder="Detalles, materiales, talles o especificaciones..."
                        value={pDescription}
                        onChange={(e) => setPDescription(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        id="featured-checkbox"
                        checked={pFeatured}
                        onChange={(e) => setPFeatured(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <label htmlFor="featured-checkbox" className="text-slate-300">
                        Marcar como producto destacado en portada
                      </label>
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsProductModalOpen(false)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl"
                      >
                        Guardar Producto
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            4. PESTAÑA: CATEGORÍAS
            ========================================== */}
        {activeTab === 'categories' && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-base font-bold text-white">Categorías de la Tienda</h3>

            <form onSubmit={handleAddCategory} className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre de nueva categoría (ej: Calzado, Ofertas)..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar</span>
              </button>
            </form>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800/60 overflow-hidden">
              {categories.map((cat) => {
                const count = products.filter((p) => p.categoryId === cat.id).length;
                return (
                  <div key={cat.id} className="p-3.5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white">{cat.name}</h4>
                      <span className="text-[10px] text-slate-400">{count} productos asociados</span>
                    </div>
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">
                      Activa
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==========================================
            5. PESTAÑA: MERCADO PAGO OAUTH Y SIMULADOR
            ========================================== */}
        {activeTab === 'mercadopago' && (
          <div className="space-y-6 max-w-3xl">
            
            {/* Banner de Garantía 0% Comisión */}
            <div className="bg-gradient-to-r from-blue-900/30 to-indigo-900/30 border border-blue-500/30 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                <Shield className="w-5 h-5" />
                <span>Arquitectura de Pagos Multi-Vendedor (0% de Comisión en Ventas)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Nuestra plataforma utiliza el modelo <strong>OAuth de Mercado Pago</strong>. El dinero de cada venta ingresa <strong>directamente a la cuenta bancaria / cuenta Mercado Pago de tu comercio</strong>. La plataforma cobra únicamente su suscripción mensual fija de bajo costo y no retiene comisiones por transacción.
              </p>
            </div>

            {/* Estado de Conexión */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-base font-bold text-white">Estado de la Conexión</h4>
                  <p className="text-xs text-slate-400">Vinculación de credenciales con Mercado Pago</p>
                </div>
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full border ${
                    mpStatus?.connected
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}
                >
                  {mpStatus?.connected ? '✅ Conectado y Activo' : '⚠️ No Vinculado'}
                </span>
              </div>

              {mpStatus?.connected ? (
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">ID de Usuario Mercado Pago:</span>
                    <span className="font-mono text-slate-200">{mpStatus.mpUserId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Seguridad de Tokens:</span>
                    <span className="text-emerald-400 font-semibold">Cifrado Criptográfico AES-256</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Checkout API:</span>
                    <span className="text-blue-400 font-semibold">Habilitado</span>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={handleDisconnectMP}
                      className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg transition"
                    >
                      Desconectar Mercado Pago
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <p className="text-xs text-slate-300">
                    Para empezar a recibir pagos online con tarjetas de crédito, débito y dinero en cuenta, autoriza la aplicación integradora con tu cuenta de Mercado Pago:
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleStartMPOAuth}
                      className="px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Conectar con Mercado Pago (OAuth)</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={handleConnectDevMP}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition"
                    >
                      <span>Conectar Modo Sandbox (Pruebas Inmediatas)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Herramienta de Simulación de Webhooks (Pruebas de Desarrollo) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-blue-400" />
                  Simulador de Webhooks y Pagos en Vivo
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Herramienta para probar la sincronización automática de estados sin necesidad de realizar pagos reales en producción.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">Seleccionar Pedido</label>
                  <select
                    value={simulatedOrderId}
                    onChange={(e) => setSimulatedOrderId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.orderNumber} - {o.customer.firstName} ({formatCurrency(o.total)}) [{o.status}]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">Resultado del Pago</label>
                  <select
                    value={simulatedStatus}
                    onChange={(e) => setSimulatedStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="APPROVED">Aprobado (APPROVED) → Pedido Confirmado</option>
                    <option value="REJECTED">Rechazado (REJECTED) → Pedido Cancelado</option>
                    <option value="REFUNDED">Reembolsado (REFUNDED)</option>
                  </select>
                </div>
              </div>

              <button
                disabled={isSimulating || !simulatedOrderId}
                onClick={handleSimulateWebhook}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
                <span>Disparar Webhook Simulado e Idempotente</span>
              </button>
            </div>
          </div>
        )}

        {/* ==========================================
            6. PESTAÑA: CONFIGURACIÓN
            ========================================== */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="space-y-6 max-w-2xl">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h4 className="text-base font-bold text-white">Información de la Tienda</h4>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Nombre de la Tienda</label>
                  <input
                    type="text"
                    required
                    value={stName}
                    onChange={(e) => setStName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Descripción</label>
                  <textarea
                    rows={2}
                    value={stDescription}
                    onChange={(e) => setStDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 block mb-1 font-medium">Teléfono / WhatsApp</label>
                    <input
                      type="text"
                      value={stPhone}
                      onChange={(e) => setStPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1 font-medium">Email de Contacto</label>
                    <input
                      type="email"
                      value={stEmail}
                      onChange={(e) => setStEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Dirección del Local</label>
                  <input
                    type="text"
                    value={stAddress}
                    onChange={(e) => setStAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Color Primario de la Marca</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={stColor}
                      onChange={(e) => setStColor(e.target.value)}
                      className="w-10 h-8 rounded border border-slate-800 cursor-pointer bg-slate-950"
                    />
                    <span className="font-mono text-slate-300 text-xs">{stColor}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Configuración de Envíos */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h4 className="text-base font-bold text-white">Costos de Envío</h4>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Costo de Envío Estándar ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={stShippingCost}
                    onChange={(e) => setStShippingCost(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Monto Mínimo para Envío Gratis ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={stFreeShippingMin}
                    onChange={(e) => setStFreeShippingMin(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Datos Bancarios para Transferencia */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h4 className="text-base font-bold text-white">Transferencia Bancaria</h4>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Nombre del Banco</label>
                  <input
                    type="text"
                    placeholder="Banco Santander / BBVA / Galicia / Mercado Pago"
                    value={stBankName}
                    onChange={(e) => setStBankName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 block mb-1 font-medium">CBU / CVU</label>
                    <input
                      type="text"
                      placeholder="0000003100012345678901"
                      value={stCbu}
                      onChange={(e) => setStCbu(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1 font-medium">Alias</label>
                    <input
                      type="text"
                      placeholder="MI.COMERCIO.ONLINE"
                      value={stAlias}
                      onChange={(e) => setStAlias(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
            >
              Guardar Toda la Configuración
            </button>
          </form>
        )}

        {/* ==========================================
            7. PESTAÑA: SUSCRIPCIÓN SAAS
            ========================================== */}
        {activeTab === 'subscription' && (
          <div className="space-y-6 max-w-2xl">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">Plan Activo</span>
                  <h3 className="text-lg font-bold text-white mt-0.5">{subscription?.planName || 'Plan Comercio Pro (Fijo)'}</h3>
                </div>
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-bold">
                  {subscription?.status || 'ACTIVE'}
                </span>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Cuota Mensual Fija:</span>
                  <span className="text-base font-bold text-white">{formatCurrency(subscription?.amount || 15000)} / mes</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Comisión en tus Ventas:</span>
                  <span className="text-sm font-bold text-emerald-400">0.00% (Sin comisiones por venta)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Próxima Fecha de Renovación:</span>
                  <span className="text-slate-300">{formatDate(subscription?.currentPeriodEnd || new Date().toISOString())}</span>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Tu comercio cuenta con acceso completo e ilimitado a todas las herramientas: gestión de pedidos, catálogo de productos, control de stock y pasarela de cobro directa con Mercado Pago.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
