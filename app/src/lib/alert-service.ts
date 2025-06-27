import { db as getDbInstance } from "@/lib/db";
import { 
  alertHistory,
} from "@/db/schema/schema";
import { eq } from "drizzle-orm";

export class AlertService {
  private static instance: AlertService;

  public static getInstance(): AlertService {
    if (!AlertService.instance) {
      AlertService.instance = new AlertService();
    }
    return AlertService.instance;
  }

  /**
   * Save alert notification to history
   */
  async saveAlertHistory(alertData: {
    type: string;
    message: string;
    target: string;
    targetType: 'monitor' | 'job';
    monitorId?: string;
    jobId?: string;
    provider: string;
    status: 'sent' | 'failed' | 'pending';
    errorMessage?: string;
  }): Promise<void> {
    const db = await getDbInstance();
    
    try {
      await db.insert(alertHistory).values({
        type: alertData.type as any,
        message: alertData.message,
        target: alertData.target,
        targetType: alertData.targetType,
        monitorId: alertData.monitorId || null,
        jobId: alertData.jobId || null,
        provider: alertData.provider,
        status: alertData.status,
        errorMessage: alertData.errorMessage || null,
        sentAt: new Date(),
      });
      
      console.log(`Alert history saved: ${alertData.type} for ${alertData.target}`);
    } catch (error) {
      console.error('Failed to save alert history:', error);
    }
  }
} 