-- Migration script for 'Situación Bancaria' module
-- Tables based on BANCOS.csv and BANCOSDETALLE.csv structure

-- 1. Table: ic_situacion_bancaria (Headers: id_transaccion, nombre_banco, tipo_transaccion, plazo, valor, interes, monto_final, contador, fecha_transaccion, primer_pago, mensual, estado, a_nombre_de, motivo, logo_banco)
-- 1. Table: ic_situacion_bancaria
DROP TABLE IF EXISTS public.ic_situacion_bancaria_detalle CASCADE;
DROP TABLE IF EXISTS public.ic_situacion_bancaria CASCADE;

CREATE TABLE IF NOT EXISTS public.ic_situacion_bancaria (
  id_transaccion text NOT NULL, -- Changed to text (hex string in CSV)
  nombre_banco text NOT NULL,
  tipo_transaccion text,
  plazo_tipo text, -- Added missing column
  plazo integer,
  valor numeric(12, 2),
  interes numeric(5, 2),
  monto_final numeric(12, 2),
  contador integer,
  fecha_transaccion date,
  primer_pago date,
  mensual numeric(10, 2),
  estado text DEFAULT 'ACTIVO',
  valor_descontado numeric(12, 2), -- Added missing column
  a_nombre_de text,
  motivo text,
  logo_banco text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  CONSTRAINT ic_situacion_bancaria_pkey PRIMARY KEY (id_transaccion)
);

-- 2. Table: ic_situacion_bancaria_detalle
CREATE TABLE IF NOT EXISTS public.ic_situacion_bancaria_detalle (
  id_detalle text NOT NULL, -- Changed to text (hex string in CSV)
  transaccion text NOT NULL, -- Changed to text to match parent
  cuota integer NOT NULL,
  valor numeric(10, 2),
  estado text DEFAULT 'PENDIENTE',
  fecha_pago date,
  fecha_pagado date,
  fotografia text,
  enviar_pdf text, -- Added missing column
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  CONSTRAINT ic_situacion_bancaria_detalle_pkey PRIMARY KEY (id_detalle),
  CONSTRAINT ic_situacion_bancaria_detalle_transaccion_fkey FOREIGN KEY (transaccion)
      REFERENCES public.ic_situacion_bancaria (id_transaccion) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_situacion_bancaria_detalle_transaccion
    ON public.ic_situacion_bancaria_detalle USING btree
    (transaccion ASC NULLS LAST);

-- Enable Row Level Security (RLS)
ALTER TABLE public.ic_situacion_bancaria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ic_situacion_bancaria_detalle ENABLE ROW LEVEL SECURITY;

-- Policies for Authenticated Users
-- Allow all authenticated users to view/modify (adjust logic if tenant isolation is required later)
CREATE POLICY "Enable all for authenticated users" ON public.ic_situacion_bancaria
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all for authenticated users" ON public.ic_situacion_bancaria_detalle
    FOR ALL USING (auth.role() = 'authenticated');

-- Instructions for Data Migration (CSVs)
-- 1. Import BANCOS.csv into 'ic_situacion_bancaria' mapping columns accordingly.
-- 2. Import BANCOSDETALLE.csv into 'ic_situacion_bancaria_detalle' mapping columns accordingly.
-- Ensure date formats in CSV match PostgreSQL date format (YYYY-MM-DD) or use a transform during import.
