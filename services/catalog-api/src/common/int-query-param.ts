import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, ValidateBy } from 'class-validator';

export interface IntQueryParamOptions {
  min: number;
  max: number;
  description?: string;
  example?: number;
  /** Used when the parameter is missing or blank. Without it, blank means unset. */
  default?: number;
}

/**
 * An integer query parameter: blank means unset (or the default), digits with
 * an optional leading minus become a number, and anything else (1e3, 0x10,
 * 1.5) stays a string for the range check to reject. One validator, so a bad
 * value gets one message, in search-service's words (internal/query/params.go).
 * OpenAPI shows it as an integer with its bounds.
 */
export function IntQueryParam(opts: IntQueryParamOptions): PropertyDecorator {
  const { min, max } = opts;
  const decorators = [
    ApiPropertyOptional({
      type: 'integer',
      minimum: min,
      maximum: max,
      description: opts.description,
      example: opts.example,
      default: opts.default,
    }),
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (trimmed === '') return opts.default;
      return /^-?\d+$/.test(trimmed) ? Number(trimmed) : value;
    }),
    ValidateBy({
      name: 'isIntInRange',
      constraints: [min, max],
      validator: {
        validate: (value: unknown) =>
          Number.isInteger(value) &&
          (value as number) >= min &&
          (value as number) <= max,
        defaultMessage: (args) =>
          `${args?.property} must be a whole number from ${min} to ${max}`,
      },
    }),
  ];
  if (opts.default === undefined) decorators.unshift(IsOptional());
  return applyDecorators(...decorators);
}
