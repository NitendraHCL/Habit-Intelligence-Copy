/**
 * One-off seed: copy the existing lib/config/data-sources.ts whitelist into
 * the new DataSourceRegistry table. Run with:
 *   npx tsx scripts/seed-data-source-registry.ts
 *
 * Idempotent — uses upsert on the `table` unique key.
 */

import { PrismaClient } from "@prisma/client";
import { dataSources } from "../lib/config/data-sources";

const prisma = new PrismaClient();

async function main() {
  let created = 0;
  let updated = 0;
  for (const [table, ds] of Object.entries(dataSources)) {
    const existing = await prisma.dataSourceRegistry.findUnique({ where: { table } });
    const data = {
      table,
      label: ds.label,
      cugColumn: ds.cugColumn,
      columns: ds.columns as unknown as object,
      joins: (ds.joins ?? null) as unknown as object | null,
      enabled: true,
    };
    if (existing) {
      await prisma.dataSourceRegistry.update({ where: { table }, data });
      updated++;
    } else {
      await prisma.dataSourceRegistry.create({ data });
      created++;
    }
  }
  console.log(`Seeded data_source_registry: ${created} created, ${updated} updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
