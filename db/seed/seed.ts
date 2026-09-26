// ============================================================
// MIGR8 Database Seed
// Seeds target schema: users, transactions, accounts
// Generates volume suitable for rehearsal & lock duration testing
// ============================================================

import "dotenv/config";
import { query, getPool } from "../connection.js";
import { logger } from "../../observability/logger/index.js";

export async function seedDatabase() {
  logger.info("🌱 Seeding MIGR8 database tables...");

  // 1. Ensure columns exist on users table
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active';
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

    INSERT INTO users (id, email, name, role, password_hash, status)
    VALUES ('00000000-0000-0000-0000-000000000001', 'admin@migr8.internal', 'Lead Database Architect', 'ADMIN', 'demo-hash', 'active')
    ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'USD',
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      merchant VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
  `);

  // 2. Check user row count
  const countRes = await query("SELECT COUNT(*) FROM users");
  const count = parseInt((countRes.rows[0] as { count: string }).count, 10);

  if (count < 1000) {
    logger.info(`Seeding users (currently ${count})...`);
    // Insert 1,000 demo users in batches
    await query(`
      INSERT INTO users (email, name, password_hash, status, created_at)
      SELECT
        'user_' || i || '@example.com',
        'Demo User ' || i,
        'demo_hash_' || i,
        CASE WHEN i % 10 = 0 THEN 'suspended' ELSE 'active' END,
        NOW() - (i || ' hours')::INTERVAL
      FROM generate_series(1, 1000) AS i
      ON CONFLICT (email) DO NOTHING;
    `);

    // Insert sample transactions
    await query(`
      INSERT INTO transactions (user_id, amount, merchant, created_at)
      SELECT
        u.id,
        (random() * 500 + 10)::NUMERIC(12, 2),
        'Merchant ' || (floor(random() * 50) + 1)::INT,
        NOW() - (floor(random() * 30) || ' days')::INTERVAL
      FROM users u
      CROSS JOIN generate_series(1, 3)
      ON CONFLICT DO NOTHING;
    `);

    logger.info("✅ Seed data inserted successfully (1,000 users + 3,000 transactions)");
  } else {
    logger.info(`Database already populated with ${count} users.`);
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, "Seed script failed");
      process.exit(1);
    });
}
