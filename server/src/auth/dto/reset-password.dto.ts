import { PASSWORD_PATTERN } from '@dashboard/shared';
import { IsString, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @Matches(PASSWORD_PATTERN)
  password!: string;
}
