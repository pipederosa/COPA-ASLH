-- Módulo de pedido de audiencia (protestas)
CREATE TABLE IF NOT EXISTS protests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  championship_id UUID REFERENCES championships(id) ON DELETE CASCADE,
  protestor TEXT NOT NULL,        -- nombre del protestante
  protestee TEXT NOT NULL,        -- nombre del protestado
  description TEXT NOT NULL,      -- descripción de los hechos
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','DESESTIMADO','RESUELTO')),
  cr_response TEXT,               -- respuesta de la CR
  cr_result TEXT,                 -- resultado / penalización
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE protests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read protests" ON protests FOR SELECT USING (true);
CREATE POLICY "public insert protests" ON protests FOR INSERT WITH CHECK (true);
CREATE POLICY "auth update protests" ON protests FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth delete protests" ON protests FOR DELETE USING (auth.role() = 'authenticated');
