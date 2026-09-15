import { PASSWORD_PATTERN } from '@dashboard/shared';
import { IsEmail, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @Matches(PASSWORD_PATTERN)
  password!: string;
}
