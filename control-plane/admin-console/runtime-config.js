window.AIVI_ADMIN_RUNTIME = {
    environment: 'local',
    allowPreview: true,
    apiBaseUrl: '',
    auth: {
        mode: 'cognito_hosted_ui_pkce',
        cognitoDomain: '',
        userPoolClientId: '',
        logoutUrl: '',
        requireMfa: true,
        adminGroups: ['aivi-super-admin', 'aivi-support', 'aivi-finance']
    }
};
