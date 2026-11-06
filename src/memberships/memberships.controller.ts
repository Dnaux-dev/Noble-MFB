import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipsService } from './memberships.service';

@Controller('memberships')
@UseGuards(JwtAuthGuard)
export class MembershipsController {
  constructor(
    private readonly membershipsService: MembershipsService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateMembershipDto,
    @Req() request: { user: { sub: string } },
  ) {
    if (dto.user_id !== request.user.sub) {
      throw new ForbiddenException(
        'You can only create memberships for your own account',
      );
    }

    return this.membershipsService.create(dto);
  }

 @Get(':id/schedule')
findSchedule(
  @Param('id') id: string,
  @Query('as_of') asOf: string,
  @Req() request: { user: { sub: string } },
) {
  return this.membershipsService.findSchedule(
    id,
    request.user.sub,
    asOf,
  );
}

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() request: { user: { sub: string } },  
  ) {
    return this.membershipsService.findOne(id, request.user.sub);
  }
}