'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Producto = {
  id: number;
  nombre: string;
  opciones: {
    nombre: string;
    precio: number;
  }[];
};

type ItemCarrito = {
  productoId: number;
  nombre: string;
  variante: string;
  precio: number;
  cantidad: number;
  notas: string;
};

type MetodoPago = 'efectivo' | 'transferencia' | '';

export default function Home() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  const [pantallaPago, setPantallaPago] = useState(false);
  const [metodoPago, setMetodoPago] =
    useState<MetodoPago>('');

  const [recibido, setRecibido] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarProductos();
  }, []);

  async function cargarProductos() {
    setCargando(true);
    setError('');

    const { data, error } = await supabase
      .from('productos')
      .select(`
        id,
        nombre,
        activo,
        variantes (
          nombre,
          precio,
          activo
        )
      `)
      .eq('activo', true)
      .order('id');

    if (error) {
      console.error('Error al cargar productos:', error);

      setError(
        'No se pudieron cargar los productos: ' +
          error.message
      );

      setCargando(false);
      return;
    }

    const productosFormateados: Producto[] =
      (data ?? []).map((producto: any) => ({
        id: producto.id,
        nombre: producto.nombre,

        opciones: (producto.variantes ?? [])
          .filter(
            (variante: any) => variante.activo
          )
          .map((variante: any) => ({
            nombre: variante.nombre,
            precio: Number(variante.precio),
          })),
      }));

    setProductos(productosFormateados);
    setCargando(false);
  }

  function agregar(
    productoId: number,
    nombre: string,
    variante: string,
    precio: number
  ) {
    setCarrito((actual) => {
      const existe = actual.find(
        (item) =>
          item.productoId === productoId &&
          item.variante === variante
      );

      if (existe) {
        return actual.map((item) =>
          item.productoId === productoId &&
          item.variante === variante
            ? {
                ...item,
                cantidad: item.cantidad + 1,
              }
            : item
        );
      }

      return [
        ...actual,
        {
          productoId,
          nombre,
          variante,
          precio,
          cantidad: 1,
          notas: '',
        },
      ];
    });
  }

  function cambiarCantidad(
    productoId: number,
    variante: string,
    cambio: number
  ) {
    setCarrito((actual) =>
      actual
        .map((item) =>
          item.productoId === productoId &&
          item.variante === variante
            ? {
                ...item,
                cantidad:
                  item.cantidad + cambio,
              }
            : item
        )
        .filter((item) => item.cantidad > 0)
    );
  }

  function cambiarNota(
    productoId: number,
    variante: string,
    nota: string
  ) {
    setCarrito((actual) =>
      actual.map((item) =>
        item.productoId === productoId &&
        item.variante === variante
          ? {
              ...item,
              notas: nota,
            }
          : item
      )
    );
  }

  const total = carrito.reduce(
    (suma, item) =>
      suma + item.precio * item.cantidad,
    0
  );

  const cantidadRecibida =
    Number(recibido) || 0;

  const cambio =
    cantidadRecibida > total
      ? cantidadRecibida - total
      : 0;

  function continuarPedido() {
    if (carrito.length === 0) return;

    setPantallaPago(true);
    setMetodoPago('');
    setRecibido('');
  }

  function volverPedido() {
    setPantallaPago(false);
    setMetodoPago('');
    setRecibido('');
  }

  async function registrarPago() {
    if (guardando) return;

    if (!metodoPago) {
      alert('Selecciona un método de pago.');
      return;
    }

    if (
      metodoPago === 'efectivo' &&
      cantidadRecibida < total
    ) {
      alert(
        'La cantidad recibida es menor al total.'
      );
      return;
    }

    setGuardando(true);

    // 1. Crear pedido
    const { data: pedido, error: errorPedido } =
      await supabase
        .from('pedidos')
        .insert({
          estado: 'pendiente',
          metodo_pago: metodoPago,
          total: total,
          notas: null,
        })
        .select()
        .single();

    if (errorPedido) {
      console.error(
        'Error al crear pedido:',
        errorPedido
      );

      alert(
        'Error al crear pedido: ' +
          errorPedido.message
      );

      setGuardando(false);
      return;
    }

    // 2. Preparar productos
    const detalles = carrito.map((item) => ({
      pedido_id: pedido.id,
      producto_id: item.productoId,
      variante: item.variante,
      cantidad: item.cantidad,
      precio_unitario: item.precio,
      subtotal:
        item.precio * item.cantidad,
      notas:
        item.notas.trim() === ''
          ? null
          : item.notas.trim(),
    }));

    // 3. Guardar detalle
    const { error: errorDetalles } =
      await supabase
        .from('detalle_pedido')
        .insert(detalles);

    if (errorDetalles) {
      console.error(
        'Error al guardar productos:',
        errorDetalles
      );

      alert(
        'El pedido se creó, pero hubo un error al guardar los productos: ' +
          errorDetalles.message
      );

      setGuardando(false);
      return;
    }

    alert(
      metodoPago === 'efectivo'
        ? `Venta registrada. Cambio: $${cambio}`
        : 'Transferencia registrada correctamente.'
    );

    // Preparar siguiente venta
    setCarrito([]);
    setPantallaPago(false);
    setMetodoPago('');
    setRecibido('');
    setGuardando(false);
  }

  // PANTALLA DE COBRO
  if (pantallaPago) {
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

          <p style={{ marginTop: '5px' }}>
            Cobrar pedido
          </p>
        </header>

        <section style={tarjeta}>
          <h2>Resumen</h2>

          {carrito.map((item) => (
            <div
              key={`${item.productoId}-${item.variante}`}
              style={{
                borderBottom:
                  '1px solid #eee',
                padding: '14px 0',
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
                    {item.nombre}
                  </strong>

                  {item.variante !==
                    'Único' && (
                    <div>
                      {item.variante}
                    </div>
                  )}

                  <div>
                    {item.cantidad} × $
                    {item.precio}
                  </div>
                </div>

                <strong>
                  $
                  {item.precio *
                    item.cantidad}
                </strong>
              </div>

              {item.notas && (
                <div
                  style={{
                    marginTop: '8px',
                    color: '#8b1e5a',
                  }}
                >
                  Nota: {item.notas}
                </div>
              )}
            </div>
          ))}

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
            <strong>${total}</strong>
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
                <strong>Cambio</strong>

                <strong>
                  ${cambio}
                </strong>
              </div>

              {recibido !== '' &&
                cantidadRecibida <
                  total && (
                  <p
                    style={{
                      color: '#b00020',
                      fontWeight:
                        'bold',
                    }}
                  >
                    Faltan $
                    {total -
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
                ${total}
              </strong>
            </div>
          )}

          <button
            onClick={registrarPago}
            disabled={
              guardando ||
              !metodoPago ||
              (metodoPago ===
                'efectivo' &&
                cantidadRecibida <
                  total)
            }
            style={{
              width: '100%',
              padding: '18px',
              marginTop: '25px',
              border: 'none',
              borderRadius: '12px',

              background:
                guardando ||
                !metodoPago ||
                (metodoPago ===
                  'efectivo' &&
                  cantidadRecibida <
                    total)
                  ? '#ccc'
                  : '#9c2864',

              color: 'white',
              fontSize: '18px',
              fontWeight: 'bold',
            }}
          >
            {guardando
              ? 'Registrando...'
              : 'Registrar pago'}
          </button>

          <button
            onClick={volverPedido}
            disabled={guardando}
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
            Volver al pedido
          </button>
        </section>
      </main>
    );
  }

  // PANTALLA DE NUEVA VENTA
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

        <p style={{ marginTop: '5px' }}>
          Nueva venta
        </p>
      </header>

      <h2>Productos</h2>

      {cargando && (
        <p>
          Cargando productos...
        </p>
      )}

      {error && (
        <div
          style={{
            background: '#ffe5e5',
            color: '#a40000',
            padding: '15px',
            borderRadius: '10px',
            marginBottom: '15px',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '15px',
        }}
      >
        {productos.map(
          (producto) => (
            <div
              key={producto.id}
              style={tarjeta}
            >
              <h3
                style={{
                  marginTop: 0,
                }}
              >
                {producto.nombre}
              </h3>

              {producto.opciones.map(
                (opcion) => (
                  <button
                    key={
                      opcion.nombre
                    }
                    onClick={() =>
                      agregar(
                        producto.id,
                        producto.nombre,
                        opcion.nombre,
                        opcion.precio
                      )
                    }
                    style={{
                      width: '100%',
                      padding: '14px',
                      marginBottom:
                        '8px',
                      border: 'none',
                      borderRadius:
                        '10px',
                      background:
                        '#9c2864',
                      color: 'white',
                      fontSize: '16px',
                      cursor:
                        'pointer',
                    }}
                  >
                    {opcion.nombre ===
                    'Único'
                      ? `$${opcion.precio}`
                      : `${opcion.nombre} · $${opcion.precio}`}
                  </button>
                )
              )}
            </div>
          )
        )}
      </div>

      <section style={tarjetaPedido}>
        <h2>Pedido</h2>

        {carrito.length === 0 && (
          <p
            style={{
              color: '#777',
            }}
          >
            Todavía no has agregado
            productos.
          </p>
        )}

        {carrito.map((item) => (
          <div
            key={`${item.productoId}-${item.variante}`}
            style={{
              padding: '15px 0',
              borderBottom:
                '1px solid #eee',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div>
                <strong>
                  {item.nombre}
                </strong>

                {item.variante !==
                  'Único' && (
                  <div>
                    {item.variante}
                  </div>
                )}

                <div>
                  ${item.precio} c/u
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems:
                    'center',
                  gap: '10px',
                }}
              >
                <button
                  onClick={() =>
                    cambiarCantidad(
                      item.productoId,
                      item.variante,
                      -1
                    )
                  }
                  style={
                    botonCantidad
                  }
                >
                  −
                </button>

                <strong>
                  {item.cantidad}
                </strong>

                <button
                  onClick={() =>
                    cambiarCantidad(
                      item.productoId,
                      item.variante,
                      1
                    )
                  }
                  style={
                    botonCantidad
                  }
                >
                  +
                </button>

                <strong>
                  $
                  {item.precio *
                    item.cantidad}
                </strong>
              </div>
            </div>

            <input
              type="text"
              value={item.notas}
              onChange={(e) =>
                cambiarNota(
                  item.productoId,
                  item.variante,
                  e.target.value
                )
              }
              placeholder="Nota del producto (opcional)"
              style={{
                ...campo,
                marginTop: '12px',
              }}
            />
          </div>
        ))}

        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            marginTop: '20px',
            fontSize: '26px',
          }}
        >
          <strong>Total</strong>
          <strong>${total}</strong>
        </div>

        <button
          onClick={continuarPedido}
          disabled={
            carrito.length === 0
          }
          style={{
            width: '100%',
            padding: '18px',
            marginTop: '20px',
            border: 'none',
            borderRadius: '12px',

            background:
              carrito.length === 0
                ? '#ccc'
                : '#9c2864',

            color: 'white',
            fontSize: '18px',
            fontWeight: 'bold',
          }}
        >
          Continuar pedido
        </button>
      </section>
    </main>
  );
}

const estiloPrincipal = {
  minHeight: '100vh',
  background: '#fff7fb',
  padding: '20px',
  fontFamily: 'Arial, sans-serif',
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
};

const tarjetaPedido = {
  background: 'white',
  marginTop: '30px',
  padding: '20px',
  borderRadius: '16px',
  boxShadow:
    '0 3px 12px rgba(0,0,0,0.08)',
};

const botonCantidad = {
  width: '38px',
  height: '38px',
  border: 'none',
  borderRadius: '10px',
  background: '#f2dce8',
  color: '#8b1e5a',
  fontSize: '22px',
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
  border:
    '1px solid #ddd',
  borderRadius: '10px',
  fontSize: '16px',
};