import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Entity, Column } from 'typeorm';

@Entity('logger_tbl')
export class LoggerEntry extends Base {
  @AutoMap()
  @Column({ name: 'level_column' })
  level: string;

  @AutoMap()
  @Column({ name: 'message_column', type: 'text' })
  message: string;

  @AutoMap()
  @Column({ nullable: true, name: 'context_column' })
  context: string;

  @AutoMap()
  @Column({ name: 'timestamp_column' })
  timestamp: string;

  @AutoMap()
  @Column({ name: 'pid_column' })
  pid: number;
}
