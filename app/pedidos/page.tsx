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
  metodo_pago: string | null;
  total: number;
  notas: string | null;
  nombre_cliente: string | null;
  detalle_pedido: DetallePedido[];
};

type MetodoPago =
  | 'efectivo'
  | 'transferencia'
  | '';

export default function Pedidos() {
  const [pedidos, setPedidos] =
    useState<Pedido[]>([]);

  const [cargando, setCargando] =
    useState(true);

  const [error, setError] =
    useState('');

  const [actualizando, setActualizando] =
    useState<number | null>(null);

  const [cancelando, setCancelando] =
    useState<number | null>(null);

  // Pedido que se está cobrando
  const [pedidoCobro, setPedidoCobro] =
    useState<Pedido | null>(null);

  const [metodoPago, setMetodoPago] =
    useState<MetodoPago>('');

  const [recibido, setRecibido] =
    useState('');

  const [cobrando, setCobrando] =
    useState(false);

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
        nombre_cliente,
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
    if (
      actualizando !== null ||
      cancelando !== null
    ) {
      return;
    }

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

    setActualizando(null);
  }

  async function cancelarPedido(
    pedido: Pedido
  ) {
    if (
      cancelando !== null ||
      actualizando !== null
    ) {
      return;
    }

    const numero =
      pedido.numero ?? pedido.id;

    const nombre =
      pedido.nombre_cliente?.trim();

    const mensaje = nombre
      ? `¿Seguro que quieres cancelar el Pedido #${numero} de ${nombre}?\n\nLos números de los pedidos posteriores se recorrerán automáticamente.`
      : `¿Seguro que quieres cancelar el Pedido #${numero}?\n\nLos números de los pedidos posteriores se recorrerán automáticamente.`;

    const confirmar =
      window.confirm(mensaje);

    if (!confirmar) {
      return;
    }

    setCancelando(pedido.id);

    const { error } = await supabase.rpc(
      'cancelar_pedido_y_recorrer',
      {
        p_pedido_id: pedido.id,
      }
    );

    if (error) {
      console.error(
        'Error al cancelar pedido:',
        error
      );

      alert(
        'No se pudo cancelar el pedido: ' +
          error.message
      );

      setCancelando(null);
      return;
    }

    await cargarPedidos();

    setCancelando(null);

    alert(
      `Pedido #${numero} cancelado correctamente.`
    );
  }

  function abrirCobro(pedido: Pedido) {
    setPedidoCobro(pedido);
    setMetodoPago('');
    setRecibido('');
  }

  function cancelarCobro() {
    if (cobrando) return;

    setPedidoCobro(null);
    setMetodoPago('');
    setRecibido('');
  }

  const cantidadRecibida =
    Number(recibido) || 0;

  const totalCobro = pedidoCobro
    ? Number(pedidoCobro.total)
    : 0;

  const cambio =
    cantidadRecibida > totalCobro
      ? cantidadRecibida - totalCobro
      : 0;

  async function registrarPago() {
    if (!pedidoCobro || cobrando) return;

    if (!metodoPago) {
      alert(
        'Selecciona un método de pago.'
      );
      return;
    }

    if (
      metodoPago === 'efectivo' &&
      cantidadRecibida < totalCobro
    ) {
      alert(
        'La cantidad recibida es menor al total.'
      );
      return;
    }

    setCobrando(true);

    const { error } = await supabase
      .from('pedidos')
      .update({
        metodo_pago: metodoPago,
        estado: 'entregado',
      })
      .eq('id', pedidoCobro.id)
      .eq('estado', 'listo');

    if (error) {
      console.error(
        'Error al registrar pago:',
        error
      );

      alert(
        'No se pudo registrar el pago: ' +
          error.message
      );

      setCobrando(false);
      return;
    }

    const numero =
      pedidoCobro.numero ??
      pedidoCobro.id;

    alert(
      metodoPago === 'efectivo'
        ? `Pedido #${numero} cobrado. Cambio: $${cambio}`
        : `Pedido #${numero} cobrado por transferencia.`
    );

    setPedidos((actuales) =>
      actuales.filter(
        (pedido) =>
          pedido.id !== pedidoCobro.id
      )
    );

    setPedidoCobro(null);
    setMetodoPago('');
    setRecibido('');
    setCobrando(false);
  }

  function colorEstado(
    estado: string
  ) {
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

  function textoEstado(
    estado: string
  ) {
    if (estado === 'preparando') {
      return 'PREPARANDO';
    }

    if (estado === 'listo') {
      return 'LISTO';
    }

    return 'PENDIENTE';
  }

  function formatearHora(
    fecha: string
  ) {
    if (!fecha) return '';

    return new Date(
      fecha
    ).toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // PANTALLA DE COBRO
  if (pedidoCobro) {
    return (
      <main style={estiloPrincipal}>
        <header
          style={{
            marginBottom: '25px',
          }}
        >
          <h1 style={tituloMoras}>
            MORAS
          </h1>

          <p
            style={{
              marginTop: '5px',
              fontSize: '18px',
            }}
          >
            Entregar y cobrar
          </p>
        </header>

        <section style={tarjeta}>
          <h2
            style={{
              marginBottom: '5px',
            }}
          >
            Pedido #
            {pedidoCobro.numero ??
              pedidoCobro.id}
          </h2>

          {pedidoCobro.nombre_cliente && (
            <div
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#8b1e5a',
                marginBottom: '18px',
              }}
            >
              {
                pedidoCobro.nombre_cliente
              }
            </div>
          )}

          {pedidoCobro.detalle_pedido.map(
            (detalle) => (
              <div
                key={detalle.id}
                style={{
                  padding: '14px 0',
                  borderBottom:
                    '1px solid #eee',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent:
                      'space-between',
                    gap: '15px',
                  }}
                >
                  <div>
                    <strong>
                      {detalle.cantidad} ×{' '}
                      {detalle.productos
                        ?.nombre ??
                        'Producto'}
                    </strong>

                    {detalle.variante &&
                      detalle.variante !==
                        'Único' &&
                      detalle.variante !==
                        'Normal' && (
                        <div
                          style={{
                            marginTop:
                              '4px',
                          }}
                        >
                          {
                            detalle.variante
                          }
                        </div>
                      )}
                  </div>

                  <strong>
                    $
                    {Number(
                      detalle.subtotal
                    )}
                  </strong>
                </div>

                {detalle.notas && (
                  <div
                    style={{
                      marginTop: '8px',
                      color: '#8b1e5a',
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
              fontSize: '30px',
              marginTop: '22px',
            }}
          >
            <strong>TOTAL</strong>

            <strong>
              ${totalCobro}
            </strong>
          </div>
        </section>

        <section style={tarjeta}>
          <h2>¿Cómo pagará?</h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                '1fr 1fr',
              gap: '12px',
            }}
          >
            <button
              onClick={() => {
                setMetodoPago(
                  'efectivo'
                );
                setRecibido('');
              }}
              style={{
                ...botonPago,
                background:
                  metodoPago ===
                  'efectivo'
                    ? '#9c2864'
                    : '#f2dce8',

                color:
                  metodoPago ===
                  'efectivo'
                    ? 'white'
                    : '#8b1e5a',
              }}
            >
              Efectivo
            </button>

            <button
              onClick={() => {
                setMetodoPago(
                  'transferencia'
                );
                setRecibido('');
              }}
              style={{
                ...botonPago,
                background:
                  metodoPago ===
                  'transferencia'
                    ? '#9c2864'
                    : '#f2dce8',

                color:
                  metodoPago ===
                  'transferencia'
                    ? 'white'
                    : '#8b1e5a',
              }}
            >
              Transferencia
            </button>
          </div>

          {metodoPago ===
            'efectivo' && (
            <div
              style={{
                marginTop: '25px',
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontWeight: 'bold',
                  marginBottom: '8px',
                }}
              >
                Cantidad recibida
              </label>

              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={recibido}
                onChange={(e) =>
                  setRecibido(
                    e.target.value
                  )
                }
                placeholder="Ej. 300"
                style={campo}
              />

              <div
                style={{
                  marginTop: '20px',
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  fontSize: '25px',
                }}
              >
                <strong>
                  Cambio
                </strong>

                <strong>
                  ${cambio}
                </strong>
              </div>

              {recibido !== '' &&
                cantidadRecibida <
                  totalCobro && (
                  <p
                    style={{
                      color:
                        '#b00020',
                      fontWeight:
                        'bold',
                    }}
                  >
                    Faltan $
                    {totalCobro -
                      cantidadRecibida}
                  </p>
                )}
            </div>
          )}

          {metodoPago ===
            'transferencia' && (
            <div
              style={{
                marginTop: '25px',
                padding: '15px',
                background: '#fff7fb',
                borderRadius: '12px',
              }}
            >
              Total a transferir:{' '}
              <strong>
                ${totalCobro}
              </strong>
            </div>
          )}

          <button
            onClick={registrarPago}
            disabled={
              cobrando ||
              !metodoPago ||
              (metodoPago ===
                'efectivo' &&
                cantidadRecibida <
                  totalCobro)
            }
            style={{
              width: '100%',
              padding: '18px',
              marginTop: '25px',
              border: 'none',
              borderRadius: '12px',

              background:
                cobrando ||
                !metodoPago ||
                (metodoPago ===
                  'efectivo' &&
                  cantidadRecibida <
                    totalCobro)
                  ? '#ccc'
                  : '#9c2864',

              color: 'white',
              fontSize: '18px',
              fontWeight: 'bold',
            }}
          >
            {cobrando
              ? 'Registrando...'
              : 'Confirmar pago y entregar'}
          </button>

          <button
            onClick={cancelarCobro}
            disabled={cobrando}
            style={{
              width: '100%',
              padding: '15px',
              marginTop: '10px',
              border:
                '1px solid #9c2864',
              borderRadius: '12px',
              background: 'white',
              color: '#9c2864',
              fontSize: '16px',
              fontWeight: 'bold',
            }}
          >
            Volver a pedidos
          </button>
        </section>
      </main>
    );
  }

  // PANTALLA DE PEDIDOS
  return (
    <main style={estiloPrincipal}>
      <header
        style={{
          marginBottom: '25px',
        }}
      >
        <h1 style={tituloMoras}>
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
          justifyContent:
            'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          gap: '15px',
        }}
      >
        <h2 style={{ margin: 0 }}>
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
          <p>
            Cargando pedidos...
          </p>
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
            No hay pedidos activos.
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
            colorEstado(
              pedido.estado
            );

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
                  alignItems:
                    'flex-start',
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

                  {pedido.nombre_cliente && (
                    <div
                      style={{
                        color:
                          '#8b1e5a',
                        marginTop:
                          '5px',
                        fontSize:
                          '18px',
                        fontWeight:
                          'bold',
                      }}
                    >
                      {
                        pedido.nombre_cliente
                      }
                    </div>
                  )}

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
                    padding:
                      '7px 10px',
                    borderRadius:
                      '20px',
                    fontSize: '13px',
                    fontWeight:
                      'bold',
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
                      padding:
                        '13px 0',
                      borderBottom:
                        '1px solid #eee',
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          '18px',
                      }}
                    >
                      <strong>
                        {detalle.cantidad}{' '}
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
                              '#555',
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
                          marginTop:
                            '8px',
                          background:
                            '#fff1f6',
                          color:
                            '#8b1e5a',
                          padding:
                            '10px',
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
                <strong>
                  Total
                </strong>

                <strong>
                  $
                  {Number(
                    pedido.total
                  )}
                </strong>
              </div>

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
                      pedido.id ||
                    cancelando ===
                      pedido.id
                  }
                  style={{
                    ...botonAccion,

                    background:
                      actualizando ===
                        pedido.id ||
                      cancelando ===
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
                      pedido.id ||
                    cancelando ===
                      pedido.id
                  }
                  style={{
                    ...botonAccion,

                    background:
                      actualizando ===
                        pedido.id ||
                      cancelando ===
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

              {pedido.estado ===
                'listo' && (
                <>
                  <div
                    style={{
                      marginTop:
                        '18px',
                      background:
                        '#dff5e4',
                      color:
                        '#287a3e',
                      padding:
                        '15px',
                      borderRadius:
                        '10px',
                      textAlign:
                        'center',
                      fontWeight:
                        'bold',
                      fontSize:
                        '17px',
                    }}
                  >
                    Pedido listo para
                    entregar
                  </div>

                  <button
                    onClick={() =>
                      abrirCobro(
                        pedido
                      )
                    }
                    disabled={
                      cancelando ===
                      pedido.id
                    }
                    style={{
                      ...botonAccion,

                      background:
                        cancelando ===
                        pedido.id
                          ? '#ccc'
                          : '#2d1724',
                    }}
                  >
                    Entregar y cobrar
                  </button>
                </>
              )}

              <button
                onClick={() =>
                  cancelarPedido(
                    pedido
                  )
                }
                disabled={
                  cancelando ===
                    pedido.id ||
                  actualizando ===
                    pedido.id
                }
                style={{
                  ...botonCancelar,

                  background:
                    cancelando ===
                      pedido.id
                      ? '#eee'
                      : 'white',

                  color:
                    cancelando ===
                      pedido.id
                      ? '#999'
                      : '#b00020',
                }}
              >
                {cancelando ===
                pedido.id
                  ? 'Cancelando...'
                  : 'Cancelar pedido'}
              </button>
            </article>
          );
        })}
      </div>
    </main>
  );
}

const estiloPrincipal = {
  minHeight: '100vh',
  background: '#fff7fb',
  padding: '20px',
  fontFamily:
    'Arial, sans-serif',
  color: '#2d1724',
};

const tituloMoras = {
  color: '#9c2864',
  fontSize: '38px',
  margin: 0,
};

const tarjeta = {
  background: 'white',
  padding: '18px',
  borderRadius: '16px',
  boxShadow:
    '0 3px 12px rgba(0,0,0,0.08)',
  marginBottom: '20px',
};

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

const botonCancelar = {
  width: '100%',
  padding: '13px',
  marginTop: '10px',
  border:
    '1px solid #b00020',
  borderRadius: '10px',
  fontSize: '15px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

const botonPago = {
  padding: '18px',
  border: 'none',
  borderRadius: '12px',
  fontSize: '17px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

const campo = {
  width: '100%',
  boxSizing:
    'border-box' as const,
  padding: '14px',
  border: '1px solid #ddd',
  borderRadius: '10px',
  fontSize: '16px',
};