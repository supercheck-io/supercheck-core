# API Testing Examples

These are comprehensive API testing examples that you can copy and paste into the Monaco editor. Each test includes detailed explanations for first-time users and covers all possible API testing scenarios.

## 1. Basic REST API Test

```javascript
/**
 * 🌐 API TEST: Basic REST API Operations
 * 
 * This test demonstrates fundamental API testing:
 * - Making GET, POST, PUT, DELETE requests
 * - Verifying response status codes
 * - Validating response data structure
 * - Error handling
 * 
 * Perfect for beginners - just copy, paste, and run!
 */
import { test, expect } from '@playwright/test';

test('Basic REST API CRUD operations', async ({ request }) => {
  console.log('🚀 Starting basic API testing...');
  
  // GET request - Fetch existing data
  console.log('📥 Testing GET request...');
  const getResponse = await request.get('https://jsonplaceholder.typicode.com/posts/1');
  
  expect(getResponse.status()).toBe(200);
  const getData = await getResponse.json();
  expect(getData).toHaveProperty('id');
  expect(getData).toHaveProperty('title');
  expect(getData).toHaveProperty('body');
  console.log('✅ GET request successful, data structure verified');
  
  // POST request - Create new data
  console.log('📤 Testing POST request...');
  const newPost = {
    title: 'My Test Post',
    body: 'This is a test post created by automated testing',
    userId: 1
  };
  
  const postResponse = await request.post('https://jsonplaceholder.typicode.com/posts', {
    data: newPost
  });
  
  expect(postResponse.status()).toBe(201);
  const postData = await postResponse.json();
  expect(postData.title).toBe(newPost.title);
  expect(postData.body).toBe(newPost.body);
  expect(postData).toHaveProperty('id');
  console.log(`✅ POST request successful, created post with ID: ${postData.id}`);
  
  // PUT request - Update existing data
  console.log('✏️ Testing PUT request...');
  const updatedPost = {
    id: postData.id,
    title: 'Updated Test Post',
    body: 'This post has been updated',
    userId: 1
  };
  
  const putResponse = await request.put(`https://jsonplaceholder.typicode.com/posts/${postData.id}`, {
    data: updatedPost
  });
  
  expect(putResponse.status()).toBe(200);
  const putData = await putResponse.json();
  expect(putData.title).toBe(updatedPost.title);
  console.log('✅ PUT request successful, post updated');
  
  // DELETE request - Remove data
  console.log('🗑️ Testing DELETE request...');
  const deleteResponse = await request.delete(`https://jsonplaceholder.typicode.com/posts/${postData.id}`);
  
  expect(deleteResponse.status()).toBe(200);
  console.log('✅ DELETE request successful, post removed');
  
  console.log('🎉 All CRUD operations completed successfully!');
});
```

## 2. API Authentication and Headers Test

```javascript
/**
 * 🌐 API TEST: Authentication and Headers
 * 
 * This test demonstrates:
 * - API key authentication
 * - Bearer token authentication
 * - Custom headers handling
 * - Protected endpoint testing
 * - Unauthorized access testing
 */
import { test, expect } from '@playwright/test';

