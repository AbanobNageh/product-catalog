import { ApiProperty } from '@nestjs/swagger';

/** The 412 body for a stale If-Match (ADR-0019). */
export class PreconditionFailedResponse {
  @ApiProperty({ example: 412 })
  statusCode: number;

  @ApiProperty({
    example: 'product changed: you sent version 3, current is 4',
  })
  message: string;

  @ApiProperty({ example: 'Precondition Failed' })
  error: string;

  @ApiProperty({
    type: 'integer',
    description:
      "The product's version now. Re-read the product before deciding to write again",
    example: 4,
  })
  currentVersion: number;
}
