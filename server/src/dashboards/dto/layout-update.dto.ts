import { IsUUID } from 'class-validator';
import { PositionDto } from './position.dto.js';

/** One entry of PATCH /dashboards/{id}/layout's batch body — see CreateWidgetInstanceDto for params/refreshRate. */
export class LayoutUpdateDto extends PositionDto {
  @IsUUID()
  id!: string;
}
