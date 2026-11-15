import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { SessionService } from './auth/session.service';
import { ThingsBoardClient } from './thingsboard/thingsboard.client';
import { RealtimeService } from './thingsboard/realtime.service';
import { EntitiesController } from './thingsboard/entities.controller';
import { ProjectsController } from './projects/projects.controller';
import { ProjectRepository } from './projects/project.repository';
@Module({
  controllers: [AuthController, EntitiesController, ProjectsController],
  providers: [SessionService, ThingsBoardClient, RealtimeService, ProjectRepository],
})
export class AppModule {}
