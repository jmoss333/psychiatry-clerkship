import {defineConfig,devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  testDir:'.',
  testMatch:['family-visit.spec.js'],
  workers:1,
  timeout:30000,
  reporter:'list',
  outputDir:'test-results/family-visit',
  use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:4322',serviceWorkers:'block'},
  projects:[
    {name:'desktop',use:{...devices['Desktop Chrome']}},
    {name:'mobile',use:{...devices['Pixel 7']}},
  ],
  webServer:{
    command:'python3 -m http.server 4322 --bind 127.0.0.1',
    cwd:fileURLToPath(new URL('../..',import.meta.url)),
    url:'http://127.0.0.1:4322/_prototypes/sp-interview/family-visit.html',
    reuseExistingServer:false,
    timeout:15000,
  },
});
