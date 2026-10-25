import { BadRequestException } from '@nestjs/common';
import { etag, parseIfMatch } from './if-match';

describe('parseIfMatch', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['  ', undefined],
    ['"3"', 3],
    [' "3" ', 3],
    ['"2147483647"', 2147483647],
  ])('reads %p as %p', (header, version) => {
    expect(parseIfMatch(header)).toBe(version);
  });

  // ADR-0019: exactly one strong ETag. Express's own weak body-hash ETag,
  // copied from a list or search response, must be a clear 400.
  it.each([
    '*',
    'W/"3"',
    '"3", "4"',
    '3',
    '"abc"',
    '"0"',
    '"2147483648"',
    '"-1"',
    'W/"124-rj280D5nqySaOzAwMZHN6LZE1Qw"',
  ])('rejects %p with a 400 naming the format', (header) => {
    let err: unknown;
    try {
      parseIfMatch(header);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe(
      `If-Match must be one strong ETag such as "3", got ${header}`,
    );
  });
});

describe('etag', () => {
  it('quotes the version', () => {
    expect(etag(4)).toBe('"4"');
  });
});
