# Database Testing Examples

These are comprehensive database testing examples that you can copy and paste into the Monaco editor. Each test includes detailed explanations for first-time users and covers all supported database systems.

## 1. PostgreSQL Database Testing

```javascript
/**
 * 🗄️ DATABASE TEST: PostgreSQL Operations
 * 
 * This test demonstrates PostgreSQL database testing:
 * - Connection establishment
 * - CRUD operations (Create, Read, Update, Delete)
 * - Transaction handling
 * - Error handling
 * - Performance testing
 * 
 * Perfect for testing PostgreSQL databases!
 */
import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { faker } from '@faker-js/faker';

test('PostgreSQL comprehensive database operations', async () => {
  console.log('🐘 Starting PostgreSQL database testing...');
  
  // Database connection configuration
  const client = new Client({
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'testdb',
    password: process.env.PG_PASSWORD || 'password',
    port: process.env.PG_PORT || 5432,
  });

  try {
    // Step 1: Connect to database
    console.log('🔌 Connecting to PostgreSQL database...');
    await client.connect();
    console.log('✅ Database connection established');

    // Step 2: Create test table
    console.log('📋 Creating test table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        age INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);
    console.log('✅ Test table created successfully');

    // Step 3: Generate test data with faker
    const testUsers = Array.from({ length: 5 }, () => ({
      name: faker.person.fullName(),
      email: faker.internet.email(),
      age: faker.number.int({ min: 18, max: 80 })
    }));

    console.log('📝 Generated test user data:', testUsers);

    // Step 4: INSERT operations (Create)
    console.log('➕ Testing INSERT operations...');
    const insertedUsers = [];
    
    for (const user of testUsers) {
      const insertQuery = `
        INSERT INTO test_users (name, email, age) 
        VALUES ($1, $2, $3) 
        RETURNING id, name, email, age, created_at
      `;
      
      const result = await client.query(insertQuery, [user.name, user.email, user.age]);
      const insertedUser = result.rows[0];
      insertedUsers.push(insertedUser);
      
      expect(insertedUser.name).toBe(user.name);
      expect(insertedUser.email).toBe(user.email);
      expect(insertedUser.age).toBe(user.age);
      
      console.log(`✅ User created: ${insertedUser.name} (ID: ${insertedUser.id})`);
    }

    // Step 5: SELECT operations (Read)
    console.log('🔍 Testing SELECT operations...');
    
    // Select all users
    const allUsersResult = await client.query('SELECT * FROM test_users ORDER BY id');
    expect(allUsersResult.rows.length).toBeGreaterThanOrEqual(testUsers.length);
    console.log(`✅ Found ${allUsersResult.rows.length} users in database`);
    
    // Select specific user by ID
    const firstUser = insertedUsers[0];
    const specificUserResult = await client.query(
      'SELECT * FROM test_users WHERE id = $1',
      [firstUser.id]
    );
    
    expect(specificUserResult.rows.length).toBe(1);
    expect(specificUserResult.rows[0].name).toBe(firstUser.name);
    console.log(`✅ Successfully retrieved user: ${specificUserResult.rows[0].name}`);

    // Step 6: UPDATE operations
    console.log('✏️ Testing UPDATE operations...');
    const userToUpdate = insertedUsers[1];
    const newName = faker.person.fullName();
    
    const updateResult = await client.query(
      'UPDATE test_users SET name = $1 WHERE id = $2 RETURNING *',
      [newName, userToUpdate.id]
    );
    
    expect(updateResult.rows[0].name).toBe(newName);
    console.log(`✅ User updated: ${userToUpdate.name} → ${newName}`);

    // Step 7: DELETE operations
    console.log('🗑️ Testing DELETE operations...');
    const userToDelete = insertedUsers[2];
    
    const deleteResult = await client.query(
      'DELETE FROM test_users WHERE id = $1',
      [userToDelete.id]
    );
    
    expect(deleteResult.rowCount).toBe(1);
    console.log(`✅ User deleted: ${userToDelete.name}`);
    
    // Verify deletion
    const deletedUserCheck = await client.query(
      'SELECT * FROM test_users WHERE id = $1',
      [userToDelete.id]
    );
    expect(deletedUserCheck.rows.length).toBe(0);
    console.log('✅ Deletion verified');

    // Step 8: Transaction testing
    console.log('💼 Testing transactions...');
    
    try {
      await client.query('BEGIN');
      
      // Insert user in transaction
      const transactionUser = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        age: faker.number.int({ min: 18, max: 80 })
      };
      
      const transactionResult = await client.query(
        'INSERT INTO test_users (name, email, age) VALUES ($1, $2, $3) RETURNING id',
        [transactionUser.name, transactionUser.email, transactionUser.age]
      );
      
      const newUserId = transactionResult.rows[0].id;
      console.log(`📝 User created in transaction: ID ${newUserId}`);
      
      // Rollback transaction
      await client.query('ROLLBACK');
      console.log('↩️ Transaction rolled back');
      
      // Verify rollback
      const rollbackCheck = await client.query(
        'SELECT * FROM test_users WHERE id = $1',
        [newUserId]
      );
      expect(rollbackCheck.rows.length).toBe(0);
      console.log('✅ Transaction rollback verified');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    // Step 9: Complex queries and joins
    console.log('🔗 Testing complex queries...');
    
    // Create related table for join testing
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES test_users(id),
        product_name VARCHAR(255),
        amount DECIMAL(10,2),
        order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert test orders
    const remainingUsers = await client.query('SELECT id FROM test_users LIMIT 2');
    if (remainingUsers.rows.length > 0) {
      const userId = remainingUsers.rows[0].id;
      await client.query(
        'INSERT INTO test_orders (user_id, product_name, amount) VALUES ($1, $2, $3)',
        [userId, faker.commerce.productName(), faker.commerce.price()]
      );
      
      // Test JOIN query
      const joinResult = await client.query(`
        SELECT u.name, u.email, o.product_name, o.amount 
        FROM test_users u 
        LEFT JOIN test_orders o ON u.id = o.user_id 
        WHERE u.id = $1
      `, [userId]);
      
      expect(joinResult.rows.length).toBeGreaterThan(0);
      console.log('✅ JOIN query executed successfully');
    }

    // Step 10: Performance testing
    console.log('⚡ Testing database performance...');
    const performanceStart = Date.now();
    
    const performanceResult = await client.query(
      'SELECT COUNT(*) as total_users FROM test_users'
    );
    
    const performanceTime = Date.now() - performanceStart;
    expect(performanceTime).toBeLessThan(1000); // Should complete within 1 second
    
    console.log(`⏱️ Query performance: ${performanceTime}ms`);
    console.log(`📊 Total users in database: ${performanceResult.rows[0].total_users}`);

  } catch (error) {
    console.error('❌ Database test failed:', error);
    throw error;
  } finally {
    // Cleanup: Drop test tables
    console.log('🧹 Cleaning up test data...');
    try {
      await client.query('DROP TABLE IF EXISTS test_orders');
      await client.query('DROP TABLE IF EXISTS test_users');
      console.log('✅ Test tables cleaned up');
    } catch (cleanupError) {
      console.warn('⚠️ Cleanup warning:', cleanupError.message);
    }
    
    // Close connection
    await client.end();
    console.log('✅ Database connection closed');
  }
  
  console.log('🎉 PostgreSQL database testing completed successfully!');
});
```

