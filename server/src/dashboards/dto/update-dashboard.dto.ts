import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateDashboardDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
