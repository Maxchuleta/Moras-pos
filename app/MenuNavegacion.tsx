'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MenuNavegacion() {
  const pathname = usePathname();

  const opciones = [
    {
      nombre: 'Venta',
      icono: '🛒',
      ruta: '/',
    },
    {
      nombre: 'Pedidos',
      icono: '🍓',
      ruta: '/pedidos',
    },
    {
      nombre: 'Historial',
      icono: '📋',
      ruta: '/historial',
    },
    {
      nombre: 'Caja',
      icono: '💰',
      ruta: '/caja',
    },
  ];

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '72px',
        background: 'white',
        borderTop: '1px solid #ead8e2',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        alignItems: 'center',
        zIndex: 9999,
        boxShadow: '0 -3px 12px rgba(0,0,0,0.08)',
      }}
    >
      {opciones.map((opcion) => {
        const activo =
          opcion.ruta === '/'
            ? pathname === '/'
            : pathname.startsWith(opcion.ruta);

        return (
          <Link
            key={opcion.ruta}
            href={opcion.ruta}
            style={{
              textDecoration: 'none',
              color: activo ? '#9c2864' : '#777',
              background: activo ? '#fff1f6' : 'transparent',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '4px',
              height: '100%',
              fontSize: '12px',
              fontWeight: activo ? 'bold' : 'normal',
              transition: '0.2s',
            }}
          >
            <span
              style={{
                fontSize: '23px',
                lineHeight: 1,
              }}
            >
              {opcion.icono}
            </span>

            <span>{opcion.nombre}</span>
          </Link>
        );
      })}
    </nav>
  );
}