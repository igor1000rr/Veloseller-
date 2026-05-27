// Этот файл удалён — парсинг прайса и AI-извлечение брендов выполняет worker.
//
// См. apps/worker/app/radar/brand_extractor.py (живой код, вызывается из
// apps/worker/app/radar/api.py:POST /radar/extract-brands).
//
// Web вызывает worker через apps/web/app/api/radar/upload/route.ts.
//
// Почему вынесли на worker:
//   1. У worker'а уже openpyxl/pandas в deps (не нужно xlsx в Node).
//   2. AI-ключ хранится в одном месте (worker .env).
//   3. Долгие AI-вызовы не блокируют Next.js сервер.
export {};
