import React, { useState, useEffect } from 'react';
import {
  Layers,
  ShoppingBag,
  Store as StoreIcon,
  ShieldCheck,
  Building2,
  Lock,
  UserCheck,
  RefreshCw,
  Eye,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from './hooks/useAuth.ts';
import { api } from './services/api.ts';
import { Store, Product, Category } from './types/index.ts';
import { APP_NAME, APP_TAGLINE } from './lib/constants.ts';
import { PublicStore } from './components/PublicStore.tsx';
import { StoreAdminDashboard } from './components/StoreAdminDashboard.tsx';
import { SuperAdminDashboard } from './components/SuperAdminDashboard.tsx';

type MainView = 'public_store' | 'store_admin' | 'super_admin' | 'architecture';

export default function App() {
  const { user, store: authStore, login, logout, isSuperAdmin, isStoreAdmin } = useAuth();
  
  const [currentView, setCurrentView] = useState<MainView>('public_store');
  const [demoUsers, setDemoUsers] = useState<Array<{ id: string; email: string; name: string; role: string; storeName?: string }>>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreSlug, setSelectedStoreSlug] = useState<string>('moda-urbana');
  
  // Datos del comercio activo en la vista pública
  const [activeStoreData, setActiveStoreData] = useState<{
    store: Store;
    categories: Category[];
    products: Product[];
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  // Cargar lista de tiendas y datos iniciales
  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      const [allStores, users] = await Promise.all([
        api.getStores(),
        api.getDemoUsers(),
      ]);

      setStores(allStores);
      setDemoUsers(users);

      // Cargar datos de la tienda seleccionada
      const storeRes = await api.getStoreBySlug(selectedStoreSlug);
      setActiveStoreData(storeRes);
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [selectedStoreSlug]);

  // Si el usuario cambia de rol o se loguea
  const handleSelectUser = async (email: string) => {
    try {
      const res = await login(email);
      if (res.user.role === 'SUPERADMIN') {
        setCurrentView('super_admin');
      } else if (res.user.role === 'ADMIN_COMERCIO') {
        setCurrentView('store_admin');
        if (res.store) {
          setSelectedStoreSlug(res.store.slug);
        }
      } else {
        setCurrentView('public_store');
      }
    } catch (e) {
      console.error('Error login:', e);
    }
  };

  // Abrir tienda pública desde cualquier panel
  const handleOpenStorePublic = (slug?: string) => {
    if (slug) setSelectedStoreSlug(slug);
    setCurrentView('public_store');
  };

  // Administrar comercio desde SuperAdmin
  const handleAdministerStore = (targetStore: Store) => {
    setSelectedStoreSlug(targetStore.slug);
    setCurrentView('store_admin');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      
      {/* BARRA SUPERIOR DE NAVEGACIÓN Y SESIÓN */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Logo & Marca */}
          <div className="flex items-center gap-3">
            <div
              onClick={() => setCurrentView('public_store')}
              className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-600/30 cursor-pointer hover:bg-blue-500 transition"
            >
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  onClick={() => setCurrentView('public_store')}
                  className="text-sm sm:text-base font-bold tracking-tight text-white cursor-pointer hover:text-blue-400 transition"
                >
                  {APP_NAME}
                </span>
                <span className="text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full hidden sm:inline">
                  SaaS Multi-Tenant
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden md:block">{APP_TAGLINE}</p>
            </div>
          </div>

          {/* Selector de Vistas Principales */}
          <nav className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              id="nav-btn-public"
              onClick={() => setCurrentView('public_store')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                currentView === 'public_store'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <StoreIcon className="w-3.5 h-3.5" />
              <span>Tienda Pública</span>
            </button>

            <button
              id="nav-btn-store-admin"
              onClick={() => setCurrentView('store_admin')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                currentView === 'store_admin'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Panel de Comercio</span>
            </button>

            <button
              id="nav-btn-superadmin"
              onClick={() => setCurrentView('super_admin')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                currentView === 'super_admin'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>SuperAdmin SaaS</span>
            </button>
          </nav>

          {/* Selector de Comercio y Perfil de Usuario */}
          <div className="flex items-center gap-3">
            {/* Selector de Comercio Activo */}
            <div className="hidden lg:flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedStoreSlug}
                onChange={(e) => setSelectedStoreSlug(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.slug} className="bg-slate-900 text-white">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector de Rol / Sesión Demo */}
            {user ? (
              <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs">
                <div className="text-right hidden sm:block">
                  <p className="font-semibold text-white">{user.name}</p>
                  <p className="text-[10px] text-slate-400">{user.role}</p>
                </div>
                <button
                  id="btn-logout"
                  onClick={logout}
                  className="px-2 py-0.5 bg-rose-500/20 text-rose-300 hover:bg-rose-600 hover:text-white rounded text-[11px] font-medium transition"
                >
                  Salir
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {demoUsers.slice(0, 3).map((u) => (
                  <button
                    key={u.id}
                    id={`btn-login-${u.id}`}
                    onClick={() => handleSelectUser(u.email)}
                    className="px-2 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition"
                  >
                    {u.role === 'SUPERADMIN' ? 'SuperAdmin' : u.storeName?.split(' ')[0] || u.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* VISTAS CONDICIONALES */}
      <main className="flex-1 flex flex-col">
        {/* 1. Vista Tienda Pública */}
        {currentView === 'public_store' && activeStoreData && (
          <PublicStore
            store={activeStoreData.store}
            categories={activeStoreData.categories}
            products={activeStoreData.products}
            onOrderCreated={() => {
              // Se puede actualizar la lista de pedidos si el usuario luego navega al panel
            }}
          />
        )}

        {/* 2. Vista Panel del Comercio */}
        {currentView === 'store_admin' && activeStoreData && (
          <StoreAdminDashboard
            store={activeStoreData.store}
            onStoreUpdated={loadInitialData}
            onOpenStorePublic={() => handleOpenStorePublic(activeStoreData.store.slug)}
          />
        )}

        {/* 3. Vista Panel SuperAdmin */}
        {currentView === 'super_admin' && (
          <SuperAdminDashboard
            onSelectStore={handleAdministerStore}
            onOpenStorePublic={handleOpenStorePublic}
          />
        )}
      </main>

      {/* Footer Global */}
      <footer className="border-t border-slate-800 bg-slate-900 py-4 text-center text-xs text-slate-500">
        <p>
          {APP_NAME} &copy; 2026 — Plataforma SaaS Multi-Tenant. 0% IA en producto • Pagos directos vía Mercado Pago OAuth.
        </p>
      </footer>
    </div>
  );
}
