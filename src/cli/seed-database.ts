/**
 * Rich e-commerce database seeder.
 * Generates realistic test data with Faker.js
 */

import { faker } from '@faker-js/faker';
import Database from 'better-sqlite3';
import * as logger from './logger.js';

const CATEGORIES = [
  'Electronics',
  'Computers',
  'Smartphones',
  'Audio',
  'Cameras',
  'Home & Garden',
  'Furniture',
  'Kitchen',
  'Clothing',
  'Shoes',
  'Accessories',
  'Sports',
  'Books',
  'Toys',
  'Beauty',
  'Health',
];

const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const USER_STATUSES = ['active', 'inactive', 'suspended'];

interface SeedCounts {
  users: number;
  products: number;
  orders: number;
  reviews: number;
}

const DEFAULT_COUNTS: SeedCounts = {
  users: 10000,
  products: 5000,
  orders: 50000,
  reviews: 25000,
};

/**
 * Create and seed a rich e-commerce database.
 */
export async function seedRichDatabase(
  dbPath: string,
  counts: SeedCounts = DEFAULT_COUNTS
): Promise<void> {
  logger.section('Creating Rich E-commerce Database');
  logger.newline();

  // Warn about potential database locking
  logger.warn(
    'If the server is running, stop it first to avoid SQLITE_BUSY errors during seeding.'
  );
  logger.newline();

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  try {
    // Disable foreign keys during seeding for performance
    db.pragma('foreign_keys = OFF');

    // Create schema
    createSchema(db);

    // Seed data with progress indicators
    await seedCategories(db);
    await seedUsers(db, counts.users);
    await seedProducts(db, counts.products);
    await seedOrders(db, counts.orders);
    await seedReviews(db, counts.reviews);

    // Sync product review counts and ratings with actual data
    await syncProductReviewStats(db);

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');

    db.close();

    logger.newline();
    logger.successBox(
      `Database created successfully!\n\n` +
        `📊 ${counts.users.toLocaleString()} users\n` +
        `📦 ${counts.products.toLocaleString()} products\n` +
        `🛒 ${counts.orders.toLocaleString()} orders\n` +
        `⭐ ${counts.reviews.toLocaleString()} reviews\n` +
        `💾 Estimated size: ~${estimateSize(counts)} MB`,
      '✨ Database Ready'
    );
  } catch (error: any) {
    db.close();
    throw error;
  }
}

/**
 * Create database schema.
 */
function createSchema(db: Database.Database): void {
  const spinner = logger.spinner('Creating schema...');

  db.exec(`
    -- Categories table
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      city TEXT,
      state TEXT,
      country TEXT DEFAULT 'United States',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_login TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    -- Products table
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category_id INTEGER,
      stock INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      review_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
    CREATE INDEX IF NOT EXISTS idx_products_rating ON products(rating);

    -- Orders table
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      total REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      shipped_at TEXT,
      delivered_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

    -- Order items table
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

    -- Reviews table
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      title TEXT,
      comment TEXT,
      helpful_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
  `);

  spinner.succeed('Schema created with 6 tables and indexes');
}

/**
 * Seed categories.
 */
async function seedCategories(db: Database.Database): Promise<void> {
  const spinner = logger.spinner('Creating categories...');

  const insert = db.prepare(
    'INSERT INTO categories (name, description) VALUES (?, ?)'
  );

  const insertMany = db.transaction(() => {
    for (const category of CATEGORIES) {
      insert.run(category, faker.commerce.productDescription());
    }
  });

  insertMany();

  spinner.succeed(`Created ${CATEGORIES.length} categories`);
}

/**
 * Seed users.
 */
