import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { BullModule } from '@nestjs/bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { NotificationProducer } from './notification.producer';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';
import { NotificationConsumer } from './notification.consumer';
import { DbModule } from 'src/db/db.module';
import { NotificationProfile } from './notification.mapper';
import { UserModule } from 'src/user/user.module';
import { FirebaseService } from './firebase/firebase.service';
import { FirebaseDeviceToken } from './firebase/firebase-device-token.entity';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: QueueRegisterKey.NOTIFICATION,
    }),
    TypeOrmModule.forFeature([Notification, FirebaseDeviceToken]),
    DbModule,
    UserModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationProducer,
    NotificationConsumer,
    NotificationProfile,
    FirebaseService,
  ],
  exports: [NotificationService, NotificationProducer, BullModule],
})
export class NotificationModule {}
