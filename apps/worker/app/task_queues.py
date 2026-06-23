"""Пул воркеров с очередью — инкапсуляция состояния очереди/потоков.

ЗАЧЕМ ОТДЕЛЬНЫЙ КЛАСС (а не модульные глобалы, как было в main.py):
раньше очереди пересчёта и синков жили module-глобалами и РЕАССАЙНИЛИСЬ в
`_start_*_workers` (`global _recalc_queue; _recalc_queue = Queue()`). Любой
`from app.main import _recalc_queue` зафиксировал бы импорт-тайм `None` навсегда
— очередь молча не активировалась бы у импортёра, и защита от OOM тихо
регрессировала бы. Юнит-тесты это НЕ ловят: они идут без lifespan, где очередь и
так `None`. Инкапсуляция состояния в атрибутах инстанса (читается вживую через
методы, без реассайна глобала) убирает ловушку и делает жизненный цикл потоков
тестируемым напрямую (start → enqueue → handler вызван → stop).

Поведение 1:1 со старым кодом: пул активируется в lifespan (прод под uvicorn);
в юнит-тестах TestClient поднят без `with`, lifespan не стартует → active()==False
→ вызыватель уходит в старый путь background_tasks.add_task.
"""
from __future__ import annotations

import logging
import queue as _queue
import threading
from typing import Any, Callable, Optional

logger = logging.getLogger("veloseller.worker")

# Уникальный сентинел остановки. Свой объект, а не None — чтобы легитимный
# элемент очереди (теоретически None) нельзя было спутать с командой «стоп».
_STOP = object()


class WorkerPool:
    """Пул из N демон-потоков, разбирающих общую thread-safe очередь.

    Состояние (очередь + потоки) — атрибуты инстанса, НЕ module-глобалы: читается
    вживую, без реассайна, поэтому ловушка «импортнули None навсегда» невозможна.

    Контракт:
      - start(handler): идемпотентен; поднимает потоки, каждый вызывает handler(item).
      - active(): True только между start() и stop().
      - enqueue(item): кладёт item в очередь; RuntimeError, если пул не запущен
        (вызыватель обязан проверить active() и сделать fallback).
      - stop(): шлёт по сентинелу на поток и (опц.) дожидается их завершения.

    Исключение в handler логируется и НЕ роняет поток — один сбойный item не
    убивает пул (как в старом *_worker_loop).
    """

    def __init__(self, name: str, concurrency: int) -> None:
        self._name = name
        self._concurrency = concurrency
        self._queue: Optional[_queue.Queue] = None
        self._threads: list[threading.Thread] = []
        self._lock = threading.Lock()

    def active(self) -> bool:
        return self._queue is not None

    def start(self, handler: Callable[[Any], None]) -> None:
        with self._lock:
            if self._queue is not None or self._concurrency < 1:
                return
            q: _queue.Queue = _queue.Queue()
            self._queue = q
            for _ in range(self._concurrency):
                t = threading.Thread(
                    target=self._loop, args=(q, handler),
                    name=f"{self._name}-worker", daemon=True,
                )
                t.start()
                self._threads.append(t)
        logger.info("worker pool started",
                    extra={"pool": self._name, "concurrency": self._concurrency})

    def _loop(self, q: _queue.Queue, handler: Callable[[Any], None]) -> None:
        # q и handler переданы аргументами (а не читаются из self) специально:
        # после stop() self._queue станет None, но уже запущенные потоки должны
        # дочерпать «свою» очередь до сентинела. Захват по аргументу это гарантирует.
        while True:
            item = q.get()
            try:
                if item is _STOP:
                    return
                handler(item)
            except Exception:
                logger.exception("worker pool task crashed", extra={"pool": self._name})
            finally:
                q.task_done()

    def enqueue(self, item: Any) -> None:
        q = self._queue
        if q is None:
            raise RuntimeError(f"{self._name} pool not started")
        q.put_nowait(item)

    def stop(self, join: bool = False, timeout: Optional[float] = None) -> None:
        with self._lock:
            q = self._queue
            if q is None:
                return
            threads = list(self._threads)
            for _ in threads:
                q.put(_STOP)
            self._threads.clear()
            self._queue = None
        # join вне лока: ждать дренажа очереди, держа лок, незачем — он защищает
        # только старт/стоп от гонки, а не работу потоков.
        if join:
            for t in threads:
                t.join(timeout)
