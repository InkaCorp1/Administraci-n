CREATE TABLE IF NOT EXISTS public.ic_contratos (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  fecha_contrato DATE NOT NULL,
  parte_contrato TEXT NOT NULL, -- 'Nosotros' o 'Otro'
  nombre_razon TEXT NOT NULL,
  cedula_ruc TEXT NOT NULL,
  pais TEXT NOT NULL, -- 'Ecuador', 'Perú', 'Estados Unidos'
  detalle TEXT NOT NULL,
  monto NUMERIC(15, 2) NOT NULL,
  frecuencia TEXT NOT NULL, -- 'anual', 'mensual', 'dias'
  cantidad_duracion INTEGER NOT NULL,
  fecha_fin DATE NOT NULL,
  url_foto TEXT NULL,
  estado TEXT DEFAULT 'ACTIVO',
  creado_por UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT ic_contratos_pkey PRIMARY KEY (id),
  CONSTRAINT ic_contratos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES ic_users (id) ON DELETE SET NULL
) TABLESPACE pg_default;

-- Triggers para updated_at
CREATE TRIGGER update_ic_contratos_updated_at BEFORE UPDATE ON ic_contratos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
