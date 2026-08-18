// analytics.js - Vercel Web Analytics initialization
import { inject } from '@vercel/analytics';

// Initialize Vercel Web Analytics
inject({
  mode: 'auto',
  debug: false
});
