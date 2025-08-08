import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as postgres from 'postgres';
import * as schema from './schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class DbService implements OnModuleInit {
  private readonly logger = new Logger(DbService.name);
  public db: PostgresJsDatabase<typeof schema>;

  onModuleInit() {
    this.logger.log('Initializing database connection...');
    try {
      const queryClient = postgres(process.env.DATABASE_URL!);
      this.db = drizzle(queryClient, { schema });
      this.logger.log('Database connection initialized successfully.');
    } catch (error) {
      this.logger.error('Failed to initialize database connection', error);
      throw error;
    }
  }

  /**
   * Gets project information by ID
   * @param projectId The project ID
   */
  async getProjectById(projectId: string): Promise<any> {
    try {
      const project = await this.db.query.projects.findFirst({
        where: eq(schema.projects.id, projectId),
      });
      return project;
    } catch (error) {
      this.logger.error(
        `Failed to get project ${projectId}: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