## 2. MySQL Database Testing

```javascript
/**
 * 🗄️ DATABASE TEST: MySQL Operations
 * 
 * This test demonstrates MySQL database testing:
 * - Connection management
 * - CRUD operations with prepared statements
 * - Transaction handling
 * - Index testing
 * - Performance optimization
 */
import { test, expect } from '@playwright/test';
import mysql from 'mysql2/promise';
import { faker } from '@faker-js/faker';

test('MySQL comprehensive database operations', async () => {
  console.log('🐬 Starting MySQL database testing...');
  
  let connection;
  
  try {
    // Step 1: Create database connection
    console.log('🔌 Connecting to MySQL database...');
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'password',
      database: process.env.MYSQL_DATABASE || 'testdb',
      port: process.env.MYSQL_PORT || 3306
    });
    console.log('✅ MySQL connection established');

    // Step 2: Create test table with indexes
    console.log('📋 Creating test table with indexes...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mysql_test_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        category VARCHAR(100),
        stock_quantity INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_category (category),
        INDEX idx_price (price),
        INDEX idx_name (name)
      )
    `);
    console.log('✅ Test table with indexes created');

    // Step 3: Generate and insert test data
    console.log('📝 Generating and inserting test products...');
    const testProducts = Array.from({ length: 10 }, () => ({
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      price: parseFloat(faker.commerce.price()),
      category: faker.commerce.department(),
      stock_quantity: faker.number.int({ min: 0, max: 100 })
    }));

    const insertedProducts = [];
    
    for (const product of testProducts) {
      const [result] = await connection.execute(
        'INSERT INTO mysql_test_products (name, description, price, category, stock_quantity) VALUES (?, ?, ?, ?, ?)',
        [product.name, product.description, product.price, product.category, product.stock_quantity]
      );
      
      insertedProducts.push({ ...product, id: result.insertId });
      console.log(`✅ Product created: ${product.name} (ID: ${result.insertId})`);
    }

    // Step 4: Test various SELECT operations
    console.log('🔍 Testing SELECT operations...');
    
    // Select all products
    const [allProducts] = await connection.execute('SELECT * FROM mysql_test_products ORDER BY id');
    expect(allProducts.length).toBeGreaterThanOrEqual(testProducts.length);
    console.log(`✅ Found ${allProducts.length} products`);
    
    // Select with WHERE clause
    const firstProduct = insertedProducts[0];
    const [specificProduct] = await connection.execute(
      'SELECT * FROM mysql_test_products WHERE id = ?',
      [firstProduct.id]
    );
    expect(specificProduct[0].name).toBe(firstProduct.name);
    console.log(`✅ Retrieved specific product: ${specificProduct[0].name}`);
    
    // Select with complex WHERE conditions
    const [expensiveProducts] = await connection.execute(
      'SELECT * FROM mysql_test_products WHERE price > ? AND stock_quantity > ? ORDER BY price DESC',
      [50, 10]
    );
    console.log(`✅ Found ${expensiveProducts.length} expensive products with good stock`);

    // Step 5: Test aggregate functions
    console.log('📊 Testing aggregate functions...');
    const [aggregateResult] = await connection.execute(`
      SELECT 
        COUNT(*) as total_products,
        AVG(price) as average_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        SUM(stock_quantity) as total_stock
      FROM mysql_test_products
    `);
    
    const stats = aggregateResult[0];
    expect(stats.total_products).toBeGreaterThan(0);
    console.log('📈 Product statistics:', {
      total: stats.total_products,
      avgPrice: parseFloat(stats.average_price).toFixed(2),
      minPrice: stats.min_price,
      maxPrice: stats.max_price,
      totalStock: stats.total_stock
    });

    // Step 6: Test UPDATE operations
    console.log('✏️ Testing UPDATE operations...');
    const productToUpdate = insertedProducts[1];
    const newPrice = parseFloat(faker.commerce.price());
    const newStock = faker.number.int({ min: 50, max: 200 });
    
    const [updateResult] = await connection.execute(
      'UPDATE mysql_test_products SET price = ?, stock_quantity = ? WHERE id = ?',
      [newPrice, newStock, productToUpdate.id]
    );
    
    expect(updateResult.affectedRows).toBe(1);
    console.log(`✅ Product updated: ${productToUpdate.name} - New price: $${newPrice}`);
    
    // Verify update
    const [updatedProduct] = await connection.execute(
      'SELECT price, stock_quantity FROM mysql_test_products WHERE id = ?',
      [productToUpdate.id]
    );
    expect(parseFloat(updatedProduct[0].price)).toBe(newPrice);
    console.log('✅ Update verification successful');

    // Step 7: Test transactions
    console.log('💼 Testing MySQL transactions...');
    
    await connection.beginTransaction();
    
    try {
      // Create a new product in transaction
      const transactionProduct = {
        name: faker.commerce.productName(),
        description: faker.commerce.productDescription(),
        price: parseFloat(faker.commerce.price()),
        category: faker.commerce.department(),
        stock_quantity: faker.number.int({ min: 10, max: 50 })
      };
      
      const [transactionResult] = await connection.execute(
        'INSERT INTO mysql_test_products (name, description, price, category, stock_quantity) VALUES (?, ?, ?, ?, ?)',
        [transactionProduct.name, transactionProduct.description, transactionProduct.price, transactionProduct.category, transactionProduct.stock_quantity]
      );
      
      const newProductId = transactionResult.insertId;
      console.log(`📝 Product created in transaction: ID ${newProductId}`);
      
      // Simulate an error condition and rollback
      await connection.rollback();
      console.log('↩️ Transaction rolled back');
      
      // Verify rollback
      const [rollbackCheck] = await connection.execute(
        'SELECT * FROM mysql_test_products WHERE id = ?',
        [newProductId]
      );
      expect(rollbackCheck.length).toBe(0);
      console.log('✅ Transaction rollback verified');
      
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    // Step 8: Test batch operations
    console.log('📦 Testing batch operations...');
    const batchProducts = Array.from({ length: 5 }, () => [
      faker.commerce.productName(),
      faker.commerce.productDescription(),
      parseFloat(faker.commerce.price()),
      faker.commerce.department(),
      faker.number.int({ min: 1, max: 100 })
    ]);
    
    const batchInsertSql = 'INSERT INTO mysql_test_products (name, description, price, category, stock_quantity) VALUES ?';
    const [batchResult] = await connection.query(batchInsertSql, [batchProducts]);
    
    expect(batchResult.affectedRows).toBe(batchProducts.length);
    console.log(`✅ Batch inserted ${batchProducts.length} products`);

    // Step 9: Performance testing with indexes
    console.log('⚡ Testing query performance with indexes...');
    
    // Test index usage
    const performanceStart = Date.now();
    const [indexedQuery] = await connection.execute(
      'SELECT * FROM mysql_test_products WHERE category = ? ORDER BY price',
      [testProducts[0].category]
    );
    const performanceTime = Date.now() - performanceStart;
    
    expect(performanceTime).toBeLessThan(100); // Should be fast with index
    console.log(`⏱️ Indexed query performance: ${performanceTime}ms`);
    console.log(`📊 Found ${indexedQuery.length} products in category`);

    // Step 10: Test DELETE operations
    console.log('🗑️ Testing DELETE operations...');
    const productToDelete = insertedProducts[2];
    
    const [deleteResult] = await connection.execute(
      'DELETE FROM mysql_test_products WHERE id = ?',
      [productToDelete.id]
    );
    
    expect(deleteResult.affectedRows).toBe(1);
    console.log(`✅ Product deleted: ${productToDelete.name}`);

  } catch (error) {
    console.error('❌ MySQL test failed:', error);
    throw error;
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up test data...');
    if (connection) {
      try {
        await connection.execute('DROP TABLE IF EXISTS mysql_test_products');
        console.log('✅ Test table cleaned up');
      } catch (cleanupError) {
        console.warn('⚠️ Cleanup warning:', cleanupError.message);
      }
      
      await connection.end();
      console.log('✅ MySQL connection closed');
    }
  }
  
  console.log('🎉 MySQL database testing completed successfully!');
});
```

## 3. MongoDB Database Testing

```javascript
/**
 * 🗄️ DATABASE TEST: MongoDB Operations
 * 
 * This test demonstrates MongoDB (NoSQL) database testing:
 * - Connection management
 * - Document CRUD operations
 * - Aggregation pipelines
 * - Index creation and testing
 * - Complex queries with filtering
 */
