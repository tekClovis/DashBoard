import { IsInt, IsObject, IsString } from 'class-validator';
import { PositionDto } from './position.dto.js';

export class CreateWidgetInstanceDto extends PositionDto {
  @IsString()
  service!: string;

  @IsString()
  widget!: string;

  /** Validated against the widget's ParamSpec[] in the service, not here — see param-validator.ts. */
  @IsObject()
  params!: Record<string, unknown>;

  @IsInt()
  refreshRate!: number;
}
