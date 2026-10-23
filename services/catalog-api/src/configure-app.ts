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

  const document = new DocumentBuilder()
    .setTitle('catalog-api')
    .setDescription('Product catalogue: CRUD, cache and search')
    .setVersion(APP_VERSION)
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, document),
  );
}
