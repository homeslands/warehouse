import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './notification.dto';
import { CREATE_NOTIFICATION_JOB } from './notification.constants';

@Processor(QueueRegisterKey.NOTIFICATION)
@Injectable()
export class NotificationConsumer extends WorkerHost {
  constructor(private readonly notificationService: NotificationService) {
    super();
  }

  async process(job: Job<CreateNotificationDto>): Promise<any> {
    switch (job.name) {
      case CREATE_NOTIFICATION_JOB:
        return await this.notificationService.create(job.data);
    }
  }
}
