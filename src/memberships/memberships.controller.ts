import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipsService } from './memberships.service';

@Controller('memberships')
export class MembershipsController {
    constructor(
        private readonly membershipsService: MembershipsService,
    ) { }

    @Post()
    create(@Body() dto: CreateMembershipDto) {
        return this.membershipsService.create(dto);
    }

    @Get(':id/schedule')
    findSchedule(
        @Param('id') id: string,
        @Query('as_of') asOf?: string,
    ) {
        return this.membershipsService.findSchedule(id, asOf);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.membershipsService.findOne(id);
    }
}