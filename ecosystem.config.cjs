module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'bash',
      args: '-c "echo yes | npx wrangler d1 migrations apply webapp-production --local > /dev/null 2>&1 && npx wrangler pages dev dist --d1=webapp-production --local --ip 0.0.0.0 --port 3000"',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
