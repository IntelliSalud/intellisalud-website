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

-- Límite por IP y día.
--
-- Se guarda un HASH de la IP, nunca la IP. Una dirección IP es un dato
-- personal bajo la LOPDP: guardarla en claro obligaría a declararla en la
-- política de privacidad y a conservarla bajo las mismas reglas que el resto.
-- El hash cumple la misma función de control y no identifica a nadie.
CREATE TABLE IF NOT EXISTS limites (
  ip_hash TEXT NOT NULL,
  dia     TEXT NOT NULL,          -- YYYY-MM-DD en UTC
  conteo  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, dia)
);

-- Permite purgar los registros antiguos sin recorrer toda la tabla.
CREATE INDEX IF NOT EXISTS idx_limites_dia ON limites (dia);
