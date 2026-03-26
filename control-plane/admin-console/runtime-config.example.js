window.AIVI_ADMIN_RUNTIME = {
    environment: 'staging',
    allowPreview: false,
    apiBaseUrl: 'https://admin-api.aivi.example.com',
    auth: {
        mode: 'cognito_hosted_ui_pkce',
        cognitoDomain: 'https://your-cognito-domain.auth.eu-north-1.amazoncognito.com',
        userPoolClientId: 'your-user-pool-client-id',
        redirectUri: 'https://console.aivi.example.com/',
        postLogoutRedirectUri: 'https://console.aivi.example.com/',
        logoutUrl: 'https://your-cognito-domain.auth.eu-north-1.amazoncognito.com/logout',
        scopes: ['openid', 'email', 'profile'],
        audience: '',
        requireMfa: true,
        adminGroups: ['aivi-super-admin', 'aivi-support', 'aivi-finance']
    }
};
