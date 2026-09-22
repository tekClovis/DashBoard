import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class UpdateUserDto {
  /** ISO date bans, `null` unbans. */
  @IsOptional()
  @IsDateString()
  bannedAt?: string | null;

  @IsOptional()
  @IsIn(['USER', 'ADMIN'])
  role?: 'USER' | 'ADMIN';
}
