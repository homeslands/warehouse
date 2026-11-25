import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { CodeRule } from './code-rule.entity';
import { CodeRuleResponseDto, UpdateCodeRuleRequestDto } from './code-rule.dto';

// `CodeRule` không kế thừa `Base` nên không `extend(baseMapper(mapper))` — tự đổi `updatedAt` sang chuỗi.
@Injectable()
export class CodeRuleProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        CodeRule,
        CodeRuleResponseDto,
        forMember(
          (d) => d.updatedAt,
          mapFrom((s) => s.updatedAt?.toString()),
        ),
      );

      createMap(mapper, UpdateCodeRuleRequestDto, CodeRule);
    };
  }
}
