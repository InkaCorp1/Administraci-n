-- SCRIPT DE REPARACIÓN DE RELACIONES (FOREIGN KEYS)
-- Ejecuta este script en el SQL Editor de Supabase para restaurar los Joins.

-- 1. Relación Créditos -> Socios
ALTER TABLE public.ic_creditos 
ADD CONSTRAINT ic_creditos_id_socio_fkey 
FOREIGN KEY (id_socio) REFERENCES ic_socios(idsocio) ON DELETE RESTRICT;

-- 2. Relación Amortización -> Créditos
ALTER TABLE public.ic_creditos_amortizacion 
ADD CONSTRAINT ic_creditos_amortizacion_id_credito_fkey 
FOREIGN KEY (id_credito) REFERENCES ic_creditos(id_credito) ON DELETE CASCADE;

-- 3. Relación Precancelaciones -> Créditos
ALTER TABLE public.ic_creditos_precancelacion 
ADD CONSTRAINT ic_creditos_precancelacion_id_credito_fkey 
FOREIGN KEY (id_credito) REFERENCES ic_creditos(id_credito) ON DELETE RESTRICT;

-- 4. Relación Pólizas -> Socios
ALTER TABLE public.ic_polizas 
ADD CONSTRAINT ic_polizas_id_socio_fkey 
FOREIGN KEY (id_socio) REFERENCES ic_socios(idsocio);

-- 5. Relación Pagos -> Amortización
ALTER TABLE public.ic_creditos_pagos 
ADD CONSTRAINT ic_creditos_pagos_id_detalle_fkey 
FOREIGN KEY (id_detalle) REFERENCES ic_creditos_amortizacion(id_detalle) ON DELETE RESTRICT;

-- 6. Relación Aportes Semanales -> Socios
ALTER TABLE public.ic_aportes_semanales 
ADD CONSTRAINT ic_aportes_semanales_id_socio_fkey 
FOREIGN KEY (id_socio) REFERENCES ic_socios(idsocio) ON DELETE RESTRICT;

-- NOTA: Si alguna relación ya existe, el script dará error en esa línea específica. 
-- Después de ejecutarlo, ve a Settings -> API -> PostgREST y haz clic en "Reload Schema".