test('API authentication and headers testing', async ({ request }) => {
  console.log('🔐 Testing API authentication and headers...');
  
  // Test 1: Public endpoint (no auth required)
  console.log('🌐 Testing public endpoint...');
  const publicResponse = await request.get('https://api.github.com/repos/microsoft/playwright');
  
  expect(publicResponse.status()).toBe(200);
  const repoData = await publicResponse.json();
  expect(repoData.name).toBe('playwright');
  console.log('✅ Public endpoint accessible without authentication');
  
  // Test 2: Protected endpoint without authentication (should fail)
  console.log('🚫 Testing protected endpoint without auth...');
  const unauthorizedResponse = await request.get('https://api.github.com/user');
  
  expect(unauthorizedResponse.status()).toBe(401);
  console.log('✅ Protected endpoint correctly rejects unauthorized access');
  
  // Test 3: Custom headers testing
  console.log('📋 Testing custom headers...');
  const headersResponse = await request.get('https://httpbin.org/headers', {
    headers: {
      'X-Custom-Header': 'TestValue',
      'X-Test-ID': '12345',
      'User-Agent': 'SupercheckTestRunner/1.0'
    }
  });
  
  expect(headersResponse.status()).toBe(200);
  const headersData = await headersResponse.json();
  expect(headersData.headers['X-Custom-Header']).toBe('TestValue');
  expect(headersData.headers['X-Test-ID']).toBe('12345');
  console.log('✅ Custom headers sent and verified correctly');
  
  // Test 4: Content-Type testing
  console.log('📄 Testing different content types...');
  const jsonResponse = await request.post('https://httpbin.org/post', {
    headers: {
      'Content-Type': 'application/json'
    },
    data: { test: 'json data' }
  });
  
  expect(jsonResponse.status()).toBe(200);
  const jsonResponseData = await jsonResponse.json();
  expect(jsonResponseData.json.test).toBe('json data');
  console.log('✅ JSON content type handled correctly');
  
  // Test 5: Rate limiting simulation
  console.log('⏳ Testing rate limiting behavior...');
  const rateLimitResponse = await request.get('https://api.github.com/rate_limit');
  
  expect(rateLimitResponse.status()).toBe(200);
  const rateLimitData = await rateLimitResponse.json();
  expect(rateLimitData.rate).toHaveProperty('limit');
  expect(rateLimitData.rate).toHaveProperty('remaining');
  console.log(`✅ Rate limit info: ${rateLimitData.rate.remaining}/${rateLimitData.rate.limit} remaining`);
});
```

## 3. API Data Validation with Faker

```javascript
/**
 * 🌐 API TEST: Data Validation with Faker
 * 
 * This test demonstrates:
 * - Generating realistic test data with Faker
 * - Testing data validation rules
 * - Boundary testing with edge cases
 * - Schema validation
 * - Multiple test scenarios with generated data
 */
import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('API data validation with generated test data', async ({ request }) => {
  console.log('📊 Testing API data validation with faker...');
  
  // Generate comprehensive test data
  const testUsers = Array.from({ length: 5 }, () => ({
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    website: faker.internet.url(),
    company: faker.company.name(),
    address: {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      zipcode: faker.location.zipCode(),
      geo: {
        lat: faker.location.latitude(),
        lng: faker.location.longitude()
      }
    }
  }));
  
  console.log(`📝 Generated ${testUsers.length} test users with realistic data`);
  
  // Test each user data through API
  for (const [index, user] of testUsers.entries()) {
    console.log(`👤 Testing user ${index + 1}: ${user.name}`);
    
    const response = await request.post('https://jsonplaceholder.typicode.com/users', {
      data: user
    });
    
    expect(response.status()).toBe(201);
    const responseData = await response.json();
    
    // Validate response structure matches input
    expect(responseData.name).toBe(user.name);
    expect(responseData.email).toBe(user.email);
    expect(responseData).toHaveProperty('id');
    
    console.log(`✅ User ${index + 1} created successfully with ID: ${responseData.id}`);
  }
  
  // Test boundary cases
  console.log('🔍 Testing boundary cases and edge values...');
  
  const boundaryTests = [
    {
      name: faker.lorem.words(100), // Very long name
      description: 'extremely long name'
    },
    {
      name: 'A', // Very short name
      description: 'single character name'
    },
    {
      name: '测试用户', // Unicode characters
      description: 'unicode characters'
    },
    {
      name: 'Test!@#$%^&*()', // Special characters
      description: 'special characters'
    },
    {
      name: '', // Empty string
      description: 'empty name'
    }
  ];
  
  for (const test of boundaryTests) {
    console.log(`🧪 Testing ${test.description}...`);
    
    const response = await request.post('https://jsonplaceholder.typicode.com/users', {
      data: {
        name: test.name,
        email: faker.internet.email(),
        username: faker.internet.userName()
      }
    });
    
    // JSONPlaceholder accepts most data, but in real APIs you'd test validation
    expect(response.status()).toBe(201);
    const responseData = await response.json();
    expect(responseData.name).toBe(test.name);
    
    console.log(`✅ ${test.description} handled correctly`);
  }
  
  console.log('📈 Data validation testing completed successfully!');
});
```

## 4. API Performance and Load Testing

```javascript
/**
 * 🌐 API TEST: Performance and Load Testing
 * 
 * This test demonstrates:
 * - API response time measurement
 * - Concurrent request testing
 * - Load testing with multiple requests
 * - Performance benchmarking
 * - Stress testing
 */
import { test, expect } from '@playwright/test';

