/**
 * SuperAdmin Dashboard Component
 * Panel maestro para el operador de la plataforma SaaS "Paginas Web Ventas Online".
 */

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  ShieldCheck,
  TrendingUp,
  Plus,
  RefreshCw,
  ShoppingBag,
  DollarSign,
  Lock,
  ExternalLink,
  Ban,
  CheckCircle2,
  XCircle,
  Play,
  Layers,
  Search,
  X,
  Clock,
  Terminal,
} from 'lucide-react';
import { Store, Subscription, User } from '../types/index.ts';
import { formatCurrency, formatDate } from '../utils/format.ts';
import { api } from '../services/api.ts';

interface SuperAdminDashboardProps {
  onSelectStore: (store: Store) => void;
  onOpenStorePublic: (slug: string) => void;
}

interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  results: Array<{
    id: number;
    name: string;
    category: string;
    passed: boolean;
    error?: string;
    durationMs: number;
  }>;
}

export function SuperAdminDashboard({ onSelectStore, onOpenStorePublic }: SuperAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'stores' | 'subscriptions' | 'security' | 'tests'>('stores');
  
  const [stores, setStores] = useState<Array<Store & { productsCount: number; ordersCount: number; adminEmail: string | null }>>([]);
  const [stats, setStats] = useState<{
    totalStores: number;
    activeStores: number;
    suspendedStores: number;
    totalOrders: number;
    totalSales: number;
    totalProducts: number;
    totalUsers: number;
  } | null>(null);
  const [subscriptionsData, setSubscriptionsData] = useState<{
    subscriptions: Array<Subscription & { storeName: string; storeSlug: string; storeStatus: string }>;
    mrr: number;
    totalSubscribers: number;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewStoreModalOpen, setIsNewStoreModalOpen] = useState(false);

  // Formulario nuevo comercio
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreSlug, setNewStoreSlug] = useState('');
  const [newStoreEmail, setNewStoreEmail] = useState('');
  const [newStorePhone, setNewStorePhone] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newStoreColor, setNewStoreColor] = useState('#2563eb');

  const [msgSuccess, setMsgSuccess] = useState<string | null>(null);
  const [msgError, setMsgError] = useState<string | null>(null);

  // Test Suite State
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testSummary, setTestSummary] = useState<TestRunSummary | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [statsRes, storesRes, subsRes] = await Promise.all([
        api.getAdminStats(),
        api.getAdminStores(),
        api.getAdminSubscriptions(),
      ]);

      setStats(statsRes);
      setStores(storesRes);
      setSubscriptionsData(subsRes);
    } catch (err: unknown) {
      console.error('Error cargando datos de SuperAdmin:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const notify = (msg: string, isErr = false) => {
    if (isErr) {
      setMsgError(msg);
      setMsgSuccess(null);
    } else {
      setMsgSuccess(msg);
      setMsgError(null);
    }
    setTimeout(() => {
      setMsgSuccess(null);
      setMsgError(null);
    }, 4000);
  };

  const handleRunTests = async () => {
    try {
      setIsRunningTests(true);
      const res = await api.runAutomatedTests();
      setTestSummary(res);
      if (res.failed === 0) {
        notify(`¡Todos los ${res.total} tests pasaron con éxito!`);
      } else {
        notify(`Atención: ${res.failed} de ${res.total} tests fallaron`, true);
      }
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error ejecutando tests', true);
    } finally {
      setIsRunningTests(false);
    }
  };

  // Crear nuevo comercio (Tenant)
  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createStore({
        name: newStoreName.trim(),
        slug: newStoreSlug.trim() || newStoreName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        email: newStoreEmail.trim(),
        phone: newStorePhone.trim() || undefined,
        adminName: newAdminName.trim() || 'Administrador',
        adminEmail: newAdminEmail.trim() || newStoreEmail.trim(),
        primaryColor: newStoreColor,
      });

      notify('Nuevo comercio aprovisionado exitosamente con aislamiento multi-tenant.');
      setIsNewStoreModalOpen(false);
      setNewStoreName('');
      setNewStoreSlug('');
      setNewStoreEmail('');
      setNewAdminEmail('');
      loadData();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error creando comercio', true);
    }
  };

  // Cambiar estado de comercio
  const handleToggleStoreStatus = async (storeId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVO' ? 'SUSPENDIDO' : 'ACTIVO';
    try {
      await api.updateStoreStatus(storeId, nextStatus);
      notify(`Comercio actualizado a estado "${nextStatus}".`);
      loadData();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error cambiando estado de comercio', true);
    }
  };

  const filteredStores = stores.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.adminEmail && s.adminEmail.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Cabecera SuperAdmin */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">Paginas Web Ventas Online</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Panel SuperAdmin SaaS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Control de comercios (tenants), suscripciones mensuales fijas y testing automatizado.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer"
              title="Refrescar datos"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              id="btn-new-store"
              onClick={() => setIsNewStoreModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Aprovisionar Comercio</span>
            </button>
          </div>
        </div>

        {/* Notificaciones */}
        {msgSuccess && (
          <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 text-center text-xs text-emerald-300 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{msgSuccess}</span>
          </div>
        )}
        {msgError && (
          <div className="bg-rose-500/10 border-b border-rose-500/20 px-4 py-2 text-center text-xs text-rose-300 flex items-center justify-center gap-2">
            <span>{msgError}</span>
          </div>
        )}

        {/* Pestañas SuperAdmin */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-2 pt-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('stores')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'stores'
                ? 'border-blue-500 text-blue-400 bg-slate-800/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Comercios y Tenants ({stores.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'subscriptions'
                ? 'border-blue-500 text-blue-400 bg-slate-800/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Suscripciones SaaS (MRR: {formatCurrency(subscriptionsData?.mrr || 0)})</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'security'
                ? 'border-blue-500 text-blue-400 bg-slate-800/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Arquitectura y Seguridad</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('tests');
              if (!testSummary && !isRunningTests) {
                handleRunTests();
              }
            }}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'tests'
                ? 'border-emerald-500 text-emerald-400 bg-slate-800/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Test Suite Automatizado (25 Tests)</span>
          </button>
        </div>
      </div>

      {/* Contenido Principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">
        
        {/* Tarjetas de Métricas Globales */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Comercios Totales</span>
            <p className="text-2xl font-extrabold text-white">{stats?.totalStores || 0}</p>
            <span className="text-[10px] text-emerald-400">{stats?.activeStores || 0} activos</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ingreso Mensual Recurrente (MRR)</span>
            <p className="text-2xl font-extrabold text-blue-400">{formatCurrency(subscriptionsData?.mrr || 0)}</p>
            <span className="text-[10px] text-slate-400">Cuotas fijas SaaS</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Volumen Transaccionado (GMV)</span>
            <p className="text-2xl font-extrabold text-white">{formatCurrency(stats?.totalSales || 0)}</p>
            <span className="text-[10px] text-emerald-400">100% cobrado por comercios</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Productos</span>
            <p className="text-2xl font-extrabold text-white">{stats?.totalProducts || 0}</p>
            <span className="text-[10px] text-slate-400">En {stats?.totalStores || 0} tiendas</span>
          </div>
        </div>

        {/* ==========================================
            1. PESTAÑA: COMERCIOS (TENANTS)
            ========================================== */}
        {activeTab === 'stores' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, slug o email de admin..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[10px]">
                    <tr>
                      <th className="p-4">Comercio</th>
                      <th className="p-4">Slug / URL</th>
                      <th className="p-4">Administrador</th>
                      <th className="p-4">Catálogo</th>
                      <th className="p-4">Mercado Pago</th>
                      <th className="p-4">Estado</th>
                      <th className="p-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredStores.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs shrink-0"
                              style={{ backgroundColor: st.primaryColor || '#2563eb' }}
                            >
                              {st.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-white">{st.name}</p>
                              <span className="text-[10px] text-slate-400 font-mono">{st.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-mono text-slate-300">
                          /tienda/{st.slug}
                        </td>
                        <td className="p-4 text-slate-300">
                          <p className="text-white">{st.adminEmail || 'No asignado'}</p>
                          <span className="text-[10px] text-slate-400">{st.phone || 'Sin teléfono'}</span>
                        </td>
                        <td className="p-4 text-slate-300">
                          <span className="font-semibold text-white">{st.productsCount}</span> productos •{' '}
                          <span className="font-semibold text-white">{st.ordersCount}</span> órdenes
                        </td>
                        <td className="p-4">
                          {st.mercadoPagoConnected ? (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                              Vinculado
                            </span>
                          ) : (
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                              No Conectado
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              st.status === 'ACTIVO'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {st.status}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => onSelectStore(st)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
                          >
                            Administrar
                          </button>
                          <button
                            onClick={() => onOpenStorePublic(st.slug)}
                            className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
                            title="Ver Tienda Pública"
                          >
                            <ExternalLink className="w-3.5 h-3.5 inline" />
                          </button>
                          <button
                            onClick={() => handleToggleStoreStatus(st.id, st.status)}
                            className={`p-1 rounded transition cursor-pointer ${
                              st.status === 'ACTIVO'
                                ? 'text-rose-400 hover:bg-rose-500/10'
                                : 'text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                            title={st.status === 'ACTIVO' ? 'Suspender Tienda' : 'Activar Tienda'}
                          >
                            <Ban className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            2. PESTAÑA: SUSCRIPCIONES SAAS
            ========================================== */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white">Suscripciones Fijas Mensuales</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                La plataforma opera bajo el modelo de suscripción mensual fija por comercio. No se cobran comisiones variables sobre las ventas de los clientes.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Comercios Suscriptos</span>
                  <p className="text-xl font-bold text-white mt-1">{subscriptionsData?.totalSubscribers || 0}</p>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Precio Promedio de Suscripción</span>
                  <p className="text-xl font-bold text-blue-400 mt-1">$15.000 ARS / mes</p>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Comisión por Venta</span>
                  <p className="text-xl font-bold text-emerald-400 mt-1">0.00% (Estricto)</p>
                </div>
              </div>
            </div>

            {/* Listado de Suscripciones */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[10px]">
                  <tr>
                    <th className="p-4">Comercio</th>
                    <th className="p-4">Plan</th>
                    <th className="p-4">Monto Mensual</th>
                    <th className="p-4">Comisión Ventas</th>
                    <th className="p-4">Próximo Vencimiento</th>
                    <th className="p-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {subscriptionsData?.subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-800/30">
                      <td className="p-4 font-bold text-white">{sub.storeName}</td>
                      <td className="p-4 text-slate-300">{sub.planName}</td>
                      <td className="p-4 font-bold text-white">{formatCurrency(sub.amount)}</td>
                      <td className="p-4 font-semibold text-emerald-400">{sub.commissionRate}%</td>
                      <td className="p-4 text-slate-300">{formatDate(sub.currentPeriodEnd)}</td>
                      <td className="p-4">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {sub.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==========================================
            3. PESTAÑA: SEGURIDAD Y ARQUITECTURA
            ========================================== */}
        {activeTab === 'security' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <ShieldCheck className="w-5 h-5" />
                <span>Aislamiento Criptográfico Multi-Tenant</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Cada consulta al catálogo, pedidos, clientes y pagos está rígidamente aislada mediante el middleware <code className="text-blue-400">enforceTenantIsolation</code>. Un comercio no puede acceder ni consultar datos de ningún otro comercio.
              </p>
              <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4 pt-2">
                <li>Access Tokens y Refresh Tokens encriptados con AES-256-GCM.</li>
                <li>Firma criptográfica HMAC-SHA256 para verificación de Webhooks.</li>
                <li>Manejo idempotente de notificaciones de pago contra eventos duplicados.</li>
              </ul>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>0% Inteligencia Artificial (100% Determinista)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                La plataforma opera íntegramente mediante arquitectura web tradicional en TypeScript, Express y PostgreSQL/Prisma.
              </p>
              <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4 pt-2">
                <li>Sin chatbots ni agentes en el frontend o backend.</li>
                <li>Sin llamadas a modelos de lenguaje o generación de contenidos.</li>
                <li>Rendimiento predecible y costos fijos de infraestructura.</li>
              </ul>
            </div>
          </div>
        )}

        {/* ==========================================
            4. PESTAÑA: TEST SUITE AUTOMATIZADO (25 TESTS)
            ========================================== */}
        {activeTab === 'tests' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-white">Suite de Pruebas Automatizadas (25 Casos)</h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Ejecución end-to-end de autenticación, aislamiento multi-tenant, seguridad criptográfica, checkout, Mercado Pago y webhooks.
                </p>
              </div>

              <button
                onClick={handleRunTests}
                disabled={isRunningTests}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg transition cursor-pointer shrink-0"
              >
                {isRunningTests ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>{isRunningTests ? 'Ejecutando 25 Tests...' : 'Re-ejecutar Tests'}</span>
              </button>
            </div>

            {testSummary && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Total de Pruebas</span>
                  <p className="text-2xl font-bold text-white mt-1">{testSummary.total}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <span className="text-[10px] text-emerald-400 font-semibold uppercase">Pruebas Exitosas</span>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">{testSummary.passed}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <span className="text-[10px] text-rose-400 font-semibold uppercase">Pruebas Fallidas</span>
                  <p className={`text-2xl font-bold mt-1 ${testSummary.failed === 0 ? 'text-slate-500' : 'text-rose-400'}`}>
                    {testSummary.failed}
                  </p>
                </div>
              </div>
            )}

            {/* Listado de Resultados */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-xs">
                <span className="font-bold text-white">Desglose de Escenarios Evaluados</span>
                {testSummary && (
                  <span className="text-[11px] text-slate-400">
                    Completado en {testSummary.results.reduce((a, b) => a + b.durationMs, 0)}ms
                  </span>
                )}
              </div>

              <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto">
                {testSummary?.results.map((r) => (
                  <div key={r.id} className="p-3.5 flex items-start justify-between gap-4 text-xs hover:bg-slate-800/20">
                    <div className="flex items-start gap-3">
                      {r.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-500">#{String(r.id).padStart(2, '0')}</span>
                          <span className="text-slate-200 font-medium">{r.name}</span>
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {r.category}
                          </span>
                        </div>
                        {r.error && (
                          <p className="text-[11px] text-rose-400 mt-1 font-mono bg-rose-950/30 p-2 rounded border border-rose-900/50">
                            Error: {r.error}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {r.durationMs}ms
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          r.passed
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {r.passed ? 'PASSED' : 'FAILED'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MODAL CREAR NUEVO COMERCIO */}
      {isNewStoreModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full my-8 p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h4 className="text-base font-bold text-white">Aprovisionar Nuevo Comercio (Tenant)</h4>
              <button
                onClick={() => setIsNewStoreModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStore} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-medium">Nombre Comercial *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Zapatería Central"
                  value={newStoreName}
                  onChange={(e) => {
                    setNewStoreName(e.target.value);
                    if (!newStoreSlug) {
                      setNewStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">Slug de URL Pública *</label>
                <input
                  type="text"
                  required
                  placeholder="zapateria-central"
                  value={newStoreSlug}
                  onChange={(e) => setNewStoreSlug(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Email del Comercio *</label>
                  <input
                    type="email"
                    required
                    placeholder="contacto@zapateria.com"
                    value={newStoreEmail}
                    onChange={(e) => {
                      setNewStoreEmail(e.target.value);
                      if (!newAdminEmail) setNewAdminEmail(e.target.value);
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Teléfono</label>
                  <input
                    type="text"
                    placeholder="+54 11 4444-5555"
                    value={newStorePhone}
                    onChange={(e) => setNewStorePhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Nombre del Administrador</label>
                  <input
                    type="text"
                    placeholder="Carlos Gómez"
                    value={newAdminName}
                    onChange={(e) => setNewAdminName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Email de Acceso Admin *</label>
                  <input
                    type="email"
                    required
                    placeholder="carlos@zapateria.com"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">Color de Marca</label>
                <input
                  type="color"
                  value={newStoreColor}
                  onChange={(e) => setNewStoreColor(e.target.value)}
                  className="w-10 h-8 rounded border border-slate-800 cursor-pointer bg-slate-950"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewStoreModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl cursor-pointer"
                >
                  Crear y Aprovisionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
