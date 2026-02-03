-- ==========================================================
-- 1. TRIGGER PARA SINCRONIZACIÓN AUTOMÁTICA DE ESTADOS
-- ==========================================================
-- Este trigger se asegura de que cada vez que se inserte, actualice o borre un pago,
-- la cuota correspondiente actualice su estado (PAGADO, PARCIAL, VENCIDO, PENDIENTE).

CREATE OR REPLACE FUNCTION public.fn_sync_amortizacion_status()
RETURNS TRIGGER AS $$
DECLARE
    v_id_detalle UUID;
    total_paid NUMERIC;
    required_amount NUMERIC;
    new_status TEXT;
    v_fecha_vencimiento DATE;
BEGIN
    -- Identificar el id_detalle afectado
    IF (TG_OP = 'DELETE') THEN
        v_id_detalle := OLD.id_detalle;
    ELSE
        v_id_detalle := NEW.id_detalle;
    END IF;

    -- Calcular suma de pagos para esta cuota
    SELECT COALESCE(SUM(monto_pagado), 0) INTO total_paid 
    FROM public.ic_creditos_pagos 
    WHERE id_detalle = v_id_detalle;

    -- Obtener datos de la cuota
    SELECT cuota_total, fecha_vencimiento 
    INTO required_amount, v_fecha_vencimiento 
    FROM public.ic_creditos_amortizacion 
    WHERE id_detalle = v_id_detalle;

    -- Determinar nuevo estado basado en pagos y fecha
    IF total_paid >= required_amount THEN
        new_status := 'PAGADO';
    ELSIF total_paid > 0 THEN
        new_status := 'PARCIAL';
    ELSE
        -- Si no hay pagos, depende de si ya venció
        IF v_fecha_vencimiento < CURRENT_DATE THEN
            new_status := 'VENCIDO';
        ELSE
            new_status := 'PENDIENTE';
        END IF;
    END IF;

    -- Actualizar la tabla de amortización
    UPDATE public.ic_creditos_amortizacion 
    SET estado_cuota = new_status, 
        updated_at = NOW() 
    WHERE id_detalle = v_id_detalle;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recrear Trigger sobre la tabla de pagos
DROP TRIGGER IF EXISTS trg_sync_amortizacion_status ON public.ic_creditos_pagos;
CREATE TRIGGER trg_sync_amortizacion_status
AFTER INSERT OR UPDATE OR DELETE ON public.ic_creditos_pagos
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_amortizacion_status();


-- ==========================================================
-- 2. ACTUALIZACIÓN MASIVA DE REGISTROS ACTUALES
-- ==========================================================
-- Ejecuta esto una vez para corregir todos los estados actuales en la base de datos.

UPDATE public.ic_creditos_amortizacion a
SET estado_cuota = sub.nuevo_estado,
    updated_at = NOW()
FROM (
    SELECT 
        am.id_detalle,
        CASE 
            WHEN COALESCE(SUM(p.monto_pagado), 0) >= am.cuota_total THEN 'PAGADO'
            WHEN COALESCE(SUM(p.monto_pagado), 0) > 0 THEN 'PARCIAL'
            WHEN am.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDO'
            ELSE 'PENDIENTE'
        END as nuevo_estado
    FROM public.ic_creditos_amortizacion am
    LEFT JOIN public.ic_creditos_pagos p ON am.id_detalle = p.id_detalle
    GROUP BY am.id_detalle, am.cuota_total, am.fecha_vencimiento
) sub
WHERE a.id_detalle = sub.id_detalle
AND (a.estado_cuota != sub.nuevo_estado OR a.estado_cuota IS NULL);
