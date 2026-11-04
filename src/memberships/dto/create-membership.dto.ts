import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateMembershipDto {
  @IsUUID()
  user_id: string;

  @IsString()
  @IsIn(['g-ajo', 'g-esusu'])
  group_id: string;

  @IsIn(['daily', 'weekly', 'monthly'])
  frequency: 'daily' | 'weekly' | 'monthly';

  @IsIn(['monthly', 'quarterly', 'bi_annual', 'annual'])
  cycle: 'monthly' | 'quarterly' | 'bi_annual' | 'annual';

  @IsInt()
  @Min(1)
  contribution_kobo: number;

  @ValidateIf((o) => o.frequency === 'weekly')
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;

  @ValidateIf((o) => o.frequency === 'monthly')
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  month_day?: number;

  @IsOptional()
  @IsBoolean()
  month_last_day?: boolean;

  @IsDateString({ strict: true })
  joined_on: string;
}