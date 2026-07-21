import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Tests swap a module-level DB singleton; keep files serial.
    fileParallelism: false,
  },
});
