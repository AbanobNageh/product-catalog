import { BadRequestException } from '@nestjs/common';
import { INT4_MAX } from './dto/create-product.dto';

// One strong ETag holding a version, as etag() writes it (ADR-0019).
const STRONG_VERSION_ETAG = /^"([1-9]\d{0,9})"$/;

/**
 * Reads an optional If-Match header into the version the client expects.
 * Missing or blank means "no condition". Anything but one strong ETag such as
 * "3" (`*`, a weak W/"3", a list) is a 400, so a client can't believe it sent
 * a condition that was ignored.
 */
export function parseIfMatch(header: string | undefined): number | undefined {
  const value = header?.trim();
  if (!value) return undefined;
  const match = STRONG_VERSION_ETAG.exec(value);
  const version = Number(match?.[1]);
  if (!match || version > INT4_MAX) {
    throw new BadRequestException(
      `If-Match must be one strong ETag such as "3", got ${header}`,
    );
  }
  return version;
}

/** The ETag header value for a product version: the version in quotes. */
export function etag(version: number): string {
  return `"${version}"`;
}
