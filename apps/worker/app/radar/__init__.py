"""Veloseller Radar — мониторинг новинок в ассортименте брендов селлера.

Архитектура:
  wordstat_provider — абстракция получения частот Wordstat (Yandex API / XMLRiver)
  suggest_provider — WB/OZON suggest для подтверждения запроса на покупку
  brand_extractor — извлечение брендов из прайса через OpenRouter
  cache — коллективный кэш в radar_cache (общий между селлерами)
  poller — основной job: дёргает Wordstat для approved брендов,
           проверяет suggest, обновляет radar_queries.status
"""
