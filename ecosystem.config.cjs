// Configuration PM2 de l'espace recrutement, calquée sur celle du site
// principal (valeur-ajoutee/ecosystem.config.cjs).
//
// Cette application DOIT tourner sur la même machine que le site : elle écrit
// dans la base Valeur Ajoutée, dont DATABASE_URL pointe sur localhost. Un
// hébergement distant (Vercel) ne pourrait pas l'atteindre.
//
// ⚠️ AUCUN SECRET ICI — ce fichier est versionné. AUTH_SECRET, DATABASE_URL et
// BLOB_READ_WRITE_TOKEN vivent dans le `.env` de la machine.
module.exports = {
  apps: [
    {
      name: "valeur-ajoutee-recrutement",
      script: "npm",
      args: "start",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,

      env: {
        // Le site principal réécrit /candidature vers ce port.
        PORT: 3210,
        NODE_ENV: "production",
      },

      // Même format d'horodatage que le site : les logs des deux applications
      // doivent pouvoir se lire côte à côte, fuseau compris.
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
