# Data Reconciler — Web UI Brief

## Что это

Десктопное приложение для сверки данных между источниками (PostgreSQL, ClickHouse, MySQL, SQLite, MSSQL). Целевой пользователь — BI-аналитик, не разработчик. Должно быть понятно без документации.

Go-бэкенд уже готов и работает на `http://localhost:8080/api`. Нужен React SPA фронтенд.

---

## Стек фронта

- React 18+ с hooks
- TypeScript
- Tailwind CSS
- Lucide React (иконки)
- React Router (навигация)
- Без redux — хватит React Query или простого fetch + useState

Собирается через Vite. Финальная статика встраивается в Go через `embed`.

---

## Дизайн

Тёмная тема, professional/utilitarian стиль. Похоже на Grafana / Metabase / DataGrip. Не "маркетинговый лендинг", а рабочий инструмент.

- Sidebar навигация слева (collapsible)
- Основной контент справа
- Цвета статусов: зелёный (#22c55e) = ok, красный (#ef4444) = error, жёлтый (#eab308) = warning, серый = not run
- Моноширинный шрифт для данных/таблиц (JetBrains Mono или Fira Code)
- Compact density — много информации на экран

---

## Экраны (4 штуки)

### 1. Dashboard (главная, `/`)

Обзорный экран. Показывает:

- Карточки подключённых датасорсов (имя, тип, статус зелёный/красный)
- Список проверок с последним результатом (зелёный/красный бейдж)
- Кнопка "Run All Checks" — запускает все проверки разом
- Статистика: всего проверок, passed, failed, not run

Компоненты:
```
┌──────────────────────────────────────────────────┐
│  Data Reconciler                    [Run All ▶]  │
├──────────────────────────────────────────────────┤
│  Datasources (2)                                 │
│  ┌─────────────┐ ┌─────────────┐                │
│  │ 🟢 1С (PG)  │ │ 🟢 CH       │ [+ Add]       │
│  │ postgres     │ │ clickhouse   │                │
│  │ 7 tables     │ │ 7 tables     │                │
│  └─────────────┘ └─────────────┘                │
│                                                  │
│  Checks                                          │
│  ┌──────────────────────────────────────────┐   │
│  │ 🔴 Sales row match    │ 3 mismatches     │   │
│  │ 🔴 Stock movements    │ 2 missing rows   │   │
│  │ 🟢 Categories match   │ 0 issues         │   │
│  │ ⚪ Products check     │ not run           │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

### 2. Datasources (`/datasources`)

CRUD для подключений к базам данных.

**Список подключений** — таблица: имя, тип, хост:порт, статус, кнопки (test / edit / delete).

**Модалка добавления** — форма:
- Name (текст)
- Type (select: PostgreSQL, ClickHouse, MySQL, MariaDB, SQLite, MSSQL)
- Host (текст)
- Port (число, автозаполнение дефолтного порта при выборе типа: PG→5432, CH→9000, MySQL→3306, MSSQL→1433)
- Database (текст)
- User (текст)
- Password (текст, тип password)
- SSL Mode (select: disable, require, verify-ca — только для PG)
- File Path (текст, показывать только для SQLite)
- Кнопка "Test Connection" — POST `/api/datasources/{name}/test`, показать результат
- Кнопка "Save"

**При выборе датасорса** — показать его таблицы (GET `/api/datasources/{name}/tables`):
- Список таблиц с количеством строк
- Клик на таблицу → схема (GET `/api/datasources/{name}/tables/{table}/schema`)
- Превью данных (первые 20 строк)

### 3. Checks / Mappings (`/checks`)

Создание и управление проверками сверки.

**Список проверок** — карточки или таблица. Каждая проверка:
- Имя
- Source A → Source B (с именами датасорсов и таблиц)
- Режим (row_level / aggregate / count)
- Последний статус
- Кнопки: Run / Edit / Delete

**Создание/редактирование проверки** — пошаговый wizard или форма:

**Шаг 1: Источники**
- Source A: выбрать datasource (dropdown) → выбрать таблицу (dropdown, подгружается по API)
- Source B: выбрать datasource (dropdown) → выбрать таблицу (dropdown)

**Шаг 2: Маппинг полей**
Два столбца: поля Source A слева, поля Source B справа. Пользователь соединяет поля.

```
Source A (1С / PG)          Source B (ClickHouse)
┌──────────────────┐       ┌──────────────────┐
│ id            ●──┼───────┼──● id             │
│ product_id    ●──┼───────┼──● product_id     │
│ quantity      ●──┼───────┼──● quantity        │
│ unit_price    ●──┼───────┼──● unit_price      │
│ total_amount  ●──┼───────┼──● total_amount    │
│ movement_date ●──┼───────┼──● movement_date   │
│ document_number  │       │   document_number  │
│ supplier_id      │       │   supplier_id      │
└──────────────────┘       └──────────────────┘

Key fields: [id]  ← выбрать какие поля использовать как ключ для JOIN
Compare fields: [quantity, unit_price, total_amount, movement_date]
```

Реализация маппинга — можно просто два селекта рядом (source A field → source B field) для каждой строки маппинга. Drag & drop линии между полями — идеально, но если сложно, то dropdown-пары достаточно.

**Шаг 3: Режим и параметры**
- Mode: row_level / aggregate / count (radio buttons с описанием каждого)
- Tolerance: число (для финансов = 0)
- WHERE фильтр для каждого источника (опционально, textarea)

**Шаг 4: Превью и сохранение**
- Показать JSON конфига проверки
- Кнопка "Save" и "Save & Run"

### 4. Results (`/results/{checkId}`)

Результаты конкретной проверки. Самый важный экран.

**Header:**
- Имя проверки
- Статус (большой бейдж: 🟢 OK / 🔴 ERROR)
- Время выполнения
- Кнопка "Re-run"

**Summary карточки (4 штуки в ряд):**
```
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Source A    │ │ Source B    │ │ Matched    │ │ Issues     │
│ 90 rows    │ │ 91 rows    │ │ 85 rows    │ │ 6 total    │
│            │ │ ⚠ +1 row   │ │ 🟢 94.4%  │ │ 🔴         │
└────────────┘ └────────────┘ └────────────┘ └────────────┘
```

**Issues breakdown (группировка по типу):**
```
Missing in Source B: 2
  → stock_movements id=3 (Samsung TV приход)
  → stock_movements id=17 (JBL колонки приход)

Duplicates in Source B: 1  
  → sales receipt=ЧК-0010 (2 copies)

Value mismatches: 3
  → sales id=13: total_amount 279980 ≠ 289980 (Δ -10000)
  → products id=10: unit_price 89990 ≠ 89900 (Δ +90)
  → stock_balances product=3, date=2025-01-31: quantity 75 ≠ 73 (Δ +2)
```

**Таблица деталей** — полная таблица расхождений с сортировкой и фильтрацией:

| Type | Key | Field | Source A | Source B | Delta |
|------|-----|-------|----------|----------|-------|
| 🔴 missing | id=3 | entire row | exists | MISSING | — |
| 🔴 missing | id=17 | entire row | exists | MISSING | — |
| 🟡 duplicate | receipt=ЧК-0010 | source_b | — | 2 copies | — |
| 🔴 mismatch | id=13 | total_amount | 279,980 | 289,980 | -10,000 |
| 🔴 mismatch | id=10 | unit_price | 89,990 | 89,900 | +90 |
| 🔴 mismatch | prod=3, 31.01 | quantity | 75 | 73 | +2 |

Строки с расхождениями — красный фон. Дельта отрицательная — красный текст, положительная — оранжевый.

Фильтры: по типу (missing / duplicate / mismatch), по полю, поиск по ключу.

Кнопка "Export to Excel" — скачать таблицу расхождений в .xlsx.

---

## API Reference

Бэкенд на `http://localhost:8080/api`. Все ответы — JSON.

### Datasources

```
GET    /api/datasources
Response: [{ "name": "1c", "type": "postgresql", "status": "connected" }]

POST   /api/datasources
Body: {
  "name": "1c",
  "type": "postgresql",
  "host": "localhost",
  "port": 5432,
  "database": "source_of_truth",
  "user": "recon",
  "password": "recon123"
}
Response: { "status": "connected", "name": "1c" }

POST   /api/datasources/{name}/test
Response: { "status": "ok" } | { "status": "error", "error": "..." }

DELETE /api/datasources/{name}
Response: { "status": "removed" }

GET    /api/datasources/{name}/tables
Response: [{ "name": "sales", "row_count": 90 }, ...]

GET    /api/datasources/{name}/tables/{table}/schema
Response: [{ "name": "id", "type": "INT4", "nullable": false, "primary_key": true }, ...]

POST   /api/datasources/{name}/query
Body: { "table": "sales", "fields": ["id", "total_amount"], "limit": 20 }
Response: { "columns": ["id", "total_amount"], "rows": [[1, 569970], ...], "total": 20 }
```

### Checks

```
GET    /api/checks
Response: [{ "id": "chk-1", "name": "Sales match", "mode": "row_level", ... }]

POST   /api/checks
Body: {
  "id": "chk-1",
  "name": "Sales row match",
  "source_a": {
    "datasource": "1c",
    "table": "sales",
    "fields": ["quantity", "unit_price", "total_amount"]
  },
  "source_b": {
    "datasource": "analytics",
    "table": "sales",
    "fields": ["quantity", "unit_price", "total_amount"]
  },
  "field_map": {},
  "key_fields": ["id"],
  "mode": "row_level",
  "tolerance": 0
}

POST   /api/checks/{id}/run
Response: {
  "check_id": "chk-1",
  "check_name": "Sales row match",
  "status": "error",
  "summary": {
    "source_a_rows": 90,
    "source_b_rows": 91,
    "matched_rows": 85,
    "mismatched_rows": 2,
    "missing_in_a": 1,
    "missing_in_b": 0,
    "duplicates_in_a": 0,
    "duplicates_in_b": 1
  },
  "details": [
    {
      "type": "mismatch",
      "key_values": { "id": "13" },
      "field": "total_amount",
      "value_a": 279980,
      "value_b": 289980,
      "delta": -10000
    },
    {
      "type": "duplicate",
      "key_values": { "id": "100" },
      "field": "source_b: 2 copies"
    }
  ],
  "duration": "45.2ms"
}

POST   /api/checks/run-all
Response: [<CheckResult>, <CheckResult>, ...]

DELETE /api/checks/{id}

GET    /api/supported-types
Response: ["postgresql", "postgres", "clickhouse", "mysql", "mariadb", "sqlite", "mssql"]
```

---

## Компонентная структура

```
src/
├── App.tsx
├── main.tsx
├── api/
│   └── client.ts          # fetch обёртка для всех API-вызовов
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx     # навигация
│   │   └── Layout.tsx      # sidebar + content area
│   ├── datasources/
│   │   ├── DatasourceList.tsx
│   │   ├── DatasourceCard.tsx
│   │   ├── AddDatasourceModal.tsx
│   │   ├── TableBrowser.tsx     # просмотр таблиц и схемы
│   │   └── DataPreview.tsx      # превью строк таблицы
│   ├── checks/
│   │   ├── CheckList.tsx
│   │   ├── CheckWizard.tsx      # создание проверки (шаги 1-4)
│   │   ├── FieldMapper.tsx      # маппинг полей A↔B
│   │   └── CheckCard.tsx
│   ├── results/
│   │   ├── ResultsView.tsx      # основной экран результатов
│   │   ├── SummaryCards.tsx      # 4 карточки-метрики
│   │   ├── IssueBreakdown.tsx   # группировка по типу
│   │   └── DiscrepancyTable.tsx # таблица с сортировкой/фильтрами
│   └── shared/
│       ├── StatusBadge.tsx      # 🟢🔴🟡⚪
│       ├── DataTable.tsx        # переиспользуемая таблица
│       ├── Modal.tsx
│       └── LoadingSpinner.tsx
├── pages/
│   ├── DashboardPage.tsx
│   ├── DatasourcesPage.tsx
│   ├── ChecksPage.tsx
│   └── ResultsPage.tsx
└── types/
    └── index.ts               # TypeScript типы (зеркалят Go модели)
```

---

## TypeScript типы

```typescript
// Зеркало Go моделей

interface DSConfig {
  name: string;
  type: 'postgresql' | 'clickhouse' | 'mysql' | 'mariadb' | 'sqlite' | 'mssql';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl_mode?: string;
  file_path?: string;
}

interface DatasourceInfo {
  name: string;
  type: string;
  status: string;
}

interface TableInfo {
  name: string;
  schema?: string;
  row_count: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
}

interface QueryResult {
  columns: string[];
  rows: any[][];
  total: number;
}

interface CheckConfig {
  id: string;
  name: string;
  source_a: SourceRef;
  source_b: SourceRef;
  field_map: Record<string, string>;
  key_fields: string[];
  mode: 'row_level' | 'aggregate' | 'count';
  tolerance: number;
}

interface SourceRef {
  datasource: string;
  table: string;
  fields: string[];
  where?: string;
}

interface CheckResult {
  check_id: string;
  check_name: string;
  status: 'ok' | 'warning' | 'error';
  mode: string;
  summary: ResultSummary;
  details: Discrepancy[];
  run_at: string;
  duration: string;
}

interface ResultSummary {
  source_a_rows: number;
  source_b_rows: number;
  matched_rows: number;
  mismatched_rows: number;
  missing_in_a: number;
  missing_in_b: number;
  duplicates_in_a: number;
  duplicates_in_b: number;
}

interface Discrepancy {
  type: 'missing' | 'duplicate' | 'mismatch';
  key_values: Record<string, any>;
  field?: string;
  value_a?: any;
  value_b?: any;
  delta?: any;
}
```

---

## Поведение и UX

- При добавлении датасорса автозаполнять порт по типу БД
- "Test Connection" с индикатором загрузки и зелёной/красной галочкой
- При запуске проверки — спиннер, потом анимированное появление результата
- Числа в таблицах — с разделителями тысяч (279 980, не 279980)
- Дельта со знаком: +90, -10 000
- Таблица расхождений: строки кликабельные, разворачивают полные данные строки из обоих источников
- Empty states: "No datasources yet — add your first connection", "No checks configured", "All checks passed ✓"
- Тосты/нотификации при успехе/ошибке операций
- Responsive: минимальная ширина 1024px (это десктоп-инструмент)

---

## Тестовые данные для разработки

Docker-compose поднимает PostgreSQL и ClickHouse с тестовыми данными (розничная торговля электроникой, Казахстан). В ClickHouse намеренно заложено 8 багов разных типов.

Подключения для тестов:
- **PostgreSQL (1С):** host=localhost, port=5432, db=source_of_truth, user=recon, password=recon123
- **ClickHouse:** host=localhost, port=9000, db=analytics, user=recon, password=recon123

Ожидаемый результат: инструмент должен найти все 8 расхождений — 2 потерянных строки, 1 дубликат, 3 ошибки в значениях, 1 сдвиг даты, 1 пустое поле.
