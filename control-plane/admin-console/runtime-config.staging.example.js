window.AIVI_ADMIN_RUNTIME = {
    environment: 'staging',
    allowPreview: false,
    apiBaseUrl: 'https://admin-api-staging.example.com',
    auth: {
        mode: 'cognito_hosted_ui_pkce',
        cognitoDomain: 'https://your-staging-cognito-domain.auth.eu-north-1.amazoncognito.com',
        userPoolClientId: 'your-staging-user-pool-client-id',
        logoutUrl: 'https://console-staging.dollarchain.store/logout',
        requireMfa: true,
        adminGroups: ['aivi-super-admin', 'aivi-support', 'aivi-finance']
    }
};
