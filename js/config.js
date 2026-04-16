// ============================================================
//  CONFIGURACIÓN — Completar con tus datos de Supabase
//  Supabase Dashboard > Project Settings > API
// ============================================================

const SUPABASE_URL = 'https://awoejmyiedpwjhvruvve.supabase.co';           // Ej: https://abcxyz.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3b2VqbXlpZWRwd2podnJ1dnZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NTYwMjAsImV4cCI6MjA5MTMzMjAyMH0.BVjPfQeNyD7qBrDit1SVNLCibxrxXUfkccFQv2068MA'; // Clave "anon public"

// ============================================================
//  NO MODIFICAR DEBAJO DE ESTA LÍNEA
// ============================================================
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