import { test, expect } from '@playwright/test';
import { MongoClient } from 'mongodb';
import { faker } from '@faker-js/faker';

test('MongoDB comprehensive document operations', async () => {
  console.log('🍃 Starting MongoDB database testing...');
  
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DATABASE || 'testdb';
  const client = new MongoClient(uri);
  
  try {
    // Step 1: Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ MongoDB connection established');
    
    const db = client.db(dbName);
    const usersCollection = db.collection('test_users');
    const postsCollection = db.collection('test_posts');

    // Step 2: Create indexes for performance
    console.log('📑 Creating indexes...');
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ 'profile.age': 1 });
    await postsCollection.createIndex({ authorId: 1 });
    await postsCollection.createIndex({ tags: 1 });
    await postsCollection.createIndex({ createdAt: -1 });
    console.log('✅ Indexes created successfully');

    // Step 3: Generate test users with complex nested data
    console.log('👥 Generating test users...');
    const testUsers = Array.from({ length: 8 }, () => ({
      name: faker.person.fullName(),
      email: faker.internet.email(),
      profile: {
        age: faker.number.int({ min: 18, max: 80 }),
        bio: faker.lorem.paragraph(),
        location: {
          city: faker.location.city(),
          country: faker.location.country(),
          coordinates: {
            lat: parseFloat(faker.location.latitude()),
            lng: parseFloat(faker.location.longitude())
          }
        },
        interests: faker.helpers.arrayElements([
          'technology', 'sports', 'music', 'art', 'travel', 'cooking', 'reading'
        ], { min: 2, max: 5 })
      },
      settings: {
        notifications: faker.datatype.boolean(),
        privacy: faker.helpers.arrayElement(['public', 'private', 'friends']),
        theme: faker.helpers.arrayElement(['light', 'dark', 'auto'])
      },
      createdAt: new Date(),
      isActive: faker.datatype.boolean()
    }));

    // Step 4: Insert users (Create operation)
    console.log('➕ Inserting test users...');
    const insertResult = await usersCollection.insertMany(testUsers);
    expect(Object.keys(insertResult.insertedIds).length).toBe(testUsers.length);
    console.log(`✅ Inserted ${testUsers.length} users`);

    // Get inserted user IDs for creating posts
    const insertedUserIds = Object.values(insertResult.insertedIds);

    // Step 5: Generate and insert test posts
    console.log('📝 Creating test posts...');
    const testPosts = Array.from({ length: 15 }, () => ({
      title: faker.lorem.sentence(),
      content: faker.lorem.paragraphs(3),
      authorId: faker.helpers.arrayElement(insertedUserIds),
      tags: faker.helpers.arrayElements([
        'javascript', 'mongodb', 'testing', 'programming', 'database', 'nosql', 'development'
      ], { min: 1, max: 4 }),
      metadata: {
        views: faker.number.int({ min: 0, max: 1000 }),
        likes: faker.number.int({ min: 0, max: 100 }),
        readTime: faker.number.int({ min: 1, max: 15 })
      },
      createdAt: faker.date.recent({ days: 30 }),
      isPublished: faker.datatype.boolean()
    }));

    const postsInsertResult = await postsCollection.insertMany(testPosts);
    expect(Object.keys(postsInsertResult.insertedIds).length).toBe(testPosts.length);
    console.log(`✅ Inserted ${testPosts.length} posts`);

    // Step 6: Test various query operations (Read)
    console.log('🔍 Testing query operations...');
    
    // Find all active users
    const activeUsers = await usersCollection.find({ isActive: true }).toArray();
    console.log(`✅ Found ${activeUsers.length} active users`);
    
    // Find users by age range
    const youngUsers = await usersCollection.find({
      'profile.age': { $gte: 18, $lte: 30 }
    }).toArray();
    console.log(`✅ Found ${youngUsers.length} young users (18-30)`);
    
    // Find users with specific interests
    const techUsers = await usersCollection.find({
      'profile.interests': { $in: ['technology', 'programming'] }
    }).toArray();
    console.log(`✅ Found ${techUsers.length} tech-interested users`);
    
    // Complex query with multiple conditions
    const complexQuery = await usersCollection.find({
      $and: [
        { isActive: true },
        { 'profile.age': { $gte: 25 } },
        { 'settings.privacy': { $ne: 'private' } }
      ]
    }).toArray();
    console.log(`✅ Complex query returned ${complexQuery.length} users`);

    // Step 7: Test aggregation pipelines
    console.log('📊 Testing aggregation pipelines...');
    
    // User statistics by age group
    const ageGroupStats = await usersCollection.aggregate([
      {
        $bucket: {
          groupBy: '$profile.age',
          boundaries: [18, 30, 50, 100],
          default: 'Other',
          output: {
            count: { $sum: 1 },
            avgAge: { $avg: '$profile.age' },
            users: { $push: '$name' }
          }
        }
      }
    ]).toArray();
    
    expect(ageGroupStats.length).toBeGreaterThan(0);
    console.log('📈 Age group statistics:', ageGroupStats);
    
    // Posts with author information (lookup/join)
    const postsWithAuthors = await postsCollection.aggregate([
      {
        $lookup: {
          from: 'test_users',
          localField: 'authorId',
          foreignField: '_id',
          as: 'author'
        }
      },
      {
        $unwind: '$author'
      },
      {
        $project: {
          title: 1,
          'author.name': 1,
          'author.email': 1,
          'metadata.views': 1,
          tags: 1
        }
      },
      { $limit: 5 }
    ]).toArray();
    
    expect(postsWithAuthors.length).toBeGreaterThan(0);
    console.log(`✅ Found ${postsWithAuthors.length} posts with author info`);

    // Step 8: Test update operations
    console.log('✏️ Testing update operations...');
    
    // Update single document
    const userToUpdate = activeUsers[0];
    const updateResult = await usersCollection.updateOne(
      { _id: userToUpdate._id },
      {
        $set: { 
          'profile.bio': 'Updated bio for testing',
          'settings.theme': 'dark',
          updatedAt: new Date()
        },
        $inc: { 'profile.loginCount': 1 }
      }
    );
    
    expect(updateResult.modifiedCount).toBe(1);
    console.log(`✅ Updated user: ${userToUpdate.name}`);
    
    // Update multiple documents
    const bulkUpdateResult = await usersCollection.updateMany(
      { 'profile.age': { $gte: 50 } },
      {
        $set: { 'settings.notifications': true },
        $addToSet: { 'profile.interests': 'senior-community' }
      }
    );
    
    console.log(`✅ Bulk updated ${bulkUpdateResult.modifiedCount} senior users`);

    // Step 9: Test array operations
    console.log('📋 Testing array operations...');
    
    // Add new interest to a user
    await usersCollection.updateOne(
      { _id: userToUpdate._id },
      { $addToSet: { 'profile.interests': 'database-testing' } }
    );
    
    // Remove an interest from a user
    await usersCollection.updateOne(
      { _id: userToUpdate._id },
      { $pull: { 'profile.interests': 'art' } }
    );
    
    // Verify array operations
    const updatedUser = await usersCollection.findOne({ _id: userToUpdate._id });
    expect(updatedUser.profile.interests).toContain('database-testing');
    console.log('✅ Array operations verified');

    // Step 10: Test text search (if text index exists)
    console.log('🔎 Testing text search...');
    
    // Create text index for search
    try {
      await postsCollection.createIndex({ 
        title: 'text', 
        content: 'text', 
        tags: 'text' 
      });
      
      const searchResults = await postsCollection.find({
        $text: { $search: 'javascript programming' }
      }).toArray();
      
      console.log(`✅ Text search found ${searchResults.length} posts`);
    } catch (error) {
      console.log('ℹ️ Text search index already exists or not supported');
    }

    // Step 11: Test performance with large dataset queries
    console.log('⚡ Testing query performance...');
    
    const performanceStart = Date.now();
    const performanceQuery = await usersCollection.find({
      'profile.age': { $gte: 25, $lte: 45 },
      isActive: true
    }).sort({ createdAt: -1 }).limit(10).toArray();
    
    const performanceTime = Date.now() - performanceStart;
    expect(performanceTime).toBeLessThan(1000); // Should complete within 1 second
    console.log(`⏱️ Performance query: ${performanceTime}ms, found ${performanceQuery.length} users`);

    // Step 12: Test delete operations
    console.log('🗑️ Testing delete operations...');
    
    // Delete single document
    const userToDelete = activeUsers[1];
    const deleteResult = await usersCollection.deleteOne({ _id: userToDelete._id });
    expect(deleteResult.deletedCount).toBe(1);
    console.log(`✅ Deleted user: ${userToDelete.name}`);
    
    // Delete posts by deleted user
    const deletePostsResult = await postsCollection.deleteMany({ authorId: userToDelete._id });
    console.log(`✅ Deleted ${deletePostsResult.deletedCount} posts by deleted user`);

    // Step 13: Test transactions (if replica set is available)
    console.log('💼 Testing transactions...');
    
    const session = client.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Create user and post in transaction
        const transactionUser = {
          name: faker.person.fullName(),
          email: faker.internet.email(),
          profile: { age: 25 },
          createdAt: new Date(),
          isActive: true
        };
        
        const userResult = await usersCollection.insertOne(transactionUser, { session });
        
        const transactionPost = {
          title: 'Transaction Test Post',
          content: 'This post was created in a transaction',
          authorId: userResult.insertedId,
          createdAt: new Date(),
          isPublished: true
        };
        
        await postsCollection.insertOne(transactionPost, { session });
        
        console.log('✅ Transaction completed successfully');
      });
    } catch (error) {
      console.log('ℹ️ Transactions may not be available (requires replica set)');
    } finally {
      await session.endSession();
    }

  } catch (error) {
    console.error('❌ MongoDB test failed:', error);
    throw error;
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up test data...');
    if (client) {
      try {
        const db = client.db(dbName);
        await db.collection('test_users').drop();
        await db.collection('test_posts').drop();
        console.log('✅ Test collections cleaned up');
      } catch (cleanupError) {
        console.warn('⚠️ Cleanup warning:', cleanupError.message);
      }
      
      await client.close();
      console.log('✅ MongoDB connection closed');
    }
  }
  
  console.log('🎉 MongoDB database testing completed successfully!');
});
```

## 4. Microsoft SQL Server Testing

```javascript
/**
 * 🗄️ DATABASE TEST: Microsoft SQL Server Operations
 * 
 * This test demonstrates SQL Server database testing:
 * - Connection pooling
 * - Stored procedures
 * - Complex joins and CTEs
 * - Full-text search
 * - Performance monitoring
 */
