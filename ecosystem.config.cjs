// PM2 process config for the Transport Management web app.
//
// Yeh app ek static Vite build hai (dist/ folder). Ise hum `serve` package
// se port 5175 par serve karte hain. Nginx is port par reverse-proxy karega
// (transport.nirdesham.com -> 127.0.0.1:5175).
//
// Dusra Next project apne alag port par chalta rahega — koi conflict nahi,
// kyunki yeh sirf 5175 use karta hai.
//
// Server par pehli baar:
//   npm run build          # dist/ banao
//   pm2 start ecosystem.config.cjs
//   pm2 save               # reboot ke baad bhi auto-start ke liye
//
// Agar `serve` global install nahi hai:
//   npm install -g serve

module.exports = {
  apps: [
    {
      name: 'transport-web',
      // `serve` se dist/ folder serve karte hain. PM2 ko `serve` seedha script
      // ki tarah dena kabhi-kabhi fail hota hai (PATH me na mile), isliye hum
      // `npx serve` chalate hain — yeh global ya local, dono me se jo mile use
      // le leta hai.
      //   -s  => SPA mode (har route index.html par bhejo, React Router ke liye)
      //   -l  => listen port
      script: 'npx',
      args: 'serve -s dist -l 5175',
      interpreter: 'none',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PM2_SERVE_SPA: 'true',
      },
    },
  ],
}
