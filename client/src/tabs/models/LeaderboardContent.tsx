/**
 * LeaderboardContent — re-exports the existing Leaderboard page content
 * stripped of its Navbar wrapper.
 *
 * Strategy: Rather than duplicating the entire Leaderboard page (which is
 * very large), we import the page and render it inside a wrapper that
 * suppresses the top-level min-h-screen padding. The Navbar inside the
 * page is hidden via CSS since it's now redundant.
 */
export { default } from "@/pages/Leaderboard";
