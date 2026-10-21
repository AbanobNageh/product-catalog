import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Pipes and Swagger, shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const { version } = JSON.parse(
    readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
  ) as { version: string };
  const document = new DocumentBuilder()
    .setTitle('catalog-api')
    .setDescription('Product catalogue: CRUD, cache and search')
    .setVersion(version)
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, document),
  );
}
