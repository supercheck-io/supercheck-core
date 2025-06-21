import { Injectable, Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios'; // Import HttpService
import { AxiosError, Method } from 'axios'; // Import Method from axios
import { firstValueFrom } from 'rxjs'; // To convert Observable to Promise
import { MonitorJobDataDto, MonitorConfig, MonitorType } from './dto/monitor-job.dto';
import { MonitorExecutionResult, MonitorResultStatus, MonitorResultDetails } from './types/monitor-result.type';
import { DB_PROVIDER_TOKEN } from '../execution/services/db.service'; // Import DB_PROVIDER_TOKEN
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'; // Import specific Drizzle type
import * as schema from '../db/schema'; // Assuming your schema is here and WILL contain monitorResults


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
    @Inject(DB_PROVIDER_TOKEN) private db: PostgresJsDatabase<typeof schema>, // Use specific type and @Inject
    private readonly httpService: HttpService // Inject HttpService
  ) {}

  async executeMonitor(jobData: MonitorJobDataDto): Promise<MonitorExecutionResult> {
    this.logger.log(`Executing monitor ${jobData.monitorId} of type ${jobData.type} for target ${jobData.target}`);

    // Check if monitor is paused before execution
    try {
      const monitor = await this.db.query.monitors.findFirst({
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
        case 'http_request':
          ({ status, details, responseTimeMs, isUp } = await this.executeHttpRequest(jobData.target, jobData.config));
          break;
        case 'ping_host':
          ({ status, details, responseTimeMs, isUp } = await this.executePingHost(jobData.target, jobData.config));
          break;
        case 'port_check':
          ({ status, details, responseTimeMs, isUp } = await this.executePortCheck(jobData.target, jobData.config));
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
    this.logger.log(`Attempting to save result for monitor ${resultData.monitorId}`);
    
    // Don't try to save results for monitors that don't exist or have errors
    if (resultData.error === 'Monitor not found' || resultData.error === 'Monitor is paused') {
      this.logger.log(`Skipping save for monitor ${resultData.monitorId}: ${resultData.error}`);
      return;
    }
    
    try {
      // Get the monitor details and previous status for alert processing
      const monitor = await this.db.query.monitors.findFirst({
        where: (monitors, { eq }) => eq(monitors.id, resultData.monitorId),
      });

      let previousStatus: string | undefined;
      let isStatusChange = false;

      if (monitor) {
        // Get the last result to determine if status changed
        const lastResult = await this.db.query.monitorResults.findFirst({
          where: (monitorResults, { eq }) => eq(monitorResults.monitorId, resultData.monitorId),
          orderBy: (monitorResults, { desc }) => [desc(monitorResults.checkedAt)],
        });

        if (lastResult) {
          previousStatus = lastResult.status;
          isStatusChange = lastResult.status !== resultData.status;
        }

        // Save the result with status change flag
        await this.db.insert(schema.monitorResults).values({
          monitorId: resultData.monitorId,
          checkedAt: resultData.checkedAt, 
          status: resultData.status,
          responseTimeMs: resultData.responseTimeMs,
          details: resultData.details as any,
          isUp: resultData.isUp,
          isStatusChange,
        });

        this.logger.log(`Successfully saved result for monitor ${resultData.monitorId}`);

        // Trigger alert if status changed or it's a critical error
        if (isStatusChange || resultData.status === 'error') {
          try {
            // Call the app's alert API
            const alertContext = {
              monitorId: resultData.monitorId,
              monitorName: monitor.name,
              monitorTarget: monitor.target,
              monitorType: monitor.type,
              status: resultData.status,
              previousStatus,
              errorMessage: resultData.details?.errorMessage || resultData.error,
              responseTime: resultData.responseTimeMs,
              checkedAt: resultData.checkedAt,
              isStatusChange,
            };

            const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
            const response = await fetch(`${appBaseUrl}/api/alerts/process`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(alertContext),
            });

            if (!response.ok) {
              this.logger.error(`Failed to trigger alert for monitor ${resultData.monitorId}: ${response.statusText}`);
            } else {
              this.logger.log(`Successfully triggered alert for monitor ${resultData.monitorId}`);
            }
          } catch (alertError) {
            this.logger.error(`Error triggering alert for monitor ${resultData.monitorId}:`, alertError);
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
        details.errorMessage = `Received status code: ${response.status}, expected: ${config?.expectedStatusCodes || '2xx'}`;
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
            details.errorMessage += `Received status code: ${error.response.status}, expected: ${config?.expectedStatusCodes || '2xx'}`;
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


} 