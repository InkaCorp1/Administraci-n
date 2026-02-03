-- Crear relación de foreign key entre ic_preferencial y ic_socios
-- Ejecutar este SQL en Supabase SQL Editor

-- Primero, verificar que no existan valores huérfanos (opcional pero recomendado)
-- SELECT DISTINCT p.idsocio 
-- FROM ic_preferencial p 
-- LEFT JOIN ic_socios s ON p.idsocio = s.idsocio 
-- WHERE s.idsocio IS NULL;

-- Agregar la constraint de foreign key
ALTER TABLE public.ic_preferencial
ADD CONSTRAINT ic_preferencial_idsocio_fkey 
FOREIGN KEY (idsocio) 
REFERENCES public.ic_socios(idsocio)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- Verificar que se creó correctamente
-- SELECT 
--   tc.constraint_name, 
--   tc.table_name, 
--   kcu.column_name, 
--   ccu.table_name AS foreign_table_name,
--   ccu.column_name AS foreign_column_name 
-- FROM information_schema.table_constraints AS tc 
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY' 
--   AND tc.table_name = 'ic_preferencial';
