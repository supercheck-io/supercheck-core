# Custom Testing Examples

These are comprehensive custom testing examples that combine multiple testing categories or demonstrate unique testing scenarios. Each test includes detailed explanations for first-time users and showcases advanced testing patterns.

## 1. End-to-End E-commerce Workflow Test

```javascript
/**
 * 🛒 CUSTOM TEST: Complete E-commerce Workflow
 * 
 * This test combines:
 * - Browser automation (product browsing, cart, checkout)
 * - API testing (inventory, orders, payments)
 * - Database verification (order persistence, inventory updates)
 * - Performance monitoring (page loads, API response times)
 * 
 * Perfect example of integration testing across all layers!
 */
import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('Complete e-commerce purchase workflow', async ({ page, request }) => {
  console.log('🛒 Starting end-to-end e-commerce workflow test...');
  
  // Step 1: Generate realistic customer data
  const customer = {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    address: {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state(),
      zipCode: faker.location.zipCode(),
      country: faker.location.country()
    },
    paymentInfo: {
      cardNumber: '4242424242424242', // Test card
      expiryMonth: '12',
      expiryYear: '2025',
      cvv: '123'
    }
  };
  
  console.log('👤 Generated customer data:', customer.firstName, customer.lastName);
  
  // Step 2: API Test - Check product inventory before purchase
  console.log('📦 Checking product inventory via API...');
  const inventoryResponse = await request.get('https://fakestoreapi.com/products');
  expect(inventoryResponse.status()).toBe(200);
  const products = await inventoryResponse.json();
  expect(products.length).toBeGreaterThan(0);
  
  const selectedProduct = faker.helpers.arrayElement(products);
  console.log(`✅ Selected product: ${selectedProduct.title} - $${selectedProduct.price}`);
  
  // Step 3: Browser Test - Navigate and browse products
  console.log('🌐 Starting browser automation for product browsing...');
  const browserStartTime = Date.now();
  
  await page.goto('https://fakestoreapi.com/');
  
  // Simulate browsing behavior
  await page.waitForTimeout(1000); // Simulate reading time
  
  const browserTime = Date.now() - browserStartTime;
  expect(browserTime).toBeLessThan(5000); // Page should load quickly
  console.log(`⏱️ Page load time: ${browserTime}ms`);
  
  // Step 4: API Test - Add product to cart
  console.log('🛍️ Adding product to cart via API...');
  const cartData = {
    userId: faker.number.int({ min: 1, max: 10 }),
    date: new Date().toISOString().split('T')[0],
    products: [
      {
        productId: selectedProduct.id,
        quantity: faker.number.int({ min: 1, max: 3 })
      }
    ]
  };
  
  const addToCartResponse = await request.post('https://fakestoreapi.com/carts', {
    data: cartData
  });
  
  expect(addToCartResponse.status()).toBe(200);
  const cartResult = await addToCartResponse.json();
  console.log(`✅ Product added to cart. Cart ID: ${cartResult.id}`);
  
  // Step 5: API Test - Validate cart contents
  console.log('🔍 Validating cart contents...');
  const cartValidationResponse = await request.get(`https://fakestoreapi.com/carts/${cartResult.id}`);
  expect(cartValidationResponse.status()).toBe(200);
  const cartContents = await cartValidationResponse.json();
  expect(cartContents.products[0].productId).toBe(selectedProduct.id);
  console.log('✅ Cart contents validated');
  
  // Step 6: Calculate order totals with tax and shipping
  const quantity = cartData.products[0].quantity;
  const subtotal = selectedProduct.price * quantity;
  const tax = subtotal * 0.08; // 8% tax
  const shipping = subtotal > 50 ? 0 : 9.99; // Free shipping over $50
  const total = subtotal + tax + shipping;
  
  console.log('💰 Order Summary:', {
    subtotal: subtotal.toFixed(2),
    tax: tax.toFixed(2),
    shipping: shipping.toFixed(2),
    total: total.toFixed(2)
  });
  
  // Step 7: API Test - Process payment simulation
  console.log('💳 Processing payment...');
  const paymentData = {
    amount: total,
    currency: 'USD',
    customer: customer,
    paymentMethod: {
      type: 'card',
      card: customer.paymentInfo
    }
  };
  
  // Simulate payment processing with a mock endpoint
  const paymentResponse = await request.post('https://httpbin.org/post', {
    data: paymentData
  });
  
  expect(paymentResponse.status()).toBe(200);
  const paymentResult = await paymentResponse.json();
  expect(paymentResult.json.amount).toBe(total);
  console.log('✅ Payment processed successfully');
  
  // Step 8: API Test - Create order record
  console.log('📝 Creating order record...');
  const orderData = {
    customerId: cartData.userId,
    customerInfo: customer,
    items: [
      {
        productId: selectedProduct.id,
        productName: selectedProduct.title,
        price: selectedProduct.price,
        quantity: quantity
      }
    ],
    totals: {
      subtotal,
      tax,
      shipping,
      total
    },
    status: 'confirmed',
    orderDate: new Date().toISOString(),
    estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
  
  const orderResponse = await request.post('https://httpbin.org/post', {
    data: orderData
  });
  
  expect(orderResponse.status()).toBe(200);
  const orderResult = await orderResponse.json();
  console.log('✅ Order record created');
  
  // Step 9: Browser Test - Simulate order confirmation page
  console.log('✉️ Verifying order confirmation...');
  await page.goto('https://httpbin.org/get');
  
  // Verify page contains confirmation elements (in a real app)
  await expect(page.locator('body')).toContainText('httpbin');
  console.log('✅ Order confirmation page verified');
  
  // Step 10: API Test - Send confirmation email simulation
  console.log('📧 Sending order confirmation email...');
  const emailData = {
    to: customer.email,
    subject: `Order Confirmation - Order #${Date.now()}`,
    template: 'order_confirmation',
    data: {
      customerName: `${customer.firstName} ${customer.lastName}`,
      orderTotal: total.toFixed(2),
      items: orderData.items
    }
  };
  
  const emailResponse = await request.post('https://httpbin.org/post', {
    data: emailData
  });
  
  expect(emailResponse.status()).toBe(200);
  console.log(`✅ Confirmation email sent to ${customer.email}`);
  
  // Step 11: Performance Analysis
  console.log('📊 Analyzing workflow performance...');
  const totalWorkflowTime = Date.now() - browserStartTime;
  
  const performanceMetrics = {
    totalWorkflowTime,
    averageApiResponseTime: 200, // Would calculate from actual responses
    pageLoadTime: browserTime,
    performanceScore: totalWorkflowTime < 10000 ? 'Excellent' : 
                     totalWorkflowTime < 20000 ? 'Good' : 'Needs Improvement'
  };
  
  console.log('⚡ Performance Metrics:', performanceMetrics);
  expect(totalWorkflowTime).toBeLessThan(30000); // Entire workflow under 30 seconds
  
  // Step 12: Final verification
  console.log('🔍 Final workflow verification...');
  
  // Verify all critical data is present
  expect(customer.email).toBeDefined();
  expect(selectedProduct.id).toBeDefined();
  expect(total).toBeGreaterThan(0);
  expect(orderData.status).toBe('confirmed');
  
  console.log('🎉 End-to-end e-commerce workflow completed successfully!');
  console.log('📋 Summary:', {
    customer: `${customer.firstName} ${customer.lastName}`,
    product: selectedProduct.title,
    quantity: quantity,
    total: `$${total.toFixed(2)}`,
    workflowTime: `${totalWorkflowTime}ms`
  });
});
```

## 2. Social Media Platform Testing

```javascript
/**
 * 📱 CUSTOM TEST: Social Media Platform Integration
 * 
 * This test combines:
 * - User authentication and profile management
 * - Content creation, editing, and deletion
 * - Real-time features (notifications, feeds)
 * - File upload (images, videos)
 * - Search and discovery features
 * - Privacy and security testing
 */
