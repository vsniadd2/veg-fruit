# Запуск на сервере через Docker Compose

## Что будет работать

- **Postgres** (данные в volume `veg_fruit_pg_data`, не удаляются при `docker-compose down`)
- **Backend** (Express, порт внутри сети `3001`)
- **Web** (Nginx + собранный Vite frontend, порт `80` на сервере, проксирует `/api` на backend)

## Быстрый старт (на сервере)

В корне проекта:

```bash
cp .env.example .env
docker compose up -d --build
```

Сайт будет доступен на:

- `http://178.172.201.107`

Проверка backend:

- `http://178.172.201.107/api/health`

## Остановка / обновление кода / перезапуск

Остановить (данные БД сохранятся):

```bash
docker compose down
```

Обновить код (например `git pull`), затем пересобрать и поднять:

```bash
docker compose up -d --build
```

## Локальный запуск (dev)

Локально удобнее запускать dev-сервера (Vite + node --watch):

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
```

Открыть:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3001/api/health`

## Важно про сохранность данных

- `docker compose down` **НЕ удаляет** именованные volumes.
- Данные удалятся только если вы выполните `docker compose down -v` или вручную удалите volume:
  - `docker volume rm veg_fruit_pg_data`

