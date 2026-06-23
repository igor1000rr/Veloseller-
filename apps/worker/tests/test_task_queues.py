"""Интеграционные тесты WorkerPool — раньше очереди пересчёта/синков (threading
machinery) были НЕ покрыты: юнит-тесты идут без lifespan, где очередь = None.
После инкапсуляции в класс жизненный цикл потоков тестируется напрямую.

Покрываем: active()-контракт, fan-out на N потоков, обработку каждого item,
живучесть пула при исключении в handler, идемпотентность start, корректный stop,
и обёртку _run_sync_item из main.py.
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

import queue as _queue
import threading

import pytest

from app.task_queues import WorkerPool


def _drain(pool: WorkerPool):
    """Гарантированно гасим пул в финализаторе теста (не плодим потоки между тестами)."""
    pool.stop(join=True, timeout=2)


class TestWorkerPoolContract:
    def test_inactive_before_start(self):
        pool = WorkerPool("t", 2)
        assert pool.active() is False

    def test_enqueue_before_start_raises(self):
        pool = WorkerPool("t", 2)
        with pytest.raises(RuntimeError):
            pool.enqueue("x")

    def test_active_after_start(self):
        pool = WorkerPool("t", 2)
        try:
            pool.start(lambda item: None)
            assert pool.active() is True
        finally:
            _drain(pool)

    def test_inactive_after_stop(self):
        pool = WorkerPool("t", 2)
        pool.start(lambda item: None)
        pool.stop(join=True, timeout=2)
        assert pool.active() is False

    def test_enqueue_after_stop_raises(self):
        pool = WorkerPool("t", 2)
        pool.start(lambda item: None)
        pool.stop(join=True, timeout=2)
        with pytest.raises(RuntimeError):
            pool.enqueue("x")

    def test_concurrency_zero_never_activates(self):
        """concurrency<1 → пул не поднимается (active остаётся False)."""
        pool = WorkerPool("t", 0)
        pool.start(lambda item: None)
        assert pool.active() is False


class TestWorkerPoolProcessing:
    def test_each_item_handled(self):
        results: _queue.Queue = _queue.Queue()
        pool = WorkerPool("t", 2)
        try:
            pool.start(lambda item: results.put(item))
            for i in range(10):
                pool.enqueue(i)
            got = sorted(results.get(timeout=2) for _ in range(10))
            assert got == list(range(10))
        finally:
            _drain(pool)

    def test_spawns_concurrency_threads(self):
        pool = WorkerPool("t", 3)
        try:
            pool.start(lambda item: None)
            assert len(pool._threads) == 3
        finally:
            _drain(pool)

    def test_runs_in_parallel(self):
        """N=3 потока действительно работают параллельно: барьер на 3 участника
        разблокируется, только если 3 handler-вызова идут одновременно."""
        barrier = threading.Barrier(3, timeout=3)
        done: _queue.Queue = _queue.Queue()

        def handler(item):
            barrier.wait()  # BrokenBarrierError по таймауту, если потоков <3
            done.put(item)

        pool = WorkerPool("t", 3)
        try:
            pool.start(handler)
            for i in range(3):
                pool.enqueue(i)
            got = sorted(done.get(timeout=3) for _ in range(3))
            assert got == [0, 1, 2]
        finally:
            _drain(pool)

    def test_handler_exception_does_not_kill_pool(self):
        """Сбойный item логируется, но поток выживает и берёт следующий.
        concurrency=1 → следующий item обрабатывает ТОТ ЖЕ поток, что упал."""
        results: _queue.Queue = _queue.Queue()

        def handler(item):
            if item == "boom":
                raise ValueError("handler crashed")
            results.put(item)

        pool = WorkerPool("t", 1)
        try:
            pool.start(handler)
            pool.enqueue("boom")
            pool.enqueue("ok")
            assert results.get(timeout=2) == "ok"
        finally:
            _drain(pool)

    def test_start_is_idempotent(self):
        """Повторный start не плодит вторую генерацию потоков и не теряет хендлер."""
        results: _queue.Queue = _queue.Queue()
        pool = WorkerPool("t", 2)
        try:
            pool.start(lambda item: results.put(("first", item)))
            pool.start(lambda item: results.put(("second", item)))  # no-op
            assert len(pool._threads) == 2
            pool.enqueue(1)
            tag, val = results.get(timeout=2)
            assert tag == "first" and val == 1
        finally:
            _drain(pool)

    def test_stop_when_not_started_is_noop(self):
        pool = WorkerPool("t", 2)
        pool.stop()  # не должно бросать
        assert pool.active() is False


class TestRunSyncItem:
    """main._run_sync_item — обёртка-хендлер пула синков: (fn, args) → fn(*args)."""

    def test_unpacks_and_calls(self):
        from app.main import _run_sync_item

        calls = []
        _run_sync_item((lambda *a: calls.append(a), ("conn-1", "seller-1", "token")))
        assert calls == [("conn-1", "seller-1", "token")]


class TestLifespanWiring:
    """Раньше НЕ покрывалось: что lifespan реально активирует пулы. Со старыми
    module-глобалами (`from app.main import _recalc_queue`) импортёр навсегда видел
    None → защита от OOM тихо регрессировала, а тест поймать это не мог. Теперь
    инстанс читается вживую, и активацию через lifespan можно проверить end-to-end."""

    def test_pools_active_inside_lifespan_and_stopped_after(self):
        from fastapi.testclient import TestClient
        from app import main

        assert main._recalc_pool.active() is False
        assert main._sync_pool.active() is False
        with TestClient(main.app):
            assert main._recalc_pool.active() is True
            assert main._sync_pool.active() is True
        # shutdown lifespan погасил пулы — нет утечки потоков между тестами
        assert main._recalc_pool.active() is False
        assert main._sync_pool.active() is False

    def test_dispatched_sync_runs_through_pool_under_lifespan(self):
        """Полный прод-путь: lifespan поднял пул → _dispatch_sync кладёт в очередь →
        выделенный поток выполняет fn. Именно этот путь раньше был без теста."""
        from fastapi.testclient import TestClient
        from fastapi import BackgroundTasks
        from app import main

        ran = threading.Event()
        with TestClient(main.app):
            # background_tasks не должен использоваться, раз пул активен — но передаём
            # реальный объект, чтобы поймать ошибочный fallback (его задачи в тесте не
            # выполнятся без ответа FastAPI, поэтому ev.set оттуда не сработает).
            main._dispatch_sync(BackgroundTasks(), lambda: ran.set())
            assert ran.wait(timeout=3), "fn не выполнилась в пуле — _dispatch_sync не ушёл в очередь"
