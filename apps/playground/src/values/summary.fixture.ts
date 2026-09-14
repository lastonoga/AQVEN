import type { Ir } from "../api/types.js"

const ticketSchema = {
  type: "object",
  description: "Обращение из пакета: текст клиента и время",
  required: ["id", "text", "created_at"],
  properties: {
    id: { type: "string", description: "Идентификатор обращения" },
    text: { type: "string", description: "Текст обращения" },
    created_at: { type: "string", description: "Когда обращение создано" },
    author: { type: "object", description: "Кто написал", properties: { name: { type: "string" } } },
  },
}

const statSchema = {
  type: "object",
  description: "Статистика по одной категории",
  required: ["category_id", "count"],
  properties: {
    category_id: { type: "string" },
    count: { type: "integer" },
  },
}

const coverSchema = { type: "string", contentMediaType: "image/png", contentEncoding: "base64" }

export const demoIr: Ir = {
  flow: "demo",
  version: 1,
  input: "Batch",
  output: { type: "Digest", from: "$digest.out" },
  components: {},
  nodes: {},
  types: {
    Ticket: {
      name: "Ticket",
      kind: "object",
      declared: true,
      description: "Обращение из пакета: текст клиента и время",
      example: { id: "tkt-1", text: "Заказ не приехал.", created_at: "2025-03-17T09:12:00Z" },
      schema: ticketSchema,
    },
    "Ticket[]": {
      name: "Ticket[]",
      kind: "array",
      declared: true,
      description: "Список: Обращение из пакета",
      schema: { type: "array", items: ticketSchema },
    },
    "CategoryStat[]": {
      name: "CategoryStat[]",
      kind: "array",
      declared: true,
      description: "Список: Статистика по одной категории",
      schema: { type: "array", items: statSchema },
    },
    Digest: {
      name: "Digest",
      kind: "object",
      declared: true,
      description: "Сводка по пакету обращений: выход воркфлоу",
      schema: {
        type: "object",
        required: ["batch_id", "headline", "stats"],
        properties: {
          batch_id: { type: "string" },
          headline: { type: "string" },
          stats: { type: "array", items: statSchema },
        },
      },
    },
    RouteKind: {
      name: "RouteKind",
      kind: "enum",
      declared: true,
      description: "Направление, в которое уходит обращение после классификации",
      schema: { type: "string", enum: ["billing", "technical"] },
      valueDescriptions: {
        billing: "Деньги: счета, списания, возвраты",
        technical: "Техника: ошибки продукта и интеграции",
      },
    },
    TicketId: {
      name: "TicketId",
      kind: "id",
      declared: true,
      description: "Идентификатор обращения внутри пакета",
      schema: { type: "string" },
      source: "tickets_of_batch()",
      allowedSet: "dynamic",
    },
    Score: {
      name: "Score",
      kind: "scalar",
      declared: true,
      description: "Оценка от 0 до 1",
      schema: { type: "number" },
    },
    Memo: {
      name: "Memo",
      kind: "scalar",
      declared: true,
      description: "Текст меморандума целиком",
      schema: { type: "string" },
    },
    Cover: {
      name: "Cover",
      kind: "scalar",
      declared: true,
      description: "Обложка отчёта",
      schema: coverSchema,
    },
    CreatedAt: {
      name: "CreatedAt",
      kind: "scalar",
      declared: true,
      description: "Когда обращение создано",
      schema: { type: "string", format: "date-time" },
    },
  },
}

export const ticket = {
  id: "tkt-48219",
  text: "Заказ обещали в понедельник, а привезли в среду. Прошу вернуть доставку.",
  created_at: "2025-03-17T09:12:00Z",
}

export const stubDigest = {
  _type: "Digest",
  _stub: true,
  id: "digest_out_315e3b",
  title: "короткий разбор без правок",
  score: 0.89,
}
