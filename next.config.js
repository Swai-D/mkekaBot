/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    APIFY_API_TOKEN: process.env.APIFY_API_TOKEN,
    DATABASE_URL: process.env.DATABASE_URL,
  }
}

export default nextConfig