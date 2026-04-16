-- Ejecutar en Supabase > SQL Editor
-- Agrega soporte para regata por equipos

ALTER TABLE races ADD COLUMN IF NOT EXISTS is_team_race BOOLEAN DEFAULT FALSE;
ALTER TABLE results ADD COLUMN IF NOT EXISTS team TEXT DEFAULT NULL;
