/**
 * Multistep Check Script
 *
 * This script demonstrates how to perform multistep API tests using Playwright.
 * It shows how to chain API calls and use data from previous responses in subsequent requests.
 */

import { test, expect } from "@playwright/test";

test("Multistep check - Create, read, update, and delete a resource", async ({
  request,
}) => {
  // Step 1: Create a new resource (POST)
  console.log("Step 1: Creating a new post...");
  const createResponse = await request.post(
    "https://jsonplaceholder.typicode.com/posts",
    {
      data: {
        title: "Multistep Test with Playwright",
        body: "This is a test of chained API calls using Playwright",
        userId: 1,
      },
    }
  );

  expect(createResponse.status()).toBe(201);
  const newPost = await createResponse.json();
  console.log("✅ Post created with ID:" + newPost.id);

  // Step 2: Retrieve the created resource (GET)
  console.log(`Step 2: Retrieving post with ID ${newPost.id}...`);
  const getResponse = await request.get(
    `https://jsonplaceholder.typicode.com/posts/${newPost.id}`
  );

  expect(getResponse.status()).toBe(200);
  const retrievedPost = await getResponse.json();
  expect(retrievedPost.title).toBe("Multistep Test with Playwright");
  console.log("✅ Post retrieved successfully");

  // Step 3: Update the resource (PUT)
  console.log(`Step 3: Updating post with ID ${newPost.id}...`);
  const updateResponse = await request.put(
    `https://jsonplaceholder.typicode.com/posts/${newPost.id}`,
    {
      data: {
        id: newPost.id,
        title: "Updated Multistep Test",
        body: "This post has been updated",
        userId: 1,
      },
    }
  );

  expect(updateResponse.status()).toBe(200);
  const updatedPost = await updateResponse.json();
  expect(updatedPost.title).toBe("Updated Multistep Test");
  console.log("✅ Post updated successfully");

  // Step 4: Delete the resource (DELETE)
  console.log(`Step 4: Deleting post with ID ${newPost.id}...`);
  const deleteResponse = await request.delete(
    `https://jsonplaceholder.typicode.com/posts/${newPost.id}`
  );

  expect(deleteResponse.status()).toBe(200);
  console.log("✅ Post deleted successfully");
});

test("Multistep check - Authentication and authorized requests", async ({
  request,
}) => {
  // Step 1: Get authentication token (simulated)
  console.log("Step 1: Getting authentication token...");
  // In a real scenario, this would be an actual auth endpoint
  // For this example, we'll simulate the token acquisition
  const authToken = "simulated_jwt_token";
  console.log("✅ Authentication token acquired");

  // Step 2: Use the token to access a protected resource
  console.log("Step 2: Accessing protected resource with token...");
  const protectedResponse = await request.get(
    "https://jsonplaceholder.typicode.com/users/1",
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }
  );

  expect(protectedResponse.status()).toBe(200);
  const userData = await protectedResponse.json();
  expect(userData.id).toBe(1);
  console.log("✅ Protected resource accessed successfully");

  // Step 3: Use data from the protected resource in another request
  console.log("Step 3: Using data from previous response...");
  const postsResponse = await request.get(
    `https://jsonplaceholder.typicode.com/users/${userData.id}/posts`
  );

  expect(postsResponse.status()).toBe(200);
  const posts = await postsResponse.json();
  expect(Array.isArray(posts)).toBe(true);
  expect(posts.length).toBeGreaterThan(0);
  console.log(
    "✅ Retrieved" + posts.length + " posts for user " + userData.name
  );
});

test("Multistep check - Conditional flow based on response", async ({
  request,
}) => {
  // Step 1: Get a list of resources
  console.log("Step 1: Getting list of todos...");
  const listResponse = await request.get(
    "https://jsonplaceholder.typicode.com/todos"
  );

  expect(listResponse.status()).toBe(200);
  const todos = await listResponse.json();
  console.log("✅ Retrieved" + todos.length + " todos");

  // Step 2: Filter the list based on a condition
  console.log("Step 2: Filtering completed todos...");
  const completedTodos = todos.filter(
    (todo: { completed: boolean; id: number }) => todo.completed
  );
  console.log("✅ Found" + completedTodos.length + " completed todos");

  // Step 3A: If there are completed todos, get details for the first one
  if (completedTodos.length > 0) {
    console.log(
      `Step 3A: Getting details for completed todo ID ${completedTodos[0].id}...`
    );
    const detailResponse = await request.get(
      `https://jsonplaceholder.typicode.com/todos/${completedTodos[0].id}`
    );

    expect(detailResponse.status()).toBe(200);
    const todoDetail = await detailResponse.json();
    expect(todoDetail.completed).toBe(true);
    console.log("✅ Completed todo details retrieved successfully");
  }
  // Step 3B: If no completed todos, get details for any todo
  else {
    console.log(
      "Step 3B: No completed todos found, getting details for any todo..."
    );
    const detailResponse = await request.get(
      "https://jsonplaceholder.typicode.com/todos/1"
    );

    expect(detailResponse.status()).toBe(200);
    console.log("✅ Todo details retrieved successfully");
  }
});
