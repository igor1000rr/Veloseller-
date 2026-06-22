"use client";

import { useEffect } from "react";

/**
 * Глобальный error boundary — заменяет корневой layout при фатальной ошибке
 * рендера, поэтому должен содержать свои <html>/<body> и НЕ зависеть от
 * globals.css (инлайн-стили). Без него Next отдаёт пустой белый экран.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global] fatal render error:", error);
  }, [error]);

  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#fff", color: "#1a1a1a" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: 16,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Произошла ошибка</h1>
          <p style={{ fontSize: 14, color: "#666", maxWidth: 420, margin: 0 }}>
            Сервис временно недоступен. Попробуйте обновить страницу.
          </p>
          <button
            onClick={reset}
            style={{
              borderRadius: 8,
              border: "1px solid #1a1a1a",
              background: "#1a1a1a",
              color: "#fff",
              padding: "8px 16px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
