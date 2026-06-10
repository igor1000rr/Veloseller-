-- Бренды Radar: разрешить source='price' (бренды, извлечённые из прайса частотным
-- анализатором). Раньше CHECK допускал только 'ai'/'manual', из-за чего ВСЕ бренды
-- из прайса молча отбраковывались на upsert (source='price' нарушал CHECK) —
-- в «Брендах» не появлялось ни одного извлечённого бренда.
ALTER TABLE public.radar_brands DROP CONSTRAINT IF EXISTS radar_brands_source_check;
ALTER TABLE public.radar_brands ADD CONSTRAINT radar_brands_source_check
  CHECK (source = ANY (ARRAY['ai'::text, 'manual'::text, 'price'::text]));
