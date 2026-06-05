-- Seed data maintained directly as SQL.
-- Loaded by Supabase using supabase/config.toml [db.seed]. Edit this file directly when catalog values change.

INSERT INTO public.departamentos (id, name, normalized_name, active) VALUES
  ('antioquia', 'Antioquia', 'antioquia', TRUE),
  ('atlantico', 'Atlántico', 'atlantico', TRUE),
  ('bogota_d_c', 'Bogotá, D.C.', 'bogota d c', TRUE),
  ('bolivar', 'Bolívar', 'bolivar', TRUE),
  ('boyaca', 'Boyacá', 'boyaca', TRUE),
  ('caldas', 'Caldas', 'caldas', TRUE),
  ('caqueta', 'Caquetá', 'caqueta', TRUE),
  ('cauca', 'Cauca', 'cauca', TRUE),
  ('cesar', 'Cesar', 'cesar', TRUE),
  ('cordoba', 'Córdoba', 'cordoba', TRUE),
  ('cundinamarca', 'Cundinamarca', 'cundinamarca', TRUE),
  ('choco', 'Chocó', 'choco', TRUE),
  ('huila', 'Huila', 'huila', TRUE),
  ('la_guajira', 'La Guajira', 'la guajira', TRUE),
  ('magdalena', 'Magdalena', 'magdalena', TRUE),
  ('meta', 'Meta', 'meta', TRUE),
  ('narino', 'Nariño', 'narino', TRUE),
  ('norte_de_santander', 'Norte De Santander', 'norte de santander', TRUE),
  ('quindio', 'Quindío', 'quindio', TRUE),
  ('risaralda', 'Risaralda', 'risaralda', TRUE),
  ('santander', 'Santander', 'santander', TRUE),
  ('sucre', 'Sucre', 'sucre', TRUE),
  ('tolima', 'Tolima', 'tolima', TRUE),
  ('valle_del_cauca', 'Valle Del Cauca', 'valle del cauca', TRUE),
  ('arauca', 'Arauca', 'arauca', TRUE),
  ('casanare', 'Casanare', 'casanare', TRUE),
  ('putumayo', 'Putumayo', 'putumayo', TRUE),
  ('archipielago_de_san_andres_providencia_y_santa_catalina', 'Archipiélago De San Andrés, Providencia Y Santa Catalina', 'archipielago de san andres providencia y santa catalina', TRUE),
  ('amazonas', 'Amazonas', 'amazonas', TRUE),
  ('guainia', 'Guainía', 'guainia', TRUE),
  ('guaviare', 'Guaviare', 'guaviare', TRUE),
  ('vaupes', 'Vaupés', 'vaupes', TRUE),
  ('vichada', 'Vichada', 'vichada', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, normalized_name = EXCLUDED.normalized_name, active = EXCLUDED.active;

