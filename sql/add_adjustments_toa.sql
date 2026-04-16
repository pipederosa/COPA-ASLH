-- Ajustes de puntos (penalizaciones/beneficios extra)
CREATE TABLE IF NOT EXISTS point_adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  championship_id UUID REFERENCES championships(id) ON DELETE CASCADE,
  pilot_id UUID REFERENCES pilots(id) ON DELETE CASCADE,
  points NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE point_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read adjustments" ON point_adjustments FOR SELECT USING (true);
CREATE POLICY "auth write adjustments" ON point_adjustments FOR ALL USING (auth.role() = 'authenticated');

-- TOA (archivos PDF)
CREATE TABLE IF NOT EXISTS toa_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  championship_id UUID REFERENCES championships(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE toa_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read toa" ON toa_files FOR SELECT USING (true);
CREATE POLICY "auth write toa" ON toa_files FOR ALL USING (auth.role() = 'authenticated');

-- Storage bucket for TOA PDFs (run this too)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('toa', 'toa', true) ON CONFLICT DO NOTHING;
