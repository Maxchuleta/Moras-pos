import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { createClient } from '@supabase/supabase-js';

export async function POST(
  request: NextRequest
) {
  try {
    // 1. Leer la contraseña enviada
    const body = await request.json();

    const pin = String(
      body.pin ?? ''
    );

    // 2. Comprobar que existe
    // la contraseña administrativa
    if (!process.env.ADMIN_PIN) {
      return NextResponse.json(
        {
          error:
            'La contraseña administrativa no está configurada.',
        },
        {
          status: 500,
        }
      );
    }

    // 3. Verificar contraseña
    if (
      pin !== process.env.ADMIN_PIN
    ) {
      return NextResponse.json(
        {
          error:
            'Contraseña incorrecta.',
        },
        {
          status: 401,
        }
      );
    }

    // 4. Obtener datos privados
    // de Supabase
    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const supabaseKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY;

    if (
      !supabaseUrl ||
      !supabaseKey
    ) {
      return NextResponse.json(
        {
          error:
            'Falta configurar Supabase en el servidor.',
        },
        {
          status: 500,
        }
      );
    }

    // 5. Cliente administrativo
    const supabaseAdmin =
      createClient(
        supabaseUrl,
        supabaseKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );

    // 6. Calcular el fin de
    // semana anterior
    const ahora = new Date();

    const hoy = new Date(
      ahora.getFullYear(),
      ahora.getMonth(),
      ahora.getDate()
    );

    const diaSemana =
      hoy.getDay();

    const diasDesdeViernesActual =
      (diaSemana - 5 + 7) % 7;

    const viernesActual =
      new Date(hoy);

    viernesActual.setDate(
      hoy.getDate() -
        diasDesdeViernesActual
    );

    viernesActual.setHours(
      0,
      0,
      0,
      0
    );

    const viernesAnterior =
      new Date(viernesActual);

    viernesAnterior.setDate(
      viernesAnterior.getDate() - 7
    );

    viernesAnterior.setHours(
      0,
      0,
      0,
      0
    );

    // Lunes a las 00:00.
    // Por lo tanto incluye:
    // viernes, sábado y domingo.
    const lunesPosterior =
      new Date(viernesAnterior);

    lunesPosterior.setDate(
      lunesPosterior.getDate() + 3
    );

    lunesPosterior.setHours(
      0,
      0,
      0,
      0
    );

    // 7. Buscar únicamente
    // ventas entregadas
    const {
      data: pedidos,
      error: errorPedidos,
    } = await supabaseAdmin
      .from('pedidos')
      .select('id')
      .eq(
        'estado',
        'entregado'
      )
      .gte(
        'fecha',
        viernesAnterior.toISOString()
      )
      .lt(
        'fecha',
        lunesPosterior.toISOString()
      );

    if (errorPedidos) {
      throw errorPedidos;
    }

    const ids =
      (pedidos ?? []).map(
        (pedido) => pedido.id
      );

    // 8. Si no hay ventas,
    // no eliminamos nada
    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        eliminados: 0,
        mensaje:
          'No había ventas entregadas del fin de semana anterior.',
      });
    }

    // 9. Eliminar primero
    // los detalles
    const {
      error: errorDetalles,
    } = await supabaseAdmin
      .from('detalle_pedido')
      .delete()
      .in(
        'pedido_id',
        ids
      );

    if (errorDetalles) {
      throw errorDetalles;
    }

    // 10. Eliminar los pedidos
    const {
      error:
        errorEliminarPedidos,
    } = await supabaseAdmin
      .from('pedidos')
      .delete()
      .in('id', ids)
      .eq(
        'estado',
        'entregado'
      );

    if (
      errorEliminarPedidos
    ) {
      throw errorEliminarPedidos;
    }

    // 11. Respuesta correcta
    return NextResponse.json({
      ok: true,
      eliminados: ids.length,

      mensaje:
        `Se eliminaron ${ids.length} ventas del historial anterior.`,
    });
  } catch (error) {
    console.error(
      'Error al eliminar historial:',
      error
    );

    return NextResponse.json(
      {
        error:
          'No se pudo eliminar el historial.',
      },
      {
        status: 500,
      }
    );
  }
}