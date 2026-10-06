import { IsEmail } from 'class-validator';

export class ShareDashboardDto {
  @IsEmail()
  email!: string;
}
