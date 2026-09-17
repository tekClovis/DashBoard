import { IsInt } from 'class-validator';

/** Shared x/y/w/h grid position fields — extended by CreateWidgetInstanceDto and LayoutUpdateDto. */
export abstract class PositionDto {
  @IsInt()
  x!: number;

  @IsInt()
  y!: number;

  @IsInt()
  w!: number;

  @IsInt()
  h!: number;
}
