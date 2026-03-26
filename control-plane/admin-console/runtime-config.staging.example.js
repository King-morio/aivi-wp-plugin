window.AIVI_ADMIN_RUNTIME = {
    environment: 'staging',
    allowPreview: false,
    apiBaseUrl: 'https://dnvo4w1sca.execute-api.eu-north-1.amazonaws.com',
    auth: {
        mode: 'cognito_hosted_ui_pkce',
        cognitoDomain: 'https://your-staging-cognito-domain.auth.eu-north-1.amazoncognito.com',
        userPoolClientId: 'your-staging-user-pool-client-id',
        redirectUri: 'https://console-staging.dollarchain.store/',
        postLogoutRedirectUri: 'https://console-staging.dollarchain.store/',
        logoutUrl: 'https://your-staging-cognito-domain.auth.eu-north-1.amazoncognito.com/logout',
        scopes: ['openid', 'email', 'profile'],
        audience: '',
        requireMfa: true,
        adminGroups: ['aivi-super-admin', 'aivi-support', 'aivi-finance']
    }
};
