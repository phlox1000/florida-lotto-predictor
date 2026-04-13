import { updateDraws } from './services/scraper';

// Update Cron job to call new scraper logic
const games = ['Florida Lotto', 'Powerball'];
await Promise.all(games.map(updateDraws));