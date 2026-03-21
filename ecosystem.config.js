module.exports = {
    apps: [
        {
            name: 'zagreb-buildings-export',
            script: 'scripts/commit-claims.sh',
            cwd: '/root/code/zagreb-buildings',
            cron_restart: '0 0 * * *', // Daily at midnight UTC
            autorestart: false,
            watch: false,
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/root/.pm2/logs/zagreb-buildings-export-error.log',
            out_file: '/root/.pm2/logs/zagreb-buildings-export-out.log',
            merge_logs: true,
        },
    ],
};
