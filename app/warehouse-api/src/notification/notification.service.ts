import { Mapper } from '@automapper/core';
import { InjectMapper } from '@automapper/nestjs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { In, IsNull, Repository } from 'typeorm';
import {
  CreateNotificationDto,
  FirebaseRegisterDeviceTokenRequestDto,
  FirebaseRegisterDeviceTokenResponseDto,
  GetAllNotificationDto,
  NotificationResponseDto,
} from './notification.dto';
import { Notification } from './notification.entity';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { UserService } from 'src/user/user.service';
import { NotificationException } from './notification.exception';
import { NotificationValidation } from './notification.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { FirebaseDeviceToken } from './firebase/firebase-device-token.entity';
import { FirebaseService } from './firebase/firebase.service';
import { FirebasePlatform } from './firebase/firebase.constant';
import { FirebaseSendNotificationDto, FirebaseTokenDto } from './firebase/firebase.dto';

@Injectable()
export class NotificationService {
  constructor(
    @InjectMapper()
    private readonly mapper: Mapper,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly transactionManagerService: TransactionManagerService,
    @InjectRepository(FirebaseDeviceToken)
    private readonly firebaseDeviceTokenRepository: Repository<FirebaseDeviceToken>,
    private readonly firebaseService: FirebaseService,
    private readonly userService: UserService,
  ) {}

  async readNotification(slug: string): Promise<NotificationResponseDto> {
    const notification = await this.notificationRepository.findOne({
      where: { slug: slug ?? IsNull() },
    });

    if (!notification) {
      throw new NotificationException(NotificationValidation.NOTIFICATION_NOT_FOUND);
    }

    notification.isRead = true;
    const result = await this.notificationRepository.save(notification);

    return this.mapper.map(result, Notification, NotificationResponseDto);
  }

  async create(data: CreateNotificationDto): Promise<Notification> {
    const context = `${NotificationService.name}.${this.create.name}`;

    const notification = this.mapper.map(data, CreateNotificationDto, Notification);

    let createdNotification: Notification;
    try {
      createdNotification = await this.transactionManagerService.execute<Notification>(
        async (manager) => {
          return await manager.save(notification);
        },
        (result) => {
          this.logger.log(`Notification created: ${result.id}`, context);
        },
      );
    } catch (error) {
      this.logger.error(`Error creating notification: ${error.message}`, error.stack, context);
      return;
    }

    // Gửi notification tới Firebase FCM server
    try {
      const deviceTokens = await this.firebaseDeviceTokenRepository.find({
        where: { userId: createdNotification.receiverId },
        select: {
          id: true,
          token: true,
          platform: true,
        },
      });

      if (deviceTokens.length === 0) {
        this.logger.warn(`No device tokens for user ${createdNotification.receiverId}`, context);
        return createdNotification;
      }

      const tokensWithPlatform: Array<FirebaseTokenDto> = deviceTokens.map((dt) => ({
        token: dt.token,
        platform: dt.platform as FirebasePlatform,
      }));

      const fcmData: FirebaseSendNotificationDto = {
        title: createdNotification.title || '',
        body: createdNotification.body || '',
        link: createdNotification.link || '',
        data: {
          payload: JSON.stringify({
            slug: createdNotification.slug,
            type: createdNotification.type,
            message: createdNotification.message,
            senderId: createdNotification.senderId,
            receiverId: createdNotification.receiverId,
            createdAt: createdNotification.createdAt.toISOString(),
            sentAt: new Date().toISOString(),
            route: createdNotification.link || '',
            ...(createdNotification.metadata ? JSON.parse(createdNotification.metadata) : {}),
          }),
        },
      };

      const result = await this.firebaseService.sendToAllPlatforms(tokensWithPlatform, fcmData);

      if (result.failedTokens && result.failedTokens.length > 0) {
        const failedDeviceTokens = await this.firebaseDeviceTokenRepository.find({
          where: { token: In(result.failedTokens) },
        });
        await this.firebaseDeviceTokenRepository.remove(failedDeviceTokens);
        this.logger.warn(`Failed tokens when FCM for firebase: ${result.failedTokens}`, context);
        this.logger.warn(
          `Removed ${result.failedTokens.length} invalid tokens for user ${createdNotification.receiverId} when sending notification to firebase fcm server`,
          context,
        );
      }

      return createdNotification;
    } catch (error) {
      this.logger.error(
        `Error when sending notification to firebase fcm server: ${error.message}`,
        error.stack,
        context,
      );
      return createdNotification;
    }
  }

  async registerDeviceToken(
    userId: string,
    data: FirebaseRegisterDeviceTokenRequestDto,
  ): Promise<FirebaseRegisterDeviceTokenResponseDto> {
    let deviceToken = await this.firebaseDeviceTokenRepository.findOne({
      where: { token: data.token },
    });

    if (deviceToken) {
      deviceToken.userId = userId;
      deviceToken.platform = data.platform;
      deviceToken.userAgent = data.userAgent;
      deviceToken.updatedAt = new Date();
    } else {
      deviceToken = this.firebaseDeviceTokenRepository.create({
        userId,
        token: data.token,
        platform: data.platform,
        userAgent: data.userAgent,
      });
    }

    const result = await this.firebaseDeviceTokenRepository.save(deviceToken);
    return this.mapper.map(result, FirebaseDeviceToken, FirebaseRegisterDeviceTokenResponseDto);
  }

  async unregisterDeviceToken(token: string): Promise<void> {
    const deviceToken = await this.firebaseDeviceTokenRepository.findOne({
      where: { token },
    });
    if (deviceToken) {
      await this.firebaseDeviceTokenRepository.remove(deviceToken);
    }
  }

  async findAll(
    options: GetAllNotificationDto,
  ): Promise<AppPaginatedResponseDto<NotificationResponseDto>> {
    const query = this.notificationRepository
      .createQueryBuilder('notification')
      .orderBy('notification.createdAt', 'DESC')
      .limit(options.size)
      .offset((options.page - 1) * options.size);

    if (options.receiver) {
      const receiver = await this.userService.findBySlug(options.receiver);
      if (receiver) {
        query.andWhere('notification.receiverId = :receiverId', {
          receiverId: receiver.id,
        });
      }
    }

    if (options.isRead) {
      query.andWhere('notification.isRead = :isRead', {
        isRead: options.isRead,
      });
    }

    if (options.type) {
      query.andWhere('notification.type = :type', {
        type: options.type,
      });
    }

    const notifications = await query.getMany();

    const total = await query.getCount();
    const totalPages = Math.ceil(total / options.size);
    const hasNext = options.page < totalPages;
    const hasPrevious = options.page > 1;

    return {
      hasNext: hasNext,
      hasPrevios: hasPrevious,
      items: this.mapper.mapArray(notifications, Notification, NotificationResponseDto),
      total,
      page: options.page,
      pageSize: options.size,
      totalPages,
    } as AppPaginatedResponseDto<NotificationResponseDto>;
  }
}
