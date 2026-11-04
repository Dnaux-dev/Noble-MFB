import { Body, Controller, Post } from '@nestjs/common';
import { CreateInflowDto } from './dto/create-inflow.dto';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
  ) {}

  @Post('inflows')
  createInflow(@Body() dto: CreateInflowDto) {
    return this.webhooksService.createInflow(dto);
  }
}