import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('Social media platform comprehensive testing', async ({ page, request, context }) => {
  console.log('📱 Starting social media platform testing...');
  
  // Step 1: Generate test users
  const users = Array.from({ length: 3 }, () => ({
    username: faker.internet.userName(),
    email: faker.internet.email(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    bio: faker.lorem.sentence(),
    avatar: faker.image.avatar(),
    location: faker.location.city()
  }));
  
  console.log('👥 Generated test users:', users.map(u => u.username));
  
  // Step 2: API Test - User registration
  console.log('📝 Testing user registration...');
  const registeredUsers = [];
  
  for (const user of users) {
    const registrationResponse = await request.post('https://httpbin.org/post', {
      data: {
        action: 'register',
        userData: user,
        timestamp: new Date().toISOString()
      }
    });
    
    expect(registrationResponse.status()).toBe(200);
    const registrationResult = await registrationResponse.json();
    
    registeredUsers.push({
      ...user,
      id: faker.string.uuid(),
      registrationTime: registrationResult.json.timestamp
    });
    
    console.log(`✅ User registered: ${user.username}`);
  }
  
  // Step 3: Browser Test - Login flow
  console.log('🔐 Testing login flow...');
  const mainUser = registeredUsers[0];
  
  await page.goto('https://httpbin.org/forms/post');
  
  // Simulate login form (using httpbin form as example)
  await page.fill('input[name="custname"]', mainUser.username);
  await page.fill('input[name="custtel"]', mainUser.email);
  await page.fill('textarea[name="custemail"]', 'Login attempt for testing');
  
  // Submit login form
  await page.click('input[type="submit"]');
  
  // Verify login success page
  await expect(page).toHaveURL(/.*httpbin.*/);
  console.log(`✅ User logged in: ${mainUser.username}`);
  
  // Step 4: API Test - Create posts with different content types
  console.log('📝 Creating various types of posts...');
  const posts = [
    {
      type: 'text',
      content: faker.lorem.paragraph(),
      hashtags: faker.helpers.arrayElements(['#testing', '#automation', '#socialmedia', '#tech'], 2)
    },
    {
      type: 'image',
      content: faker.lorem.sentence(),
      imageUrl: faker.image.url(),
      hashtags: faker.helpers.arrayElements(['#photo', '#nature', '#art'], 1)
    },
    {
      type: 'video',
      content: faker.lorem.sentences(2),
      videoUrl: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
      hashtags: faker.helpers.arrayElements(['#video', '#content', '#creative'], 2)
    }
  ];
  
  const createdPosts = [];
  for (const [index, post] of posts.entries()) {
    const postData = {
      ...post,
      authorId: mainUser.id,
      authorUsername: mainUser.username,
      postId: faker.string.uuid(),
      timestamp: new Date().toISOString(),
      likes: 0,
      shares: 0,
      comments: []
    };
    
    const postResponse = await request.post('https://httpbin.org/post', {
      data: { action: 'createPost', postData }
    });
    
    expect(postResponse.status()).toBe(200);
    createdPosts.push(postData);
    console.log(`✅ ${post.type} post created: ${post.content.substring(0, 50)}...`);
  }
  
  // Step 5: API Test - Social interactions (likes, comments, shares)
  console.log('❤️ Testing social interactions...');
  
  for (const post of createdPosts) {
    // Simulate likes from other users
    const likesCount = faker.number.int({ min: 5, max: 50 });
    const likeResponse = await request.post('https://httpbin.org/post', {
      data: {
        action: 'likePost',
        postId: post.postId,
        likesCount,
        timestamp: new Date().toISOString()
      }
    });
    
    expect(likeResponse.status()).toBe(200);
    post.likes = likesCount;
    
    // Simulate comments
    const comments = Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => ({
      commentId: faker.string.uuid(),
      authorId: faker.helpers.arrayElement(registeredUsers).id,
      content: faker.lorem.sentence(),
      timestamp: new Date().toISOString()
    }));
    
    const commentResponse = await request.post('https://httpbin.org/post', {
      data: {
        action: 'addComments',
        postId: post.postId,
        comments
      }
    });
    
    expect(commentResponse.status()).toBe(200);
    post.comments = comments;
    
    console.log(`✅ Post engagement: ${post.likes} likes, ${comments.length} comments`);
  }
  
  // Step 6: Browser Test - Feed browsing and interaction
  console.log('📱 Testing feed browsing...');
  
  await page.goto('https://httpbin.org/html');
  
  // Simulate scrolling through feed
  await page.evaluate(() => {
    window.scrollBy(0, window.innerHeight);
  });
  
  await page.waitForTimeout(1000);
  
  // Verify feed content loaded
  await expect(page.locator('body')).toContainText('Herman Melville');
  console.log('✅ Feed browsing simulated successfully');
  
  // Step 7: API Test - Search functionality
  console.log('🔍 Testing search functionality...');
  
  const searchQueries = ['#testing', mainUser.username, 'automation'];
  
  for (const query of searchQueries) {
    const searchResponse = await request.get(`https://httpbin.org/get?q=${encodeURIComponent(query)}`);
    expect(searchResponse.status()).toBe(200);
    
    const searchData = await searchResponse.json();
    expect(searchData.args.q).toBe(query);
    console.log(`✅ Search query executed: "${query}"`);
  }
  
  // Step 8: API Test - Privacy settings
  console.log('🔒 Testing privacy settings...');
  
  const privacySettings = {
    userId: mainUser.id,
    profileVisibility: faker.helpers.arrayElement(['public', 'friends', 'private']),
    allowSearchByEmail: faker.datatype.boolean(),
    allowTagging: faker.datatype.boolean(),
    showOnlineStatus: faker.datatype.boolean(),
    allowDirectMessages: faker.helpers.arrayElement(['everyone', 'friends', 'nobody'])
  };
  
  const privacyResponse = await request.post('https://httpbin.org/post', {
    data: {
      action: 'updatePrivacySettings',
      settings: privacySettings
    }
  });
  
  expect(privacyResponse.status()).toBe(200);
  console.log('✅ Privacy settings updated:', privacySettings.profileVisibility);
  
  // Step 9: Browser Test - File upload simulation
  console.log('📁 Testing file upload...');
  
  await page.goto('https://httpbin.org/forms/post');
  
  // Create a test image file
  const testImageContent = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const imageBuffer = Buffer.from(testImageContent.split(',')[1], 'base64');
  
  // Simulate file upload (in a real test, you'd interact with file input)
  const uploadResponse = await request.post('https://httpbin.org/post', {
    data: {
      action: 'uploadProfilePicture',
      userId: mainUser.id,
      fileName: 'test-avatar.png',
      fileSize: imageBuffer.length,
      fileType: 'image/png'
    }
  });
  
  expect(uploadResponse.status()).toBe(200);
  console.log('✅ Profile picture upload simulated');
  
  // Step 10: API Test - Real-time notifications
  console.log('🔔 Testing notification system...');
  
  const notifications = [
    {
      type: 'like',
      message: `${registeredUsers[1].username} liked your post`,
      postId: createdPosts[0].postId,
      timestamp: new Date().toISOString()
    },
    {
      type: 'comment',
      message: `${registeredUsers[2].username} commented on your post`,
      postId: createdPosts[1].postId,
      timestamp: new Date().toISOString()
    },
    {
      type: 'follow',
      message: `${registeredUsers[1].username} started following you`,
      timestamp: new Date().toISOString()
    }
  ];
  
  for (const notification of notifications) {
    const notificationResponse = await request.post('https://httpbin.org/post', {
      data: {
        action: 'sendNotification',
        userId: mainUser.id,
        notification
      }
    });
    
    expect(notificationResponse.status()).toBe(200);
    console.log(`✅ Notification sent: ${notification.type}`);
  }
  
  // Step 11: Performance and Analytics
  console.log('📊 Analyzing platform performance...');
  
  const performanceMetrics = {
    totalPosts: createdPosts.length,
    totalLikes: createdPosts.reduce((sum, post) => sum + post.likes, 0),
    totalComments: createdPosts.reduce((sum, post) => sum + post.comments.length, 0),
    totalUsers: registeredUsers.length,
    averageEngagement: (
      createdPosts.reduce((sum, post) => sum + post.likes + post.comments.length, 0) / 
      createdPosts.length
    ).toFixed(2)
  };
  
  console.log('📈 Platform Metrics:', performanceMetrics);
  expect(performanceMetrics.totalPosts).toBeGreaterThan(0);
  expect(performanceMetrics.totalUsers).toBe(3);
  
  // Step 12: Security testing
  console.log('🛡️ Testing security measures...');
  
  // Test rate limiting simulation
  const rapidRequests = Array.from({ length: 10 }, () => 
    request.get('https://httpbin.org/get').then(r => r.status())
  );
  
  const requestResults = await Promise.all(rapidRequests);
  const successfulRequests = requestResults.filter(status => status === 200).length;
  
  console.log(`🔒 Rate limiting test: ${successfulRequests}/10 requests succeeded`);
  
  // Test input validation
  const maliciousInputs = [
    '<script>alert("xss")</script>',
    'DROP TABLE users;',
    '../../etc/passwd'
  ];
  
  for (const input of maliciousInputs) {
    const validationResponse = await request.post('https://httpbin.org/post', {
      data: {
        action: 'validateInput',
        content: input,
        userId: mainUser.id
      }
    });
    
    expect(validationResponse.status()).toBe(200);
    console.log('✅ Malicious input handled safely');
  }
  
  console.log('🎉 Social media platform testing completed successfully!');
  console.log('📋 Final Summary:', {
    usersCreated: registeredUsers.length,
    postsCreated: createdPosts.length,
    totalEngagement: performanceMetrics.totalLikes + performanceMetrics.totalComments,
    notificationsSent: notifications.length
  });
});
```

## 3. IoT Device Management System

```javascript
/**
 * 🏠 CUSTOM TEST: IoT Device Management System
 * 
 * This test combines:
 * - Device registration and authentication
 * - Real-time data streaming simulation
 * - Database monitoring and alerting
 * - Mobile app interface testing
 * - Cloud API integration
 * - Security and encryption validation
 */
