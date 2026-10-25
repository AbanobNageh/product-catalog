import { IntQueryParam } from '../../common/int-query-param';
import { INT4_MAX } from './create-product.dto';

export class ListProductsQuery {
  @IntQueryParam({ min: 1, max: INT4_MAX, default: 1 })
  page: number = 1;

  @IntQueryParam({ min: 1, max: 100, default: 20 })
  limit: number = 20;
}
