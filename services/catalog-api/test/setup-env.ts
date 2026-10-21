import { loadTestEnv } from './load-test-env';

// Each test worker loads the same env as the global setup.
loadTestEnv();
