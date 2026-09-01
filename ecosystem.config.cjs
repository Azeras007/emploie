// Configuration PM2 par défaut.
//
// Pour une instance client, `scripts/nouveau-client.mjs` engendre sa propre
// version de ce fichier, avec le nom de l'enseigne et son port.
//
// ⚠️ AUCUN SECRET ICI — ce fichier est versionné. AUTH_SECRET, DATABASE_URL,
// UPLOAD_DIR et SMTP_URL vivent dans le `.env` de la machine.
module.exports = {
  apps: [
    {
      name: "candidatures",
      script: "npm",
      args: "start",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,

      env: {
        // Le domaine public réécrit /candidature vers ce port.
        PORT: 3210,
        NODE_ENV: "production",
      },

      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
