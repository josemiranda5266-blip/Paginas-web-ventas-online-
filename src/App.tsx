import React from 'react';

export default function App() {
  return (
    <div id="saas-app-root" className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
          Plataforma SaaS E-commerce
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          Fase 1: Auditoría y arquitectura base inicializada.
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Servidor & Tipos Listos
        </div>
      </div>
    </div>
  );
}
