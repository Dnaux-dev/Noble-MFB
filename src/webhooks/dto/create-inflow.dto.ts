import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateInflowDto {
  @IsString()
  @IsNotEmpty()
  provider_ref: string;

  @IsUUID()
  membership_id: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amount_kobo: number;

  @IsDateString({ strict: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    { message: 'received_at must be an RFC3339 timestamp with a timezone offset' },
  )
  received_at: string;
}