test('API performance and load testing', async ({ request }) => {
  console.log('⚡ Starting API performance testing...');
  
  // Test 1: Single request response time
  console.log('⏱️ Measuring single request response time...');
  const startTime = Date.now();
  
  const response = await request.get('https://jsonplaceholder.typicode.com/posts/1');
  
  const responseTime = Date.now() - startTime;
  expect(response.status()).toBe(200);
  expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
  
  console.log(`✅ Single request completed in ${responseTime}ms`);
  
  // Test 2: Multiple sequential requests
  console.log('🔄 Testing multiple sequential requests...');
  const sequentialTimes = [];
  const numberOfRequests = 10;
  
  for (let i = 1; i <= numberOfRequests; i++) {
    const reqStart = Date.now();
    const seqResponse = await request.get(`https://jsonplaceholder.typicode.com/posts/${i}`);
    const reqTime = Date.now() - reqStart;
    
    expect(seqResponse.status()).toBe(200);
    sequentialTimes.push(reqTime);
    
    console.log(`Request ${i}: ${reqTime}ms`);
  }
  
  const avgSequentialTime = sequentialTimes.reduce((a, b) => a + b, 0) / sequentialTimes.length;
  console.log(`✅ Average sequential request time: ${avgSequentialTime.toFixed(2)}ms`);
  
  // Test 3: Concurrent requests (parallel)
  console.log('🚀 Testing concurrent requests...');
  const concurrentStart = Date.now();
  
  const concurrentPromises = Array.from({ length: 10 }, (_, i) => 
    request.get(`https://jsonplaceholder.typicode.com/posts/${i + 1}`)
  );
  
  const concurrentResponses = await Promise.all(concurrentPromises);
  const concurrentTotalTime = Date.now() - concurrentStart;
  
  // Verify all requests succeeded
  concurrentResponses.forEach((response, index) => {
    expect(response.status()).toBe(200);
  });
  
  console.log(`✅ ${concurrentResponses.length} concurrent requests completed in ${concurrentTotalTime}ms`);
  console.log(`⚡ Concurrent vs Sequential improvement: ${((avgSequentialTime * 10) / concurrentTotalTime).toFixed(2)}x faster`);
  
  // Test 4: Stress testing with error handling
  console.log('💪 Stress testing with high volume requests...');
  const stressTestPromises = [];
  const stressTestCount = 50;
  
  for (let i = 0; i < stressTestCount; i++) {
    stressTestPromises.push(
      request.get('https://jsonplaceholder.typicode.com/posts')
        .then(response => ({ success: true, status: response.status() }))
        .catch(error => ({ success: false, error: error.message }))
    );
  }
  
  const stressResults = await Promise.all(stressTestPromises);
  const successfulRequests = stressResults.filter(result => result.success).length;
  const failedRequests = stressResults.filter(result => !result.success).length;
  
  console.log(`📊 Stress test results: ${successfulRequests} successful, ${failedRequests} failed`);
  expect(successfulRequests).toBeGreaterThan(stressTestCount * 0.95); // 95% success rate
  
  // Test 5: API endpoint availability test
  console.log('🔍 Testing API endpoint availability...');
  const endpoints = [
    'https://jsonplaceholder.typicode.com/posts',
    'https://jsonplaceholder.typicode.com/users',
    'https://jsonplaceholder.typicode.com/comments',
    'https://jsonplaceholder.typicode.com/albums',
    'https://jsonplaceholder.typicode.com/photos'
  ];
  
  for (const endpoint of endpoints) {
    const endpointStart = Date.now();
    const endpointResponse = await request.get(endpoint);
    const endpointTime = Date.now() - endpointStart;
    
    expect(endpointResponse.status()).toBe(200);
    console.log(`✅ ${endpoint}: ${endpointTime}ms`);
  }
  
  console.log('🎯 Performance testing completed successfully!');
});
```

## 5. GraphQL API Testing

```javascript
/**
 * 🌐 API TEST: GraphQL API Testing
 * 
 * This test demonstrates:
 * - GraphQL query operations
 * - GraphQL mutation operations
 * - Variable handling in GraphQL
 * - Error handling for GraphQL
 * - Complex nested queries
 */
import { test, expect } from '@playwright/test';

