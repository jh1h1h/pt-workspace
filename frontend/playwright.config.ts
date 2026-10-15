import { defineConfig } from '@playwright/test';
const python = process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: [['list'], ['json', {
    outputFile: '../docs/e2e-test-results.json'
  }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure'
  },
  webServer: [{
    command: `${python} ../scripts/e2e_backend.py`,
    url: 'http://127.0.0.1:8000/api/v1/health',
    reuseExistingServer: false,
    timeout: 30000
  }, {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 30000
  }]
});
