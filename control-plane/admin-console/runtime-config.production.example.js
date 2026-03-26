window.AIVI_ADMIN_RUNTIME = {
    environment: 'production',
    allowPreview: false,
    apiBaseUrl: 'https://admin-api.example.com',
    auth: {
        mode: 'cognito_hosted_ui_pkce',
        cognitoDomain: 'https://your-production-cognito-domain.auth.eu-north-1.amazoncognito.com',
        userPoolClientId: 'your-production-user-pool-client-id',
        redirectUri: 'https://console.dollarchain.store/',
        postLogoutRedirectUri: 'https://console.dollarchain.store/',
        logoutUrl: 'https://your-production-cognito-domain.auth.eu-north-1.amazoncognito.com/logout',
        scopes: ['openid', 'email', 'profile'],
        audience: '',
        requireMfa: true,
        adminGroups: ['aivi-super-admin', 'aivi-support', 'aivi-finance']
    }
};
