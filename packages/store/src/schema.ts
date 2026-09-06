import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Append-only event log. `seq` is the global order; `id` is the UUIDv7 producers reference. */
export const events = sqliteTable(
  "events",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    id: text("id").notNull(),
    type: text("type").notNull(),
    at: text("at").notNull(),
    actor: text("actor", { mode: "json" }).notNull(),
    correlationId: text("correlation_id"),
    causationId: text("causation_id"),
    payload: text("payload", { mode: "json" }).notNull(),
  },
  (table) => [
    uniqueIndex("events_id_unique").on(table.id),
    index("events_type_idx").on(table.type),
    index("events_correlation_idx").on(table.correlationId),
  ],
);
