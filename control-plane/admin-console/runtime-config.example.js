window.AIVI_ADMIN_RUNTIME = {
    environment: 'staging',
    allowPreview: false,
    apiBaseUrl: 'https://admin-api.aivi.example.com',
    auth: {
        mode: 'cognito_hosted_ui_pkce',
        cognitoDomain: 'https://your-cognito-domain.auth.eu-north-1.amazoncognito.com',
        userPoolClientId: 'your-user-pool-client-id',
        logoutUrl: 'https://admin.aivi.example.com/logout',
        requireMfa: true,
        adminGroups: ['aivi-super-admin', 'aivi-support', 'aivi-finance']
    }
};
