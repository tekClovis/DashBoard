import { IsInt, IsObject, IsOptional } from 'class-validator';

export class UpdateWidgetInstanceDto {
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  refreshRate?: number;
}
