-- Índice de Visibilidad Médica — esquema D1
-- Aplicar: npx wrangler d1 execute intellisalud-visibilidad --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS scans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  clave         TEXT NOT NULL,          -- nombre|especialidad|ciudad normalizado
  nombre        TEXT NOT NULL,
  especialidad  TEXT NOT NULL,
  ciudad        TEXT NOT NULL,
  puntaje_total INTEGER NOT NULL,
  resultado     TEXT NOT NULL,          -- JSON con las 10 dimensiones
  creado_en     TEXT NOT NULL
);

-- La caché se consulta por clave y fecha en cada escaneo.
CREATE INDEX IF NOT EXISTS idx_scans_clave ON scans (clave, creado_en DESC);

CREATE TABLE IF NOT EXISTS leads (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id              INTEGER REFERENCES scans (id),
  nombre               TEXT NOT NULL,
  especialidad         TEXT,
  lugar_trabajo        TEXT,
  email                TEXT NOT NULL,
  consentimiento_lopdp INTEGER NOT NULL,  -- 1 = autorizó; sin esto no se inserta
  es_titular           INTEGER NOT NULL,  -- 1 = es el profesional o tiene autorización
  creado_en            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_email  ON leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_creado ON leads (creado_en DESC);
