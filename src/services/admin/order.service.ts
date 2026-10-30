import { and, or } from "@prisma/orm-postgres/orm-client";
import { db } from "../../lib/db.js";
import { notFound } from "../../lib/errors.js";
import { orderListSchema, paginate } from "../../types/admin.types.js";

const userFields = ["id", "email", "firstName", "lastName"] as const;

async function list(query: unknown) {
  const input = orderListSchema.parse(query);
  const pattern = input.search ? `%${input.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;

  // A relation's fields can't be filtered here, so match buyers by email first.
  const buyerIds = pattern
    ? (await db.orm.public.User.where((u) => u.email.ilike(pattern)).select("id").limit(500).all()).map((u) => u.id)
    : [];

  const filtered = db.orm.public.Order.where((o) => {
    const conditions = [o.id.isNotNull()];
    if (input.status) conditions.push(o.status.eq(input.status));
    if (pattern) {
      conditions.push(buyerIds.length ? or(o.reference.ilike(pattern), o.userId.in(buyerIds)) : o.reference.ilike(pattern));
    }
    return and(...conditions);
  });

  const [{ total }, items] = await Promise.all([
    filtered.aggregate((a) => ({ total: a.count() })),
    filtered
      .include("user", (user) => user.select(...userFields))
      .include("purchases", (purchases) => purchases.count())
      .orderBy([(o) => o.createdAt.desc(), (o) => o.id.desc()])
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize)
      .all(),
  ]);

  return paginate(items, total, input.page, input.pageSize);
}

async function get(id: string) {
  const order = await db.orm.public.Order.where({ id })
    .include("user", (user) => user.select(...userFields, "phone"))
    .include("purchases", (purchases) =>
      purchases
        .select("id", "expiresAt", "createdAt")
        .include("module", (module) => module.select("id", "title", "price")),
    )
    .include("transactions", (transactions) =>
      transactions
        .select("id", "reference", "paystackId", "amount", "currency", "status", "gatewayResponse", "channel", "paidAt", "createdAt")
        .orderBy((t) => t.createdAt.desc()),
    )
    .first();
  if (!order) throw notFound("Order not found");
  return order;
}

export const adminOrderService = { list, get };
