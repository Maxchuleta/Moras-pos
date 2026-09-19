'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type CierreCaja = {
  id: number;
  fecha_apertura: string;
  fecha_cierre: string | null;
  efectivo_inicial: number;
  ventas_efectivo: number;
  ventas_transferencia: number;
  total_ventas: number;
  efectivo_contado: number | null;
  diferencia: number | null;
};

type Pedido = {
  id: number;
  fecha: string;
  estado: string;
  metodo_pago: string;
  total: number;
};

export default function Caja() {
  const [caja, setCaja] =
    useState<CierreCaja | null>(null);

  const [efectivoInicial, setEfectivoInicial] =
    useState('');

  const [efectivoContado, setEfectivoContado] =
    useState('');

  const [ventasEfectivo, setVentasEfectivo] =
    useState(0);

  const [
    ventasTransferencia,
    setVentasTransferencia,
  ] = useState(0);

  const [cargando, setCargando] =
    useState(true);

  const [procesando, setProcesando] =
    useState(false);

  const [error, setError] = useState('');

  useEffect(() => {
    buscarCajaAbierta();
  }, []);

  useEffect(() => {
    if (!caja) return;

    calcularVentas(caja.fecha_apertura);

    const canal = supabase
      .channel('caja-tiempo-real')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pedidos',
        },
        () => {
          calcularVentas(
            caja.fecha_apertura
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [caja?.id]);

  async function buscarCajaAbierta() {
    setCargando(true);
    setError('');

    const { data, error } = await supabase
      .from('cierres_caja')
      .select('*')
      .is('fecha_cierre', null)
      .order('fecha_apertura', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(error);

      setError(
        'No se pudo consultar la caja: ' +
          error.message
      );

      setCargando(false);
      return;
    }

    if (data) {
      const cajaAbierta =
        data as CierreCaja;

      setCaja(cajaAbierta);

      await calcularVentas(
        cajaAbierta.fecha_apertura
      );
    }

    setCargando(false);
  }

  async function calcularVentas(
    fechaApertura: string
  ) {
    const { data, error } = await supabase
      .from('pedidos')
      .select(
        'id, fecha, estado, metodo_pago, total'
      )
      .gte('fecha', fechaApertura);

    if (error) {
      console.error(error);

      setError(
        'No se pudieron calcular las ventas: ' +
          error.message
      );

      return;
    }

    const pedidos =
      (data ?? []) as Pedido[];

    const efectivo = pedidos
      .filter(
        (pedido) =>
          pedido.metodo_pago ===
          'efectivo'
      )
      .reduce(
        (suma, pedido) =>
          suma + Number(pedido.total),
        0
      );

    const transferencia = pedidos
      .filter(
        (pedido) =>
          pedido.metodo_pago ===
          'transferencia'
      )
      .reduce(
        (suma, pedido) =>
          suma + Number(pedido.total),
        0
      );

    setVentasEfectivo(efectivo);

    setVentasTransferencia(
      transferencia
    );
  }

  async function abrirCaja() {
    if (procesando) return;

    const inicial = Number(
      efectivoInicial
    );

    if (
      efectivoInicial.trim() === '' ||
      Number.isNaN(inicial) ||
      inicial < 0
    ) {
      alert(
        'Ingresa una cantidad válida de efectivo inicial.'
      );

      return;
    }

    setProcesando(true);
    setError('');

    // Revisar nuevamente que no exista
    // una caja abierta.
    const { data: existente, error: errorConsulta } =
      await supabase
        .from('cierres_caja')
        .select('id')
        .is('fecha_cierre', null)
        .limit(1)
        .maybeSingle();

    if (errorConsulta) {
      setError(
        'No se pudo verificar la caja: ' +
          errorConsulta.message
      );

      setProcesando(false);
      return;
    }

    if (existente) {
      alert(
        'Ya existe una caja abierta.'
      );

      setProcesando(false);

      await buscarCajaAbierta();

      return;
    }

    const ahora =
      new Date().toISOString();

    const { data, error } = await supabase
      .from('cierres_caja')
      .insert({
        fecha_apertura: ahora,
        fecha_cierre: null,
        efectivo_inicial: inicial,
        ventas_efectivo: 0,
        ventas_transferencia: 0,
        total_ventas: 0,
        efectivo_contado: null,
        diferencia: null,
      })
      .select()
      .single();

    if (error) {
      console.error(error);

      setError(
        'No se pudo abrir la caja: ' +
          error.message
      );

      setProcesando(false);
      return;
    }

    setCaja(data as CierreCaja);

    setVentasEfectivo(0);
    setVentasTransferencia(0);

    setEfectivoInicial('');

    setProcesando(false);
  }

  async function cerrarCaja() {
    if (!caja || procesando) return;

    const contado = Number(
      efectivoContado
    );

    if (
      efectivoContado.trim() === '' ||
      Number.isNaN(contado) ||
      contado < 0
    ) {
      alert(
        'Ingresa el efectivo contado.'
      );

      return;
    }

    setProcesando(true);
    setError('');

    /*
      Volvemos a calcular las ventas
      justo antes de cerrar.
    */

    const { data, error: errorVentas } =
      await supabase
        .from('pedidos')
        .select(
          'id, fecha, estado, metodo_pago, total'
        )
        .gte(
          'fecha',
          caja.fecha_apertura
        );

    if (errorVentas) {
      setError(
        'No se pudieron calcular las ventas: ' +
          errorVentas.message
      );

      setProcesando(false);
      return;
    }

    const pedidos =
      (data ?? []) as Pedido[];

    const efectivo = pedidos
      .filter(
        (pedido) =>
          pedido.metodo_pago ===
          'efectivo'
      )
      .reduce(
        (suma, pedido) =>
          suma + Number(pedido.total),
        0
      );

    const transferencia = pedidos
      .filter(
        (pedido) =>
          pedido.metodo_pago ===
          'transferencia'
      )
      .reduce(
        (suma, pedido) =>
          suma + Number(pedido.total),
        0
      );

    const total =
      efectivo + transferencia;

    const efectivoEsperado =
      Number(caja.efectivo_inicial) +
      efectivo;

    const diferencia =
      contado - efectivoEsperado;

    const ahora =
      new Date().toISOString();

    const { error } = await supabase
      .from('cierres_caja')
      .update({
        fecha_cierre: ahora,
        ventas_efectivo: efectivo,
        ventas_transferencia:
          transferencia,
        total_ventas: total,
        efectivo_contado: contado,
        diferencia: diferencia,
      })
      .eq('id', caja.id);

    if (error) {
      console.error(error);

      setError(
        'No se pudo cerrar la caja: ' +
          error.message
      );

      setProcesando(false);
      return;
    }

    alert(
      diferencia === 0
        ? 'Caja cerrada correctamente. No hay diferencia.'
        : diferencia > 0
        ? `Caja cerrada. Sobrante: ${formatearDinero(
            diferencia
          )}`
        : `Caja cerrada. Faltante: ${formatearDinero(
            Math.abs(diferencia)
          )}`
    );

    setCaja(null);
    setEfectivoContado('');
    setVentasEfectivo(0);
    setVentasTransferencia(0);

    setProcesando(false);
  }

  function formatearDinero(
    valor: number
  ) {
    return Number(valor).toLocaleString(
      'es-MX',
      {
        style: 'currency',
        currency: 'MXN',
      }
    );
  }

  function formatearFecha(
    fecha: string
  ) {
    return new Date(fecha).toLocaleString(
      'es-MX',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }
    );
  }

  if (cargando) {
    return (
      <main style={pagina}>
        <h1 style={logo}>MORAS</h1>

        <p>Cargando caja...</p>
      </main>
    );
  }

  const efectivoEsperado = caja
    ? Number(caja.efectivo_inicial) +
      ventasEfectivo
    : 0;

  const totalVentas =
    ventasEfectivo +
    ventasTransferencia;

  const contadoTemporal =
    efectivoContado.trim() === ''
      ? null
      : Number(efectivoContado);

  const diferenciaTemporal =
    contadoTemporal === null ||
    Number.isNaN(contadoTemporal)
      ? null
      : contadoTemporal -
        efectivoEsperado;

  return (
    <main style={pagina}>
      <header
        style={{
          marginBottom: '25px',
        }}
      >
        <h1 style={logo}>
          MORAS
        </h1>

        <p
          style={{
            marginTop: '5px',
            fontSize: '18px',
          }}
        >
          Control de caja
        </p>
      </header>

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

      {/* CAJA CERRADA */}

      {!caja && (
        <section style={tarjeta}>
          <div
            style={{
              background: '#f2dce8',
              color: '#8b1e5a',
              display: 'inline-block',
              padding: '7px 12px',
              borderRadius: '20px',
              fontWeight: 'bold',
              marginBottom: '15px',
            }}
          >
            CAJA CERRADA
          </div>

          <h2>
            Abrir caja
          </h2>

          <p
            style={{
              color: '#666',
            }}
          >
            Cuenta el dinero disponible
            antes de comenzar a vender.
          </p>

          <label
            style={etiqueta}
          >
            Efectivo inicial
          </label>

          <div
            style={{
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: '15px',
                top: '14px',
                fontSize: '20px',
                color: '#666',
              }}
            >
              $
            </span>

            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={
                efectivoInicial
              }
              onChange={(e) =>
                setEfectivoInicial(
                  e.target.value
                )
              }
              style={{
                ...input,
                paddingLeft: '35px',
              }}
            />
          </div>

          <button
            onClick={abrirCaja}
            disabled={procesando}
            style={{
              ...botonPrincipal,
              opacity: procesando
                ? 0.6
                : 1,
            }}
          >
            {procesando
              ? 'Abriendo...'
              : 'Abrir caja'}
          </button>
        </section>
      )}

      {/* CAJA ABIERTA */}

      {caja && (
        <>
          <section
            style={{
              ...tarjeta,
              marginBottom: '18px',
            }}
          >
            <div
              style={{
                background: '#dff5e4',
                color: '#287a3e',
                display: 'inline-block',
                padding: '7px 12px',
                borderRadius: '20px',
                fontWeight: 'bold',
              }}
            >
              CAJA ABIERTA
            </div>

            <p
              style={{
                color: '#666',
                marginBottom: 0,
              }}
            >
              Apertura:{' '}
              <strong>
                {formatearFecha(
                  caja.fecha_apertura
                )}
              </strong>
            </p>
          </section>

          {/* RESUMEN */}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            <Resumen
              titulo="Efectivo inicial"
              valor={formatearDinero(
                Number(
                  caja.efectivo_inicial
                )
              )}
            />

            <Resumen
              titulo="Ventas en efectivo"
              valor={formatearDinero(
                ventasEfectivo
              )}
            />

            <Resumen
              titulo="Transferencias"
              valor={formatearDinero(
                ventasTransferencia
              )}
            />

            <Resumen
              titulo="Total vendido"
              valor={formatearDinero(
                totalVentas
              )}
            />
          </div>

          {/* EFECTIVO ESPERADO */}

          <section
            style={{
              ...tarjeta,
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                color: '#666',
                marginBottom: '7px',
              }}
            >
              Efectivo esperado en caja
            </div>

            <strong
              style={{
                fontSize: '32px',
                color: '#9c2864',
              }}
            >
              {formatearDinero(
                efectivoEsperado
              )}
            </strong>

            <div
              style={{
                color: '#777',
                marginTop: '8px',
                fontSize: '14px',
              }}
            >
              Efectivo inicial + ventas
              en efectivo
            </div>
          </section>

          {/* CERRAR */}

          <section style={tarjeta}>
            <h2>
              Cerrar caja
            </h2>

            <p
              style={{
                color: '#666',
              }}
            >
              Cuenta todo el efectivo
              que tienes físicamente.
            </p>

            <label
              style={etiqueta}
            >
              Efectivo contado
            </label>

            <div
              style={{
                position: 'relative',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: '15px',
                  top: '14px',
                  fontSize: '20px',
                  color: '#666',
                }}
              >
                $
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={
                  efectivoContado
                }
                onChange={(e) =>
                  setEfectivoContado(
                    e.target.value
                  )
                }
                style={{
                  ...input,
                  paddingLeft:
                    '35px',
                }}
              />
            </div>

            {diferenciaTemporal !==
              null && (
              <div
                style={{
                  marginTop: '15px',
                  padding: '15px',
                  borderRadius: '10px',

                  background:
                    diferenciaTemporal ===
                    0
                      ? '#dff5e4'
                      : diferenciaTemporal >
                        0
                      ? '#e8f1ff'
                      : '#ffe5e5',

                  color:
                    diferenciaTemporal ===
                    0
                      ? '#287a3e'
                      : diferenciaTemporal >
                        0
                      ? '#1769aa'
                      : '#a40000',

                  fontWeight: 'bold',
                }}
              >
                {diferenciaTemporal ===
                0
                  ? 'Caja exacta'
                  : diferenciaTemporal >
                    0
                  ? `Sobrante: ${formatearDinero(
                      diferenciaTemporal
                    )}`
                  : `Faltante: ${formatearDinero(
                      Math.abs(
                        diferenciaTemporal
                      )
                    )}`}
              </div>
            )}

            <button
              onClick={cerrarCaja}
              disabled={procesando}
              style={{
                ...botonPrincipal,
                background:
                  '#2d1724',
                opacity: procesando
                  ? 0.6
                  : 1,
              }}
            >
              {procesando
                ? 'Cerrando...'
                : 'Cerrar caja'}
            </button>
          </section>
        </>
      )}
    </main>
  );
}

function Resumen({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <div style={tarjeta}>
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
        }}
      >
        {valor}
      </strong>
    </div>
  );
}

const pagina: React.CSSProperties = {
  minHeight: '100vh',
  background: '#fff7fb',
  padding: '20px',
  fontFamily: 'Arial, sans-serif',
  color: '#2d1724',
};

const logo: React.CSSProperties = {
  color: '#9c2864',
  fontSize: '38px',
  margin: 0,
};

const tarjeta: React.CSSProperties = {
  background: 'white',
  padding: '20px',
  borderRadius: '16px',
  boxShadow:
    '0 3px 12px rgba(0,0,0,0.08)',
};

const etiqueta: React.CSSProperties = {
  display: 'block',
  fontWeight: 'bold',
  marginTop: '20px',
  marginBottom: '8px',
};

const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '14px',
  borderRadius: '10px',
  border: '1px solid #ccc',
  fontSize: '18px',
  outline: 'none',
};

const botonPrincipal: React.CSSProperties = {
  width: '100%',
  marginTop: '18px',
  padding: '15px',
  border: 'none',
  borderRadius: '10px',
  background: '#9c2864',
  color: 'white',
  fontSize: '17px',
  fontWeight: 'bold',
  cursor: 'pointer',
};