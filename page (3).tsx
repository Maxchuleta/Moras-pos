'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

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
  metodo_pago: string | null;
  total: number;
  notas: string | null;
  detalle_pedido: DetallePedido[];
};

type Filtro =
  | 'hoy'
  | 'semana'
  | 'todos';

export default function Historial() {
  const [pedidos, setPedidos] =
    useState<Pedido[]>([]);

  const [cargando, setCargando] =
    useState(true);

  const [error, setError] =
    useState('');

  const [filtro, setFiltro] =
    useState<Filtro>('hoy');

  // Administración
  const [mostrarAdmin, setMostrarAdmin] =
    useState(false);

  const [pin, setPin] =
    useState('');

  const [eliminando, setEliminando] =
    useState(false);

  const [mensajeAdmin, setMensajeAdmin] =
    useState('');

  const [errorAdmin, setErrorAdmin] =
    useState('');

  useEffect(() => {
    cargarHistorial();

    const canal = supabase
      .channel('historial-tiempo-real')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pedidos',
        },
        () => {
          cargarHistorial(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  async function cargarHistorial(
    mostrarCarga = true
  ) {
    if (mostrarCarga) {
      setCargando(true);
    }

    setError('');

    const { data, error } =
      await supabase
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
        .eq(
          'estado',
          'entregado'
        )
        .order('fecha', {
          ascending: false,
        });

    if (error) {
      console.error(
        'Error al cargar historial:',
        error
      );

      setError(
        'No se pudo cargar el historial: ' +
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

  // ==========================
  // ELIMINAR SEMANA ANTERIOR
  // ==========================

  async function eliminarHistorialAnterior() {
    if (eliminando) {
      return;
    }

    if (pin.trim() === '') {
      setErrorAdmin(
        'Escribe la contraseña administrativa.'
      );
      return;
    }

    const confirmar =
      window.confirm(
        '¿Seguro que quieres eliminar las ventas entregadas del fin de semana anterior?\n\nEsta acción es permanente y no se puede deshacer.'
      );

    if (!confirmar) {
      return;
    }

    setEliminando(true);
    setMensajeAdmin('');
    setErrorAdmin('');

    try {
      const respuesta = await fetch(
        '/api/admin/eliminar-historial',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            pin: pin.trim(),
          }),
        }
      );

      const resultado =
        await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          resultado.error ??
            'No se pudo eliminar el historial.'
        );
      }

      setMensajeAdmin(
        resultado.mensaje ??
          'Historial eliminado correctamente.'
      );

      setPin('');

      await cargarHistorial(false);
    } catch (error) {
      console.error(
        'Error al eliminar historial:',
        error
      );

      setErrorAdmin(
        error instanceof Error
          ? error.message
          : 'No se pudo eliminar el historial.'
      );
    } finally {
      setEliminando(false);
    }
  }

  // ==========================
  // FILTROS
  // ==========================

  const pedidosFiltrados =
    useMemo(() => {
      const ahora = new Date();

      return pedidos.filter(
        (pedido) => {
          const fechaPedido =
            new Date(
              pedido.fecha
            );

          if (
            filtro === 'todos'
          ) {
            return true;
          }

          if (
            filtro === 'hoy'
          ) {
            return (
              fechaPedido.getFullYear() ===
                ahora.getFullYear() &&
              fechaPedido.getMonth() ===
                ahora.getMonth() &&
              fechaPedido.getDate() ===
                ahora.getDate()
            );
          }

          if (
            filtro === 'semana'
          ) {
            const inicioSemana =
              new Date(ahora);

            const dia =
              inicioSemana.getDay();

            const diferencia =
              dia === 0
                ? -6
                : 1 - dia;

            inicioSemana.setDate(
              inicioSemana.getDate() +
                diferencia
            );

            inicioSemana.setHours(
              0,
              0,
              0,
              0
            );

            return (
              fechaPedido >=
              inicioSemana
            );
          }

          return true;
        }
      );
    }, [pedidos, filtro]);

  const totalVendido =
    pedidosFiltrados.reduce(
      (total, pedido) =>
        total +
        Number(
          pedido.total
        ),
      0
    );

  const totalEfectivo =
    pedidosFiltrados
      .filter(
        (pedido) =>
          pedido.metodo_pago ===
          'efectivo'
      )
      .reduce(
        (total, pedido) =>
          total +
          Number(
            pedido.total
          ),
        0
      );

  const totalTransferencia =
    pedidosFiltrados
      .filter(
        (pedido) =>
          pedido.metodo_pago ===
          'transferencia'
      )
      .reduce(
        (total, pedido) =>
          total +
          Number(
            pedido.total
          ),
        0
      );

  function formatearFecha(
    fecha: string
  ) {
    return new Date(
      fecha
    ).toLocaleDateString(
      'es-MX',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }
    );
  }

  function formatearHora(
    fecha: string
  ) {
    return new Date(
      fecha
    ).toLocaleTimeString(
      'es-MX',
      {
        hour: '2-digit',
        minute: '2-digit',
      }
    );
  }

  function formatearDinero(
    valor: number
  ) {
    return Number(
      valor
    ).toLocaleString(
      'es-MX',
      {
        style: 'currency',
        currency: 'MXN',
      }
    );
  }

  function nombreMetodo(
    metodo: string | null
  ) {
    if (
      metodo === 'efectivo'
    ) {
      return 'Efectivo';
    }

    if (
      metodo ===
      'transferencia'
    ) {
      return 'Transferencia';
    }

    return metodo ?? '';
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#fff7fb',
        padding: '20px',
        fontFamily:
          'Arial, sans-serif',
        color: '#2d1724',
      }}
    >
      {/* ENCABEZADO */}

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
          Historial de ventas
        </p>
      </header>

      {/* FILTROS */}

      <div
        style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          marginBottom: '20px',
        }}
      >
        <button
          onClick={() =>
            setFiltro('hoy')
          }
          style={botonFiltro(
            filtro === 'hoy'
          )}
        >
          Hoy
        </button>

        <button
          onClick={() =>
            setFiltro('semana')
          }
          style={botonFiltro(
            filtro ===
              'semana'
          )}
        >
          Esta semana
        </button>

        <button
          onClick={() =>
            setFiltro('todos')
          }
          style={botonFiltro(
            filtro ===
              'todos'
          )}
        >
          Todos
        </button>

        <button
          onClick={() =>
            cargarHistorial()
          }
          style={{
            padding:
              '11px 16px',
            borderRadius:
              '10px',
            border: 'none',
            background:
              '#f2dce8',
            color: '#8b1e5a',
            fontWeight:
              'bold',
            cursor: 'pointer',
          }}
        >
          Actualizar
        </button>
      </div>

      {/* RESUMEN */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginBottom:
            '25px',
        }}
      >
        <TarjetaResumen
          titulo="Ventas"
          valor={String(
            pedidosFiltrados.length
          )}
        />

        <TarjetaResumen
          titulo="Total vendido"
          valor={formatearDinero(
            totalVendido
          )}
        />

        <TarjetaResumen
          titulo="Efectivo"
          valor={formatearDinero(
            totalEfectivo
          )}
        />

        <TarjetaResumen
          titulo="Transferencias"
          valor={formatearDinero(
            totalTransferencia
          )}
        />
      </div>

      {cargando && (
        <p>
          Cargando historial...
        </p>
      )}

      {error && (
        <div
          style={{
            background:
              '#ffe5e5',
            color: '#a40000',
            padding: '15px',
            borderRadius:
              '12px',
            marginBottom:
              '20px',
          }}
        >
          {error}
        </div>
      )}

      {!cargando &&
        !error &&
        pedidosFiltrados.length ===
          0 && (
          <div
            style={{
              background:
                'white',
              padding: '35px',
              borderRadius:
                '16px',
              textAlign:
                'center',
              color: '#777',
              boxShadow:
                '0 3px 12px rgba(0,0,0,0.08)',
            }}
          >
            No hay ventas en
            este periodo.
          </div>
        )}

      {/* LISTA */}

      <div
        style={{
          display: 'grid',
          gap: '15px',
        }}
      >
        {pedidosFiltrados.map(
          (pedido) => (
            <article
              key={pedido.id}
              style={{
                background:
                  'white',
                borderRadius:
                  '16px',
                padding: '20px',
                boxShadow:
                  '0 3px 12px rgba(0,0,0,0.08)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  alignItems:
                    'flex-start',
                  gap: '15px',
                  marginBottom:
                    '15px',
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize:
                        '21px',
                    }}
                  >
                    Pedido #
                    {pedido.numero ??
                      pedido.id}
                  </h2>

                  <div
                    style={{
                      marginTop:
                        '5px',
                      color: '#777',
                    }}
                  >
                    {formatearFecha(
                      pedido.fecha
                    )}{' '}
                    ·{' '}
                    {formatearHora(
                      pedido.fecha
                    )}
                  </div>
                </div>

                <div
                  style={{
                    textAlign:
                      'right',
                  }}
                >
                  <strong
                    style={{
                      fontSize:
                        '20px',
                      color:
                        '#9c2864',
                    }}
                  >
                    {formatearDinero(
                      Number(
                        pedido.total
                      )
                    )}
                  </strong>

                  <div
                    style={{
                      marginTop:
                        '5px',
                      color: '#666',
                    }}
                  >
                    {nombreMetodo(
                      pedido.metodo_pago
                    )}
                  </div>
                </div>
              </div>

              {pedido.detalle_pedido.map(
                (detalle) => (
                  <div
                    key={
                      detalle.id
                    }
                    style={{
                      padding:
                        '12px 0',
                      borderTop:
                        '1px solid #eee',
                    }}
                  >
                    <div>
                      <strong>
                        {
                          detalle.cantidad
                        }{' '}
                        ×{' '}
                        {detalle
                          .productos
                          ?.nombre ??
                          'Producto'}
                      </strong>
                    </div>

                    {detalle.variante &&
                      detalle.variante !==
                        'Único' &&
                      detalle.variante !==
                        'Normal' && (
                        <div
                          style={{
                            marginTop:
                              '4px',
                            color:
                              '#666',
                          }}
                        >
                          {
                            detalle.variante
                          }
                        </div>
                      )}

                    <div
                      style={{
                        marginTop:
                          '4px',
                        color: '#777',
                        fontSize:
                          '14px',
                      }}
                    >
                      {formatearDinero(
                        Number(
                          detalle.precio_unitario
                        )
                      )}{' '}
                      c/u
                    </div>

                    {detalle.notas && (
                      <div
                        style={{
                          marginTop:
                            '7px',
                          background:
                            '#fff1f6',
                          color:
                            '#8b1e5a',
                          padding:
                            '8px 10px',
                          borderRadius:
                            '8px',
                        }}
                      >
                        Nota:{' '}
                        {
                          detalle.notas
                        }
                      </div>
                    )}
                  </div>
                )
              )}

              <div
                style={{
                  marginTop:
                    '15px',
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  alignItems:
                    'center',
                  gap: '10px',
                }}
              >
                <span
                  style={{
                    background:
                      '#dff5e4',
                    color:
                      '#287a3e',
                    padding:
                      '7px 11px',
                    borderRadius:
                      '20px',
                    fontSize:
                      '13px',
                    fontWeight:
                      'bold',
                  }}
                >
                  ENTREGADO
                </span>

                <strong>
                  Total:{' '}
                  {formatearDinero(
                    Number(
                      pedido.total
                    )
                  )}
                </strong>
              </div>
            </article>
          )
        )}
      </div>

      {/* ADMINISTRACIÓN */}

      <section
        style={{
          background: 'white',
          marginTop: '35px',
          padding: '20px',
          borderRadius: '16px',
          boxShadow:
            '0 3px 12px rgba(0,0,0,0.08)',
        }}
      >
        <h2
          style={{
            marginTop: 0,
          }}
        >
          Administración del historial
        </h2>

        <p
          style={{
            color: '#666',
            lineHeight: 1.5,
          }}
        >
          Esta opción permite
          eliminar las ventas
          entregadas del fin de
          semana anterior.
        </p>

        {!mostrarAdmin ? (
          <button
            onClick={() => {
              setMostrarAdmin(
                true
              );

              setMensajeAdmin(
                ''
              );

              setErrorAdmin('');
            }}
            style={{
              width: '100%',
              padding: '14px',
              border:
                '1px solid #b00020',
              borderRadius:
                '10px',
              background:
                'white',
              color: '#b00020',
              fontSize:
                '16px',
              fontWeight:
                'bold',
              cursor:
                'pointer',
            }}
          >
            Eliminar semana
            anterior
          </button>
        ) : (
          <div
            style={{
              marginTop:
                '15px',
            }}
          >
            <label
              style={{
                display:
                  'block',
                fontWeight:
                  'bold',
                marginBottom:
                  '8px',
              }}
            >
              Contraseña
              administrativa
            </label>

            <input
              type="password"
              value={pin}
              onChange={(e) =>
                setPin(
                  e.target.value
                )
              }
              placeholder="Contraseña"
              autoComplete="off"
              style={{
                width: '100%',
                boxSizing:
                  'border-box',
                padding:
                  '14px',
                border:
                  '1px solid #ddd',
                borderRadius:
                  '10px',
                fontSize:
                  '17px',
              }}
            />

            {errorAdmin && (
              <div
                style={{
                  marginTop:
                    '12px',
                  padding:
                    '12px',
                  background:
                    '#ffe5e5',
                  color:
                    '#a40000',
                  borderRadius:
                    '9px',
                }}
              >
                {errorAdmin}
              </div>
            )}

            {mensajeAdmin && (
              <div
                style={{
                  marginTop:
                    '12px',
                  padding:
                    '12px',
                  background:
                    '#dff5e4',
                  color:
                    '#287a3e',
                  borderRadius:
                    '9px',
                }}
              >
                {mensajeAdmin}
              </div>
            )}

            <button
              onClick={
                eliminarHistorialAnterior
              }
              disabled={
                eliminando ||
                pin.trim() ===
                  ''
              }
              style={{
                width: '100%',
                padding:
                  '15px',
                marginTop:
                  '15px',
                border:
                  'none',
                borderRadius:
                  '10px',
                background:
                  eliminando ||
                  pin.trim() ===
                    ''
                    ? '#ccc'
                    : '#b00020',
                color: 'white',
                fontSize:
                  '16px',
                fontWeight:
                  'bold',
                cursor:
                  eliminando
                    ? 'default'
                    : 'pointer',
              }}
            >
              {eliminando
                ? 'Eliminando...'
                : 'Confirmar eliminación'}
            </button>

            <button
              onClick={() => {
                if (
                  eliminando
                )
                  return;

                setMostrarAdmin(
                  false
                );
                setPin('');
                setErrorAdmin(
                  ''
                );
                setMensajeAdmin(
                  ''
                );
              }}
              disabled={
                eliminando
              }
              style={{
                width: '100%',
                padding:
                  '13px',
                marginTop:
                  '9px',
                border:
                  '1px solid #9c2864',
                borderRadius:
                  '10px',
                background:
                  'white',
                color:
                  '#9c2864',
                fontWeight:
                  'bold',
                fontSize:
                  '15px',
                cursor:
                  'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function TarjetaResumen({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <div
      style={{
        background: 'white',
        padding: '17px',
        borderRadius: '14px',
        boxShadow:
          '0 3px 12px rgba(0,0,0,0.07)',
      }}
    >
      <div
        style={{
          color: '#777',
          fontSize: '14px',
          marginBottom: '7px',
        }}
      >
        {titulo}
      </div>

      <strong
        style={{
          fontSize: '21px',
          color: '#2d1724',
        }}
      >
        {valor}
      </strong>
    </div>
  );
}

function botonFiltro(
  activo: boolean
): React.CSSProperties {
  return {
    padding: '11px 17px',
    borderRadius: '10px',
    border: 'none',

    background: activo
      ? '#9c2864'
      : '#f2dce8',

    color: activo
      ? 'white'
      : '#8b1e5a',

    fontWeight: 'bold',
    cursor: 'pointer',
  };
}