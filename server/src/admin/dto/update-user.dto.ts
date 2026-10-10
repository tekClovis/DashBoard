import { IsDateString, IsIn, IsOptional } from 'class-validator';

/** PATCH body; at least one field is required (enforced by the service). */
export class UpdateUserDto {
  /** Ban timestamp (ISO date string) to ban; `null` to unban. */
  @IsOptional()
  @IsDateString()
  bannedAt?: string | null;

  @IsOptional()
  @IsIn(['USER', 'ADMIN'])
  role?: 'USER' | 'ADMIN';
}
