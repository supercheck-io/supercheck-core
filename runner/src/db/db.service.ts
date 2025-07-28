import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as postgres from 'postgres';
import * as schema from './schema';

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
}