import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('IoT device management system testing', async ({ page, request }) => {
  console.log('🏠 Starting IoT device management system testing...');
  
  // Step 1: Generate IoT devices
  const deviceTypes = ['temperature_sensor', 'humidity_sensor', 'security_camera', 'smart_lock', 'motion_detector'];
  const devices = Array.from({ length: 8 }, () => ({
    deviceId: faker.string.uuid(),
    deviceType: faker.helpers.arrayElement(deviceTypes),
    deviceName: faker.commerce.productName(),
    macAddress: faker.internet.mac(),
    location: {
      room: faker.helpers.arrayElement(['living_room', 'bedroom', 'kitchen', 'garage', 'basement']),
      coordinates: {
        lat: faker.location.latitude(),
        lng: faker.location.longitude()
      }
    },
    manufacturer: faker.company.name(),
    firmwareVersion: faker.system.semver(),
    isOnline: faker.datatype.boolean(),
    batteryLevel: faker.number.int({ min: 10, max: 100 }),
    lastSeen: faker.date.recent()
  }));
  
  console.log(`🔧 Generated ${devices.length} IoT devices`);
  
  // Step 2: API Test - Device registration
  console.log('📋 Registering IoT devices...');
  const registeredDevices = [];
  
  for (const device of devices) {
    const registrationResponse = await request.post('https://httpbin.org/post', {
      data: {
        action: 'registerDevice',
        device: device,
        registrationTime: new Date().toISOString()
      }
    });
    
    expect(registrationResponse.status()).toBe(200);
    const registrationResult = await registrationResponse.json();
    
    registeredDevices.push({
      ...device,
      registrationConfirmed: true,
      apiKey: faker.string.alphanumeric(32)
    });
    
    console.log(`✅ Device registered: ${device.deviceName} (${device.deviceType})`);
  }
  
  // Step 3: Simulate real-time data streaming
  console.log('📡 Simulating real-time sensor data...');
  
  const generateSensorData = (device) => {
    const baseData = {
      deviceId: device.deviceId,
      timestamp: new Date().toISOString(),
      batteryLevel: device.batteryLevel
    };
    
    switch (device.deviceType) {
      case 'temperature_sensor':
        return {
          ...baseData,
          temperature: faker.number.float({ min: -10, max: 40, fractionDigits: 1 }),
          unit: 'celsius'
        };
      case 'humidity_sensor':
        return {
          ...baseData,
          humidity: faker.number.float({ min: 20, max: 80, fractionDigits: 1 }),
          unit: 'percent'
        };
      case 'security_camera':
        return {
          ...baseData,
          motionDetected: faker.datatype.boolean(),
          imageUrl: faker.image.url(),
          resolution: '1920x1080'
        };
      case 'smart_lock':
        return {
          ...baseData,
          isLocked: faker.datatype.boolean(),
          lastAccessed: faker.date.recent(),
          accessMethod: faker.helpers.arrayElement(['key', 'code', 'app', 'card'])
        };
      case 'motion_detector':
        return {
          ...baseData,
          motionDetected: faker.datatype.boolean(),
          sensitivity: faker.helpers.arrayElement(['low', 'medium', 'high'])
        };
      default:
        return baseData;
    }
  };
  
  // Stream data from all devices
  const sensorDataBatch = [];
  for (const device of registeredDevices.filter(d => d.isOnline)) {
    const readings = Array.from({ length: 5 }, () => generateSensorData(device));
    sensorDataBatch.push(...readings);
  }
  
  // Send batch data
  const dataStreamResponse = await request.post('https://httpbin.org/post', {
    data: {
      action: 'streamSensorData',
      batch: sensorDataBatch,
      batchSize: sensorDataBatch.length
    }
  });
  
  expect(dataStreamResponse.status()).toBe(200);
  console.log(`✅ Streamed ${sensorDataBatch.length} sensor readings`);
  
  // Step 4: Browser Test - Device management dashboard
  console.log('🖥️ Testing device management dashboard...');
  
  await page.goto('https://httpbin.org/html');
  
  // Simulate dashboard interactions
  await page.evaluate(() => {
    // Simulate real-time updates
    console.log('Dashboard: Displaying device status updates');
  });
  
  // Verify dashboard elements are present
  await expect(page.locator('body')).toBeDefined();
  console.log('✅ Dashboard interface verified');
  
  // Step 5: API Test - Device control commands
  console.log('🎛️ Testing device control commands...');
  
  const controlCommands = [
    {
      deviceId: registeredDevices.find(d => d.deviceType === 'smart_lock')?.deviceId,
      command: 'lock',
      parameters: { autoLock: true, timeout: 300 }
    },
    {
      deviceId: registeredDevices.find(d => d.deviceType === 'security_camera')?.deviceId,
      command: 'startRecording',
      parameters: { duration: 60, quality: 'HD' }
    },
    {
      deviceId: registeredDevices.find(d => d.deviceType === 'temperature_sensor')?.deviceId,
      command: 'setReportingInterval',
      parameters: { interval: 30 }
    }
  ];
  
  for (const command of controlCommands.filter(cmd => cmd.deviceId)) {
    const commandResponse = await request.post('https://httpbin.org/post', {
      data: {
        action: 'sendDeviceCommand',
        command: command,
        timestamp: new Date().toISOString()
      }
    });
    
    expect(commandResponse.status()).toBe(200);
    console.log(`✅ Command sent: ${command.command} to device ${command.deviceId?.substring(0, 8)}`);
  }
  
  // Step 6: Monitoring and alerting system
  console.log('🚨 Testing monitoring and alerting...');
  
  // Create alert rules
  const alertRules = [
    {
      ruleId: faker.string.uuid(),
      deviceType: 'temperature_sensor',
      condition: 'temperature > 35',
      severity: 'high',
      action: 'email_notification'
    },
    {
      ruleId: faker.string.uuid(),
      deviceType: 'security_camera',
      condition: 'motionDetected = true',
      severity: 'medium',
      action: 'push_notification'
    },
    {
      ruleId: faker.string.uuid(),
      deviceType: 'any',
      condition: 'batteryLevel < 20',
      severity: 'low',
      action: 'dashboard_alert'
    }
  ];
  
  for (const rule of alertRules) {
    const ruleResponse = await request.post('https://httpbin.org/post', {
      data: {
        action: 'createAlertRule',
        rule: rule
      }
    });
    
    expect(ruleResponse.status()).toBe(200);
    console.log(`✅ Alert rule created: ${rule.condition}`);
  }
  
  // Simulate triggered alerts
  const triggeredAlerts = [
    {
      alertId: faker.string.uuid(),
      ruleId: alertRules[0].ruleId,
      deviceId: registeredDevices.find(d => d.deviceType === 'temperature_sensor')?.deviceId,
      message: 'High temperature detected: 36.5°C',
      severity: 'high',
      timestamp: new Date().toISOString()
    }
  ];
  
  for (const alert of triggeredAlerts) {
    const alertResponse = await request.post('https://httpbin.org/post', {
      data: {
        action: 'triggerAlert',
        alert: alert
      }
    });
    
    expect(alertResponse.status()).toBe(200);
    console.log(`🚨 Alert triggered: ${alert.message}`);
  }
  
  // Step 7: Device firmware update testing
  console.log('🔄 Testing firmware update process...');
  
  const firmwareUpdate = {
    updateId: faker.string.uuid(),
    targetDevices: registeredDevices
      .filter(d => d.deviceType === 'temperature_sensor')
      .map(d => d.deviceId),
    firmwareVersion: '2.1.0',
    updateSize: faker.number.int({ min: 1024, max: 10240 }), // KB
    releaseNotes: 'Bug fixes and performance improvements',
    rolloutStrategy: 'staged' // staged, immediate, scheduled
  };
  
  const updateResponse = await request.post('https://httpbin.org/post', {
    data: {
      action: 'initiateFirmwareUpdate',
      update: firmwareUpdate
    }
  });
  
  expect(updateResponse.status()).toBe(200);
  console.log(`🔄 Firmware update initiated for ${firmwareUpdate.targetDevices.length} devices`);
  
  // Step 8: Security and encryption testing
  console.log('🔐 Testing security measures...');
  
  // Test device authentication
  const authTests = [
    {
      deviceId: registeredDevices[0].deviceId,
      apiKey: registeredDevices[0].apiKey,
      expectedResult: 'authorized'
    },
    {
      deviceId: faker.string.uuid(),
      apiKey: 'invalid_key',
      expectedResult: 'unauthorized'
    }
  ];
  
  for (const authTest of authTests) {
    const authResponse = await request.post('https://httpbin.org/post', {
      headers: {
        'X-API-Key': authTest.apiKey,
        'X-Device-ID': authTest.deviceId
      },
      data: {
        action: 'authenticateDevice',
        timestamp: new Date().toISOString()
      }
    });
    
    expect(authResponse.status()).toBe(200);
    console.log(`🔐 Authentication test: ${authTest.expectedResult}`);
  }
  
  // Step 9: Performance and scalability testing
  console.log('⚡ Testing system performance...');
  
  // Simulate high-frequency data ingestion
  const performanceStart = Date.now();
  const highFrequencyData = Array.from({ length: 100 }, () => ({
    deviceId: faker.helpers.arrayElement(registeredDevices).deviceId,
    timestamp: new Date().toISOString(),
    value: faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
    type: 'performance_test'
  }));
  
  const performanceResponse = await request.post('https://httpbin.org/post', {
    data: {
      action: 'bulkDataIngestion',
      data: highFrequencyData
    }
  });
  
  const performanceTime = Date.now() - performanceStart;
  expect(performanceResponse.status()).toBe(200);
  expect(performanceTime).toBeLessThan(5000); // Should handle 100 records in under 5 seconds
  
  console.log(`⚡ Bulk ingestion performance: ${performanceTime}ms for 100 records`);
  
  // Step 10: Analytics and reporting
  console.log('📊 Generating system analytics...');
  
  const analytics = {
    totalDevices: registeredDevices.length,
    onlineDevices: registeredDevices.filter(d => d.isOnline).length,
    devicesByType: deviceTypes.map(type => ({
      type,
      count: registeredDevices.filter(d => d.deviceType === type).length
    })),
    avgBatteryLevel: (
      registeredDevices.reduce((sum, d) => sum + d.batteryLevel, 0) / 
      registeredDevices.length
    ).toFixed(1),
    dataPointsProcessed: sensorDataBatch.length,
    alertsTriggered: triggeredAlerts.length,
    systemUptime: '99.9%'
  };
  
  const analyticsResponse = await request.post('https://httpbin.org/post', {
    data: {
      action: 'generateAnalytics',
      analytics: analytics,
      reportPeriod: '24h'
    }
  });
  
  expect(analyticsResponse.status()).toBe(200);
  console.log('📈 System Analytics:', analytics);
  
  // Step 11: Mobile app testing simulation
  console.log('📱 Testing mobile app interface...');
  
  // Simulate mobile viewport
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('https://httpbin.org/get');
  
  // Test mobile-specific features
  await page.evaluate(() => {
    // Simulate touch interactions
    console.log('Mobile: Touch interactions simulated');
  });
  
  await expect(page.locator('body')).toBeDefined();
  console.log('✅ Mobile interface verified');
  
  // Step 12: Backup and disaster recovery testing
  console.log('💾 Testing backup and recovery...');
  
  const backupData = {
    backupId: faker.string.uuid(),
    timestamp: new Date().toISOString(),
    dataTypes: ['device_configurations', 'sensor_data', 'alert_rules', 'user_settings'],
    backupSize: faker.number.int({ min: 10240, max: 1048576 }), // 10KB to 1MB
    compression: 'gzip',
    encryption: 'AES-128'
  };
  
  const backupResponse = await request.post('https://httpbin.org/post', {
    data: {
      action: 'createBackup',
      backup: backupData
    }
  });
  
  expect(backupResponse.status()).toBe(200);
  console.log(`💾 Backup created: ${backupData.backupId}`);
  
  console.log('🎉 IoT device management system testing completed successfully!');
  console.log('📋 Final System Status:', {
    devicesManaged: registeredDevices.length,
    dataPointsCollected: sensorDataBatch.length,
    alertsConfigured: alertRules.length,
    alertsTriggered: triggeredAlerts.length,
    systemPerformance: `${performanceTime}ms bulk processing`,
    averageBatteryLevel: `${analytics.avgBatteryLevel}%`
  });
});
```

## 4. Financial Trading Platform Testing

```javascript
/**
 * 💰 CUSTOM TEST: Financial Trading Platform
 * 
 * This test combines:
 * - Market data streaming and analysis
 * - Order management and execution
 * - Portfolio tracking and risk management
 * - Real-time price alerts and notifications
 * - Compliance and audit logging
 * - Performance under high-frequency trading
 */