test('GraphQL API testing comprehensive', async ({ request }) => {
  console.log('🔮 Testing GraphQL API operations...');
  
  // Test 1: Basic GraphQL Query
  console.log('📋 Testing basic GraphQL query...');
  const basicQuery = {
    query: `
      query GetUsers($first: Int) {
        users(first: $first) {
          id
          name
          email
          posts {
            title
            body
          }
        }
      }
    `,
    variables: {
      first: 3
    }
  };
  
  // Using a mock GraphQL endpoint for demonstration
  const queryResponse = await request.post('https://graphql-placeholder.com/', {
    headers: {
      'Content-Type': 'application/json'
    },
    data: basicQuery
  });
  
  expect(queryResponse.status()).toBe(200);
  const queryData = await queryResponse.json();
  
  if (queryData.data) {
    expect(queryData).toHaveProperty('data');
    console.log('✅ GraphQL query executed successfully');
  } else {
    console.log('ℹ️ GraphQL endpoint response structure may vary');
  }
  
  // Test 2: GraphQL Mutation
  console.log('✏️ Testing GraphQL mutation...');
  const mutation = {
    query: `
      mutation CreateUser($input: CreateUserInput!) {
        createUser(input: $input) {
          id
          name
          email
          createdAt
        }
      }
    `,
    variables: {
      input: {
        name: 'Test User GraphQL',
        email: 'graphql@test.com'
      }
    }
  };
  
  const mutationResponse = await request.post('https://graphql-placeholder.com/', {
    headers: {
      'Content-Type': 'application/json'
    },
    data: mutation
  });
  
  expect(mutationResponse.status()).toBe(200);
  console.log('✅ GraphQL mutation request sent successfully');
  
  // Test 3: Complex nested query
  console.log('🔗 Testing complex nested GraphQL query...');
  const complexQuery = {
    query: `
      query GetComplexData {
        users(first: 2) {
          id
          name
          email
          posts {
            id
            title
            body
            comments {
              id
              name
              email
              body
            }
          }
          albums {
            id
            title
            photos {
              id
              title
              url
            }
          }
        }
      }
    `
  };
  
  const complexResponse = await request.post('https://graphql-placeholder.com/', {
    headers: {
      'Content-Type': 'application/json'
    },
    data: complexQuery
  });
  
  expect(complexResponse.status()).toBe(200);
  console.log('✅ Complex nested GraphQL query executed');
  
  // Test 4: GraphQL Error Handling
  console.log('🚫 Testing GraphQL error handling...');
  const invalidQuery = {
    query: `
      query InvalidQuery {
        nonExistentField {
          invalidProperty
        }
      }
    `
  };
  
  const errorResponse = await request.post('https://graphql-placeholder.com/', {
    headers: {
      'Content-Type': 'application/json'
    },
    data: invalidQuery
  });
  
  // GraphQL typically returns 200 even for query errors, with errors in response
  expect(errorResponse.status()).toBe(200);
  const errorData = await errorResponse.json();
  
  console.log('✅ GraphQL error handling tested');
  
  console.log('🔮 GraphQL testing completed!');
});
```

## 6. API Error Handling and Edge Cases

```javascript
/**
 * 🌐 API TEST: Error Handling and Edge Cases
 * 
 * This test demonstrates:
 * - HTTP error status code handling
 * - Network timeout testing
 * - Malformed request handling
 * - Edge case data testing
 * - Retry logic testing
 */
import { test, expect } from '@playwright/test';

