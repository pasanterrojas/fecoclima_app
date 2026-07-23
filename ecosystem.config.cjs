module.exports = {
  apps: [{
    name: 'fecoclima-ia-front',
    script: '.output/server/index.mjs',
    cwd: __dirname,
    instances: process.env.PM2_INSTANCES || 1,
    exec_mode: 'cluster',
    autorestart: true,
    max_memory_restart: '700M',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3017,
      HOST: '0.0.0.0'
    }
  }]
}
