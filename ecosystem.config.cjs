// Configuration PM2 de l'espace candidature Kiabi.
//
// ⚠️ AUCUN SECRET ICI — ce fichier est versionné. AUTH_SECRET, DATABASE_URL et
// UPLOAD_DIR vivent dans le `.env` de la machine.
module.exports = {
  apps: [
    {
      name: "kiabi-recrutement",
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