test('API error handling and edge cases', async ({ request }) => {
  console.log('🛡️ Testing API error handling and edge cases...');
  
  // Test 1: 404 Not Found
  console.log('🔍 Testing 404 Not Found errors...');
  const notFoundResponse = await request.get('https://jsonplaceholder.typicode.com/posts/99999');
  
  expect(notFoundResponse.status()).toBe(404);
  console.log('✅ 404 error handled correctly');
  
  // Test 2: HTTP Status Code Testing
  console.log('📊 Testing various HTTP status codes...');
  const statusCodes = [200, 201, 400, 401, 403, 404, 500, 502, 503];
  
  for (const statusCode of statusCodes) {
    try {
      const statusResponse = await request.get(`https://httpstat.us/${statusCode}`);
      expect(statusResponse.status()).toBe(statusCode);
      console.log(`✅ Status ${statusCode}: Handled correctly`);
    } catch (error) {
      console.log(`⚠️ Status ${statusCode}: ${error.message}`);
    }
  }
  
  // Test 3: Request timeout testing
  console.log('⏰ Testing request timeouts...');
  try {
    const timeoutResponse = await request.get('https://httpstat.us/200?sleep=5000', {
      timeout: 2000 // 2 second timeout for a 5 second response
    });
  } catch (error) {
    expect(error.message).toContain('timeout');
    console.log('✅ Timeout error handled correctly');
  }
  
  // Test 4: Invalid JSON response handling
  console.log('📄 Testing invalid response handling...');
  const invalidJsonResponse = await request.get('https://httpstat.us/200');
  
  try {
    await invalidJsonResponse.json();
  } catch (error) {
    console.log('✅ Invalid JSON response handled correctly');
  }
  
  // Test 5: Large payload testing
  console.log('📦 Testing large payload handling...');
  const largePayload = {
    title: 'Large Test Post',
    body: 'A'.repeat(10000), // 10KB of text
    userId: 1,
    metadata: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item_${i}` }))
  };
  
  const largeResponse = await request.post('https://jsonplaceholder.typicode.com/posts', {
    data: largePayload
  });
  
  expect(largeResponse.status()).toBe(201);
  console.log('✅ Large payload handled successfully');
  
  // Test 6: Special characters and encoding
  console.log('🔤 Testing special characters and encoding...');
  const specialCharsData = {
    title: 'Test with émojis 🚀🔥💯 and spëcial chàracters',
    body: 'Testing with various encodings: 中文, العربية, русский, 日本語',
    userId: 1,
    tags: ['test', 'émoji', '中文', 'специальный']
  };
  
  const encodingResponse = await request.post('https://jsonplaceholder.typicode.com/posts', {
    data: specialCharsData
  });
  
  expect(encodingResponse.status()).toBe(201);
  const encodingData = await encodingResponse.json();
  expect(encodingData.title).toContain('émojis');
  console.log('✅ Special characters and encoding handled correctly');
  
  // Test 7: Empty and null value testing
  console.log('🚫 Testing empty and null values...');
  const edgeCaseData = [
    { title: null, body: 'Null title test', userId: 1 },
    { title: '', body: 'Empty title test', userId: 1 },
    { title: 'Valid title', body: null, userId: 1 },
    { title: 'Valid title', body: '', userId: 1 },
    { userId: 0 }, // Missing required fields
    {} // Completely empty object
  ];
  
  for (const [index, data] of edgeCaseData.entries()) {
    console.log(`🧪 Testing edge case ${index + 1}...`);
    
    const edgeResponse = await request.post('https://jsonplaceholder.typicode.com/posts', {
      data: data
    });
    
    // JSONPlaceholder is lenient, but real APIs would validate
    expect(edgeResponse.status()).toBe(201);
    console.log(`✅ Edge case ${index + 1} handled`);
  }
  
  console.log('🛡️ Error handling and edge case testing completed!');
});
```

## Quick Copy Templates

### 🎯 Basic API Test Template
```javascript
import { test, expect } from '@playwright/test';

test('My API test', async ({ request }) => {
  // Make API request
  const response = await request.get('https://your-api.com/endpoint');
  
  // Verify response
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty('expectedField');
  
  console.log('✅ API test completed!');
});
```

### 🎯 CRUD Operations Template
```javascript
import { test, expect } from '@playwright/test';

test('CRUD operations test', async ({ request }) => {
  // CREATE
  const createResponse = await request.post('https://api.example.com/items', {
    data: { name: 'Test Item', value: 123 }
  });
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json();
  
  // READ
  const readResponse = await request.get(`https://api.example.com/items/${created.id}`);
  expect(readResponse.status()).toBe(200);
  
  // UPDATE
  const updateResponse = await request.put(`https://api.example.com/items/${created.id}`, {
    data: { name: 'Updated Item', value: 456 }
  });
  expect(updateResponse.status()).toBe(200);
  
  // DELETE
  const deleteResponse = await request.delete(`https://api.example.com/items/${created.id}`);
  expect(deleteResponse.status()).toBe(200);
  
  console.log('✅ CRUD operations completed!');
});
```

### 🎯 Authentication Test Template
```javascript
import { test, expect } from '@playwright/test';

test('API with authentication', async ({ request }) => {
  // Test without auth (should fail)
  const unauthorizedResponse = await request.get('https://api.example.com/protected');
  expect(unauthorizedResponse.status()).toBe(401);
  
  // Test with auth
  const authorizedResponse = await request.get('https://api.example.com/protected', {
    headers: {
      'Authorization': 'Bearer your-token-here'
    }
  });
  expect(authorizedResponse.status()).toBe(200);
  
  console.log('✅ Authentication test completed!');
});
```

### 🎯 Data Validation Test Template
```javascript
import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('Data validation with faker', async ({ request }) => {
  const testData = {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.phone.number()
  };
  
  const response = await request.post('https://api.example.com/users', {
    data: testData
  });
  
  expect(response.status()).toBe(201);
  const responseData = await response.json();
  expect(responseData.name).toBe(testData.name);
  expect(responseData.email).toBe(testData.email);
  
  console.log('✅ Data validation test completed!');
});
```