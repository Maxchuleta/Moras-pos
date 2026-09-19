'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type DetallePedido = {
  id: number;
  producto_id: number;
  variante: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  notas: string | null;

  productos: {
    nombre: string;
  } | null;
};

type Pedido = {
  id: number;
  numero: number | null;
  fecha: string;
  estado: string;
  metodo_pago: string;
  total: number;
  notas: string | null;
  detalle_pedido: DetallePedido[];
};

export default function Pedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [actualizando, setActualizando] =
    useState<number | null>(null);

  useEffect(() => {
    cargarPedidos();

    const canal = supabase
      .channel('pedidos-tiempo-real')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pedidos',
        },
        () => {
          cargarPedidos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  async function cargarPedidos() {
    setError('');

    const { data, error } = await supabase
      .from('pedidos')
      .select(`
        id,
        numero,
        fecha,
        estado,
        metodo_pago,
        total,
        notas,
        detalle_pedido (
          id,
          producto_id,
          variante,
          cantidad,
          precio_unitario,
          subtotal,
          notas,
          productos (
            nombre
          )
        )
      `)
      .in('estado', [
        'pendiente',
        'preparando',
        'listo',
      ])
      .order('fecha', {
        ascending: true,
      });

    if (error) {
      console.error(
        'Error al cargar pedidos:',
        error
      );

      setError(
        'No se pudieron cargar los pedidos: ' +
          error.message
      );

      setCargando(false);
      return;
    }

    setPedidos(
      (data ?? []) as unknown as Pedido[]
    );

    setCargando(false);
  }

  async function cambiarEstado(
    pedidoId: number,
    nuevoEstado: string
  ) {
    if (actualizando !== null) return;

    setActualizando(pedidoId);

    const { error } = await supabase
      .from('pedidos')
      .update({
        estado: nuevoEstado,
      })
      .eq('id', pedidoId);

    if (error) {
      console.error(
        'Error al cambiar estado:',
        error
      );

      alert(
        'No se pudo cambiar el estado: ' +
          error.message
      );

      setActualizando(null);
      return;
    }

    // Si se entrega, quitarlo de preparación
    if (nuevoEstado === 'entregado') {
      setPedidos((actuales) =>
        actuales.filter(
          (pedido) =>
            pedido.id !== pedidoId
        )
      );
    } else {
      setPedidos((actuales) =>
        actuales.map((pedido) =>
          pedido.id === pedidoId
            ? {
                ...pedido,
                estado: nuevoEstado,
              }
            : pedido
        )
      );
    }

    setActualizando(null);
  }

  function colorEstado(estado: string) {
    if (estado === 'preparando') {
      return {
        fondo: '#dceeff',
        texto: '#1769aa',
        borde: '#3b8ed0',
      };
    }

    if (estado === 'listo') {
      return {
        fondo: '#dff5e4',
        texto: '#287a3e',
        borde: '#45a85d',
      };
    }

    return {
      fondo: '#fff0c9',
      texto: '#8a6412',
      borde: '#d6a72c',
    };
  }

  function textoEstado(estado: string) {
    if (estado === 'preparando') {
      return 'PREPARANDO';
    }

    if (estado === 'listo') {
      return 'LISTO';
    }

    return 'PENDIENTE';
  }

  function formatearHora(fecha: string) {
    if (!fecha) return '';

    return new Date(fecha).toLocaleTimeString(
      'es-MX',
      {
        hour: '2-digit',
        minute: '2-digit',
      }
    );
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#fff7fb',
        padding: '20px',
        fontFamily: 'Arial, sans-serif',
        color: '#2d1724',
      }}
    >
      <header
        style={{
          marginBottom: '25px',
        }}
      >
        <h1
          style={{
            color: '#9c2864',
            fontSize: '38px',
            margin: 0,
          }}
        >
          MORAS
        </h1>

        <p
          style={{
            marginTop: '5px',
            fontSize: '18px',
          }}
        >
          Preparación de pedidos
        </p>
      </header>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          gap: '15px',
        }}
      >
        <h2
          style={{
            margin: 0,
          }}
        >
          Pedidos
        </h2>

        <button
          onClick={cargarPedidos}
          style={{
            border: 'none',
            background: '#f2dce8',
            color: '#8b1e5a',
            padding: '12px 16px',
            borderRadius: '10px',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Actualizar
        </button>
      </div>

      {cargando &&
        pedidos.length === 0 && (
          <p>Cargando pedidos...</p>
        )}

      {error && (
        <div
          style={{
            background: '#ffe5e5',
            color: '#a40000',
            padding: '15px',
            borderRadius: '12px',
            marginBottom: '20px',
          }}
        >
          {error}
        </div>
      )}

      {!cargando &&
        !error &&
        pedidos.length === 0 && (
          <div
            style={{
              background: 'white',
              padding: '35px',
              borderRadius: '16px',
              textAlign: 'center',
              color: '#777',
              boxShadow:
                '0 3px 12px rgba(0,0,0,0.08)',
            }}
          >
            No hay pedidos por preparar.
          </div>
        )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '18px',
        }}
      >
        {pedidos.map((pedido) => {
          const colores =
            colorEstado(pedido.estado);

          return (
            <article
              key={pedido.id}
              style={{
                background: 'white',
                borderRadius: '16px',
                padding: '20px',
                boxShadow:
                  '0 3px 12px rgba(0,0,0,0.08)',
                borderTop: `6px solid ${colores.borde}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '18px',
                  gap: '10px',
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                    }}
                  >
                    Pedido #
                    {pedido.numero ??
                      pedido.id}
                  </h2>

                  <div
                    style={{
                      color: '#777',
                      marginTop: '5px',
                    }}
                  >
                    {formatearHora(
                      pedido.fecha
                    )}
                  </div>
                </div>

                <span
                  style={{
                    background:
                      colores.fondo,
                    color:
                      colores.texto,
                    padding: '7px 10px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                  }}
                >
                  {textoEstado(
                    pedido.estado
                  )}
                </span>
              </div>

              {pedido.detalle_pedido.map(
                (detalle) => (
                  <div
                    key={detalle.id}
                    style={{
                      padding: '13px 0',
                      borderBottom:
                        '1px solid #eee',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '18px',
                      }}
                    >
                      <strong>
                        {detalle.cantidad} ×{' '}
                        {detalle.productos
                          ?.nombre ??
                          'Producto'}
                      </strong>
                    </div>

                    {detalle.variante &&
                      detalle.variante !==
                        'Único' && (
                        <div
                          style={{
                            marginTop: '4px',
                            color: '#555',
                          }}
                        >
                          {
                            detalle.variante
                          }
                        </div>
                      )}

                    {detalle.notas && (
                      <div
                        style={{
                          marginTop: '8px',
                          background:
                            '#fff1f6',
                          color:
                            '#8b1e5a',
                          padding: '10px',
                          borderRadius:
                            '8px',
                          fontWeight:
                            'bold',
                        }}
                      >
                        Nota:{' '}
                        {detalle.notas}
                      </div>
                    )}
                  </div>
                )
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  marginTop: '18px',
                  fontSize: '20px',
                }}
              >
                <strong>Total</strong>

                <strong>
                  $
                  {Number(
                    pedido.total
                  )}
                </strong>
              </div>

              {/* PENDIENTE */}
              {pedido.estado ===
                'pendiente' && (
                <button
                  onClick={() =>
                    cambiarEstado(
                      pedido.id,
                      'preparando'
                    )
                  }
                  disabled={
                    actualizando ===
                    pedido.id
                  }
                  style={{
                    ...botonAccion,
                    background:
                      actualizando ===
                      pedido.id
                        ? '#ccc'
                        : '#9c2864',
                  }}
                >
                  {actualizando ===
                  pedido.id
                    ? 'Actualizando...'
                    : 'Empezar pedido'}
                </button>
              )}

              {/* PREPARANDO */}
              {pedido.estado ===
                'preparando' && (
                <button
                  onClick={() =>
                    cambiarEstado(
                      pedido.id,
                      'listo'
                    )
                  }
                  disabled={
                    actualizando ===
                    pedido.id
                  }
                  style={{
                    ...botonAccion,
                    background:
                      actualizando ===
                      pedido.id
                        ? '#ccc'
                        : '#287a3e',
                  }}
                >
                  {actualizando ===
                  pedido.id
                    ? 'Actualizando...'
                    : 'Marcar como listo'}
                </button>
              )}

              {/* LISTO */}
              {pedido.estado ===
                'listo' && (
                <>
                  <div
                    style={{
                      marginTop: '18px',
                      background:
                        '#dff5e4',
                      color: '#287a3e',
                      padding: '15px',
                      borderRadius: '10px',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      fontSize: '17px',
                    }}
                  >
                    Pedido listo
                  </div>

                  <button
                    onClick={() =>
                      cambiarEstado(
                        pedido.id,
                        'entregado'
                      )
                    }
                    disabled={
                      actualizando ===
                      pedido.id
                    }
                    style={{
                      ...botonAccion,
                      background:
                        actualizando ===
                        pedido.id
                          ? '#ccc'
                          : '#2d1724',
                    }}
                  >
                    {actualizando ===
                    pedido.id
                      ? 'Entregando...'
                      : 'Entregar pedido'}
                  </button>
                </>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}

const botonAccion = {
  width: '100%',
  padding: '15px',
  marginTop: '18px',
  border: 'none',
  borderRadius: '10px',
  color: 'white',
  fontSize: '16px',
  fontWeight: 'bold',
  cursor: 'pointer',
};