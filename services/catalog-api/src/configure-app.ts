import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { APP_VERSION } from './common/app-version';

/** Pipes and Swagger, shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, openApiConfig()),
  );
}

/** The OpenAPI document's header, shared with the OpenAPI tests. */
export function openApiConfig() {
  return (
    new DocumentBuilder()
      .setTitle('catalog-api')
      .setDescription('Product catalogue: CRUD, cache and search')
      .setVersion(APP_VERSION)
      // ADR-0020: the Authorize button; @RequireScope marks each keyed operation.
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          // Not @nestjs/swagger's default JWT: these are opaque keys.
          bearerFormat: 'API key',
          description: 'An API key: read, write or admin scope',
        },
        'bearer',
      )
      .build()
  );
}
