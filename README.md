# Paginas Web Ventas Online - Plataforma SaaS E-commerce Multi-Tenant

Plataforma web profesional para la creación y gestión de tiendas online independientes con arquitectura multi-tenant aislada, panel SuperAdmin, panel para administradores de comercio y catálogo público para clientes.

---

## 1. Arquitectura del Sistema

- **Frontend**: React 19 + TypeScript (Strict Mode) + Tailwind CSS + Lucide Icons.
- **Backend**: Node.js + Express 4.21 (arquitectura full-stack unificada en puerto 3000).
- **Multi-Tenancy**: Aislamiento estricto por `storeId` validado en middlewares de backend.
- **Base de Datos**: Modelado relacional para **PostgreSQL** mediante **Prisma ORM** (`/prisma/schema.prisma`).
- **Pagos**: Arquitectura preparada para **Mercado Pago Multi-Vendedor (OAuth por comercio)**, generación de preferencias de pago con access tokens del vendedor y confirmación por Webhooks.
- **Regla Estricta**: 0% Inteligencia Artificial en el producto (sin chatbots, sin APIs generativas).

---

## 2. Estructura del Proyecto

```text
├── prisma/
│   └── schema.prisma         # Esquema relacional para PostgreSQL (13 entidades)
├── server/
│   ├── auth/                 # Lógica de sesiones y tokens
│   ├── db/                   # Repositorio de datos y semillas demo aisladas
│   ├── middleware/           # Aislamiento multi-tenant, seguridad y autenticación
│   ├── payments/             # Adaptador de Mercado Pago (OAuth, Checkout, Webhooks)
│   └── routes/               # Endpoints REST (/api/auth, /api/stores, /api/catalog, /api/orders, /api/payments, /api/admin)
├── src/
│   ├── components/           # Componentes UI modulares
│   ├── hooks/                # Hooks personalizados de React (useAuth, etc.)
│   ├── layouts/              # Plantillas de layout (Admin, Tienda pública)
│   ├── lib/                  # Constantes y utilidades base
│   ├── pages/                # Vistas de la aplicación
│   ├── services/             # Cliente API HTTP tipado
│   ├── store/                # Estado global y de carrito
│   ├── types/                # Modelos y tipos TypeScript estrictos
│   └── utils/                # Formateadores de moneda y fechas
├── .env.example              # Declaración segura de variables de entorno
├── metadata.json
├── package.json
├── server.ts                 # Entry point del servidor Express + Vite
└── tsconfig.json             # Configuración TypeScript con modo estricto
```

---

## 3. Modelo de Datos (PostgreSQL + Prisma)

1. `User`: Cuentas con roles `SUPERADMIN`, `ADMIN_COMERCIO` y `CLIENTE`.
2. `Store`: Cada comercio o tenant (`id`, `slug`, `status`, colores, datos de contacto).
3. `StoreSettings`: Costos de envío, mínimos de compra, retiro en local, transferencia bancaria.
4. `MercadoPagoConnection`: Tokens encriptados del vendedor vinculados mediante OAuth.
5. `Category`: Categorías de productos aisladas por `storeId`.
6. `Product`: Productos con SKU, precio actual, precio anterior, stock y stock mínimo por `storeId`.
7. `Customer`: Datos del comprador.
8. `Address`: Direcciones de entrega.
9. `Order`: Pedidos con número único por tienda, estados y congelamiento histórico.
10. `OrderItem`: Items comprados con el precio congelado al momento del pedido.
11. `Payment`: Entidad independiente para registrar intentos, métodos y confirmaciones de pago.
12. `Promotion`: Promociones fijas o porcentuales por tienda.
13. `AuditLog`: Registro de auditoría y trazabilidad de acciones críticas.

---

## 4. Roles y Seguridad

| Rol | Alcance | Permisos Principales |
|---|---|---|
| **SUPERADMIN** | Plataforma Global | Crear comercios, suspender/activar tiendas, ver métricas globales. |
| **ADMIN_COMERCIO** | `storeId` exclusivo | Gestionar su catálogo, stock, pedidos y conectar su cuenta de Mercado Pago. |
| **CLIENTE** | Tienda pública | Navegar catálogo, agregar al carrito y realizar pedidos. |

---

## 5. Variables de Entorno (.env.example)

```env
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000
DATABASE_URL="postgresql://postgres:postgres_password@localhost:5432/paginas_web_ventas_online?schema=public"
JWT_SECRET="clave_secreta_jwt"
ENCRYPTION_KEY="clave_32_bytes_para_tokens_oauth"
MP_APP_CLIENT_ID="MERCADO_PAGO_CLIENT_ID"
MP_APP_CLIENT_SECRET="MERCADO_PAGO_CLIENT_SECRET"
MP_OAUTH_REDIRECT_URI="http://localhost:3000/api/payments/mercadopago/oauth/callback"
MP_WEBHOOK_SECRET="MERCADO_PAGO_WEBHOOK_SECRET"
```

---

## 6. Comandos de Ejecución

- **Desarrollo**: `npm run dev`
- **Verificación de Tipos**: `npm run lint`
- **Compilación de Producción**: `npm run build`
- **Inicio en Producción**: `npm start`