import { test, expect } from '@playwright/test';
import sql from 'mssql';
import { faker } from '@faker-js/faker';

test('SQL Server comprehensive database operations', async () => {
  console.log('🏢 Starting SQL Server database testing...');
  
  const config = {
    user: process.env.MSSQL_USER || 'sa',
    password: process.env.MSSQL_PASSWORD || 'YourPassword123!',
    server: process.env.MSSQL_SERVER || 'localhost',
    database: process.env.MSSQL_DATABASE || 'master',
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };

  let pool;
  
  try {
    // Step 1: Create connection pool
    console.log('🔌 Creating SQL Server connection pool...');
    pool = await sql.connect(config);
    console.log('✅ SQL Server connection pool established');

    // Step 2: Create test database and tables
    console.log('📋 Creating test tables...');
    
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Employees' AND xtype='U')
      CREATE TABLE Employees (
        EmployeeID int IDENTITY(1,1) PRIMARY KEY,
        FirstName nvarchar(50) NOT NULL,
        LastName nvarchar(50) NOT NULL,
        Email nvarchar(100) UNIQUE NOT NULL,
        DepartmentID int,
        Salary decimal(10,2),
        HireDate datetime2 DEFAULT GETDATE(),
        IsActive bit DEFAULT 1
      )
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Departments' AND xtype='U')
      CREATE TABLE Departments (
        DepartmentID int IDENTITY(1,1) PRIMARY KEY,
        DepartmentName nvarchar(100) NOT NULL,
        Budget decimal(15,2),
        ManagerID int
      )
    `);

    console.log('✅ Test tables created');

    // Step 3: Insert test departments
    console.log('🏢 Creating test departments...');
    const departments = [
      { name: 'Engineering', budget: 500000.00 },
      { name: 'Marketing', budget: 300000.00 },
      { name: 'Sales', budget: 400000.00 },
      { name: 'HR', budget: 200000.00 }
    ];

    const insertedDepartments = [];
    for (const dept of departments) {
      const request = pool.request();
      request.input('DepartmentName', sql.NVarChar(100), dept.name);
      request.input('Budget', sql.Decimal(15,2), dept.budget);
      
      const result = await request.query(`
        INSERT INTO Departments (DepartmentName, Budget) 
        OUTPUT INSERTED.DepartmentID
        VALUES (@DepartmentName, @Budget)
      `);
      
      insertedDepartments.push({
        id: result.recordset[0].DepartmentID,
        name: dept.name,
        budget: dept.budget
      });
      
      console.log(`✅ Department created: ${dept.name} (ID: ${result.recordset[0].DepartmentID})`);
    }

    // Step 4: Insert test employees with parameterized queries
    console.log('👥 Creating test employees...');
    const testEmployees = Array.from({ length: 20 }, () => ({
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
      departmentId: faker.helpers.arrayElement(insertedDepartments).id,
      salary: faker.number.float({ min: 30000, max: 150000, fractionDigits: 2 })
    }));

    const insertedEmployees = [];
    for (const employee of testEmployees) {
      const request = pool.request();
      request.input('FirstName', sql.NVarChar(50), employee.firstName);
      request.input('LastName', sql.NVarChar(50), employee.lastName);
      request.input('Email', sql.NVarChar(100), employee.email);
      request.input('DepartmentID', sql.Int, employee.departmentId);
      request.input('Salary', sql.Decimal(10,2), employee.salary);
      
      const result = await request.query(`
        INSERT INTO Employees (FirstName, LastName, Email, DepartmentID, Salary)
        OUTPUT INSERTED.EmployeeID
        VALUES (@FirstName, @LastName, @Email, @DepartmentID, @Salary)
      `);
      
      insertedEmployees.push({
        ...employee,
        id: result.recordset[0].EmployeeID
      });
    }
    
    console.log(`✅ Created ${insertedEmployees.length} employees`);

    // Step 5: Test complex queries with joins
    console.log('🔗 Testing complex JOIN queries...');
    
    const joinQuery = await pool.request().query(`
      SELECT 
        e.EmployeeID,
        e.FirstName + ' ' + e.LastName AS FullName,
        e.Email,
        e.Salary,
        d.DepartmentName,
        d.Budget
      FROM Employees e
      INNER JOIN Departments d ON e.DepartmentID = d.DepartmentID
      WHERE e.IsActive = 1
      ORDER BY e.Salary DESC
    `);
    
    expect(joinQuery.recordset.length).toBeGreaterThan(0);
    console.log(`✅ JOIN query returned ${joinQuery.recordset.length} employee records`);

    // Step 6: Test aggregate functions and GROUP BY
    console.log('📊 Testing aggregate functions...');
    
    const aggregateQuery = await pool.request().query(`
      SELECT 
        d.DepartmentName,
        COUNT(e.EmployeeID) AS EmployeeCount,
        AVG(e.Salary) AS AverageSalary,
        MIN(e.Salary) AS MinSalary,
        MAX(e.Salary) AS MaxSalary,
        SUM(e.Salary) AS TotalSalaries
      FROM Departments d
      LEFT JOIN Employees e ON d.DepartmentID = e.DepartmentID AND e.IsActive = 1
      GROUP BY d.DepartmentID, d.DepartmentName
      ORDER BY EmployeeCount DESC
    `);
    
    expect(aggregateQuery.recordset.length).toBe(departments.length);
    console.log('📈 Department statistics:', aggregateQuery.recordset);

    // Step 7: Test Common Table Expressions (CTEs)
    console.log('🔄 Testing Common Table Expressions...');
    
    const cteQuery = await pool.request().query(`
      WITH SalaryRanks AS (
        SELECT 
          EmployeeID,
          FirstName + ' ' + LastName AS FullName,
          Salary,
          DepartmentID,
          ROW_NUMBER() OVER (PARTITION BY DepartmentID ORDER BY Salary DESC) AS SalaryRank
        FROM Employees
        WHERE IsActive = 1
      )
      SELECT 
        sr.FullName,
        sr.Salary,
        d.DepartmentName,
        sr.SalaryRank
      FROM SalaryRanks sr
      INNER JOIN Departments d ON sr.DepartmentID = d.DepartmentID
      WHERE sr.SalaryRank <= 3
      ORDER BY d.DepartmentName, sr.SalaryRank
    `);
    
    expect(cteQuery.recordset.length).toBeGreaterThan(0);
    console.log(`✅ CTE query returned top 3 earners per department: ${cteQuery.recordset.length} records`);

    // Step 8: Test stored procedures
    console.log('⚙️ Testing stored procedures...');
    
    // Create a stored procedure
    await pool.request().query(`
      IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'GetEmployeesByDepartment')
        DROP PROCEDURE GetEmployeesByDepartment
    `);
    
    await pool.request().query(`
      CREATE PROCEDURE GetEmployeesByDepartment
        @DepartmentID int,
        @MinSalary decimal(10,2) = 0
      AS
      BEGIN
        SELECT 
          EmployeeID,
          FirstName + ' ' + LastName AS FullName,
          Email,
          Salary,
          HireDate
        FROM Employees
        WHERE DepartmentID = @DepartmentID 
          AND Salary >= @MinSalary
          AND IsActive = 1
        ORDER BY Salary DESC
      END
    `);
    
    // Execute the stored procedure
    const request = pool.request();
    request.input('DepartmentID', sql.Int, insertedDepartments[0].id);
    request.input('MinSalary', sql.Decimal(10,2), 50000);
    
    const spResult = await request.execute('GetEmployeesByDepartment');
    console.log(`✅ Stored procedure returned ${spResult.recordset.length} employees`);

    // Step 9: Test transactions
    console.log('💼 Testing transactions...');
    
    const transaction = new sql.Transaction(pool);
    
    try {
      await transaction.begin();
      
      const transactionRequest = new sql.Request(transaction);
      
      // Insert new employee in transaction
      transactionRequest.input('FirstName', sql.NVarChar(50), 'Transaction');
      transactionRequest.input('LastName', sql.NVarChar(50), 'Test');
      transactionRequest.input('Email', sql.NVarChar(100), 'transaction@test.com');
      transactionRequest.input('DepartmentID', sql.Int, insertedDepartments[0].id);
      transactionRequest.input('Salary', sql.Decimal(10,2), 75000);
      
      const transResult = await transactionRequest.query(`
        INSERT INTO Employees (FirstName, LastName, Email, DepartmentID, Salary)
        OUTPUT INSERTED.EmployeeID
        VALUES (@FirstName, @LastName, @Email, @DepartmentID, @Salary)
      `);
      
      const newEmployeeId = transResult.recordset[0].EmployeeID;
      console.log(`📝 Employee created in transaction: ID ${newEmployeeId}`);
      
      // Rollback to test rollback functionality
      await transaction.rollback();
      console.log('↩️ Transaction rolled back');
      
      // Verify rollback
      const rollbackCheck = await pool.request()
        .input('EmployeeID', sql.Int, newEmployeeId)
        .query('SELECT * FROM Employees WHERE EmployeeID = @EmployeeID');
      
      expect(rollbackCheck.recordset.length).toBe(0);
      console.log('✅ Transaction rollback verified');
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    // Step 10: Test performance monitoring
    console.log('⚡ Testing performance monitoring...');
    
    const performanceStart = Date.now();
    
    const performanceQuery = await pool.request().query(`
      SELECT 
        e.EmployeeID,
        e.FirstName + ' ' + e.LastName AS FullName,
        e.Salary,
        d.DepartmentName,
        CASE 
          WHEN e.Salary >= 100000 THEN 'Senior'
          WHEN e.Salary >= 60000 THEN 'Mid-level'
          ELSE 'Junior'
        END AS SalaryLevel
      FROM Employees e
      INNER JOIN Departments d ON e.DepartmentID = d.DepartmentID
      WHERE e.IsActive = 1
        AND e.Salary BETWEEN 40000 AND 120000
      ORDER BY e.Salary DESC
    `);
    
    const performanceTime = Date.now() - performanceStart;
    expect(performanceTime).toBeLessThan(1000); // Should complete within 1 second
    
    console.log(`⏱️ Performance query: ${performanceTime}ms`);
    console.log(`📊 Query returned ${performanceQuery.recordset.length} employees`);

    // Step 11: Test UPDATE operations
    console.log('✏️ Testing UPDATE operations...');
    
    const employeeToUpdate = insertedEmployees[0];
    const updateRequest = pool.request();
    updateRequest.input('EmployeeID', sql.Int, employeeToUpdate.id);
    updateRequest.input('NewSalary', sql.Decimal(10,2), employeeToUpdate.salary * 1.1);
    
    const updateResult = await updateRequest.query(`
      UPDATE Employees 
      SET Salary = @NewSalary
      WHERE EmployeeID = @EmployeeID
    `);
    
    expect(updateResult.rowsAffected[0]).toBe(1);
    console.log(`✅ Employee salary updated: ${employeeToUpdate.firstName} ${employeeToUpdate.lastName}`);

    // Step 12: Test DELETE operations
    console.log('🗑️ Testing DELETE operations...');
    
    const employeeToDelete = insertedEmployees[1];
    const deleteRequest = pool.request();
    deleteRequest.input('EmployeeID', sql.Int, employeeToDelete.id);
    
    const deleteResult = await deleteRequest.query(`
      DELETE FROM Employees WHERE EmployeeID = @EmployeeID
    `);
    
    expect(deleteResult.rowsAffected[0]).toBe(1);
    console.log(`✅ Employee deleted: ${employeeToDelete.firstName} ${employeeToDelete.lastName}`);

  } catch (error) {
    console.error('❌ SQL Server test failed:', error);
    throw error;
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up test data...');
    if (pool) {
      try {
        await pool.request().query('DROP TABLE IF EXISTS Employees');
        await pool.request().query('DROP TABLE IF EXISTS Departments');
        await pool.request().query('DROP PROCEDURE IF EXISTS GetEmployeesByDepartment');
        console.log('✅ Test objects cleaned up');
      } catch (cleanupError) {
        console.warn('⚠️ Cleanup warning:', cleanupError.message);
      }
      
      await pool.close();
      console.log('✅ SQL Server connection pool closed');
    }
  }
  
  console.log('🎉 SQL Server database testing completed successfully!');
});
```

## Quick Copy Templates

### 🎯 Basic Database Connection Template
```javascript
import { test, expect } from '@playwright/test';

test('Basic database connection', async () => {
  // Replace with your database client
  const client = new DatabaseClient({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'user',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_DATABASE || 'testdb'
  });
  
  try {
    await client.connect();
    console.log('✅ Database connected');
    
    // Your database operations here
    const result = await client.query('SELECT 1 as test');
    expect(result.rows[0].test).toBe(1);
    
  } finally {
    await client.end();
    console.log('✅ Database connection closed');
  }
});
```

### 🎯 CRUD Operations Template
```javascript
import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('Database CRUD operations', async () => {
  // Setup connection and test data
  const testData = {
    name: faker.person.fullName(),
    email: faker.internet.email()
  };
  
  // CREATE
  const createResult = await client.query(
    'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id',
    [testData.name, testData.email]
  );
  const userId = createResult.rows[0].id;
  
  // READ
  const readResult = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
  expect(readResult.rows[0].name).toBe(testData.name);
  
  // UPDATE
  const newName = faker.person.fullName();
  await client.query('UPDATE users SET name = $1 WHERE id = $2', [newName, userId]);
  
  // DELETE
  await client.query('DELETE FROM users WHERE id = $1', [userId]);
  
  console.log('✅ CRUD operations completed!');
});
```

### 🎯 Transaction Template
```javascript
import { test, expect } from '@playwright/test';

test('Database transaction', async () => {
  try {
    await client.query('BEGIN');
    
    // Your transactional operations here
    await client.query('INSERT INTO table1 (data) VALUES ($1)', ['test']);
    await client.query('INSERT INTO table2 (data) VALUES ($1)', ['test']);
    
    // Commit or rollback based on your test logic
    await client.query('COMMIT');
    console.log('✅ Transaction committed');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.log('↩️ Transaction rolled back');
    throw error;
  }
});
```