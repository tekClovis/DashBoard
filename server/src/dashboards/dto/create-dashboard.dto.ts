import { IsString, Length } from 'class-validator';

export class CreateDashboardDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}
