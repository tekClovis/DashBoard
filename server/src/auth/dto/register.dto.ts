import { IsEmail, Matches } from 'class-validator';

/** 8-72 chars, at least one digit and one non-alphanumeric symbol — docs/auth/specs.md §Flows. */
const PASSWORD_PATTERN = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,72}$/;

export class RegisterDto {
  @IsEmail()
  email!: string;

  @Matches(PASSWORD_PATTERN)
  password!: string;
}
