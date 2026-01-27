-- SQL para crear la tabla de Gastos Administrativos en Supabase
-- Tabla: ic_gastos_administrativos

-- 1. Crear la tabla
CREATE TABLE IF NOT EXISTS public.ic_gastos_administrativos (
    id_gastos TEXT PRIMARY KEY,
    monto NUMERIC(10, 2) NOT NULL,
    motivo TEXT NOT NULL,
    fecha DATE NOT NULL,
    inicio DATE,
    fotografia TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Restricción para asegurar que el monto no sea negativo
    CONSTRAINT monto_positivo CHECK (monto >= 0)
);

-- Índices para mejorar el rendimiento de las búsquedas y ordenamiento
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON public.ic_gastos_administrativos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_motivo ON public.ic_gastos_administrativos USING gin (motivo jsquery_ops) WHERE false; -- Placeholder si se usara full text search
CREATE INDEX IF NOT EXISTS idx_gastos_motivo_simple ON public.ic_gastos_administrativos(motivo);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE public.ic_gastos_administrativos ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas para usuarios autenticados
-- Permitir lectura a todos los autenticados
CREATE POLICY "Permitir lectura para usuarios autenticados" 
ON public.ic_gastos_administrativos 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Permitir inserción para usuarios autenticados
CREATE POLICY "Permitir inserción para usuarios autenticados" 
ON public.ic_gastos_administrativos 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Permitir actualización para usuarios autenticados
CREATE POLICY "Permitir actualización para usuarios autenticados" 
ON public.ic_gastos_administrativos 
FOR UPDATE 
USING (auth.role() = 'authenticated');

-- Permitir eliminación para usuarios autenticados
CREATE POLICY "Permitir eliminación para usuarios autenticados" 
ON public.ic_gastos_administrativos 
FOR DELETE 
USING (auth.role() = 'authenticated');

-- 4. Almacenamiento de Imágenes (REQUERIDO)
-- Se recomienda usar el bucket 'inkacorp' y la carpeta 'administrativos/'
-- para organizar las evidencias de gastos.
