-- Fechas de próximas ediciones por campeonato
CREATE TABLE IF NOT EXISTS championship_dates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  championship_id UUID REFERENCES championships(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE championship_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read dates" ON championship_dates FOR SELECT USING (true);
CREATE POLICY "auth write dates" ON championship_dates FOR ALL USING (auth.role() = 'authenticated');

-- Campeonato anual: configuración global
CREATE TABLE IF NOT EXISTS annual_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Campeonato Anual',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE annual_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read annual" ON annual_config FOR SELECT USING (true);
CREATE POLICY "auth write annual" ON annual_config FOR ALL USING (auth.role() = 'authenticated');

-- Relación: qué campeonatos forman parte del anual
CREATE TABLE IF NOT EXISTS annual_championships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  annual_id UUID REFERENCES annual_config(id) ON DELETE CASCADE,
  championship_id UUID REFERENCES championships(id) ON DELETE CASCADE,
  UNIQUE(annual_id, championship_id)
);
ALTER TABLE annual_championships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read annual_champs" ON annual_championships FOR SELECT USING (true);
CREATE POLICY "auth write annual_champs" ON annual_championships FOR ALL USING (auth.role() = 'authenticated');
