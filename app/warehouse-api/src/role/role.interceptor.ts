import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ClassTransformOptions, instanceToPlain } from 'class-transformer';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class RoleBasedSerializationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { user } = context.switchToHttp().getRequest();
    const options: ClassTransformOptions = {
      groups: user?.roleName ? [user.roleName] : [],
    };

    return next.handle().pipe(
      map((data) => {
        if (!data || typeof data !== 'object') return data;
        return JSON.parse(JSON.stringify(instanceToPlain(data, options)));
      }),
    );
  }
}
