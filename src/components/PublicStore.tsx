/**
 * Public Store Component
 * Catálogo público multi-tenant con carrito, checkout y pasarela Mercado Pago propia del comercio.
 */

import React, { useState } from 'react';
import {
  ShoppingBag,
  Truck,
  Store as StoreIcon,
  CreditCard,
  Building2,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  Minus,
  Trash2,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Search,
  Tag,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { Store, Product, Category, Order, CartItem, DeliveryMethod, PaymentProvider } from '../types/index.ts';
import { formatCurrency, formatDate } from '../utils/format.ts';
import { api } from '../services/api.ts';

interface PublicStoreProps {
  store: Store;
  categories: Category[];
  products: Product[];
  onOrderCreated?: (order: Order) => void;
}

export function PublicStore({ store, categories, products, onOrderCreated }: PublicStoreProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Estado del Carrito
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Estado del Checkout
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'form' | 'processing' | 'success'>('form');
  const [customerName, setCustomerName] = useState('');
  const [customerLastName, setCustomerLastName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('DELIVERY');
  const [paymentMethod, setPaymentMethod] = useState<PaymentProvider>('MERCADOPAGO');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  // Resultado de la Orden
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [mpPreference, setMpPreference] = useState<{ initPoint: string; sandboxInitPoint: string } | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtro de productos
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.categoryId === selectedCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch && p.active;
  });

  // Operaciones de Carrito
  const addToCart = (product: Product, quantity = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        const newQty = Math.min(product.stock, existing.quantity + quantity);
        return prev.map((item) => (item.product.id === product.id ? { ...item, quantity: newQty } : item));
      }
      return [...prev, { product, quantity: Math.min(product.stock, quantity) }];
    });
    setIsCartOpen(true);
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (newQty > item.product.stock) return item;
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const cartSubtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // Cálculo de Envío
  const minFreeShipping = store.settings?.freeShippingMinAmount || 0;
  const standardShippingCost = store.settings?.shippingCost || 0;
  const isFreeShipping = minFreeShipping > 0 && cartSubtotal >= minFreeShipping;
  const shippingCost = deliveryMethod === 'DELIVERY' ? (isFreeShipping ? 0 : standardShippingCost) : 0;
  const cartTotal = cartSubtotal + shippingCost;

  // Manejar creación de Orden (Checkout)
  const handleProceedToCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);

    if (cart.length === 0) {
      setCheckoutError('El carrito está vacío.');
      return;
    }

    if (!customerName.trim() || !customerEmail.trim()) {
      setCheckoutError('Por favor ingresa tu nombre y correo electrónico.');
      return;
    }

    if (deliveryMethod === 'DELIVERY' && (!addressStreet.trim() || !addressCity.trim())) {
      setCheckoutError('Por favor completa la dirección de entrega.');
      return;
    }

    try {
      setIsSubmitting(true);
      setCheckoutStep('processing');

      // 1. Crear Orden en el Backend (Inicia en estado PENDIENTE)
      const order = await api.createCheckoutOrder(store.id, {
        customer: {
          firstName: customerName.trim(),
          lastName: customerLastName.trim(),
          email: customerEmail.trim(),
          phone: customerPhone.trim() || undefined,
        },
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
        })),
        deliveryMethod,
        paymentMethod,
        address: deliveryMethod === 'DELIVERY' ? {
          address: addressStreet.trim(),
          city: addressCity.trim(),
          province: addressProvince.trim() || 'Buenos Aires',
          postalCode: addressPostalCode.trim() || '1000',
        } : undefined,
        notes: orderNotes.trim() || undefined,
      });

      setCreatedOrder(order);
      if (onOrderCreated) onOrderCreated(order);

      // 2. Si el método de pago es Mercado Pago, generar la Preferencia mediante el backend
      if (paymentMethod === 'MERCADOPAGO') {
        try {
          const pref = await api.createMercadoPagoPreference(store.id, order.id);
          setMpPreference(pref);
        } catch (mpErr) {
          console.warn('Nota de Mercado Pago:', mpErr);
          // Si el comercio no tiene MP aún configurado, se permite continuar y pagar por transferencia/efectivo
        }
      }

      // Limpiar carrito
      setCart([]);
      setCheckoutStep('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el pedido';
      setCheckoutError(msg);
      setCheckoutStep('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Banner de la Tienda */}
      {store.banner ? (
        <div className="relative h-48 sm:h-64 w-full overflow-hidden bg-slate-900">
          <img
            src={store.banner}
            alt={store.name}
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        </div>
      ) : (
        <div className="h-24 bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border-b border-slate-800" />
      )}

      {/* Cabecera de la Tienda */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 sm:-mt-16 relative z-10 w-full mb-8">
        <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {store.logo ? (
              <img
                src={store.logo}
                alt={store.name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border-2 border-slate-700 bg-slate-800 shadow-md shrink-0"
              />
            ) : (
              <div
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl flex items-center justify-center text-white text-2xl font-bold border-2 border-slate-700 shrink-0"
                style={{ backgroundColor: store.primaryColor || '#2563eb' }}
              >
                {store.name.charAt(0)}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{store.name}</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Tienda Oficial
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl line-clamp-2">
                {store.description || 'Bienvenido a nuestra tienda online oficial.'}
              </p>
              
              {/* Info de contacto rápida */}
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                {store.address && (
                  <span className="flex items-center gap-1">
                    <StoreIcon className="w-3.5 h-3.5 text-slate-500" />
                    {store.address}
                  </span>
                )}
                {store.schedule && (
                  <span className="text-slate-400 hidden sm:inline">
                    • {store.schedule}
                  </span>
                )}
                {store.settings?.whatsappNumber && (
                  <a
                    href={`https://wa.me/${store.settings.whatsappNumber.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 transition"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Botón Flotante/Header de Carrito */}
          <div className="w-full md:w-auto flex items-center justify-end">
            <button
              id="btn-open-cart"
              onClick={() => setIsCartOpen(true)}
              className="w-full md:w-auto px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-white flex items-center justify-center gap-2 shadow-lg transition"
              style={{ backgroundColor: store.primaryColor || '#2563eb' }}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Ver Carrito</span>
              {cartItemCount > 0 && (
                <span className="bg-white text-slate-900 text-xs font-bold px-2 py-0.5 rounded-full ml-1">
                  {cartItemCount} ({formatCurrency(cartTotal)})
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Contenido Principal: Filtros y Catálogo */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex-1 mb-16">
        
        {/* Barra de Búsqueda y Categorías */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
          {/* Pills de Categorías */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
            <button
              id="cat-btn-all"
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === 'all'
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              Todos los productos ({products.length})
            </button>
            {categories.map((cat) => {
              const count = products.filter((p) => p.categoryId === cat.id).length;
              return (
                <button
                  key={cat.id}
                  id={`cat-btn-${cat.id}`}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                    selectedCategory === cat.id
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>

          {/* Buscador */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar productos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Rejilla de Productos */}
        {filteredProducts.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
            <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-base font-semibold text-white">No se encontraron productos</h3>
            <p className="text-xs max-w-sm mx-auto">
              Intenta cambiar los términos de búsqueda o selecciona otra categoría de la tienda.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredProducts.map((product) => {
              const isOutOfStock = product.stock <= 0;
              const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;

              return (
                <div
                  key={product.id}
                  id={`product-card-${product.id}`}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden flex flex-col transition group shadow-sm hover:shadow-md"
                >
                  {/* Imagen */}
                  <div
                    className="relative aspect-square w-full overflow-hidden bg-slate-950 cursor-pointer"
                    onClick={() => setSelectedProduct(product)}
                  >
                    <img
                      src={product.images[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80'}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />

                    {/* Badges */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      {hasDiscount && (
                        <span className="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow">
                          OFERTA
                        </span>
                      )}
                      {product.featured && (
                        <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-md shadow">
                          DESTACADO
                        </span>
                      )}
                    </div>

                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center">
                        <span className="bg-rose-600/90 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                          Sin Stock
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-blue-400 tracking-wider">
                        {product.categoryName || 'Catálogo'}
                      </span>
                      <h3
                        onClick={() => setSelectedProduct(product)}
                        className="text-sm font-semibold text-white line-clamp-2 hover:text-blue-400 cursor-pointer transition mt-0.5"
                      >
                        {product.name}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                        {product.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-end justify-between gap-2">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-bold text-white">
                            {formatCurrency(product.price)}
                          </span>
                          {hasDiscount && (
                            <span className="text-xs text-slate-500 line-through">
                              {formatCurrency(product.compareAtPrice!)}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 block">
                          {product.stock > 0 ? `Stock: ${product.stock} un.` : 'Agotado'}
                        </span>
                      </div>

                      <button
                        id={`btn-add-cart-${product.id}`}
                        disabled={isOutOfStock}
                        onClick={() => addToCart(product, 1)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        style={{ backgroundColor: store.primaryColor || '#2563eb' }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Agregar</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DETALLE DE PRODUCTO */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-800">
              <span className="text-xs uppercase font-semibold text-blue-400">
                {selectedProduct.categoryName || 'Detalle del Producto'}
              </span>
              <button
                onClick={() => setSelectedProduct(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="aspect-square rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                <img
                  src={selectedProduct.images[0]}
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex flex-col justify-between space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-white">{selectedProduct.name}</h2>
                  {selectedProduct.sku && (
                    <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                      SKU: {selectedProduct.sku}
                    </span>
                  )}

                  <div className="flex items-baseline gap-2 mt-3">
                    <span className="text-2xl font-extrabold text-white">
                      {formatCurrency(selectedProduct.price)}
                    </span>
                    {selectedProduct.compareAtPrice && (
                      <span className="text-sm text-slate-500 line-through">
                        {formatCurrency(selectedProduct.compareAtPrice)}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 mt-4 leading-relaxed whitespace-pre-line">
                    {selectedProduct.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Disponibilidad:</span>
                    <span className={selectedProduct.stock > 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                      {selectedProduct.stock > 0 ? `${selectedProduct.stock} unidades en stock` : 'Sin stock disponible'}
                    </span>
                  </div>

                  <button
                    disabled={selectedProduct.stock <= 0}
                    onClick={() => {
                      addToCart(selectedProduct, 1);
                      setSelectedProduct(null);
                    }}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 shadow-lg disabled:opacity-40"
                    style={{ backgroundColor: store.primaryColor || '#2563eb' }}
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Agregar al Carrito</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER LATERAL DE CARRITO */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header Carrito */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Tu Carrito ({cartItemCount})</h3>
              </div>
              <button
                id="btn-close-cart"
                onClick={() => setIsCartOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista de Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center py-12 space-y-3">
                  <ShoppingBag className="w-12 h-12 text-slate-700" />
                  <p className="text-sm font-medium">El carrito está vacío</p>
                  <p className="text-xs text-slate-600 max-w-xs">
                    Explora el catálogo y agrega productos para iniciar tu compra.
                  </p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex gap-3 items-center"
                  >
                    <img
                      src={item.product.images[0]}
                      alt={item.product.name}
                      className="w-14 h-14 rounded-lg object-cover bg-slate-900 shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-semibold text-white truncate">{item.product.name}</h4>
                      <p className="text-xs font-bold text-slate-200 mt-0.5">
                        {formatCurrency(item.product.price)}
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center border border-slate-800 rounded-md bg-slate-900">
                          <button
                            onClick={() => updateCartQty(item.product.id, -1)}
                            className="p-1 text-slate-400 hover:text-white transition"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-bold text-white">{item.quantity}</span>
                          <button
                            disabled={item.quantity >= item.product.stock}
                            onClick={() => updateCartQty(item.product.id, 1)}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 transition"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer de Carrito */}
            {cart.length > 0 && (
              <div className="p-4 border-t border-slate-800 bg-slate-950/80 space-y-3">
                {/* Barra de progreso de envío gratis */}
                {minFreeShipping > 0 && (
                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg text-xs space-y-1.5">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">Envío Gratis:</span>
                      <span className="font-semibold text-slate-200">
                        {isFreeShipping ? '¡Alcanzaste el envío gratis!' : `Faltan ${formatCurrency(Math.max(0, minFreeShipping - cartSubtotal))}`}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${Math.min(100, (cartSubtotal / minFreeShipping) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 text-xs text-slate-300">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-white">{formatCurrency(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Envío:</span>
                    <span>{isFreeShipping ? 'Gratis' : formatCurrency(standardShippingCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
                    <span>Total Estimado:</span>
                    <span className="text-blue-400">{formatCurrency(cartTotal)}</span>
                  </div>
                </div>

                <button
                  id="btn-go-to-checkout"
                  onClick={() => {
                    setIsCartOpen(false);
                    setIsCheckoutOpen(true);
                    setCheckoutStep('form');
                  }}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition"
                  style={{ backgroundColor: store.primaryColor || '#2563eb' }}
                >
                  <span>Iniciar Compra</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE CHECKOUT Y CONFIRMACIÓN */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full my-8 overflow-hidden shadow-2xl">
            
            {/* Header Modal Checkout */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Finalizar Compra Segura</h3>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Banner */}
            {checkoutError && (
              <div className="m-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* PASO 1: FORMULARIO DE COMPRA */}
            {checkoutStep === 'form' && (
              <form onSubmit={handleProceedToCheckout} className="p-6 space-y-5">
                
                {/* 1. Datos del Comprador */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    1. Datos de Contacto
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">Nombre *</label>
                      <input
                        type="text"
                        required
                        placeholder="Juan"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">Apellido</label>
                      <input
                        type="text"
                        placeholder="Pérez"
                        value={customerLastName}
                        onChange={(e) => setCustomerLastName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">Email *</label>
                      <input
                        type="email"
                        required
                        placeholder="juan.perez@ejemplo.com"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">Teléfono / WhatsApp</label>
                      <input
                        type="tel"
                        placeholder="+54 11 1234-5678"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Método de Entrega */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    2. Método de Entrega
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('DELIVERY')}
                      className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
                        deliveryMethod === 'DELIVERY'
                          ? 'border-blue-500 bg-blue-600/10 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Truck className="w-5 h-5 text-blue-400" />
                      <div>
                        <p className="text-xs font-bold">Envío a Domicilio</p>
                        <p className="text-[10px] text-slate-400">
                          {isFreeShipping ? 'Gratis' : formatCurrency(standardShippingCost)}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('PICKUP')}
                      className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
                        deliveryMethod === 'PICKUP'
                          ? 'border-blue-500 bg-blue-600/10 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <StoreIcon className="w-5 h-5 text-emerald-400" />
                      <div>
                        <p className="text-xs font-bold">Retiro en Local</p>
                        <p className="text-[10px] text-slate-400">Sin costo adicional</p>
                      </div>
                    </button>
                  </div>

                  {deliveryMethod === 'DELIVERY' && (
                    <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                      <div>
                        <label className="text-xs text-slate-300 block mb-1">Dirección y Altura *</label>
                        <input
                          type="text"
                          required={deliveryMethod === 'DELIVERY'}
                          placeholder="Av. Santa Fe 1234, 4to B"
                          value={addressStreet}
                          onChange={(e) => setAddressStreet(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-300 block mb-1">Ciudad *</label>
                          <input
                            type="text"
                            required={deliveryMethod === 'DELIVERY'}
                            placeholder="CABA"
                            value={addressCity}
                            onChange={(e) => setAddressCity(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-300 block mb-1">Código Postal</label>
                          <input
                            type="text"
                            placeholder="1425"
                            value={addressPostalCode}
                            onChange={(e) => setAddressPostalCode(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Método de Pago */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    3. Medio de Pago
                  </h4>
                  <div className="space-y-2">
                    <label
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition ${
                        paymentMethod === 'MERCADOPAGO'
                          ? 'border-sky-500 bg-sky-500/10 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="MERCADOPAGO"
                        checked={paymentMethod === 'MERCADOPAGO'}
                        onChange={() => setPaymentMethod('MERCADOPAGO')}
                        className="text-sky-500"
                      />
                      <CreditCard className="w-5 h-5 text-sky-400" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-white flex items-center gap-2">
                          Mercado Pago
                          <span className="text-[10px] font-semibold bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded">
                            Tarjetas / Débito / Dinero en Cuenta
                          </span>
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Paga seguro y directo a la cuenta de {store.name}.
                        </p>
                      </div>
                    </label>

                    {store.settings?.acceptBankTransfer && (
                      <label
                        className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition ${
                          paymentMethod === 'TRANSFER'
                            ? 'border-indigo-500 bg-indigo-500/10 text-white'
                            : 'border-slate-800 bg-slate-950 text-slate-400'
                        }`}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="TRANSFER"
                          checked={paymentMethod === 'TRANSFER'}
                          onChange={() => setPaymentMethod('TRANSFER')}
                          className="text-indigo-500"
                        />
                        <Building2 className="w-5 h-5 text-indigo-400" />
                        <div className="flex-1">
                          <p className="text-xs font-bold text-white">Transferencia Bancaria</p>
                          <p className="text-[10px] text-slate-400">
                            Recibirás los datos de CBU/CVU y Alias para transferir.
                          </p>
                        </div>
                      </label>
                    )}

                    {store.settings?.acceptCashOnDelivery && (
                      <label
                        className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition ${
                          paymentMethod === 'CASH_ON_DELIVERY'
                            ? 'border-emerald-500 bg-emerald-500/10 text-white'
                            : 'border-slate-800 bg-slate-950 text-slate-400'
                        }`}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="CASH_ON_DELIVERY"
                          checked={paymentMethod === 'CASH_ON_DELIVERY'}
                          onChange={() => setPaymentMethod('CASH_ON_DELIVERY')}
                          className="text-emerald-500"
                        />
                        <Tag className="w-5 h-5 text-emerald-400" />
                        <div>
                          <p className="text-xs font-bold text-white">Pago Contra Entrega</p>
                          <p className="text-[10px] text-slate-400">
                            Abona en efectivo al recibir o retirar tu pedido.
                          </p>
                        </div>
                      </label>
                    )}
                  </div>
                </div>

                {/* Resumen Final de Compra */}
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>Productos ({cartItemCount}):</span>
                    <span>{formatCurrency(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Envío:</span>
                    <span>{shippingCost === 0 ? 'Gratis' : formatCurrency(shippingCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
                    <span>Total a Pagar:</span>
                    <span className="text-blue-400">{formatCurrency(cartTotal)}</span>
                  </div>
                </div>

                <button
                  id="btn-confirm-order"
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition cursor-pointer"
                  style={{ backgroundColor: store.primaryColor || '#2563eb' }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar y Realizar Pedido</span>
                </button>
              </form>
            )}

            {/* PASO 2: PROCESANDO */}
            {checkoutStep === 'processing' && (
              <div className="p-12 text-center space-y-4">
                <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mx-auto" />
                <h4 className="text-base font-bold text-white">Generando tu Pedido...</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Validando stock disponible, calculando costos y preparando la orden de compra.
                </p>
              </div>
            )}

            {/* PASO 3: CONFIRMACIÓN EXITOSA */}
            {checkoutStep === 'success' && createdOrder && (
              <div className="p-6 space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-lg font-bold text-white">¡Pedido Registrado con Éxito!</h4>
                  <p className="text-xs text-slate-300 font-mono">
                    Orden {createdOrder.orderNumber}
                  </p>
                </div>

                {/* Estado del Pedido */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Estado del Pedido:</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase text-[10px]">
                      {createdOrder.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Medio de Pago:</span>
                    <span className="text-white font-semibold">{createdOrder.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Total:</span>
                    <span className="text-base font-bold text-blue-400">
                      {formatCurrency(createdOrder.total)}
                    </span>
                  </div>
                </div>

                {/* Acciones de Pago según el Método */}
                {createdOrder.paymentMethod === 'MERCADOPAGO' && mpPreference && (
                  <div className="bg-sky-950/40 border border-sky-500/30 rounded-xl p-4 space-y-3 text-center">
                    <p className="text-xs text-sky-200">
                      Haz click abajo para abonar con Mercado Pago en la cuenta oficial del comercio:
                    </p>
                    <a
                      href={mpPreference.initPoint || mpPreference.sandboxInitPoint}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Pagar {formatCurrency(createdOrder.total)} con Mercado Pago</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                {/* Datos de Transferencia */}
                {createdOrder.paymentMethod === 'TRANSFER' && store.settings?.bankDetails && (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
                    <h5 className="font-bold text-white flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-indigo-400" />
                      Datos para Transferencia Bancaria
                    </h5>
                    <div className="text-slate-300 space-y-1 font-mono text-[11px] pt-1">
                      <p>Banco: <strong className="text-white">{store.settings.bankDetails.bankName}</strong></p>
                      <p>Titular: <strong className="text-white">{store.settings.bankDetails.accountHolder}</strong></p>
                      <p>CBU/CVU: <strong className="text-emerald-400">{store.settings.bankDetails.cbuCvu}</strong></p>
                      <p>Alias: <strong className="text-emerald-400">{store.settings.bankDetails.alias}</strong></p>
                    </div>
                  </div>
                )}

                {/* Botón WhatsApp */}
                {store.settings?.whatsappNumber && (
                  <a
                    href={`https://wa.me/${store.settings.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                      `Hola ${store.name}, acabo de realizar el pedido ${createdOrder.orderNumber} por ${formatCurrency(
                        createdOrder.total
                      )} a nombre de ${createdOrder.customer.firstName}.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Enviar Comprobante por WhatsApp</span>
                  </a>
                )}

                <button
                  onClick={() => {
                    setIsCheckoutOpen(false);
                    setCreatedOrder(null);
                  }}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
                >
                  Cerrar y Volver a la Tienda
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