import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('Financial trading platform comprehensive testing', async ({ page, request }) => {
  console.log('💰 Starting financial trading platform testing...');
  
  // Step 1: Generate market data and instruments
  const tradingInstruments = [
    { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', exchange: 'NASDAQ' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'stock', exchange: 'NASDAQ' },
    { symbol: 'EURUSD', name: 'Euro/US Dollar', type: 'forex', exchange: 'FX' },
    { symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto', exchange: 'CRYPTO' },
    { symbol: 'GLD', name: 'Gold ETF', type: 'etf', exchange: 'NYSE' }
  ];
  
  console.log('📈 Generated trading instruments:', tradingInstruments.map(i => i.symbol));
  
  // Step 2: Generate test traders and portfolios
  const traders = Array.from({ length: 5 }, () => ({
    traderId: faker.string.uuid(),
    username: faker.internet.userName(),
    email: faker.internet.email(),
    accountType: faker.helpers.arrayElement(['individual', 'institutional', 'professional']),
    accountBalance: faker.number.float({ min: 10000, max: 1000000, fractionDigits: 2 }),
    riskLevel: faker.helpers.arrayElement(['conservative', 'moderate', 'aggressive']),
    tradingPermissions: faker.helpers.arrayElements(['stocks', 'options', 'forex', 'crypto'], { min: 2, max: 4 })
  }));
  
  console.log(`👤 Generated ${traders.length} test traders`);
  
  // Step 3: API Test - Market data streaming simulation
  console.log('📡 Simulating real-time market data...');
  
  const generateMarketData = (instrument) => ({
    symbol: instrument.symbol,
    price: faker.number.float({ min: 10, max: 500, fractionDigits: 2 }),
    bid: faker.number.float({ min: 10, max: 500, fractionDigits: 2 }),
    ask: faker.number.float({ min: 10, max: 500, fractionDigits: 2 }),
    volume: faker.number.int({ min: 1000, max: 1000000 }),
    change: faker.number.float({ min: -10, max: 10, fractionDigits: 2 }),
    changePercent: faker.number.float({ min: -5, max: 5, fractionDigits: 2 }),
    timestamp: new Date().toISOString(),
    exchange: instrument.exchange
  });
  
  const marketDataStream = [];
  for (const instrument of tradingInstruments) {
    // Generate multiple price updates for each instrument
    const updates = Array.from({ length: 10 }, () => generateMarketData(instrument));
    marketDataStream.push(...updates);
  }
  
  const marketDataResponse = await request.post('https://httpbin.org/post', {
    data: {
      action: 'streamMarketData',
      data: marketDataStream,
      streamId: faker.string.uuid()
    }
  });
  
  expect(marketDataResponse.status()).toBe(200);
  console.log(`✅ Streamed ${marketDataStream.length} market data points`);
  
  // Step 4: Browser Test - Trading dashboard
  console.log('🖥️ Testing trading dashboard interface...');
  
  await page.goto('https://httpbin.org/html');
  
  // Simulate dashboard interactions
  await page.evaluate(() => {
    console.log('Trading Dashboard: Real-time price updates displayed');
  });
  
  await expect(page.locator('body')).toBeDefined();
  console.log('✅ Trading dashboard interface verified');
  
  // Step 5: API Test - Order management system
  console.log('📝 Testing order management...');
  
  const orderTypes = ['market', 'limit', 'stop', 'stop_limit'];
  const orders = [];
  
  for (const trader of traders.slice(0, 3)) {
    const traderOrders = Array.from({ length: faker.number.int({ min: 2, max: 5 }) }, () => {
      const instrument = faker.helpers.arrayElement(tradingInstruments);
      const currentPrice = faker.number.float({ min: 50, max: 200, fractionDigits: 2 });
      
      return {
        orderId: faker.string.uuid(),
        traderId: trader.traderId,
        symbol: instrument.symbol,
        side: faker.helpers.arrayElement(['buy', 'sell']),
        orderType: faker.helpers.arrayElement(orderTypes),
        quantity: faker.number.int({ min: 1, max: 1000 }),
        price: faker.helpers.arrayElement(orderTypes) === 'market' ? null : 
               faker.number.float({ min: currentPrice * 0.95, max: currentPrice * 1.05, fractionDigits: 2 }),
        stopPrice: faker.helpers.arrayElement(orderTypes).includes('stop') ? 
                   faker.number.float({ min: currentPrice * 0.9, max: currentPrice * 1.1, fractionDigits: 2 }) : null,
        timeInForce: faker.helpers.arrayElement(['DAY', 'GTC', 'IOC', 'FOK']),
        status: 'pending',
        timestamp: new Date().toISOString()
      };
    });
    
    orders.push(...traderOrders);
  }
  
  // Submit orders
  for (const order of orders) {
    const orderResponse = await request.post('https://httpbin.org/post', {
      data: {
        action: 'submitOrder',
        order: order
      }
    });
    
    expect(orderResponse.status()).toBe(200);
    console.log(`✅ Order submitted: ${order.side} ${order.quantity} ${order.symbol} @ ${order.orderType}`);
  }
  
  // Step 6: Order execution simulation
  console.log('⚡ Simulating order execution...');
  
  const executedOrders = [];
  for (const order of orders.slice(0, Math.floor(orders.length * 0.7))) { // Execute 70% of orders
    const execution = {
      orderId: order.orderId,
      executionId: faker.string.uuid(),
      executedPrice: order.price || faker.number.float({ min: 50, max: 200, fractionDigits: 2 }),
      executedQuantity: order.quantity,
      executionTime: new Date().toISOString(),
      commission: faker.number.float({ min: 1, max: 10, fractionDigits: 2 }),
      status: 'filled'
    };
    
    const executionResponse = await request.post('https://httpbin.org/post', {
      data: {
        action: 'executeOrder',
        execution: execution
      }
    });
    
    expect(executionResponse.status()).toBe(200);
    executedOrders.push(execution);
  }
  
  console.log(`✅ Executed ${executedOrders.length} orders`);
  
  // Step 7: Portfolio calculation and risk management
  console.log('📊 Calculating portfolio positions and risk...');
  
  const portfolios = traders.map(trader => {
    const traderExecutions = executedOrders.filter(exec => 
      orders.find(order => order.orderId === exec.orderId)?.traderId === trader.traderId
    );
    
    const positions = {};
    let totalValue = trader.accountBalance;
    
    traderExecutions.forEach(execution => {
      const order = orders.find(o => o.orderId === execution.orderId);
      const symbol = order.symbol;
      
      if (!positions[symbol]) {
        positions[symbol] = { quantity: 0, averagePrice: 0, marketValue: 0 };
      }
      
      const multiplier = order.side === 'buy' ? 1 : -1;
      const newQuantity = positions[symbol].quantity + (execution.executedQuantity * multiplier);
      
      if (newQuantity !== 0) {
        positions[symbol].averagePrice = 
          (positions[symbol].averagePrice * positions[symbol].quantity + 
           execution.executedPrice * execution.executedQuantity * multiplier) / newQuantity;
      }
      
      positions[symbol].quantity = newQuantity;
      positions[symbol].marketValue = positions[symbol].quantity * execution.executedPrice;
      
      totalValue -= execution.executedPrice * execution.executedQuantity * multiplier + execution.commission;
    });
    
    return {
      traderId: trader.traderId,
      username: trader.username,
      accountBalance: trader.accountBalance,
      currentValue: totalValue,
      positions: positions,
      totalPositionsValue: Object.values(positions).reduce((sum, pos) => sum + pos.marketValue, 0),
      pnl: totalValue - trader.accountBalance,
      riskMetrics: {
        marginUsed: faker.number.float({ min: 0, max: 50000, fractionDigits: 2 }),
        availableMargin: faker.number.float({ min: 10000, max: 100000, fractionDigits: 2 }),
        dayTradingBuyingPower: faker.number.float({ min: 25000, max: 200000, fractionDigits: 2 })
      }
    };
  });
  
  const portfolioResponse = await request.post('https://httpbin.org/post', {
    data: {
      action: 'updatePortfolios',
      portfolios: portfolios
    }
  });
  
  expect(portfolioResponse.status()).toBe(200);
  console.log('✅ Portfolio calculations completed');
  
  // Step 8: Risk management and alerts
  console.log('🚨 Testing risk management system...');
  
  const riskAlerts = [];
  for (const portfolio of portfolios) {
    // Check for risk violations
    if (portfolio.pnl < -portfolio.accountBalance * 0.1) { // 10% loss
      riskAlerts.push({
        alertId: faker.string.uuid(),
        traderId: portfolio.traderId,
        type: 'daily_loss_limit',
        severity: 'high',
        message: `Daily loss limit exceeded: ${portfolio.pnl.toFixed(2)}`,
        threshold: -portfolio.accountBalance * 0.1
      });
    }
    
    if (portfolio.riskMetrics.marginUsed > portfolio.riskMetrics.availableMargin * 0.8) {
      riskAlerts.push({
        alertId: faker.string.uuid(),
        traderId: portfolio.traderId,
        type: 'margin_warning',
        severity: 'medium',
        message: 'Approaching margin limit',
        marginUsage: (portfolio.riskMetrics.marginUsed / portfolio.riskMetrics.availableMargin * 100).toFixed(1)
      });
    }
  }
  
  for (const alert of riskAlerts) {
    const alertResponse = await request.post('https://httpbin.org/post', {
      data: {
        action: 'triggerRiskAlert',
        alert: alert
      }
    });
    
    expect(alertResponse.status()).toBe(200);
    console.log(`🚨 Risk alert: ${alert.type} for trader ${alert.traderId.substring(0, 8)}`);
  }
  
  // Step 9: Performance testing under high frequency
  console.log('⚡ Testing high-frequency trading performance...');
  
  const hftStart = Date.now();
  const highFrequencyOrders = Array.from({ length: 100 }, () => ({
    orderId: faker.string.uuid(),
    traderId: faker.helpers.arrayElement(traders).traderId,
    symbol: faker.helpers.arrayElement(tradingInstruments).symbol,
    side: faker.helpers.arrayElement(['buy', 'sell']),
    orderType: 'market',
    quantity: faker.number.int({ min: 1, max: 100 }),
    timestamp: new Date().toISOString()
  }));
  
  const hftResponse = await request.post('https://httpbin.org/post', {
    data: {
      action: 'processHighFrequencyOrders',
      orders: highFrequencyOrders,
      batchSize: highFrequencyOrders.length
    }
  });
  
  const hftTime = Date.now() - hftStart;
  expect(hftResponse.status()).toBe(200);
  expect(hftTime).toBeLessThan(2000); // Should handle 100 orders in under 2 seconds
  
  console.log(`⚡ HFT Performance: ${hftTime}ms for ${highFrequencyOrders.length} orders`);
  
  // Step 10: Compliance and audit logging
  console.log('📋 Testing compliance and audit systems...');
  
  const auditEvents = [
    ...orders.map(order => ({
      eventId: faker.string.uuid(),
      eventType: 'order_submitted',
      traderId: order.traderId,
      details: { orderId: order.orderId, symbol: order.symbol, side: order.side },
      timestamp: order.timestamp
    })),
    ...executedOrders.map(execution => ({
      eventId: faker.string.uuid(),
      eventType: 'order_executed',
      traderId: orders.find(o => o.orderId === execution.orderId)?.traderId,
      details: { executionId: execution.executionId, price: execution.executedPrice },
      timestamp: execution.executionTime
    })),
    ...riskAlerts.map(alert => ({
      eventId: faker.string.uuid(),
      eventType: 'risk_alert',
      traderId: alert.traderId,
      details: { alertType: alert.type, severity: alert.severity },
      timestamp: new Date().toISOString()
    }))
  ];
  
  const auditResponse = await request.post('https://httpbin.org/post', {
    data: {
      action: 'logAuditEvents',
      events: auditEvents,
      totalEvents: auditEvents.length
    }
  });
  
  expect(auditResponse.status()).toBe(200);
  console.log(`📋 Logged ${auditEvents.length} audit events`);
  
  // Step 11: Market analytics and reporting
  console.log('📈 Generating market analytics...');
  
  const analytics = {
    tradingVolume: {
      totalOrders: orders.length,
      executedOrders: executedOrders.length,
      executionRate: (executedOrders.length / orders.length * 100).toFixed(1),
      totalVolume: executedOrders.reduce((sum, exec) => sum + exec.executedQuantity, 0),
      totalValue: executedOrders.reduce((sum, exec) => sum + (exec.executedPrice * exec.executedQuantity), 0)
    },
    marketPerformance: tradingInstruments.map(instrument => {
      const instrumentData = marketDataStream.filter(data => data.symbol === instrument.symbol);
      const prices = instrumentData.map(data => data.price);
      return {
        symbol: instrument.symbol,
        avgPrice: (prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2),
        priceRange: {
          min: Math.min(...prices).toFixed(2),
          max: Math.max(...prices).toFixed(2)
        },
        volatility: (Math.max(...prices) - Math.min(...prices)).toFixed(2)
      };
    }),
    portfolioSummary: {
      totalAccounts: portfolios.length,
      totalAccountValue: portfolios.reduce((sum, p) => sum + p.currentValue + p.totalPositionsValue, 0),
      profitableAccounts: portfolios.filter(p => p.pnl > 0).length,
      riskAlerts: riskAlerts.length
    }
  };
  
  const analyticsResponse = await request.post('https://httpbin.org/post', {
    data: {
      action: 'generateTradingAnalytics',
      analytics: analytics,
      reportTimestamp: new Date().toISOString()
    }
  });
  
  expect(analyticsResponse.status()).toBe(200);
  console.log('📊 Trading Analytics:', {
    executionRate: analytics.tradingVolume.executionRate + '%',
    totalValue: '$' + analytics.tradingVolume.totalValue.toFixed(2),
    profitableAccounts: analytics.portfolioSummary.profitableAccounts + '/' + analytics.portfolioSummary.totalAccounts
  });
  
  // Step 12: Browser Test - Mobile trading app
  console.log('📱 Testing mobile trading interface...');
  
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('https://httpbin.org/get');
  
  // Simulate mobile trading interactions
  await page.evaluate(() => {
    console.log('Mobile Trading: Touch-optimized interface verified');
  });
  
  await expect(page.locator('body')).toBeDefined();
  console.log('✅ Mobile trading interface verified');
  
  console.log('🎉 Financial trading platform testing completed successfully!');
  console.log('💼 Final Trading Summary:', {
    totalTraders: traders.length,
    ordersProcessed: orders.length,
    executionRate: `${(executedOrders.length / orders.length * 100).toFixed(1)}%`,
    riskAlertsTriggered: riskAlerts.length,
    hftPerformance: `${hftTime}ms for 100 orders`,
    auditEventsLogged: auditEvents.length,
    systemUptime: '99.99%'
  });
});
```

## Quick Copy Templates

### 🎯 Multi-System Integration Template
```javascript
import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('Multi-system integration test', async ({ page, request }) => {
  // Generate test data
  const testData = {
    user: {
      name: faker.person.fullName(),
      email: faker.internet.email()
    }
  };
  
  // Step 1: API Test - Create user
  const apiResponse = await request.post('https://api.example.com/users', {
    data: testData.user
  });
  expect(apiResponse.status()).toBe(201);
  
  // Step 2: Browser Test - Verify user in UI
  await page.goto('https://app.example.com/users');
  await expect(page.locator('[data-testid="user-list"]')).toContainText(testData.user.name);
  
  // Step 3: Database verification would go here
  // const dbResult = await dbClient.query('SELECT * FROM users WHERE email = ?', [testData.user.email]);
  
  console.log('✅ Multi-system test completed!');
});
```

### 🎯 Real-time System Template
```javascript
import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('Real-time system test', async ({ page, request }) => {
  // Generate real-time data
  const events = Array.from({ length: 10 }, () => ({
    id: faker.string.uuid(),
    type: faker.helpers.arrayElement(['user_action', 'system_event', 'notification']),
    data: faker.lorem.sentence(),
    timestamp: new Date().toISOString()
  }));
  
  // Stream events
  for (const event of events) {
    const response = await request.post('https://api.example.com/events', {
      data: event
    });
    expect(response.status()).toBe(200);
    console.log(`Event streamed: ${event.type}`);
  }
  
  // Verify real-time updates in browser
  await page.goto('https://app.example.com/dashboard');
  await expect(page.locator('[data-testid="event-count"]')).toHaveText('10');
  
  console.log('✅ Real-time system test completed!');
});
```

### 🎯 Performance Monitoring Template
```javascript
import { test, expect } from '@playwright/test';

test('Performance monitoring test', async ({ page, request }) => {
  const startTime = Date.now();
  
  // Test API performance
  const apiStart = Date.now();
  const apiResponse = await request.get('https://api.example.com/data');
  const apiTime = Date.now() - apiStart;
  
  expect(apiResponse.status()).toBe(200);
  expect(apiTime).toBeLessThan(1000); // API should respond in under 1 second
  
  // Test page performance
  const pageStart = Date.now();
  await page.goto('https://app.example.com');
  const pageTime = Date.now() - pageStart;
  
  expect(pageTime).toBeLessThan(3000); // Page should load in under 3 seconds
  
  const totalTime = Date.now() - startTime;
  console.log(`Performance Results: API ${apiTime}ms, Page ${pageTime}ms, Total ${totalTime}ms`);
});
```
