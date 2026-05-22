module.exports = {
  apps: [
    {
      name: 'lavanderia-backend',
      script: 'src/server.js',
      cwd: 'C:/xampp/htdocs/Lavanderia',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 3100
      }
    }
  ]
};



