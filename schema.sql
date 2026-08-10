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

-- Informes personalizados servidos en /informe/<token>.
--
-- Tabla aparte en lugar de una columna en "leads": este archivo se ejecuta
-- completo cada vez que cambia el esquema, y D1 no admite
-- "ALTER TABLE ... ADD COLUMN IF NOT EXISTS". Una tabla con IF NOT EXISTS sí
-- es idempotente.
--
-- El token es la única credencial de acceso al informe, así que se genera con
-- 128 bits de aleatoriedad criptográfica. La página va con noindex y /informe/
-- está bloqueado en robots.txt: el informe contiene datos de una persona
-- identificada y no debe aparecer en ningún buscador.
CREATE TABLE IF NOT EXISTS informes (
  token     TEXT PRIMARY KEY,
  scan_id   INTEGER NOT NULL REFERENCES scans (id),
  lead_id   INTEGER REFERENCES leads (id),
  creado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_informes_scan ON informes (scan_id);

-- Credencial de desbloqueo por escaneo.
--
-- /api/unlock ya NO confía en el scan_id que manda el cliente (es un entero
-- autoincremental, adivinable): exige este token de 128 bits, que /api/scan
-- entrega junto al resultado. Tabla aparte en vez de una columna en "scans"
-- por la misma razón que "informes": D1 no admite
-- "ALTER TABLE ... ADD COLUMN IF NOT EXISTS", así que una columna nueva
-- rompería la idempotencia de este archivo.
CREATE TABLE IF NOT EXISTS scan_tokens (
  scan_id   INTEGER PRIMARY KEY REFERENCES scans (id),
  token     TEXT NOT NULL UNIQUE,
  creado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_tokens_token ON scan_tokens (token);

-- Límite por IP y día para /api/unlock, igual que "limites" pero para
-- /api/scan. Tabla separada porque son cuotas independientes: unlock no
-- gasta en Brave/Anthropic, pero sí envía un correo real y es la vía para
-- iterar tokens si alguien lo automatiza.
CREATE TABLE IF NOT EXISTS limites_unlock (
  ip_hash TEXT NOT NULL,
  dia     TEXT NOT NULL,
  conteo  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, dia)
);

CREATE INDEX IF NOT EXISTS idx_limites_unlock_dia ON limites_unlock (dia);

-- Deduplica el botón "Quiero que me contacten" de /informe/<token>.
--
-- PRIMARY KEY en scan_id: un segundo clic (recarga, doble tap) no debe
-- disparar un segundo correo urgente. El primer INSERT gana; los siguientes
-- caen en el ON CONFLICT DO NOTHING de /api/contactar.
CREATE TABLE IF NOT EXISTS solicitudes_contacto (
  scan_id   INTEGER PRIMARY KEY REFERENCES scans (id),
  creado_en TEXT NOT NULL
);

-- Caché de la "búsqueda de campo": especialidad+ciudad SIN nombre, usada para
-- contar cuántos perfiles profesionales distintos son visibles en ese campo.
--
-- Clave por especialidad+ciudad, no por médico: el costo de la búsqueda en
-- Brave se paga una vez por cohorte y se amortiza entre todos los médicos que
-- compartan esa especialidad+ciudad durante la ventana de caché (7 días —
-- más larga que la de "scans" porque la composición de un campo cambia más
-- lento que el perfil de una sola persona).
CREATE TABLE IF NOT EXISTS campo_cache (
  clave             TEXT PRIMARY KEY,   -- especialidad|ciudad normalizado
  especialidad      TEXT NOT NULL,
  ciudad            TEXT NOT NULL,
  perfiles_visibles INTEGER NOT NULL,
  creado_en         TEXT NOT NULL
);
