-- ============================================================
--  REGATAS NÁUTICAS — Schema para Supabase
--  Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Tabla de campeonatos
CREATE TABLE championships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  total_races INTEGER NOT NULL DEFAULT 10,
  total_discards INTEGER NOT NULL DEFAULT 0,
  discard1_from INTEGER DEFAULT 0,
  discard2_from INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de participantes
CREATE TABLE pilots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  championship_id UUID REFERENCES championships(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sail_number TEXT,
  boat_class TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de regatas (configuración de cada regata)
CREATE TABLE races (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  championship_id UUID REFERENCES championships(id) ON DELETE CASCADE,
  race_number INTEGER NOT NULL,
  is_double BOOLEAN DEFAULT FALSE,
  no_discard BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(championship_id, race_number)
);

-- Tabla de resultados
CREATE TABLE results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  race_id UUID REFERENCES races(id) ON DELETE CASCADE,
  pilot_id UUID REFERENCES pilots(id) ON DELETE CASCADE,
  position INTEGER,
  status TEXT CHECK (status IN ('normal', 'DNS', 'DNF', 'OCS', 'DSQ', 'RET')),
  points NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(race_id, pilot_id)
);

-- RLS: lectura pública, escritura solo autenticada
ALTER TABLE championships ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilots ENABLE ROW LEVEL SECURITY;
ALTER TABLE races ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura pública
CREATE POLICY "public read championships" ON championships FOR SELECT USING (true);
CREATE POLICY "public read pilots" ON pilots FOR SELECT USING (true);
CREATE POLICY "public read races" ON races FOR SELECT USING (true);
CREATE POLICY "public read results" ON results FOR SELECT USING (true);

-- Políticas de escritura autenticada
CREATE POLICY "auth write championships" ON championships FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth write pilots" ON pilots FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth write races" ON races FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth write results" ON results FOR ALL USING (auth.role() = 'authenticated');

-- Índices
CREATE INDEX idx_pilots_championship ON pilots(championship_id);
CREATE INDEX idx_races_championship ON races(championship_id);
CREATE INDEX idx_results_race ON results(race_id);
CREATE INDEX idx_results_pilot ON results(pilot_id);
