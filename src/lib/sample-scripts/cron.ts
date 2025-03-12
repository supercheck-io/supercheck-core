/**
 * CRON/Heartbeat Check Script
 * 
 * This script demonstrates how to monitor scheduled tasks and services
 * using Playwright. It checks for service availability and response times.
 */

import { test, expect } from '@playwright/test';

test('CRON check - Service heartbeat monitoring', async ({ request }) => {
  // Define the services to monitor
  const services = [
    { name: 'API Service', url: 'https://jsonplaceholder.typicode.com/posts' },
    { name: 'User Service', url: 'https://jsonplaceholder.typicode.com/users' },
    { name: 'Comment Service', url: 'https://jsonplaceholder.typicode.com/comments' }
  ];
  
  // Check each service
  for (const service of services) {
    console.log(`Checking heartbeat for ${service.name}...`);
    
    const startTime = Date.now();
    const response = await request.get(service.url);
    const responseTime = Date.now() - startTime;
    
    // Verify the service is responding
    expect(response.status()).toBe(200);
    
    // Verify the response time is acceptable (under 2 seconds)
    expect(responseTime).toBeLessThan(2000);
    
    console.log(`✅ ${service.name} is healthy (responded in ${responseTime}ms)`);
  }
});

test('CRON check - Scheduled task verification', async () => {
  // Simulate checking a task that should run every hour
  // In a real scenario, you might check a log file or a database record
  
  console.log('Verifying scheduled task execution...');
  
  // Get the current time
  const now = new Date();
  
  // Simulate checking when the task last ran
  // For this example, we'll pretend it ran 30 minutes ago
  const lastRunTime = new Date(now.getTime() - 30 * 60 * 1000);
  
  // Check if the task ran within the expected timeframe (within the last hour)
  const timeSinceLastRun = now.getTime() - lastRunTime.getTime();
  const oneHourInMs = 60 * 60 * 1000;
  
  expect(timeSinceLastRun).toBeLessThan(oneHourInMs);
  
  console.log(`✅ Scheduled task last ran at ${lastRunTime.toISOString()} (${Math.round(timeSinceLastRun / 60000)} minutes ago)`);
});

test('CRON check - System resource monitoring', async () => {
  // Simulate checking system resources
  // In a real scenario, you would use system APIs or external monitoring tools
  
  console.log('Monitoring system resources...');
  
  // Simulate CPU usage check (random value between 0-100%)
  const cpuUsage = Math.random() * 100;
  console.log(`CPU Usage: ${cpuUsage.toFixed(2)}%`);
  
  // Simulate memory usage check (random value between 0-100%)
  const memoryUsage = Math.random() * 100;
  console.log(`Memory Usage: ${memoryUsage.toFixed(2)}%`);
  
  // Simulate disk usage check (random value between 0-100%)
  const diskUsage = Math.random() * 100;
  console.log(`Disk Usage: ${diskUsage.toFixed(2)}%`);
  
  // Verify resources are within acceptable thresholds
  expect(cpuUsage).toBeLessThan(90);
  expect(memoryUsage).toBeLessThan(90);
  expect(diskUsage).toBeLessThan(90);
  
  console.log('✅ System resources are within acceptable thresholds');
});

test('CRON check - Database backup verification', async () => {
  // Simulate checking if database backups are being created regularly
  // In a real scenario, you would check actual backup files or logs
  
  console.log('Verifying database backups...');
  
  // Simulate checking when the last backup was created
  const now = new Date();
  const lastBackupTime = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago
  
  // Check if the backup was created within the expected timeframe (within the last 24 hours)
  const timeSinceLastBackup = now.getTime() - lastBackupTime.getTime();
  const oneDayInMs = 24 * 60 * 60 * 1000;
  
  expect(timeSinceLastBackup).toBeLessThan(oneDayInMs);
  
  // Simulate checking the backup size
  const backupSizeInMB = 250 + Math.random() * 50; // Random size between 250-300 MB
  
  // Verify the backup size is reasonable (not too small)
  expect(backupSizeInMB).toBeGreaterThan(100);
  
  console.log(`✅ Database backup verified: Last backup at ${lastBackupTime.toISOString()} (${Math.round(timeSinceLastBackup / 3600000)} hours ago), size: ${backupSizeInMB.toFixed(2)} MB`);
});
