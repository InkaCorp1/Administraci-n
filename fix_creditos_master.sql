-- ==========================================================
-- 1. TRIGGER PARA SINCRONIZAR EL CRÉDITO MAESTRO (ic_creditos)
-- ==========================================================
-- Este trigger se ejecuta cuando cambia una cuota en la tabla de amortización
-- y actualiza el contador de cuotas pagadas/mora y el estado global del crédito.

CREATE OR REPLACE FUNCTION public.fn_sync_credito_master_status()
RETURNS TRIGGER AS $$
DECLARE
    v_id_credito UUID;
    v_total_cuotas INTEGER;
    v_pagadas INTEGER;
    v_en_mora INTEGER;
    v_nuevo_estado TEXT;
    v_estado_actual TEXT;
BEGIN
    v_id_credito := NEW.id_credito;

    -- Obtener estadísticas de las cuotas
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE estado_cuota = 'PAGADO' OR estado_cuota = 'CONDONADO'),
        COUNT(*) FILTER (WHERE estado_cuota = 'VENCIDO')
    INTO v_total_cuotas, v_pagadas, v_en_mora
    FROM public.ic_creditos_amortizacion
    WHERE id_credito = v_id_credito;

    -- Obtener estado actual para no sobreescribir estados especiales (PAUSADO, RECHAZADO, PRECANCELADO)
    SELECT estado_credito INTO v_estado_actual 
    FROM public.ic_creditos 
    WHERE id_credito = v_id_credito;

    -- Lógica de determinación de estado
    IF v_pagadas >= v_total_cuotas AND v_total_cuotas > 0 THEN
        v_nuevo_estado := 'CANCELADO';
    ELSIF v_en_mora > 0 THEN
        v_nuevo_estado := 'MOROSO';
    ELSIF v_pagadas > 0 THEN
        -- Si ya empezó a pagar y no hay mora, está activo
        v_nuevo_estado := 'ACTIVO';
    ELSE
        -- Si no hay pagos ni mora, vuelve a PENDIENTE o ACTIVO (según lógica de desembolso)
        v_nuevo_estado := 'ACTIVO'; -- Generalmente si ya tiene tabla de amortización está ACTIVO
    END IF;

    -- SI EL CRÉDITO NO ESTÁ EN ESTADO OPERATIVO (ACTIVO, MOROSO o PENDIENTE), NO TOCAR EL ESTADO EXCEPTO PARA CONTADORES
    -- Los estados CANCELADO, PRECANCELADO, PAUSADO y RECHAZADO son manuales o finales y no deben ser cambiados por el trigger.
    IF v_estado_actual NOT IN ('ACTIVO', 'MOROSO', 'PENDIENTE') THEN
        v_nuevo_estado := v_estado_actual;
    END IF;

    -- Actualizar el crédito maestro
    UPDATE public.ic_creditos
    SET 
        cuotas_pagadas = v_pagadas,
        cuotas_en_mora = v_en_mora,
        estado_credito = v_nuevo_estado,
        updated_at = NOW()
    WHERE id_credito = v_id_credito;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recrear Trigger
DROP TRIGGER IF EXISTS trg_sync_credito_master_status ON public.ic_creditos_amortizacion;
CREATE TRIGGER trg_sync_credito_master_status
AFTER UPDATE OF estado_cuota ON public.ic_creditos_amortizacion
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_credito_master_status();


-- ==========================================================
-- 2. SQL PARA ACTUALIZACIÓN MASIVA DE CRÉDITOS EXISTENTES (MODO SEGURO)
-- ==========================================================

UPDATE public.ic_creditos c
SET 
    cuotas_pagadas = sub.pagadas,
    cuotas_en_mora = sub.mora,
    estado_credito = CASE 
        -- Solo cambiar estado si está en el grupo operativo. Si es PAUSADO/CANCELADO/etc, mantenerlo.
        WHEN c.estado_credito NOT IN ('ACTIVO', 'MOROSO', 'PENDIENTE') THEN c.estado_credito
        WHEN sub.pagadas >= sub.total AND sub.total > 0 THEN 'CANCELADO'
        WHEN sub.mora > 0 THEN 'MOROSO'
        ELSE 'ACTIVO'
    END,
    updated_at = NOW()
FROM (
    SELECT 
        id_credito,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE estado_cuota = 'PAGADO' OR estado_cuota = 'CONDONADO') as pagadas,
        COUNT(*) FILTER (WHERE estado_cuota = 'VENCIDO') as mora
    FROM public.ic_creditos_amortizacion
    GROUP BY id_credito
) sub
WHERE c.id_credito = sub.id_credito;
