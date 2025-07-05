import { Injectable, Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios'; // Import HttpService
import { AxiosError, Method } from 'axios'; // Import Method from axios
import { firstValueFrom } from 'rxjs'; // To convert Observable to Promise
import { MonitorJobDataDto, MonitorConfig, MonitorType } from './dto/monitor-job.dto';
import { MonitorExecutionResult, MonitorResultStatus, MonitorResultDetails } from './types/monitor-result.type';
import { DbService } from '../db/db.service';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'; // Import specific Drizzle type
import * as schema from '../db/schema'; // Assuming your schema is here and WILL contain monitorResults
import { eq, inArray } from 'drizzle-orm';
import { NotificationService, NotificationPayload } from '../notification/notification.service';


// Placeholder for actual execution libraries (axios, ping, net, dns, playwright-runner)

// Replace generic DrizzleInstance with the specific type from Drizzle
// interface DrizzleInstance {
//   insert(table: any): any; // Simplified for now
// }

// Helper function to check status codes against a flexible string pattern
function isExpectedStatus(actualStatus: number, expectedCodesString?: string): boolean {
  if (!expectedCodesString || expectedCodesString.trim() === '') {
    // Default to 2xx if no specific codes are provided
    return actualStatus >= 200 && actualStatus < 300;
  }

  const parts = expectedCodesString.split(',').map(part => part.trim());
  
  for (const part of parts) {
    // Handle patterns like "2xx", "3xx", "4xx", "5xx"
    if (part.endsWith('xx')) {
      const prefix = parseInt(part.charAt(0));
      const actualPrefix = Math.floor(actualStatus / 100);
      if (actualPrefix === prefix) {
        return true;
      }
    }
    // Handle ranges like "200-299"
    else if (part.includes('-')) {
      const [min, max] = part.split('-').map(Number);
      if (actualStatus >= min && actualStatus <= max) {
        return true;
      }
    }
    // Handle specific status codes like "200", "404"
    else if (Number(part) === actualStatus) {
      return true;
    }
  }
  
  return false;
}

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly httpService: HttpService,
    private readonly notificationService: NotificationService
  ) {}

  async executeMonitor(jobData: MonitorJobDataDto): Promise<MonitorExecutionResult | null> {
    this.logger.log(`Executing monitor ${jobData.monitorId} of type ${jobData.type} for target ${jobData.target}`);

    // Check if monitor is paused before execution
    try {
      const monitor = await this.dbService.db.query.monitors.findFirst({
        where: (monitors, { eq }) => eq(monitors.id, jobData.monitorId),
      });

      if (!monitor) {
        this.logger.warn(`Monitor ${jobData.monitorId} not found in database, skipping execution`);
        return {
          monitorId: jobData.monitorId,
          status: 'error',
          checkedAt: new Date(),
          responseTimeMs: undefined,
          details: { errorMessage: 'Monitor not found' },
          isUp: false,
          error: 'Monitor not found',
        };
      }

      if (monitor.status === 'paused') {
        this.logger.log(`Monitor ${jobData.monitorId} is paused, skipping execution`);
        return {
          monitorId: jobData.monitorId,
          status: 'error',
          checkedAt: new Date(),
          responseTimeMs: undefined,
          details: { errorMessage: 'Monitor is paused' },
          isUp: false,
          error: 'Monitor is paused',
        };
      }
    } catch (dbError) {
      this.logger.error(`Failed to check monitor status for ${jobData.monitorId}: ${dbError.message}`);
      // Continue with execution if we can't verify status
    }

    let status: MonitorResultStatus = 'error';
    let details: MonitorResultDetails = {};
    let responseTimeMs: number | undefined;
    let isUp = false; 
    let executionError: string | undefined;

    try {
      switch (jobData.type) {
        case MonitorType.HTTP_REQUEST:
          ({ status, details, responseTimeMs, isUp } = await this.executeHttpRequest(jobData.target, jobData.config));
          break;
        case MonitorType.WEBSITE:
          // Website monitoring is essentially HTTP GET with simplified config
          const websiteConfig = {
            ...jobData.config,
            method: 'GET' as const,
            expectedStatusCodes: jobData.config?.expectedStatusCodes || '200-299',
          };
          ({ status, details, responseTimeMs, isUp } = await this.executeHttpRequest(jobData.target, websiteConfig));
          
          // If SSL checking is enabled and the website check was successful, also check SSL
          if (jobData.config?.enableSslCheck && isUp && jobData.target.startsWith('https://')) {
            try {
              const sslResult = await this.executeSslCheck(jobData.target, {
                daysUntilExpirationWarning: jobData.config.sslDaysUntilExpirationWarning || 30,
                timeoutSeconds: jobData.config.timeoutSeconds || 10,
              });
              
              // Merge SSL certificate info into the website check details
              if (sslResult.details?.sslCertificate) {
                details.sslCertificate = sslResult.details.sslCertificate;
              }
              
              // If SSL check failed but website was up, show warning
              if (!sslResult.isUp && sslResult.details?.warningMessage) {
                details.sslWarning = sslResult.details.warningMessage;
              } else if (!sslResult.isUp) {
                // If SSL check completely failed, mark the overall check as down
                status = sslResult.status;
                isUp = false;
                details.errorMessage = sslResult.details?.errorMessage || 'SSL certificate check failed';
              }
            } catch (sslError) {
              this.logger.warn(`SSL check failed for website monitor ${jobData.monitorId}: ${sslError.message}`);
              details.sslWarning = `SSL check failed: ${sslError.message}`;
            }
          }
          break;
        case MonitorType.PING_HOST:
          ({ status, details, responseTimeMs, isUp } = await this.executePingHost(jobData.target, jobData.config));
          break;
        case MonitorType.PORT_CHECK:
          ({ status, details, responseTimeMs, isUp } = await this.executePortCheck(jobData.target, jobData.config));
          break;

        case MonitorType.HEARTBEAT:
          // Heartbeat monitors check for missed pings rather than actively pinging
          const heartbeatResult = await this.checkHeartbeatMissedPing(jobData.monitorId, jobData.config);
          if (heartbeatResult === null) {
            // No result to record - heartbeat is still within acceptable range
            this.logger.log(`Heartbeat monitor ${jobData.monitorId} is within acceptable range, skipping result recording`);
            return null; // Signal to skip result recording
          }
          ({ status, details, responseTimeMs, isUp } = heartbeatResult);
          break;
        case MonitorType.SSL:
          ({ status, details, responseTimeMs, isUp } = await this.executeSslCheck(jobData.target, jobData.config));
          break;
        default:
          const _exhaustiveCheck: never = jobData.type;
          this.logger.warn(`Unsupported monitor type: ${jobData.type}`);
          executionError = `Unsupported monitor type: ${jobData.type}`;
          status = 'error';
          isUp = false;
      }
    } catch (error) {
      this.logger.error(`Error executing monitor ${jobData.monitorId}: ${error.message}`, error.stack);
      executionError = error.message;
      status = 'error';
      isUp = false;
      if (details) { // Ensure details is defined before assigning to it
        details.errorMessage = error.message;
      } else {
        details = { errorMessage: error.message };
      }
    }

    const result: MonitorExecutionResult = {
      monitorId: jobData.monitorId,
      status,
      checkedAt: new Date(),
      responseTimeMs,
      details,
      isUp,
      error: executionError,
    };
    
    // The service now returns the result instead of saving it.
    // The processor will handle sending this result back to the Next.js app.
    this.logger.log(`Execution finished for monitor ${jobData.monitorId}, Status: ${status}, IsUp: ${isUp}`);
    return result;
  }

  async saveMonitorResult(resultData: MonitorExecutionResult): Promise<void> {
    try {
      const monitor = await this.getMonitorById(resultData.monitorId);
      
      if (monitor) {
        // Get previous status *before* saving the new one
        const previousStatus = monitor.status;
        
        // Save result to database first
        await this.saveMonitorResultToDb(resultData);
        
        // Then update the main monitor status
        await this.updateMonitorStatus(resultData.monitorId, resultData.status, resultData.checkedAt);
        
        // Now check for status change
        const isStatusChange = previousStatus !== resultData.status;
        
        this.logger.log(`Saved result for monitor ${resultData.monitorId}: ${resultData.status}. Status changed: ${isStatusChange}`);

        // Handle alerts if there's a status change and alertConfig is enabled
        if (isStatusChange && monitor.alertConfig?.enabled) {
          const shouldSendAlert = (
            (resultData.status === 'down' && monitor.alertConfig.alertOnFailure) ||
            (resultData.status === 'up' && previousStatus === 'down' && monitor.alertConfig.alertOnRecovery) ||
            (resultData.status === 'timeout' && monitor.alertConfig.alertOnTimeout)
          );

          if (shouldSendAlert) {
            const providers = await this.getNotificationProviders(resultData.monitorId);
            
            if (providers.length > 0) {
              const notificationPayload: NotificationPayload = {
                type: resultData.status === 'up' && previousStatus === 'down' ? 'monitor_recovery' : 'monitor_failure',
                title: resultData.status === 'up' ? `Monitor Recovered - ${monitor.name}` : `Monitor Down - ${monitor.name}`,
                message: monitor.alertConfig.customMessage || 
                  (resultData.status === 'up' 
                    ? `Monitor "${monitor.name}" has recovered and is now operational.`
                    : `Monitor "${monitor.name}" is down. ${resultData.details?.errorMessage || 'No ping received within expected interval'}`),
                targetName: monitor.name,
                targetId: monitor.id,
                severity: resultData.status === 'up' ? 'success' : 'error',
                timestamp: resultData.checkedAt,
                metadata: {
                  status: resultData.status,
                  responseTime: resultData.responseTimeMs,
                  details: resultData.details
                }
              };

              const { success, failed } = await this.notificationService.sendNotificationToMultipleProviders(
                providers,
                notificationPayload
              );

              this.logger.log(`Sent alerts: ${success} successful, ${failed} failed`);
            } else {
              this.logger.warn(`No valid notification providers found for monitor ${resultData.monitorId}`);
            }
          }
        }
      } else {
        this.logger.warn(`Monitor ${resultData.monitorId} not found when saving result`);
      }
    } catch (error) {
      this.logger.error(`Failed to save result for monitor ${resultData.monitorId}: ${error.message}`, error.stack);
      // Don't throw error to prevent job failure
    }
  }

  private async executeHttpRequest(target: string, config?: MonitorConfig): Promise<{status: MonitorResultStatus, details: MonitorResultDetails, responseTimeMs?: number, isUp: boolean}> {
    this.logger.debug(`HTTP Request: ${target}, Method: ${config?.method || 'GET'}, Config: ${JSON.stringify(config)}`);
    
    let responseTimeMs: number | undefined;
    let details: MonitorResultDetails = {};
    let status: MonitorResultStatus = 'error';
    let isUp = false;

    const timeout = config?.timeoutSeconds ? config.timeoutSeconds * 1000 : 10000; // Default 10s timeout
    const httpMethod = (config?.method || 'GET').toUpperCase() as Method;

    // Use high-resolution timer for more accurate timing
    const startTime = process.hrtime.bigint();

    try {
      const requestConfig: any = {
        method: httpMethod,
        url: target,
        timeout,
        // Default headers
        headers: {
          'User-Agent': 'SuperTest-Monitor/1.0',
          ...config?.headers
        },
        // Disable automatic decompression to get more accurate timing
        decompress: false,
        // Follow redirects but track timing
        maxRedirects: 5,
        // Handle various response types
        responseType: 'text', // Always get text to check for keywords
        // Validate status codes
        validateStatus: () => true, // Accept all status codes, we'll handle validation
      };

      // Handle authentication
      if (config?.auth) {
        if (config.auth.type === 'basic' && config.auth.username && config.auth.password) {
          requestConfig.auth = {
            username: config.auth.username,
            password: config.auth.password
          };
        } else if (config.auth.type === 'bearer' && config.auth.token) {
          requestConfig.headers['Authorization'] = `Bearer ${config.auth.token}`;
        }
      }

      // Handle request body for methods that support it
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(httpMethod) && config?.body) {
        // Set content type if not already set
        if (!requestConfig.headers['Content-Type'] && !requestConfig.headers['content-type']) {
          // Try to detect content type
          try {
            JSON.parse(config.body);
            requestConfig.headers['Content-Type'] = 'application/json';
          } catch (e) {
            requestConfig.headers['Content-Type'] = 'text/plain';
          }
        }

        // Attempt to parse body as JSON if content type suggests it, otherwise send as is
        const contentType = requestConfig.headers['Content-Type'] || requestConfig.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
        try {
          requestConfig.data = JSON.parse(config.body);
        } catch (e) {
            // If JSON parsing fails but content type is JSON, still send as string
            requestConfig.data = config.body;
          }
        } else {
          requestConfig.data = config.body;
        }
      }

      const response = await firstValueFrom(
        this.httpService.request(requestConfig)
      );

      // Calculate response time in milliseconds with high precision
      const endTime = process.hrtime.bigint();
      responseTimeMs = Math.round(Number(endTime - startTime) / 1000000); // Convert nanoseconds to milliseconds

      details = {
        statusCode: response.status,
        statusText: response.statusText,
        responseHeaders: response.headers as Record<string, string>,
        responseSize: response.data ? JSON.stringify(response.data).length : 0,
      };

      if (isExpectedStatus(response.status, config?.expectedStatusCodes)) {
        status = 'up';
        isUp = true;

        if (config?.keywordInBody) {
          const bodyString = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          const keywordFound = bodyString.includes(config.keywordInBody);
          if ((config.keywordInBodyShouldBePresent === undefined || config.keywordInBodyShouldBePresent === true) && !keywordFound) {
            status = 'down';
            isUp = false;
            details.errorMessage = `Keyword '${config.keywordInBody}' not found in response.`;
          } else if (config.keywordInBodyShouldBePresent === false && keywordFound) {
            status = 'down';
            isUp = false;
            details.errorMessage = `Keyword '${config.keywordInBody}' was found in response but should be absent.`;
          }
        }
      } else {
        status = 'down';
        isUp = false;
        details.errorMessage = `Received status code: ${response.status}, expected: ${config?.expectedStatusCodes || '200-299'}`;
      }

    } catch (error) {
      // Calculate response time even for errors to track timeout scenarios
      const errorTime = process.hrtime.bigint();
      responseTimeMs = Math.round(Number(errorTime - startTime) / 1000000);
      
      if (error instanceof AxiosError) {
        this.logger.warn(`HTTP Request to ${target} failed: ${error.message}`);
        details.errorMessage = error.message;
        if (error.response) {
          details.statusCode = error.response.status;
          details.statusText = error.response.statusText;
        }
        if (error.code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout')) {
          status = 'timeout';
          isUp = false;
          responseTimeMs = timeout; // Set to timeout value for timeout errors
        } else {
          // Check if the received status is unexpected, even on an AxiosError path
          if (error.response && !isExpectedStatus(error.response.status, config?.expectedStatusCodes)) {
            status = 'down';
            details.errorMessage = details.errorMessage ? `${details.errorMessage}. ` : '';
            details.errorMessage += `Received status code: ${error.response.status}, expected: ${config?.expectedStatusCodes || '200-299'}`;
          } else if (!error.response) { // Network error, no response from server
             status = 'down'; // Or 'error' as per preference
          }
          isUp = false; 
        }
      } else {
        this.logger.error(`Unexpected error during HTTP Request to ${target}: ${error.message}`, error.stack);
        details.errorMessage = error.message || 'An unexpected error occurred';
        status = 'error';
        isUp = false;
        responseTimeMs = timeout; // Set to timeout for unexpected errors
      }
    }
    
    this.logger.debug(`HTTP Request completed: ${target}, Status: ${status}, Response Time: ${responseTimeMs}ms`);
    return { status, details, responseTimeMs, isUp }; 
  }

  private async executePingHost(target: string, config?: MonitorConfig): Promise<{status: MonitorResultStatus, details: MonitorResultDetails, responseTimeMs?: number, isUp: boolean}> {
    const timeout = (config?.timeoutSeconds || 5) * 1000; // Default 5s timeout for ping
    this.logger.debug(`Ping Host: ${target}, Timeout: ${timeout}ms`);
    
    const startTime = process.hrtime.bigint();
    let status: MonitorResultStatus = 'error';
    let details: MonitorResultDetails = {};
    let isUp = false;
    let responseTimeMs: number | undefined;

    try {
      const { spawn } = await import('child_process');
      const isWindows = process.platform === 'win32';
      
      // Use appropriate ping command based on OS
      const pingCommand = isWindows ? 'ping' : 'ping';
      const pingArgs = isWindows 
        ? ['-n', '1', '-w', timeout.toString(), target]  // Windows: -n count, -w timeout in ms
        : ['-c', '1', '-W', Math.ceil(timeout / 1000).toString(), target]; // Linux/Mac: -c count, -W timeout in seconds

      const pingResult = await new Promise<{stdout: string, stderr: string, code: number}>((resolve, reject) => {
        const process = spawn(pingCommand, pingArgs);
        let stdout = '';
        let stderr = '';

        const timeoutHandle = setTimeout(() => {
          process.kill();
          reject(new Error('Ping timeout'));
        }, timeout + 1000); // Add 1s buffer to the timeout

        process.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        process.on('close', (code) => {
          clearTimeout(timeoutHandle);
          resolve({ stdout, stderr, code: code || 0 });
        });

        process.on('error', (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        });
      });

      const endTime = process.hrtime.bigint();
      responseTimeMs = Math.round(Number(endTime - startTime) / 1000000);

      if (pingResult.code === 0) {
        // Parse response time from ping output
        const output = pingResult.stdout;
        let parsedResponseTime: number | undefined;

        if (isWindows) {
          // Windows ping output: "time=XXXms" or "time<1ms"
          const timeMatch = output.match(/time[<=](\d+)ms/i);
          if (timeMatch) {
            parsedResponseTime = parseInt(timeMatch[1]);
          }
        } else {
          // Linux/Mac ping output: "time=XXX.XXX ms"
          const timeMatch = output.match(/time=(\d+(?:\.\d+)?) ms/i);
          if (timeMatch) {
            parsedResponseTime = Math.round(parseFloat(timeMatch[1]));
          }
        }

        status = 'up';
        isUp = true;
        details = {
          responseTimeMs: parsedResponseTime || responseTimeMs,
          packetsSent: 1,
          packetsReceived: 1,
          packetLoss: 0,
          output: output.trim()
        };
        
        // Use parsed response time if available, otherwise use our measured time
        responseTimeMs = parsedResponseTime || responseTimeMs;
      } else {
        status = 'down';
        isUp = false;
        details = {
          errorMessage: `Ping failed with exit code ${pingResult.code}`,
          stderr: pingResult.stderr,
          stdout: pingResult.stdout,
          responseTimeMs
        };
      }

    } catch (error) {
      const errorTime = process.hrtime.bigint();
      responseTimeMs = Math.round(Number(errorTime - startTime) / 1000000);
      
      this.logger.warn(`Ping to ${target} failed: ${error.message}`);
      
      if (error.message.includes('timeout')) {
        status = 'timeout';
        details.errorMessage = `Ping timeout after ${timeout}ms`;
      } else {
        status = 'error';
        details.errorMessage = error.message;
      }
      
      isUp = false;
      details.responseTimeMs = responseTimeMs;
    }
    
    this.logger.debug(`Ping completed: ${target}, Status: ${status}, Response Time: ${responseTimeMs}ms`);
    return { status, details, responseTimeMs, isUp };
  }

  private async executePortCheck(target: string, config?: MonitorConfig): Promise<{status: MonitorResultStatus, details: MonitorResultDetails, responseTimeMs?: number, isUp: boolean}> {
    const port = config?.port;
    const protocol = config?.protocol || 'tcp';
    const timeout = (config?.timeoutSeconds || 10) * 1000; // Convert to milliseconds
    
    this.logger.debug(`Port Check: ${target}, Port: ${port}, Protocol: ${protocol}, Timeout: ${timeout}ms`);
    
    if (!port) {
      return { 
        status: 'error', 
        isUp: false, 
        details: { errorMessage: 'Port not provided for port_check'} 
      };
    }

    const startTime = process.hrtime.bigint();
    let status: MonitorResultStatus = 'error';
    let details: MonitorResultDetails = {};
    let isUp = false;
    let responseTimeMs: number | undefined;

    try {
      if (protocol === 'tcp') {
        // TCP port check using net module
        const net = await import('net');
        
        await new Promise<void>((resolve, reject) => {
          const socket = new net.Socket();
          
          const timeoutHandle = setTimeout(() => {
            socket.destroy();
            reject(new Error(`Connection timeout after ${timeout}ms`));
          }, timeout);

          socket.connect(port, target, () => {
            clearTimeout(timeoutHandle);
            socket.destroy();
            resolve();
          });

          socket.on('error', (error) => {
            clearTimeout(timeoutHandle);
            socket.destroy();
            reject(error);
          });
        });

        // If we reach here, connection was successful
        const endTime = process.hrtime.bigint();
        responseTimeMs = Math.round(Number(endTime - startTime) / 1000000);
        status = 'up';
        isUp = true;
        details = { 
          port, 
          protocol, 
          connectionSuccessful: true,
          responseTimeMs 
        };

      } else if (protocol === 'udp') {
        // UDP port check using dgram module
        const dgram = await import('dgram');
        
        await new Promise<void>((resolve, reject) => {
          const client = dgram.createSocket('udp4');
          
          const timeoutHandle = setTimeout(() => {
            client.close();
            // For UDP, timeout doesn't necessarily mean the port is closed
            // UDP is connectionless, so we assume it's open if no ICMP error
            resolve();
          }, timeout);

          // Send a small test packet
          const message = Buffer.from('ping');
          
          client.send(message, port, target, (error) => {
            if (error) {
              clearTimeout(timeoutHandle);
              client.close();
              reject(error);
            } else {
              // For UDP, successful send usually means the port is reachable
              // (unless we get an ICMP port unreachable, which would trigger an error)
              clearTimeout(timeoutHandle);
              client.close();
              resolve();
            }
          });

          client.on('error', (error) => {
            clearTimeout(timeoutHandle);
            client.close();
            reject(error);
          });
        });

        // If we reach here, UDP send was successful
        const endTime = process.hrtime.bigint();
        responseTimeMs = Math.round(Number(endTime - startTime) / 1000000);
        status = 'up';
        isUp = true;
        details = { 
          port, 
          protocol, 
          packetSent: true,
          responseTimeMs,
          note: 'UDP port appears reachable (no ICMP error received)'
        };
      }

    } catch (error) {
      const endTime = process.hrtime.bigint();
      responseTimeMs = Math.round(Number(endTime - startTime) / 1000000);
      
      this.logger.warn(`Port Check to ${target}:${port} (${protocol}) failed: ${error.message}`);
      
      if (error.message.includes('timeout')) {
        status = 'timeout';
        details.errorMessage = `Connection timeout after ${timeout}ms`;
      } else if (error.code === 'ECONNREFUSED') {
        status = 'down';
        details.errorMessage = 'Connection refused - port is closed or service not running';
      } else if (error.code === 'EHOSTUNREACH') {
        status = 'down';
        details.errorMessage = 'Host unreachable';
      } else if (error.code === 'ENETUNREACH') {
        status = 'down';
        details.errorMessage = 'Network unreachable';
      } else {
        status = 'error';
        details.errorMessage = error.message;
      }
      
      isUp = false;
      details.port = port;
      details.protocol = protocol;
      details.responseTimeMs = responseTimeMs;
    }
    
    this.logger.debug(`Port Check completed: ${target}:${port} (${protocol}), Status: ${status}, Response Time: ${responseTimeMs}ms`);
    return { status, details, responseTimeMs, isUp };
  }

  private async checkHeartbeatMissedPing(monitorId: string, config?: MonitorConfig): Promise<{status: MonitorResultStatus, details: MonitorResultDetails, responseTimeMs?: number, isUp: boolean} | null> {
    this.logger.debug(`Checking heartbeat missed ping for monitor ${monitorId}`);
    
    let details: MonitorResultDetails = {};
    let status: MonitorResultStatus = 'down'; // Default to down for heartbeat checks
    let isUp = false; // Default to false - we only create entries for failures
    const responseTimeMs = 0; // Heartbeat checks don't have response times

    try {
      const expectedIntervalMinutes = config?.expectedIntervalMinutes || 60;
      const gracePeriodMinutes = config?.gracePeriodMinutes || 10;
      const lastPingAt = config?.lastPingAt;
      
      const now = new Date();
      const totalWaitMinutes = expectedIntervalMinutes + gracePeriodMinutes;
      
      // Get monitor from database to check creation time and get latest ping info
      const monitor = await this.dbService.db.query.monitors.findFirst({
        where: (monitors, { eq }) => eq(monitors.id, monitorId),
      });

      if (!monitor) {
        throw new Error(`Monitor ${monitorId} not found`);
      }

      const createdAt = new Date(monitor.createdAt!);
      const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60);
      
      let isOverdue = false;
      let overdueMessage = "";
      let currentLastPingAt = lastPingAt;

      // Check if there's a more recent ping in the monitor config
      if (monitor.config && typeof monitor.config === 'object' && 'lastPingAt' in monitor.config) {
        const configLastPing = (monitor.config as any).lastPingAt;
        if (configLastPing) {
          currentLastPingAt = configLastPing;
        }
      }

      if (!currentLastPingAt) {
        // No ping received yet - check grace period from creation
        if (minutesSinceCreation > totalWaitMinutes) {
          isOverdue = true;
          overdueMessage = `No initial ping received within ${totalWaitMinutes} minutes of creation (${Math.round(minutesSinceCreation)} minutes ago)`;
        } else {
          // Still within grace period for initial ping - don't create a result entry
          // The heartbeat service should not have queued this check yet
          this.logger.debug(`Monitor ${monitorId} still within grace period, skipping result creation`);
          return null; // Signal to not create a result entry
        }
      } else {
        // Check if last ping is too old
        const lastPing = new Date(currentLastPingAt);
        const minutesSinceLastPing = (now.getTime() - lastPing.getTime()) / (1000 * 60);
        
        if (minutesSinceLastPing > totalWaitMinutes) {
          isOverdue = true;
          overdueMessage = `Last ping was ${Math.round(minutesSinceLastPing)} minutes ago, expected every ${expectedIntervalMinutes} minutes (grace period: ${gracePeriodMinutes} minutes)`;
        } else {
          // Ping is recent enough - don't create a result entry
          // Success entries are only created when actual pings are received
          this.logger.debug(`Monitor ${monitorId} ping is recent enough, skipping result creation`);
          return null; // Signal to not create a result entry
        }
      }

      if (isOverdue) {
        status = 'down';
        isUp = false;
        details = {
          errorMessage: 'No ping received within expected interval',
          detailedMessage: overdueMessage,
          expectedInterval: expectedIntervalMinutes,
          gracePeriod: gracePeriodMinutes,
          lastPingAt: currentLastPingAt || null,
          checkType: 'missed_heartbeat',
          totalWaitMinutes,
          ...(currentLastPingAt ? {
            minutesSinceLastPing: Math.round((now.getTime() - new Date(currentLastPingAt).getTime()) / (1000 * 60))
          } : {
            minutesSinceCreation: Math.round(minutesSinceCreation)
          }),
        };
      } else {
        // Should not reach here based on logic above, but safety fallback
        return null;
      }

    } catch (error) {
      this.logger.error(`Error checking heartbeat for monitor ${monitorId}:`, error);
      status = 'error';
      isUp = false;
      details = {
        errorMessage: `Failed to check heartbeat: ${error.message}`,
        checkType: 'heartbeat_error',
      };
    }

    return { status, details, responseTimeMs, isUp };
  }

  private async executeSslCheck(target: string, config?: MonitorConfig): Promise<{status: MonitorResultStatus, details: MonitorResultDetails, responseTimeMs?: number, isUp: boolean}> {
    const timeout = (config?.timeoutSeconds || 10) * 1000; // Convert to milliseconds
    const daysUntilExpirationWarning = config?.daysUntilExpirationWarning || 30;
    
    this.logger.debug(`SSL Check: ${target}, Timeout: ${timeout}ms, Warning threshold: ${daysUntilExpirationWarning} days`);
    
    const startTime = process.hrtime.bigint();
    let status: MonitorResultStatus = 'error';
    let details: MonitorResultDetails = {};
    let isUp = false;
    let responseTimeMs: number | undefined;

    try {
      const tls = await import('tls');
      const { URL } = await import('url');
      
      // Parse target to extract hostname and port
      let hostname = target;
      let port = 443; // Default HTTPS port
      
      try {
        // Try to parse as URL first
        const url = new URL(target.startsWith('http') ? target : `https://${target}`);
        hostname = url.hostname;
        port = parseInt(url.port) || 443;
      } catch {
        // If URL parsing fails, treat as hostname:port format
        const parts = target.split(':');
        hostname = parts[0];
        if (parts[1]) {
          port = parseInt(parts[1]);
        }
      }

      const certificateInfo = await new Promise<{
        certificate: any;
        authorized: boolean;
        authorizationError?: Error;
      }>((resolve, reject) => {
        const socket = tls.connect({
          host: hostname,
          port: port,
          timeout: timeout,
          rejectUnauthorized: false, // We want to check the cert even if it's invalid
          servername: hostname, // SNI support for proper certificate validation
          secureProtocol: 'TLS_method', // Use modern TLS
        }, () => {
          const cert = socket.getPeerCertificate(true);
          const authorized = socket.authorized;
          const authorizationError = socket.authorizationError;
          
          socket.destroy();
          resolve({
            certificate: cert,
            authorized,
            authorizationError
          });
        });

        socket.on('error', (error) => {
          socket.destroy();
          reject(error);
        });

        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error(`SSL connection timeout after ${timeout}ms`));
        });

        // Set timeout manually as well
        setTimeout(() => {
          if (!socket.destroyed) {
            socket.destroy();
            reject(new Error(`SSL connection timeout after ${timeout}ms`));
          }
        }, timeout);
      });

      const endTime = process.hrtime.bigint();
      responseTimeMs = Math.round(Number(endTime - startTime) / 1000000);

      const cert = certificateInfo.certificate;
      
      if (!cert || !cert.valid_from || !cert.valid_to) {
        status = 'error';
        isUp = false;
        details = {
          errorMessage: 'No valid certificate found',
          responseTimeMs
        };
      } else {
        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        const sslCertificate = {
          valid: certificateInfo.authorized,
          issuer: cert.issuer?.CN || 'Unknown',
          subject: cert.subject?.CN || 'Unknown',
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          daysRemaining: daysRemaining,
          serialNumber: cert.serialNumber,
          fingerprint: cert.fingerprint,
        };

        // Determine status based on certificate validity
        if (now < validFrom) {
          status = 'error';
          isUp = false;
          details = {
            errorMessage: 'Certificate is not yet valid',
            sslCertificate,
            responseTimeMs
          };
        } else if (now > validTo) {
          status = 'down';
          isUp = false;
          details = {
            errorMessage: 'Certificate has expired',
            sslCertificate,
            responseTimeMs
          };
        } else if (daysRemaining <= daysUntilExpirationWarning) {
          status = 'up'; // Still up but warning
          isUp = true;
          details = {
            warningMessage: `Certificate expires in ${daysRemaining} days`,
            sslCertificate,
            responseTimeMs
          };
        } else {
          status = 'up';
          isUp = true;
          details = {
            sslCertificate,
            responseTimeMs
          };
        }

        // Add authorization details
        if (!certificateInfo.authorized && certificateInfo.authorizationError) {
          details.authorizationError = certificateInfo.authorizationError.message;
        }
      }

    } catch (error) {
      const endTime = process.hrtime.bigint();
      responseTimeMs = Math.round(Number(endTime - startTime) / 1000000);
      
      this.logger.warn(`SSL Check to ${target} failed: ${error.message}`);
      
      if (error.message.includes('timeout')) {
        status = 'timeout';
        details.errorMessage = `SSL connection timeout after ${timeout}ms`;
      } else if (error.code === 'ECONNREFUSED') {
        status = 'down';
        details.errorMessage = 'Connection refused - SSL service not available';
      } else if (error.code === 'EHOSTUNREACH') {
        status = 'down';
        details.errorMessage = 'Host unreachable';
      } else if (error.code === 'ENOTFOUND') {
        status = 'down';
        details.errorMessage = 'Host not found';
      } else if (error.message.includes('handshake')) {
        status = 'down';
        details.errorMessage = 'SSL handshake failed - certificate or TLS configuration issue';
      } else if (error.message.includes('alert')) {
        status = 'down';
        details.errorMessage = 'SSL/TLS protocol error - server rejected connection';
      } else if (error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        status = 'down';
        details.errorMessage = 'Self-signed certificate';
      } else if (error.code === 'CERT_HAS_EXPIRED') {
        status = 'down';
        details.errorMessage = 'Certificate has expired';
      } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        status = 'down';
        details.errorMessage = 'Unable to verify certificate signature';
      } else {
        status = 'error';
        details.errorMessage = `SSL check failed: ${error.message}`;
      }
      
      isUp = false;
      details.responseTimeMs = responseTimeMs;
    }
    
    this.logger.debug(`SSL Check completed: ${target}, Status: ${status}, Response Time: ${responseTimeMs}ms`);
    return { status, details, responseTimeMs, isUp };
  }

  async getMonitorById(monitorId: string): Promise<any> {
    try {
      const monitor = await this.dbService.db.query.monitors.findFirst({
        where: eq(schema.monitors.id, monitorId),
      });
      return monitor;
    } catch (error) {
      this.logger.error(`Failed to get monitor ${monitorId}: ${error.message}`);
      throw error;
    }
  }

  async getNotificationProviders(monitorId: string): Promise<any[]> {
    try {
      const providers = await this.dbService.db
        .select({
          id: schema.notificationProviders.id,
          type: schema.notificationProviders.type,
          config: schema.notificationProviders.config,
        })
        .from(schema.notificationProviders)
        .innerJoin(
          schema.monitorNotificationSettings,
          eq(schema.monitorNotificationSettings.notificationProviderId, schema.notificationProviders.id)
        )
        .where(eq(schema.monitorNotificationSettings.monitorId, monitorId));
      
      return providers.map(provider => ({
        id: provider.id,
        type: provider.type,
        config: provider.config,
      })) || [];
    } catch (error) {
      this.logger.error(
        `Failed to get notification providers for monitor ${monitorId}: ${error.message}`
      );
      return [];
    }
  }

  private async saveMonitorResultToDb(resultData: MonitorExecutionResult): Promise<void> {
    try {
      await this.dbService.db.insert(schema.monitorResults).values({
        monitorId: resultData.monitorId,
        checkedAt: resultData.checkedAt,
        status: resultData.status,
        responseTimeMs: resultData.responseTimeMs,
        details: resultData.details,
        isUp: resultData.isUp,
      });
    } catch (error) {
      this.logger.error(`Failed to save monitor result for ${resultData.monitorId}: ${error.message}`);
    }
  }

  private async updateMonitorStatus(monitorId: string, status: MonitorResultStatus, checkedAt: Date): Promise<void> {
    try {
      const monitorStatus: schema.MonitorStatus = status === 'timeout' ? 'down' : status;
      await this.dbService.db
        .update(schema.monitors)
        .set({ 
          status: monitorStatus,
          lastCheckAt: checkedAt,
        })
        .where(eq(schema.monitors.id, monitorId));
    } catch (error) {
      this.logger.error(`Failed to update monitor status for ${monitorId}: ${error.message}`);
    }
  }
} 