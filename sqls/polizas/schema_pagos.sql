-- INKA CORP: Registro de Pagos y Liquidaciones de Pólizas
-- Esta tabla permite auditar cuánto se pagó al socio al liquidar o renovar una póliza.

CREATE TABLE ic_polizas_pagos (
    id_pago_poliza UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_poliza UUID REFERENCES ic_polizas(id_poliza) ON DELETE CASCADE,
    id_socio TEXT REFERENCES ic_socios(idsocio),
    monto_total_pagado NUMERIC(15, 2) NOT NULL,
    monto_capital NUMERIC(15, 2) DEFAULT 0,
    monto_interes NUMERIC(15, 2) DEFAULT 0,
    fecha_pago TIMESTAMPTZ DEFAULT NOW(),
    tipo_pago TEXT NOT NULL, -- 'LIQUIDACION_TOTAL', 'PAGO_INTERES_RENOVACION', 'RETIRO_PARCIAL'
    metodo_pago TEXT DEFAULT 'TRANSFERENCIA',
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para rapidez de consulta
CREATE INDEX idx_polizas_pagos_id_poliza ON ic_polizas_pagos(id_poliza);
CREATE INDEX idx_polizas_pagos_id_socio ON ic_polizas_pagos(id_socio);

-- Comentarios explicativos
COMMENT ON TABLE ic_polizas_pagos IS 'Registro histórico de desembolsos realizados a los inversionistas de pólizas';
COMMENT ON COLUMN ic_polizas_pagos.tipo_pago IS 'Si es LIQUIDACION_TOTAL significa que la póliza se cerró y el socio llevó todo. PAGO_INTERES_RENOVACION es cuando se renueva solo el capital.';