async function seedUsers(db: Database.Database, count: number): Promise<void> {
  const spinner = logger.spinner(`Generating ${count.toLocaleString()} users...`);

  const insert = db.prepare(`
    INSERT INTO users (email, name, status, city, state, country, created_at, last_login)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const batchSize = 1000;
  let completed = 0;
  let userId = 1;

  for (let batch = 0; batch < Math.ceil(count / batchSize); batch++) {
    const insertBatch = db.transaction(() => {
      const limit = Math.min(batchSize, count - batch * batchSize);
      for (let i = 0; i < limit; i++) {
        const createdAt = faker.date.between({
          from: '2020-01-01',
          to: '2024-12-01',
        });

        // Ensure unique email by adding user ID
        const baseEmail = faker.internet.email().toLowerCase();
        const uniqueEmail = baseEmail.replace('@', `+user${userId}@`);

        insert.run(
          uniqueEmail,
          faker.person.fullName(),
          faker.helpers.arrayElement(USER_STATUSES),
          faker.location.city(),
          faker.location.state(),
          'United States',
          createdAt.toISOString(),
          faker.date.between({ from: createdAt, to: new Date() }).toISOString()
        );

        userId++;
      }
    });

    insertBatch();
    completed += Math.min(batchSize, count - batch * batchSize);
    spinner.text = `Generating users... ${completed.toLocaleString()}/${count.toLocaleString()}`;
  }

  spinner.succeed(`Generated ${count.toLocaleString()} users`);
}

/**
 * Seed products.
 */
async function seedProducts(db: Database.Database, count: number): Promise<void> {
  const spinner = logger.spinner(`Generating ${count.toLocaleString()} products...`);

  const insert = db.prepare(`
    INSERT INTO products (name, description, price, category_id, stock, rating, review_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const batchSize = 1000;
  let completed = 0;

  for (let batch = 0; batch < Math.ceil(count / batchSize); batch++) {
    const insertBatch = db.transaction(() => {
      const limit = Math.min(batchSize, count - batch * batchSize);
      for (let i = 0; i < limit; i++) {
        const rating = faker.number.float({ min: 1, max: 5, fractionDigits: 1 });
        const reviewCount = faker.number.int({ min: 0, max: 500 });

        insert.run(
          faker.commerce.productName(),
          faker.commerce.productDescription(),
          parseFloat(faker.commerce.price({ min: 5, max: 2000 })),
          faker.number.int({ min: 1, max: CATEGORIES.length }),
          faker.number.int({ min: 0, max: 1000 }),
          rating,
          reviewCount,
          faker.date
            .between({ from: '2020-01-01', to: '2024-11-01' })
            .toISOString()
        );
      }
    });

    insertBatch();
    completed += Math.min(batchSize, count - batch * batchSize);
    spinner.text = `Generating products... ${completed.toLocaleString()}/${count.toLocaleString()}`;
  }

  spinner.succeed(`Generated ${count.toLocaleString()} products`);
}

/**
 * Seed orders and order items.
 */
async function seedOrders(db: Database.Database, count: number): Promise<void> {
  const spinner = logger.spinner(`Generating ${count.toLocaleString()} orders...`);

  const insertOrder = db.prepare(`
    INSERT INTO orders (user_id, status, total, created_at, shipped_at, delivered_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, quantity, price)
    VALUES (?, ?, ?, ?)
  `);

  const getProductPrice = db.prepare(`
    SELECT price FROM products WHERE id = ?
  `);

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };

  const batchSize = 500;
  let completed = 0;
  let totalItems = 0;

  for (let batch = 0; batch < Math.ceil(count / batchSize); batch++) {
    const insertBatch = db.transaction(() => {
      const limit = Math.min(batchSize, count - batch * batchSize);
      for (let i = 0; i < limit; i++) {
        const orderId = batch * batchSize + i + 1;
        const status = faker.helpers.arrayElement(ORDER_STATUSES);
        const createdAt = faker.date.between({
          from: '2023-01-01',
          to: '2024-12-20',
        });

        let shippedAt = null;
        let deliveredAt = null;

        if (status === 'shipped' || status === 'delivered') {
          shippedAt = faker.date
            .between({ from: createdAt, to: new Date() })
            .toISOString();
        }

        if (status === 'delivered') {
          deliveredAt = faker.date
            .between({ from: new Date(shippedAt!), to: new Date() })
            .toISOString();
        }

        // Generate 1-5 items per order
        const itemCount = faker.number.int({ min: 1, max: 5 });
        let orderTotal = 0;

        for (let j = 0; j < itemCount; j++) {
          const productId = faker.number.int({ min: 1, max: productCount.count });
          const quantity = faker.number.int({ min: 1, max: 3 });

          // Fetch actual product price for data consistency
          const product = getProductPrice.get(productId) as { price: number } | undefined;
          const price = product?.price || parseFloat(faker.commerce.price({ min: 10, max: 500 }));

          insertItem.run(orderId, productId, quantity, price);
          orderTotal += price * quantity;
          totalItems++;
        }

        insertOrder.run(
          faker.number.int({ min: 1, max: userCount.count }),
          status,
          orderTotal,
          createdAt.toISOString(),
          shippedAt,
          deliveredAt
        );
      }
    });

    insertBatch();
    completed += Math.min(batchSize, count - batch * batchSize);
    spinner.text = `Generating orders... ${completed.toLocaleString()}/${count.toLocaleString()}`;
  }

  spinner.succeed(
    `Generated ${count.toLocaleString()} orders with ${totalItems.toLocaleString()} items`
  );
}

/**
 * Seed reviews.
 */
async function seedReviews(db: Database.Database, count: number): Promise<void> {
  const spinner = logger.spinner(`Generating ${count.toLocaleString()} reviews...`);

  const insert = db.prepare(`
    INSERT INTO reviews (product_id, user_id, rating, title, comment, helpful_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };

  const batchSize = 1000;
  let completed = 0;

  for (let batch = 0; batch < Math.ceil(count / batchSize); batch++) {
    const insertBatch = db.transaction(() => {
      const limit = Math.min(batchSize, count - batch * batchSize);
      for (let i = 0; i < limit; i++) {
        const rating = faker.number.int({ min: 1, max: 5 });

        insert.run(
          faker.number.int({ min: 1, max: productCount.count }),
          faker.number.int({ min: 1, max: userCount.count }),
          rating,
          faker.lorem.sentence(),
          faker.lorem.paragraph(),
          faker.number.int({ min: 0, max: 50 }),
          faker.date
            .between({ from: '2023-06-01', to: '2024-12-20' })
            .toISOString()
        );
      }
    });

    insertBatch();
    completed += Math.min(batchSize, count - batch * batchSize);
    spinner.text = `Generating reviews... ${completed.toLocaleString()}/${count.toLocaleString()}`;
  }

  spinner.succeed(`Generated ${count.toLocaleString()} reviews`);
}

/**
 * Sync product review_count and rating fields with actual review data.
 * Fixes the mismatch between randomly generated counts and actual reviews.
 */
async function syncProductReviewStats(db: Database.Database): Promise<void> {
  const spinner = logger.spinner('Syncing product review statistics...');

  // Update review_count and rating based on actual reviews table
  db.prepare(`
    UPDATE products
    SET
      review_count = (
        SELECT COUNT(*)
        FROM reviews
        WHERE reviews.product_id = products.id
      ),
      rating = COALESCE(
        (
          SELECT AVG(rating)
          FROM reviews
          WHERE reviews.product_id = products.id
        ),
        0
      )
  `).run();

  spinner.succeed('Synced product review statistics with actual data');
}

/**
 * Estimate database size in MB.
 */
function estimateSize(counts: SeedCounts): number {
  // Rough estimates based on row sizes
  const userSize = counts.users * 0.2; // ~200 bytes per user
  const productSize = counts.products * 0.3; // ~300 bytes per product
  const orderSize = counts.orders * 0.15; // ~150 bytes per order
  const itemSize = counts.orders * 2.5 * 0.05; // ~2.5 items/order * 50 bytes
  const reviewSize = counts.reviews * 0.25; // ~250 bytes per review

  return Math.round(userSize + productSize + orderSize + itemSize + reviewSize);
}
