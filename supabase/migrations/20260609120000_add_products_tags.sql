-- Правка 10 (#6): произвольные пользовательские теги по товару.
-- Свободный список строк (бренд/категория/поставщик/что угодно — юзер сам).
-- text[] + GIN-индекс под быстрый фильтр `tags @> ARRAY['тег']`.
-- Идемпотентно. Воркер теги не трогает (upsert products их не перезаписывает).
alter table products add column if not exists tags text[];
create index if not exists idx_products_tags on products using gin (tags);
