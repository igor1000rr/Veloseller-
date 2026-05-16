# Veloseller E2E (smoke)

Лёгкие smoke-тесты против живого production/staging хоста. Без браузера, без базы —
только fetch к публичным URL.

## Что проверяется

- /, /privacy, /terms — 200
- /login, /register — форма отдаётся
- /dashboard без авторизации → redirect /login
- /api/health — биться, возвращает status/checks
- /api/account/* без auth → 401
- Security headers (X-Frame-Options, X-Content-Type-Options)

## Запуск локально

```bash
# Против production:
E2E_BASE_URL=https://veloseller.com npm run test:e2e

# Против локального dev-сервера:
# 1. в одном терминале: npm run dev
# 2. в другом: E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

Без переменной `E2E_BASE_URL` тесты пропускаются (в CI это ожидаемо).

## Настройка в CI (опционально)

Добавьте отдельный job в .github/workflows/ci.yml:

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: [worker, web]   # только после успешных unit-тестов
    if: github.ref == 'refs/heads/main'   # только на main, не на PR
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - run: cd apps/web && npm install --legacy-peer-deps
      - run: cd apps/web && npm run test:e2e
        env:
          E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
```

После деплоя будет срабатывать smoke-проверка живого сайта. Если что-то упало — alert в GitHub Actions.
